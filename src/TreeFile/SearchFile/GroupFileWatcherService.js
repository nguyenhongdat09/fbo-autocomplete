// @ts-nocheck

const fs = require("fs");
const path = require("path");
const vscode = require("vscode");
const GroupQuickFilterKinds = require("./GroupQuickFilterKinds");

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
    }

    /**
     * Sync watcher set with current roots.
     * @param {string[]} roots
     */
    syncRoots(roots) {
        const next = new Set((roots || []).filter(Boolean));
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
        for (const root of next) {
            if (!this.watchers.has(root) && !this.nativeWatchers.has(root)) {
                this._createRootWatcher(root);
            }
        }
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

    _createRootWatcher(root) {
        if (!root || !fs.existsSync(root)) return;
        if (this._isUnderWorkspace(root)) {
            this._createVscodeWatcher(root);
        } else {
            this._createNativeWatcher(root);
        }
    }

    _createVscodeWatcher(root) {
        try {
            const pattern = new vscode.RelativePattern(vscode.Uri.file(root), "**/*");
            const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, false, true);
            watcher.onDidCreate((uri) => this._enqueue(root, "create", uri && uri.fsPath));
            watcher.onDidDelete((uri) => this._enqueue(root, "delete", uri && uri.fsPath));
            this.watchers.set(root, watcher);
        } catch {
            // Ignore invalid root watcher creation
        }
    }

    _createNativeWatcher(root) {
        try {
            const watcher = fs.watch(root, { recursive: true }, (eventType, filename) => {
                this._onNativeWatchEvent(root, eventType, filename);
            });
            watcher.on("error", () => {
                this._disposeNativeRoot(root);
            });
            this.nativeWatchers.set(root, watcher);
        } catch {
            // Ignore native watcher errors (path locked, permission, etc.)
        }
    }

    _onNativeWatchEvent(root, _eventType, filename) {
        if (!filename || typeof filename !== "string") return;
        const rel = filename.replace(/\//g, path.sep);
        const absPath = path.join(root, rel);
        fs.stat(absPath, (err, st) => {
            if (err || !st) {
                this._enqueue(root, "delete", absPath);
                return;
            }
            if (st.isDirectory()) {
                return;
            }
            this._enqueue(root, "create", absPath);
        });
    }

    _enqueue(root, action, absPath) {
        if (!absPath) return;
        let state = this.pendingByRoot.get(root);
        if (!state) {
            state = { create: new Set(), delete: new Set(), timer: null };
            this.pendingByRoot.set(root, state);
        }
        if (action === "create") {
            state.delete.delete(absPath);
            state.create.add(absPath);
        } else {
            state.create.delete(absPath);
            state.delete.add(absPath);
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
        if (w) w.dispose();
        this.watchers.delete(root);
        this._disposeNativeRoot(root);
        const state = this.pendingByRoot.get(root);
        if (state && state.timer) clearTimeout(state.timer);
        this.pendingByRoot.delete(root);
    }

    dispose() {
        for (const root of [...new Set([...this.watchers.keys(), ...this.nativeWatchers.keys()])]) {
            this._disposeRoot(root);
        }
    }
}

module.exports = GroupFileWatcherService;
