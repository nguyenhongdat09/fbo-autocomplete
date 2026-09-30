// @ts-nocheck
// LevelDB persist cho symbol index — cùng pattern GroupFileLevelStore:
// storage per-workspace (tránh LOCK khi mở nhiều IDE), disable khi DB lỗi.
//
// Record per file: key  symf|<root>|<normFile>  →  { m: mtimeMs, s: size, syms: [...] }
// Prefix scan theo "symf|<root>|" → load toàn bộ file của 1 root.

const fs = require("fs");
const path = require("path");
const level = require("level-rocksdb");

const KEY_PREFIX = "symf|";
const KEY_SEP = "|";

class SymbolLevelStore {
    /**
     * @param {string} storageRoot thư mục chứa leveldb (đã resolve per-workspace)
     */
    constructor(storageRoot) {
        this.storageRoot = storageRoot;
        this.dbPath = path.join(storageRoot, "symbol-index-leveldb");
        this.db = null;
        this.disabled = false;
        this._initPromise = null;
    }

    async init() {
        if (this.disabled) return;
        if (this._initPromise) return this._initPromise;
        this._initPromise = (async () => {
            await fs.promises.mkdir(this.storageRoot, { recursive: true });
            if (this.db) return;
            try {
                this.db = level(this.dbPath);
                await new Promise((resolve, reject) => {
                    this.db.get("__fbo_healthcheck__", (err) => {
                        if (err && !err.notFound) reject(err);
                        else resolve();
                    });
                });
            } catch {
                await this._disableDb();
            }
        })();
        return this._initPromise;
    }

    _key(root, file) {
        return KEY_PREFIX + encodeURIComponent(root) + KEY_SEP + encodeURIComponent(file);
    }

    _prefix(root) {
        return KEY_PREFIX + encodeURIComponent(root) + KEY_SEP;
    }

    /**
     * Load toàn bộ record của 1 root.
     * @param {string} rootKey path đã normalize lowercase
     * @returns {Promise<Map<string, {m:number, s:number, syms:any[]}>>} Map<normFile, record>
     */
    async loadRoot(rootKey) {
        await this.init();
        const db = this._ensureDb();
        if (!db) return new Map();
        const prefix = this._prefix(rootKey);
        const out = new Map();
        return new Promise((resolve) => {
            db.createReadStream({ gte: prefix, lte: prefix + "\uffff" })
                .on("data", (data) => {
                    try {
                        const file = decodeURIComponent(String(data.key).slice(prefix.length));
                        const rec = JSON.parse(String(data.value));
                        if (rec && Array.isArray(rec.syms)) {
                            out.set(file, { v: Number(rec.v) || 0, m: Number(rec.m) || 0, s: Number(rec.s) || 0, syms: rec.syms });
                        }
                    } catch { /* record hỏng — bỏ qua */ }
                })
                .on("end", () => resolve(out))
                .on("error", () => resolve(out));
        });
    }

    /**
     * Ghi/cập nhật 1 file record.
     * @param {string} rootKey
     * @param {string} fileKey norm abs path
     * @param {{mtimeMs:number, size:number}} stat
     * @param {any[]} symbols
     * @param {number} [ver] SCANNER_VERSION — record version khác sẽ bị rescan
     */
    async putFile(rootKey, fileKey, stat, symbols, ver) {
        const db = this._ensureDb();
        if (!db) return;
        const value = JSON.stringify({ v: ver || 0, m: stat.mtimeMs || 0, s: stat.size || 0, syms: symbols || [] });
        try {
            await new Promise((resolve, reject) => {
                db.put(this._key(rootKey, fileKey), value, (err) => (err ? reject(err) : resolve()));
            });
        } catch {
            await this._disableDb();
        }
    }

    /** Batch put — dùng khi load root có nhiều file stale. */
    async putFiles(rootKey, entries) {
        const db = this._ensureDb();
        if (!db || !entries || !entries.length) return;
        const ops = entries.map(e => ({
            type: "put",
            key: this._key(rootKey, e.file),
            value: JSON.stringify({ v: e.v || 0, m: e.mtimeMs || 0, s: e.size || 0, syms: e.syms || [] }),
        }));
        try {
            await new Promise((resolve, reject) => db.batch(ops, (err) => (err ? reject(err) : resolve())));
        } catch {
            await this._disableDb();
        }
    }

    async delFile(rootKey, fileKey) {
        const db = this._ensureDb();
        if (!db) return;
        try {
            await new Promise((resolve) => db.del(this._key(rootKey, fileKey), () => resolve()));
        } catch { /* ignore */ }
    }

    async delFiles(rootKey, fileKeys) {
        const db = this._ensureDb();
        if (!db || !fileKeys || !fileKeys.length) return;
        const ops = fileKeys.map(f => ({ type: "del", key: this._key(rootKey, f) }));
        try {
            await new Promise((resolve) => db.batch(ops, () => resolve()));
        } catch { /* ignore */ }
    }

    /** Xóa toàn bộ record của root (rebuild). */
    async delRoot(rootKey) {
        const db = this._ensureDb();
        if (!db) return;
        const saved = await this.loadRoot(rootKey);
        await this.delFiles(rootKey, [...saved.keys()]);
    }

    async close() {
        if (!this.db) return;
        const db = this.db;
        this.db = null;
        this._initPromise = null;
        await new Promise((resolve) => db.close(() => resolve()));
    }

    _ensureDb() {
        if (this.disabled) return null;
        if (!this.db) {
            try {
                // level() không tự tạo parent dir — mkdir trước (write có thể đến trước init)
                fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
                this.db = level(this.dbPath);
            } catch {
                this.disabled = true;
                return null;
            }
        }
        return this.db;
    }

    async _disableDb() {
        this.disabled = true;
        if (!this.db) return;
        const db = this.db;
        this.db = null;
        await new Promise((resolve) => {
            try { db.close(() => resolve()); } catch { resolve(); }
        });
    }
}

module.exports = SymbolLevelStore;
