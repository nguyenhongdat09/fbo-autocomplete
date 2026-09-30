// @ts-nocheck
// Index symbol per group root.
// Persist LevelDB (SymbolLevelStore):
//   - Lần đầu (DB rỗng): full scan — chậm 1 lần duy nhất.
//   - Lần sau: load record từ DB trả kết quả NGAY (~ms), rồi reconcile ngầm
//     (stat + rescan file đổi) — stat UNC rất chậm nên KHÔNG chặn query.
// Freshness: watcher (GroupFileWatcherService) + save/delete/rename hooks
//   + background reconcile xử lý thay đổi lúc extension offline.

const fs = require("fs");
const path = require("path");
const { scanFile, ALL_SCAN_EXTS, MAX_FILE_BYTES, SCANNER_VERSION } = require("./SymbolScanner");

const SCAN_CONCURRENCY = 16;
const STAT_CONCURRENCY = 32;

function norm(p) {
    return path.normalize(String(p || "")).toLowerCase();
}

function isUnderRoot(fileKey, rootKey) {
    return fileKey === rootKey || fileKey.startsWith(rootKey + path.sep);
}

class SymbolIndexService {
    /**
     * @param {{
     *   getIndexService?: () => any,   // GroupFileIndexService → filesRel
     *   store?: any,                   // SymbolLevelStore
     * }} deps
     */
    constructor(deps) {
        this._getIndexService = deps && deps.getIndexService;
        this._store = deps && deps.store;
        /** @type {Map<string, {builtAt:number, byFile:Map<string, any[]>, filesRel:string[], reconciling?:boolean}>} */
        this._roots = new Map();
        /** @type {Map<string, Promise<any>>} */
        this._pending = new Map();
        /** callback khi root build xong — để gắn watcher */
        this.onRootIndexed = null;
    }

    /**
     * @param {string} root
     * @returns {Promise<{symbols:any[], filesRel:string[]}>}
     */
    async ensure(root) {
        const key = norm(root);
        if (!key) return { symbols: [], filesRel: [] };
        const cached = this._roots.get(key);
        if (cached) return this._flatten(cached);
        if (this._pending.has(key)) return this._pending.get(key);
        const p = this._load(root, key);
        this._pending.set(key, p);
        try {
            return await p;
        } finally {
            this._pending.delete(key);
        }
    }

    async rebuild(root) {
        const key = norm(root);
        this._roots.delete(key);
        if (this._store) await this._store.delRoot(key);
        return this.ensure(root);
    }

    /** Rescan 1 file (save / watcher create|change). Cập nhật mem + store. */
    async rescanFile(absPath) {
        const key = norm(absPath);
        for (const [rootKey, entry] of this._roots) {
            if (!isUnderRoot(key, rootKey)) continue;
            const { symbols, stat } = await this._readAndScan(absPath);
            entry.byFile.set(key, symbols);
            if (this._store && stat) {
                void this._store.putFile(rootKey, key, stat, symbols, SCANNER_VERSION);
            } else if (this._store && !stat) {
                void this._store.delFile(rootKey, key);
            }
        }
    }

    removeFile(absPath) {
        const key = norm(absPath);
        for (const [rootKey, entry] of this._roots) {
            if (!isUnderRoot(key, rootKey)) continue;
            entry.byFile.delete(key);
            if (this._store) void this._store.delFile(rootKey, key);
        }
    }

    renameFile(oldPath, newPath) {
        const oldKey = norm(oldPath);
        for (const [rootKey, entry] of this._roots) {
            if (entry.byFile.has(oldKey)) {
                entry.byFile.delete(oldKey);
                if (this._store) void this._store.delFile(rootKey, oldKey);
            }
        }
        void this.rescanFile(newPath);
    }

    /** File thuộc root đã index? */
    isIndexedFile(absPath) {
        const key = norm(absPath);
        for (const [rootKey, entry] of this._roots) {
            if (isUnderRoot(key, rootKey) && entry.byFile.has(key)) return true;
        }
        return false;
    }

