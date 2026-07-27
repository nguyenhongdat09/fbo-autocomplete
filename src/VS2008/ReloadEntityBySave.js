const fs = require("fs");
const entityResolver = require("../ReadXMLByJS/entityResolver");

class ReloadEntityBySave {

    /**
     * @param {import('vscode').ExtensionContext} context
     * @param {{
     *   debounceMs?: number,
     *   maxConcurrent?: number,
     *   maxRetries?: number,
     *   retryBaseDelayMs?: number
     * }} [options]
     */
    constructor(context, options) {
        this.context = context;
        this.extensionPath = context.extensionPath;
        this.options = Object.assign({
            debounceMs: 600,
            maxConcurrent: 1,
            maxRetries: 2,
            retryBaseDelayMs: 200,
        }, options || {});

        /** @type {Map<string, {
         *   timer: NodeJS.Timeout | null,
         *   needsRun: boolean,
         *   running: boolean,
         *   latestMtimeMs: number,
         *   lastHandledMtimeMs: number,
         *   failures: number,
         *   pendingResolvers?: Array<{resolve: Function, reject: Function}>
         * }>} */
        this.fileStates = new Map();
        this.activeCount = 0;
        this.disposed = false;
        /** @type {(filePath:string)=>void | undefined} */
        this.onReloaded = undefined;
    }

    /**
     * @param {(filePath:string)=>void} handler
     */
    setOnReloaded(handler) {
        this.onReloaded = typeof handler === "function" ? handler : undefined;
    }

    /**
     * Reload entity — ReadXML.exe mode 0 --force
     * @param {string} filePath
     * @returns {Promise<void>}
     */
    reloadFile(filePath) {
        if (this.disposed) {
            return Promise.reject(new Error("ReloadEntityBySave disposed"));
        }
        if (!filePath || typeof filePath !== "string") {
            return Promise.reject(new Error("Invalid file path"));
        }

        const state = this.getOrCreateState(filePath);
        state.latestMtimeMs = this.getMtimeMs(filePath);
        state.lastHandledMtimeMs = 0;

        return new Promise((resolve, reject) => {
            if (!state.pendingResolvers) {
                state.pendingResolvers = [];
            }
            state.pendingResolvers.push({ resolve, reject });
            state.needsRun = true;
            this.pump();
        });
    }

    getOrCreateState(filePath) {
        let state = this.fileStates.get(filePath);
        if (!state) {
            state = {
                timer: null,
                needsRun: false,
                running: false,
                latestMtimeMs: 0,
                lastHandledMtimeMs: 0,
                failures: 0,
            };
            this.fileStates.set(filePath, state);
        }
        return state;
    }

    getMtimeMs(filePath) {
        try {
            return fs.statSync(filePath).mtimeMs || Date.now();
        } catch (err) {
            return Date.now();
        }
    }

    pump() {
        if (this.disposed) return;
        while (this.activeCount < this.options.maxConcurrent) {
            const next = this.pickNextFilePath();
            if (!next) break;
            this.runFile(next).catch((err) => {
                console.error("[FBO ReloadEntityBySave] Unexpected error:", err);
            });
        }
    }

    pickNextFilePath() {
        for (const [filePath, state] of this.fileStates) {
            if (state.needsRun && !state.running) {
                return filePath;
            }
        }
        return null;
    }

    async runFile(filePath) {
        const state = this.fileStates.get(filePath);
        if (!state || state.running || !state.needsRun || this.disposed) return;

        state.needsRun = false;
        state.running = true;
        const runTargetMtime = state.latestMtimeMs;
        this.activeCount += 1;

        let runError = null;
        let didReload = false;
        try {
            if (runTargetMtime > state.lastHandledMtimeMs) {
                await this.execWithRetry(filePath);
                state.lastHandledMtimeMs = Math.max(state.lastHandledMtimeMs, runTargetMtime);
                state.failures = 0;
                didReload = true;
                if (this.onReloaded) {
                    try {
                        this.onReloaded(filePath);
                    } catch (cbErr) {
                        console.error("[FBO ReloadEntityBySave] onReloaded callback error:", cbErr);
                    }
                }
            }
        } catch (err) {
            runError = err;
            state.failures += 1;
            console.error(`[FBO ReloadEntityBySave] Reload failed (${state.failures}) for ${filePath}:`, err && err.message ? err.message : err);
        } finally {
            this.flushPendingResolvers(state, runError, didReload);
            state.running = false;
            this.activeCount = Math.max(0, this.activeCount - 1);

            if (state.latestMtimeMs > state.lastHandledMtimeMs) {
                state.needsRun = true;
            }

            this.cleanupStateIfIdle(filePath);
            this.pump();
        }
    }

    async execWithRetry(filePath) {
        entityResolver.invalidateCache(filePath);
    }

    flushPendingResolvers(state, runError, didReload) {
        if (!state.pendingResolvers || state.pendingResolvers.length === 0) {
            return;
        }
        const resolvers = state.pendingResolvers;
        state.pendingResolvers = [];
        if (runError) {
            const message = runError && runError.message ? runError.message : String(runError);
            for (const { reject } of resolvers) {
                reject(runError instanceof Error ? runError : new Error(message));
            }
            return;
        }
        for (const { resolve } of resolvers) {
            resolve();
        }
    }

    cleanupStateIfIdle(filePath) {
        const state = this.fileStates.get(filePath);
        if (!state) return;
        if (state.running || state.needsRun || state.timer) return;
        if (this.fileStates.size > 300) {
            this.fileStates.delete(filePath);
        }
    }

    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    dispose() {
        this.disposed = true;
        for (const [, state] of this.fileStates) {
            if (state.timer) clearTimeout(state.timer);
        }
        this.fileStates.clear();
    }
}

module.exports = ReloadEntityBySave;
