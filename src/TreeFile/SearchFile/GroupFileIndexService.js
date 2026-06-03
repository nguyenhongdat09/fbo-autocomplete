// @ts-nocheck

const fs = require("fs");
const path = require("path");
const GroupFileScanner = require("./GroupFileScanner");
const GroupFileLevelStore = require("./GroupFileLevelStore");
const GroupQuickFilterKinds = require("./GroupQuickFilterKinds");
const GroupFileQueryMatcher = require("./GroupFileQueryMatcher");

class GroupFileIndexService {
    /**
     * @param {{ storageRoot:string, ttlMs?:number, outputChannelName?:string }} cfg
     */
    constructor(cfg) {
        const c = cfg || {};
        this.ttlMs = Number(c.ttlMs || GroupQuickFilterKinds.INDEX_TTL_MS);
        this.outputChannelName = c.outputChannelName || GroupQuickFilterKinds.OUTPUT_CHANNEL_NAME;
        this.onSearchResult = typeof c.onSearchResult === "function" ? c.onSearchResult : null;
        this.warmupConcurrency = Math.max(1, Number(c.warmupConcurrency || GroupQuickFilterKinds.WARMUP_CONCURRENCY));
        this.scanner = new GroupFileScanner();
        this.store = new GroupFileLevelStore(c.storageRoot);
        /** @type {Map<string, {filesRel:string[], loadedAt:number, source:"scan"|"leveldb"}>} */
        this.mem = new Map();
        /** @type {Map<string, Promise<any>>} */
        this.pending = new Map();
    }

    async init() {
        await this.store.init();
    }

    /**
     * Warmup in background with low concurrency.
     * @param {string[]} roots
     */
    warmup(roots) {
        const queue = [...new Set((roots || []).filter(Boolean))];
        const workers = Array.from({ length: this.warmupConcurrency }, () => this._consumeWarmupQueue(queue));
        void Promise.all(workers);
    }

    async _consumeWarmupQueue(queue) {
        while (queue.length) {
            const root = queue.shift();
            if (!root) continue;
            try {
                await this.ensureIndex(root, false);
            } catch {
                // ignore warmup errors
            }
        }
    }

    /**
     * @param {string} groupRoot
     * @param {string} keyword
     */
    async search(groupRoot, keyword) {
        const idx = await this.ensureIndex(groupRoot, false);
        const q = String(keyword || "").trim().toLowerCase();
        const matcher = new GroupFileQueryMatcher(q);
        let filesRel = idx.filesRel;
        filesRel = filesRel.filter((rel) => matcher.matches(rel));
        return {
            groupRoot,
            keyword: q,
            totalIndexed: idx.filesRel.length,
            totalMatched: filesRel.length,
            source: idx.source,
            filesRel,
        };
    }

    /**
     * @param {string} groupRoot
     * @param {boolean} forceScan
     */
    async ensureIndex(groupRoot, forceScan) {
        const root = String(groupRoot || "");
        if (!root) return { filesRel: [], source: "scan", loadedAt: Date.now() };
        if (!forceScan) {
            const inMem = this.mem.get(root);
            if (inMem && (Date.now() - inMem.loadedAt) <= this.ttlMs) {
                return inMem;
            }
        }
        if (this.pending.has(root)) {
            return this.pending.get(root);
        }
        const p = this._ensureIndexInternal(root, forceScan);
        this.pending.set(root, p);
        try {
            return await p;
        } finally {
            this.pending.delete(root);
        }
    }

    async _ensureIndexInternal(root, forceScan) {
        if (!forceScan) {
            const saved = await this.store.get(root);
            if (saved && Array.isArray(saved.filesRel) && saved.filesRel.length) {
                const inMem = {
                    filesRel: saved.filesRel,
                    loadedAt: Date.now(),
                    source: "leveldb",
                };
                this.mem.set(root, inMem);
                this._log(`cache load leveldb: ${root} (${saved.filesRel.length})`);
                return inMem;
            }
        }

        const filesRel = await this.scanner.scanGroup(root);
        const now = Date.now();
        await this.store.upsert(root, filesRel, now);
        const inMem = { filesRel, loadedAt: now, source: "scan" };
        this.mem.set(root, inMem);
        this._log(`scan done: ${root} (${filesRel.length})`);
        return inMem;
    }

    /**
     * Incremental add/remove from watcher events.
     * @param {string} groupRoot
     * @param {string} absPath
     * @param {"create"|"delete"} action
     * @returns {Promise<boolean>}
     */
    async applyPathEvent(groupRoot, absPath, action) {
        const root = String(groupRoot || "");
        if (!root) return false;
        const isCreate = action === "create";
        const isDelete = action === "delete";
        if (!isCreate && !isDelete) return false;

        // CREATE folder: bỏ qua (folder không phải file index).
        // DELETE folder: không stat được sau khi xóa, xử lý ở nhánh prefix.
        if (isCreate) {
            try {
                if (fs.existsSync(absPath)) {
                    const st = fs.statSync(absPath);
                    if (st.isDirectory()) {
                        return false;
                    }
                }
            } catch {
                // Continue best-effort
            }
        }

        const rel = this.scanner.toRelative(root, absPath);
        if (!rel) return false;
        const current = await this.ensureIndex(root, false);
        const nextSet = new Set(current.filesRel || []);
        if (isDelete) {
            nextSet.delete(rel);
            // DELETE folder/rename folder: remove toàn bộ file con theo prefix.
            const relPrefix = rel.endsWith(path.sep) ? rel : (rel + path.sep);
            for (const item of [...nextSet]) {
                if (String(item).startsWith(relPrefix)) {
                    nextSet.delete(item);
                }
            }
        } else {
            nextSet.add(rel);
        }
        const filesRel = [...nextSet].sort((a, b) => a.localeCompare(b));
        const now = Date.now();
        const inMem = { filesRel, loadedAt: now, source: "scan" };
        this.mem.set(root, inMem);
        await this.store.upsert(root, filesRel, now);
        this._log(`watcher ${action}: ${root} -> ${rel}`);
        return true;
    }

    clearExpired() {
        const now = Date.now();
        for (const [root, data] of this.mem.entries()) {
            if ((now - Number(data.loadedAt || 0)) > this.ttlMs) {
                this.mem.delete(root);
            }
        }
    }

    /** Giữ API cũ; không hiện toast (kết quả chỉ ở panel Search Result). */
    showSearchResultMessage(_result) {
        // intentionally empty
    }

    logSearchResult(result) {
        this.publishSearchResult(result);
    }

    /**
     * @param {any} result
     * @param {{ reveal?: boolean }} [options]
     */
    publishSearchResult(result, options) {
        if (!this.onSearchResult) return;
        try {
            this.onSearchResult(result, options);
        } catch {
            // swallow callback errors
        }
    }

    _log(message) {
        // reserved for future diagnostics
        void message;
    }

    async dispose() {
        this.mem.clear();
        this.pending.clear();
        await this.store.close();
    }
}

module.exports = GroupFileIndexService;