    /** File nằm dưới 1 root đã index (kể cả file mới chưa scan)? */
    isUnderIndexedRoot(absPath) {
        const key = norm(absPath);
        for (const rootKey of this._roots.keys()) {
            if (isUnderRoot(key, rootKey)) return true;
        }
        return false;
    }

    drop() {
        this._roots.clear();
    }

    _flatten(entry) {
        const symbols = [];
        for (const arr of entry.byFile.values()) symbols.push(...arr);
        return { symbols, filesRel: entry.filesRel };
    }

    async _getFilesRel(root) {
        const t0 = Date.now();
        try {
            const svc = this._getIndexService && this._getIndexService();
            if (svc && typeof svc.ensureIndex === "function") {
                const idx = await svc.ensureIndex(root, false);
                const filesRel = idx && Array.isArray(idx.filesRel) ? idx.filesRel : [];
                console.log(`[FBO_PERF_DEBUG] [SymbolIndex] filesRel ${root}: ${filesRel.length} files, source=${idx && idx.source}, ${Date.now() - t0}ms`);
                return filesRel;
            }
        } catch { /* ignore */ }
        return [];
    }

    /**
     * Load index cho root:
     *  - DB đã có → trả ngay (~ms), KHÔNG chờ filesRel (scanGroup trên UNC rất chậm)
     *    — reconcile ngầm tự fetch filesRel + stat/rescan file đổi.
     *  - DB rỗng → cold full scan (1 lần duy nhất), ghi chunk để resumable.
     */
    async _load(root, key) {
        const t0 = Date.now();
        const saved = this._store ? await this._store.loadRoot(key) : new Map();

        if (!saved.size) {
            const filesRel = await this._getFilesRel(root);
            return this._coldBuild(root, key, filesRel);
        }

        // Warm: tin DB, trả ngay — rec.syms đã chứa sẵn file abs path
        const byFile = new Map();
        for (const [fKey, rec] of saved) {
            byFile.set(fKey, rec.syms);
        }
        const entry = { builtAt: Date.now(), byFile, filesRel: [], reconciling: false };
        this._roots.set(key, entry);
        console.log(`[FBO_PERF_DEBUG] [SymbolIndex] warm ${root}: ${saved.size} files, ${Date.now() - t0}ms`);
        this._notifyIndexed(root);
        void this._reconcileInBackground(root, key, entry, saved);
        return this._flatten(entry);
    }

    /**
     * Cold: chưa có DB → scan full tất cả file (1 lần duy nhất).
     * Ghi DB theo chunk FLUSH_EVERY + await — đảm bảo persist kể cả khi
     * process bị kill giữa chừng (lần sau warm load + reconcile nốt phần thiếu).
     */
    async _coldBuild(root, key, filesRel) {
        const t0 = Date.now();
        const FLUSH_EVERY = 300;
        const candidates = filesRel
            .filter(rel => ALL_SCAN_EXTS.has(path.extname(rel).toLowerCase()))
            .map(rel => path.join(root, rel));

        const byFile = new Map();
        const putBatch = [];
        const flush = async () => {
            if (!this._store || !putBatch.length) return;
            const chunk = putBatch.splice(0, putBatch.length);
            try { await this._store.putFiles(key, chunk); } catch { /* ignore */ }
        };

        const queue = [...candidates];
        const workers = Array.from({ length: SCAN_CONCURRENCY }, async () => {
            while (queue.length) {
                const abs = queue.shift();
                if (!abs) break;
                const { symbols, stat } = await this._readAndScan(abs);
                byFile.set(norm(abs), symbols);
                if (stat) {
                    putBatch.push({ file: norm(abs), v: SCANNER_VERSION, mtimeMs: stat.mtimeMs, size: stat.size, syms: symbols });
                    if (putBatch.length >= FLUSH_EVERY) await flush();
                }
            }
        });
        await Promise.all(workers);
        await flush();

        const entry = { builtAt: Date.now(), byFile, filesRel, reconciling: false };
        this._roots.set(key, entry);
        console.log(`[FBO_PERF_DEBUG] [SymbolIndex] cold ${root}: ${candidates.length} files, ${Date.now() - t0}ms`);
        this._notifyIndexed(root);
        return this._flatten(entry);
    }

