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
    }

    async init() {
        await fs.promises.mkdir(this.storageRoot, { recursive: true });
        if (!this.db) {
            this.db = level(this.dbPath);
        }
    }

    /**
     * @param {string} groupRoot
     * @returns {Promise<{filesRel:string[],updatedAt:number}|null>}
     */
    async get(groupRoot) {
        const db = this._ensureDb();
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
        const key = this._toDbKey(groupRoot);
        const value = JSON.stringify({
            groupRoot: String(groupRoot || ""),
            filesRel: Array.isArray(filesRel) ? filesRel : [],
            updatedAt: Number(updatedAt || Date.now()),
        });
        await new Promise((resolve, reject) => {
            db.put(key, value, (err) => (err ? reject(err) : resolve()));
        });
    }

    async close() {
        if (!this.db) return;
        const db = this.db;
        this.db = null;
        await new Promise((resolve) => db.close(() => resolve()));
    }

    _ensureDb() {
        if (!this.db) {
            this.db = level(this.dbPath);
        }
        return this.db;
    }

    _toDbKey(groupRoot) {
        return `group:${encodeURIComponent(String(groupRoot || ""))}`;
    }
}

module.exports = GroupFileLevelStore;
