// @ts-nocheck

const fs = require("fs");
const path = require("path");

class GroupFileScanner {
    /**
     * @param {{ includeExtensions?: string[] }} [opts]
     */
    constructor(opts) {
        const cfg = opts || {};
        this.includeExtensions = Array.isArray(cfg.includeExtensions) && cfg.includeExtensions.length
            ? new Set(cfg.includeExtensions.map((x) => String(x).toLowerCase()))
            : null;
    }

    /**
     * @param {string} groupRoot
     * @returns {Promise<string[]>} relative file paths
     */
    async scanGroup(groupRoot) {
        const baseRoot = String(groupRoot || "");
        if (!baseRoot) return [];
        const startDir = this.getScanStartDir(baseRoot);
        const out = [];
        await this._walk(startDir, baseRoot, out);

        const mainDir = path.join(baseRoot, "Main");
        try {
            if (fs.existsSync(mainDir)) {
                await this._walk(mainDir, baseRoot, out, ".aspx");
            }
        } catch {
            // Ignore errors
        }

        out.sort((a, b) => a.localeCompare(b));
        return out;
    }

    /**
     * @param {string} groupRoot
     * @returns {string}
     */
    getScanStartDir(groupRoot) {
        const baseRoot = String(groupRoot || "");
        const controllersRoot = path.join(baseRoot, "App_Data", "Controllers");
        return fs.existsSync(controllersRoot) ? controllersRoot : baseRoot;
    }

    /**
     * @param {string} groupRoot
     * @param {string} absPath
     * @returns {boolean}
     */
    shouldTrackAbsPath(groupRoot, absPath) {
        if (!groupRoot || !absPath) return false;
        const baseRoot = String(groupRoot);
        const normalizedAbs = path.normalize(String(absPath));
        const startDir = path.normalize(this.getScanStartDir(baseRoot));
        
        if (normalizedAbs.startsWith(startDir)) {
            if (this.includeExtensions) {
                const ext = path.extname(normalizedAbs).toLowerCase();
                if (!this.includeExtensions.has(ext)) return false;
            }
            return true;
        }

        const mainDir = path.normalize(path.join(baseRoot, "Main"));
        if (normalizedAbs.startsWith(mainDir + path.sep) || normalizedAbs === mainDir) {
            const ext = path.extname(normalizedAbs).toLowerCase();
            if (ext === ".aspx") return true;
        }

        return false;
    }

    /**
     * @param {string} groupRoot
     * @param {string} absPath
     * @returns {string|null}
     */
    toRelative(groupRoot, absPath) {
        if (!this.shouldTrackAbsPath(groupRoot, absPath)) return null;
        const rel = path.relative(String(groupRoot), String(absPath));
        if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
        return rel;
    }

    /**
     * @param {string} currentDir
     * @param {string} groupRoot
     * @param {string[]} out
     */
    async _walk(currentDir, groupRoot, out, allowedExt = null) {
        /** @type {fs.Dirent[]} */
        let entries = [];
        try {
            entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entries) {
            const absPath = path.join(currentDir, e.name);
            if (e.isDirectory()) {
                await this._walk(absPath, groupRoot, out, allowedExt);
                continue;
            }
            if (!e.isFile()) continue;
            
            if (allowedExt) {
                const ext = path.extname(e.name).toLowerCase();
                if (ext !== allowedExt) continue;
            } else if (this.includeExtensions) {
                const ext = path.extname(e.name).toLowerCase();
                if (!this.includeExtensions.has(ext)) continue;
            }
            
            const rel = path.relative(groupRoot, absPath);
            if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) continue;
            out.push(rel);
        }
    }
}

module.exports = GroupFileScanner;
