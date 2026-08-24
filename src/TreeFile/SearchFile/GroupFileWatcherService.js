// @ts-nocheck

const fs = require("fs");
const path = require("path");
const vscode = require("vscode");
const GroupQuickFilterKinds = require("./GroupQuickFilterKinds");
const Utf8BomHandler = require("./Utf8BomHandler");

class GroupFileWatcherService {
    /**
     * @param {{ indexService: any, debounceMs?: number, onIndexChanged?: (groupRoot: string) => void }} deps
     */
    constructor(deps) {
        this.indexService = deps.indexService;
        this.onIndexChanged = typeof deps.onIndexChanged === "function" ? deps.onIndexChanged : null;
        this.debounceMs = Number(deps.debounceMs || GroupQuickFilterKinds.WATCH_FLUSH_DEBOUNCE_MS);
        /** @type {Map<string, import('vscode').FileSystemWatcher>} */
        this.watchers = new Map();
        /** @type {Map<string, import('fs').FSWatcher>} */
        this.nativeWatchers = new Map();
        /** @type {Map<string, {create:Set<string>, delete:Set<string>, timer:any}>} */
        this.pendingByRoot = new Map();
        /** @type {Map<string, any>} */
        this.reconnectTimers = new Map();
        /** @type {Map<string, number>} */
        this.retryCounts = new Map();
        this.maxRetries = 5;
        /** @type {Set<string>} */
        this.activeRoots = new Set();
    }

    /**
     * Sync watcher set with current roots.
     * @param {string[]} roots
     */
    syncRoots(roots) {
        const next = new Set((roots || []).filter(Boolean));
        this.activeRoots = next;

        for (const root of [...this.watchers.keys()]) {
            if (!next.has(root)) {
                this._disposeRoot(root);
            }
        }
        for (const root of [...this.nativeWatchers.keys()]) {
            if (!next.has(root)) {
                this._disposeRoot(root);
            }
        }
        for (const root of [...this.reconnectTimers.keys()]) {
            if (!next.has(root)) {
                this._clearReconnectTimer(root);
            }
        }
        for (const root of next) {
            if (!this.watchers.has(root) && !this.nativeWatchers.has(root)) {
                void this._createRootWatcher(root);
            }
        }
    }

    _isUncPath(root) {
        const str = String(root || "").trim();
        return str.startsWith("\\\\") || str.startsWith("//");
    }

    _isUnderWorkspace(root) {
        const norm = path.normalize(String(root || "")).toLowerCase();
        if (!norm) return false;
        const folders = vscode.workspace.workspaceFolders || [];
        return folders.some((f) => {
            const wf = path.normalize(f.uri.fsPath).toLowerCase();
            return norm === wf || norm.startsWith(wf + path.sep);
        });
    }

    async _createRootWatcher(root) {
        if (!root) return;
        try {
            const st = await fs.promises.stat(root);
            if (!st.isDirectory()) return;
        } catch {
            return;
        }

        const is_unc = this._isUncPath(root);
        const under_ws = this._isUnderWorkspace(root);

        if (under_ws && !is_unc) {
            this._createVscodeWatcher(root);
        } else {
            // Với UNC path hoặc ngoài workspace: dùng native watcher với auto-reconnect an toàn
            this._createNativeWatcher(root);
            if (under_ws) {
                this._createVscodeWatcher(root);
            }
        }
    }