    /**
     * Reconcile ngầm sau warm load: stat song song → rescan file đổi/mới,
     * xóa record của file đã mất. Không chặn query.
     */
    async _reconcileInBackground(root, key, entry, saved) {
        if (entry.reconciling) return;
        entry.reconciling = true;
        try {
            // filesRel fetch ở đây (scanGroup UNC chậm → không chặn query)
            const filesRel = await this._getFilesRel(root);
            entry.filesRel = filesRel;
            const candidates = filesRel
                .filter(rel => ALL_SCAN_EXTS.has(path.extname(rel).toLowerCase()))
                .map(rel => path.join(root, rel));

            // stat song song tất cả candidate + file đã lưu nhưng không còn trong filesRel
            const statTargets = new Set(candidates);
            for (const fKey of saved.keys()) statTargets.add(fKey);

            const stats = new Map();
            const queue = [...statTargets];
            const workers = Array.from({ length: STAT_CONCURRENCY }, async () => {
                while (queue.length) {
                    const t = queue.shift();
                    if (!t) break;
                    const abs = path.isAbsolute(t) ? t : path.join(root, t);
                    const fKey = norm(abs);
                    try {
                        const st = await fs.promises.stat(abs);
                        stats.set(fKey, st.isFile() ? st : null);
                    } catch {
                        stats.set(fKey, null);
                    }
                }
            });
            await Promise.all(workers);

            const stale = [];
            const dead = [];
            for (const [fKey, st] of stats) {
                const rec = saved.get(fKey);
                if (!st) {
                    if (rec || entry.byFile.has(fKey)) dead.push(fKey);
                    continue;
                }
                // record đúng version + mtime + size → không đổi, skip
                if (rec && rec.v === SCANNER_VERSION && rec.m === st.mtimeMs && rec.s === st.size) continue;
                stale.push(fKey);
            }

            // UNC hụt mạng → stat fail hàng loạt → KHÔNG xóa (tránh wipe cả index)
            const deadLimit = Math.max(20, Math.floor(saved.size * 0.2));
            if (dead.length > deadLimit) {
                console.warn(`[FBO SymbolIndex] reconcile ${root}: ${dead.length} stat-fail > ${deadLimit} — coi là hụt mạng, bỏ qua xóa`);
                dead.length = 0;
            }

            // Rescan file stale/mới
            const putBatch = [];
            const scanQueue = [...stale];
            const scanWorkers = Array.from({ length: SCAN_CONCURRENCY }, async () => {
                while (scanQueue.length) {
                    const fKey = scanQueue.shift();
                    if (!fKey) break;
                    const abs = fKey; // fKey đã là norm abs path
                    const { symbols, stat } = await this._readAndScan(abs);
                    entry.byFile.set(fKey, symbols);
                    if (stat) {
                        putBatch.push({ file: fKey, v: SCANNER_VERSION, mtimeMs: stat.mtimeMs, size: stat.size, syms: symbols });
                    }
                }
            });
            await Promise.all(scanWorkers);

            for (const fKey of dead) entry.byFile.delete(fKey);

            if (this._store) {
                if (putBatch.length) void this._store.putFiles(key, putBatch);
                if (dead.length) void this._store.delFiles(key, dead);
            }
            console.log(`[FBO_PERF_DEBUG] [SymbolIndex] reconcile ${root}: ${stale.length} rescan, ${dead.length} dead`);
        } catch (err) {
            console.warn(`[FBO SymbolIndex] reconcile ${root} failed:`, err && err.message);
        } finally {
            entry.reconciling = false;
        }
    }

    _notifyIndexed(root) {
        if (typeof this.onRootIndexed === "function") {
            try { this.onRootIndexed(root); } catch { /* ignore */ }
        }
    }

    async _readAndScan(absPath) {
        try {
            const st = await fs.promises.stat(absPath);
            if (!st.isFile() || st.size > MAX_FILE_BYTES) return { symbols: [], stat: st };
            const content = await fs.promises.readFile(absPath, "utf8");
            return { symbols: scanFile(absPath, content), stat: st };
        } catch {
            return { symbols: [], stat: null };
        }
    }
}

module.exports = SymbolIndexService;
