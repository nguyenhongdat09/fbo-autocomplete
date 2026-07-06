// @ts-nocheck

const fs = require("fs");
const path = require("path");
const level = require("level-rocksdb");

class GroupFileLevelStore {
    /**
     * @param {string} storageRoot
     */
    constructor(storageRoot) {
        this.storageRoot = storageRoot;
        this.dbPath = path.join(storageRoot, "group-file-index-leveldb");
        this.db = null;
        /** @type {boolean} */
        this.disabled = false;
    }

    async init() {
        if (this.disabled) return;
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
    }

    /**
     * @param {string} groupRoot
     * @returns {Promise<{filesRel:string[],updatedAt:number}|null>}
     */
    async get(groupRoot) {
        const db = this._ensureDb();
        if (!db) return null;
        const key = this._toDbKey(groupRoot);
        const raw = await new Promise((resolve) => {
            db.get(key, (err, value) => {
                if (err && err.notFound) return resolve(null);
                if (err) return resolve(null);
                resolve(value);
            });
        });
        if (!raw) return null;
        try {
            const obj = JSON.parse(String(raw || "{}"));
            return {
                filesRel: Array.isArray(obj.filesRel) ? obj.filesRel : [],
                updatedAt: Number(obj.updatedAt || 0),
            };
        } catch {
            return null;
        }
    }

    /**
     * @param {string} groupRoot
     * @param {string[]} filesRel
     * @param {number} updatedAt
     */
    async upsert(groupRoot, filesRel, updatedAt) {
        const db = this._ensureDb();
        if (!db) return;
        const key = this._toDbKey(groupRoot);
        const value = JSON.stringify({
            groupRoot: String(groupRoot || ""),
            filesRel: Array.isArray(filesRel) ? filesRel : [],
            updatedAt: Number(updatedAt || Date.now()),
        });
        try {
            await new Promise((resolve, reject) => {
                db.put(key, value, (err) => (err ? reject(err) : resolve()));
            });
        } catch {
            await this._disableDb();
        }
    }

    async close() {
        if (!this.db) return;
        const db = this.db;
        this.db = null;
        await new Promise((resolve) => db.close(() => resolve()));
    }

    _ensureDb() {
        if (this.disabled) return null;
        if (!this.db) {
            try {
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
            try {
                db.close(() => resolve());
            } catch {
                resolve();
            }
        });
    }

    _toDbKey(groupRoot) {
        return `group:${encodeURIComponent(String(groupRoot || ""))}`;
    }
}

module.exports = GroupFileLevelStore;
