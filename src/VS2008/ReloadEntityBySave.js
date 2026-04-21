const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const cp = require("child_process");

class ReloadEntityBySave {
    /**
     * @param {import('vscode').ExtensionContext} context
     * @param {{
     *   debounceMs?: number,
     *   maxConcurrent?: number,
     *   maxRetries?: number,
     *   retryBaseDelayMs?: number
     * }} options
     */
    constructor(context, options) {
        this.context = context;
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
         *   failures: number
         * }>} */
        this.fileStates = new Map();
        this.activeCount = 0;
        this.disposed = false;
        this.exePath = path.join(this.context.extensionPath, "src", "ReadXML", "ReadXML.exe");
        /** @type {(filePath:string)=>void | undefined} */
        this.onReloaded = undefined;
    }

    /**
     * Callback chạy sau khi ReadXML.exe xử lý thành công một file.
     * @param {(filePath:string)=>void} handler
     */
    setOnReloaded(handler) {
        this.onReloaded = typeof handler === "function" ? handler : undefined;
    }

    run() {
        return vscode.workspace.onDidSaveTextDocument((document) => {
            this.onDidSave(document);
        });
    }

    onDidSave(document) {
        if (this.disposed) return;
        if (!document || document.languageId !== "xml" || document.uri.scheme !== "file") return;

        const filePath = document.uri.fsPath;
        const state = this.getOrCreateState(filePath);
        state.latestMtimeMs = this.getMtimeMs(filePath);

        if (state.timer) {
            clearTimeout(state.timer);
        }
        state.timer = setTimeout(() => {
            state.timer = null;
            if (state.latestMtimeMs <= state.lastHandledMtimeMs && !state.running) {
                return;
            }
            state.needsRun = true;
            this.pump();
        }, this.options.debounceMs);
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

        try {
            if (runTargetMtime > state.lastHandledMtimeMs) {
                await this.execWithRetry(filePath);
                state.lastHandledMtimeMs = Math.max(state.lastHandledMtimeMs, runTargetMtime);
                state.failures = 0;
                if (this.onReloaded) {
                    try {
                        this.onReloaded(filePath);
                    } catch (cbErr) {
                        console.error("[FBO ReloadEntityBySave] onReloaded callback error:", cbErr);
                    }
                }
            }
        } catch (err) {
            state.failures += 1;
            console.error(`[FBO ReloadEntityBySave] Reload failed (${state.failures}) for ${filePath}:`, err && err.message ? err.message : err);
        } finally {
            state.running = false;
            this.activeCount = Math.max(0, this.activeCount - 1);

            // Nếu trong lúc đang chạy có save mới thì mtime sẽ tăng => chạy lại đúng 1 vòng.
            if (state.latestMtimeMs > state.lastHandledMtimeMs) {
                state.needsRun = true;
            }

            this.cleanupStateIfIdle(filePath);
            this.pump();
        }
    }

    async execWithRetry(filePath) {
        const maxAttempts = Math.max(1, Number(this.options.maxRetries) + 1);
        let lastError = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                await this.execReadXml(filePath);
                return;
            } catch (err) {
                lastError = err;
                if (attempt >= maxAttempts) break;
                const delayMs = this.options.retryBaseDelayMs * Math.pow(2, attempt - 1);
                await this.sleep(delayMs);
            }
        }
        throw lastError || new Error("ReadXML.exe failed");
    }

    execReadXml(filePath) {
        return new Promise((resolve, reject) => {
            cp.execFile(this.exePath, [filePath], (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }
                if (stderr && String(stderr).trim()) {
                    reject(new Error(String(stderr).trim()));
                    return;
                }
                resolve();
            });
        });
    }

    cleanupStateIfIdle(filePath) {
        const state = this.fileStates.get(filePath);
        if (!state) return;
        if (state.running || state.needsRun || state.timer) return;
        // Giữ map gọn để tránh phình nếu user mở rất nhiều file.
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