    _createVscodeWatcher(root) {
        if (this.watchers.has(root)) return;
        try {
            const pattern = new vscode.RelativePattern(vscode.Uri.file(root), "**/*");
            const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, false, false);
            watcher.onDidCreate((uri) => this._enqueue(root, "create", uri && uri.fsPath));
            watcher.onDidChange((uri) => this._enqueue(root, "create", uri && uri.fsPath));
            watcher.onDidDelete((uri) => this._enqueue(root, "delete", uri && uri.fsPath));
            this.watchers.set(root, watcher);
        } catch {
            // Ignore invalid root watcher creation
        }
    }

    _createNativeWatcher(root) {
        if (!root) return;
        this._clearReconnectTimer(root);
        try {
            const watcher = fs.watch(root, { recursive: true }, (event_type, filename) => {
                this._onNativeWatchEvent(root, event_type, filename);
            });
            watcher.on("error", (err) => {
                this._onNativeWatchError(root, err);
            });
            this.nativeWatchers.set(root, watcher);

            // Nếu watcher sống ổn định sau 30s, reset bộ đếm lỗi
            const success_timer = setTimeout(() => {
                if (this.nativeWatchers.has(root)) {
                    this.retryCounts.delete(root);
                }
            }, 30000);
            if (typeof success_timer.unref === "function") success_timer.unref();
        } catch (err) {
            this._onNativeWatchError(root, err);
        }
    }

    _onNativeWatchError(root, err) {
        console.warn(`[FBO Watcher] Watcher error on ${root}:`, err && err.message ? err.message : err);
        this._disposeNativeRoot(root);

        if (!this.activeRoots.has(root)) return;

        const count = (this.retryCounts.get(root) || 0) + 1;
        this.retryCounts.set(root, count);

        // Circuit Breaker: Dừng reconnect nếu lỗi liên tiếp quá 5 lần để không tốn tài nguyên
        if (count > this.maxRetries) {
            console.warn(`[FBO Watcher] Reached max retries (${this.maxRetries}) on ${root}. Paused background watcher, switching to on-demand sync mode.`);
            return;
        }

        // Exponential backoff: 5s, 10s, 20s, 40s, 60s
        const delay_ms = Math.min(60000, 5000 * Math.pow(2, count - 1));
        this._scheduleNativeReconnect(root, delay_ms);
    }

    _scheduleNativeReconnect(root, delay_ms) {
        this._clearReconnectTimer(root);
        const timer = setTimeout(async () => {
            this.reconnectTimers.delete(root);
            if (!this.activeRoots.has(root)) return;
            try {
                // Kiểm tra bất đồng bộ (Non-blocking I/O)
                const st = await fs.promises.stat(root);
                if (st.isDirectory()) {
                    this._createNativeWatcher(root);
                    await this.reconcileRoot(root);
                }
            } catch {
                const count = this.retryCounts.get(root) || 0;
                if (count <= this.maxRetries) {
                    this._scheduleNativeReconnect(root, 15000);
                }
            }
        }, delay_ms);
        this.reconnectTimers.set(root, timer);
    }

    _clearReconnectTimer(root) {
        const timer = this.reconnectTimers.get(root);
        if (timer) {
            clearTimeout(timer);
            this.reconnectTimers.delete(root);
        }
    }

    async reconcileRoot(root) {
        if (!root || !this.indexService) return false;
        try {
            const changed = await this.indexService.reconcileGroup(root);
            if (changed && this.onIndexChanged) {
                this.onIndexChanged(root);
            }
            return changed;
        } catch {
            return false;
        }
    }

    async reconcileAll() {
        for (const root of this.activeRoots) {
            this.retryCounts.delete(root); // Reset retry count khi có trigger người dùng
            if (!this.nativeWatchers.has(root) && !this.watchers.has(root)) {
                void this._createRootWatcher(root);
            }
            await this.reconcileRoot(root);
        }
    }

    _onNativeWatchEvent(root, _eventType, filename) {
        if (!filename || typeof filename !== "string") return;
        const rel = filename.replace(/\//g, path.sep);
        const abs_path = path.join(root, rel);
        fs.stat(abs_path, (err, st) => {
            if (err || !st) {
                this._enqueue(root, "delete", abs_path);
                return;
            }
            if (st.isDirectory()) {
                return;
            }
            this._enqueue(root, "create", abs_path);
        });
    }

    _enqueue(root, action, abs_path) {
        if (!abs_path) return;
        let state = this.pendingByRoot.get(root);
        if (!state) {
            state = { create: new Set(), delete: new Set(), timer: null };
            this.pendingByRoot.set(root, state);
        }
        if (action === "create") {
            state.delete.delete(abs_path);
            state.create.add(abs_path);
        } else {
            state.create.delete(abs_path);
            state.delete.add(abs_path);
        }
        if (state.timer) clearTimeout(state.timer);
        state.timer = setTimeout(() => {
            void this._flushRoot(root);
        }, this.debounceMs);
    }

    async _flushRoot(root) {
        const state = this.pendingByRoot.get(root);
        if (!state) return;
        state.timer = null;
        const creates = [...state.create];
        const deletes = [...state.delete];
        state.create.clear();
        state.delete.clear();
        let changed = false;
        for (const fp of creates) {
            await Utf8BomHandler.ensureBom(fp);
            if (await this.indexService.applyPathEvent(root, fp, "create")) {
                changed = true;
            }
        }
        for (const fp of deletes) {
            if (await this.indexService.applyPathEvent(root, fp, "delete")) {
                changed = true;
            }
        }
        if (changed && this.onIndexChanged) {
            this.onIndexChanged(root);
        }
    }

    _disposeNativeRoot(root) {
        const w = this.nativeWatchers.get(root);
        if (w) {
            try {
                w.close();
            } catch {
                // ignore
            }
        }
        this.nativeWatchers.delete(root);
    }

    _disposeRoot(root) {
        const w = this.watchers.get(root);
        if (w) {
            try {
                w.dispose();
            } catch {
                // ignore
            }
        }
        this.watchers.delete(root);
        this._disposeNativeRoot(root);
        this._clearReconnectTimer(root);
        const state = this.pendingByRoot.get(root);
        if (state && state.timer) clearTimeout(state.timer);
        this.pendingByRoot.delete(root);
    }

    dispose() {
        for (const timer of this.reconnectTimers.values()) {
            clearTimeout(timer);
        }
        this.reconnectTimers.clear();
        this.activeRoots.clear();
        for (const root of [...new Set([...this.watchers.keys(), ...this.nativeWatchers.keys()])]) {
            this._disposeRoot(root);
        }
    }
}

module.exports = GroupFileWatcherService;
