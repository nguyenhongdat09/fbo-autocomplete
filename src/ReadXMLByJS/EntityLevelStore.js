const fs = require('fs');
const path = require('path');
const level = require('level-rocksdb');

const CACHE_VERSION = 2;

class EntityLevelStore {
    constructor() {
        this.dbPath = null;
        this.db = null;
        this.disabled = false;
        this.initPromise = null;
    }

    _resolveDbPath() {
        try {
            const { getUserDatabaseRoot } = require('../extensionDatabasePaths');
            const root = getUserDatabaseRoot();
            if (root) {
                return path.join(root, 'entity-cache-leveldb');
            }
        } catch {
            // Extension context not yet initialized
        }
        const os = require('os');
        return path.join(os.tmpdir(), 'fbo-autocomplete', 'entity-cache-leveldb');
    }

    async init() {
        if (this.disabled) return;
        this.dbPath = this._resolveDbPath();
        await fs.promises.mkdir(path.dirname(this.dbPath), { recursive: true });
        if (this.db) return;
        try {
            this.db = level(this.dbPath);
            
            // Catch asynchronous LevelUP open errors (like lock file errors)
            this.db.on('error', (err) => {
                if (err && err.message && err.message.includes('LOCK')) {
                    console.warn('[EntityLevelStore] LevelDB is locked by another IDE instance. Running in RAM-only mode.');
                } else {
                    console.warn('[EntityLevelStore] LevelDB error:', err.message);
                }
                this.disabled = true;
            });

            await new Promise((resolve, reject) => {
                this.db.once('ready', () => resolve());
                this.db.once('error', (err) => reject(err));
            });
            
            // Healthcheck
            await new Promise((resolve, reject) => {
                this.db.get("__fbo_healthcheck__", (err) => {
                    if (err && !err.notFound) reject(err);
                    else resolve();
                });
            });
        } catch (err) {
            console.warn('[EntityLevelStore] Failed to init DB (likely locked). Running in RAM-only mode.', err.message);
            this.disabled = true;
        }
    }

    async _ensureInitialized() {
        if (!this.initPromise) {
            this.initPromise = this.init();
        }
        await this.initPromise;
    }

    _ensureDb() {
        if (this.disabled) return null;
        return this.db;
    }

    async getEntities(projectId, fileId) {
        await this._ensureInitialized();
        const db = this._ensureDb();
        if (!db) return null;

        const key = `MAIN:${projectId}:${fileId}`;
        const raw = await new Promise((resolve) => {
            db.get(key, (err, value) => {
                if (err) return resolve(null);
                resolve(value);
            });
        });

        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            if (!parsed.version || parsed.version < CACHE_VERSION) {
                return null;
            }
            return parsed;
        } catch {
            return null;
        }
    }

    async upsertEntities(projectId, fileId, relativePath, mtime, doctypeHash, entities, dependencies) {
        await this._ensureInitialized();
        const db = this._ensureDb();
        if (!db) return;

        const mainKey = `MAIN:${projectId}:${fileId}`;
        const mainValue = JSON.stringify({
            version: CACHE_VERSION,
            xml_relative: relativePath,
            mtime: mtime,
            doctype_hash: doctypeHash,
            entities: entities,
            dependencies: dependencies
        });

        const batch = db.batch();
        batch.put(mainKey, mainValue);

        // Update reverse index for each dependency
        for (const dep of dependencies) {
            const depFileId = Buffer.from(dep).toString('base64');
            const depKey = `DEP:${projectId}:${depFileId}`;
            
            let existingXmls = [];
            try {
                const rawDep = await new Promise((resolve, reject) => {
                    db.get(depKey, (err, val) => {
                        if (err && err.notFound) resolve(null);
                        else if (err) reject(err);
                        else resolve(val);
                    });
                });
                
                if (rawDep) {
                    const parsed = JSON.parse(rawDep);
                    if (Array.isArray(parsed.used_by_xmls)) {
                        existingXmls = parsed.used_by_xmls;
                    }
                }
            } catch (err) {
                // Ignore parsing errors for individual dep keys
            }
            
            if (!existingXmls.includes(fileId)) {
                existingXmls.push(fileId);
                batch.put(depKey, JSON.stringify({
                    dep_relative: dep,
                    used_by_xmls: existingXmls
                }));
            }
        }

        try {
            await new Promise((resolve, reject) => {
                batch.write((err) => err ? reject(err) : resolve());
            });
        } catch (err) {
            console.error('[EntityLevelStore] Batch write error:', err);
        }
    }

    async invalidateByDependency(projectId, depFilePath) {
        await this._ensureInitialized();
        const db = this._ensureDb();
        if (!db) return [];

        const normalizedDep = require('path').normalize(depFilePath).toLowerCase();
        const depFileId = Buffer.from(normalizedDep).toString('base64');
        const depKey = `DEP:${projectId}:${depFileId}`;

        let usedByXmls = [];
        try {
            const rawDep = await new Promise((resolve, reject) => {
                db.get(depKey, (err, val) => {
                    if (err && err.notFound) resolve(null);
                    else if (err) reject(err);
                    else resolve(val);
                });
            });
            
            if (rawDep) {
                const parsed = JSON.parse(rawDep);
                if (Array.isArray(parsed.used_by_xmls)) {
                    usedByXmls = parsed.used_by_xmls;
                }
            }
        } catch (err) {
            console.error('[EntityLevelStore] Failed to read depKey:', err);
            return;
        }

        if (usedByXmls.length === 0) return;

        const batch = db.batch();
        for (const xmlFileId of usedByXmls) {
            const mainKey = `MAIN:${projectId}:${xmlFileId}`;
            batch.del(mainKey);
            console.log(`[EntityLevelStore] Invalidated cache for XML: ${xmlFileId} due to dep: ${depFilePath}`);
        }
        
        // After invalidating, clear the dep list
        batch.del(depKey);

        try {
            await new Promise((resolve, reject) => {
                batch.write((err) => err ? reject(err) : resolve());
            });
        } catch (err) {
            console.error('[EntityLevelStore] Invalidation batch write error:', err);
        }
        
        return usedByXmls.map(id => Buffer.from(id, 'base64').toString('utf8'));
    }

    async close() {
        if (!this.db) return;
        const db = this.db;
        this.db = null;
        this.initPromise = null;
        await new Promise((resolve) => {
            try {
                db.close(() => resolve());
            } catch {
                resolve();
            }
        });
    }
}

// Export a singleton instance
const instance = new EntityLevelStore();
module.exports = instance;
