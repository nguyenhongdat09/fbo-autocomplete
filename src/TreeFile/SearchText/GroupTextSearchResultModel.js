// @ts-nocheck

const path = require("path");

/**
 * Gom kết quả text search theo file.
 */
class GroupTextSearchResultModel {
    /**
     * @param {{ groupRoot: string, groupLabel: string, query: string }} meta
     */
    constructor(meta) {
        this.groupRoot = String(meta.groupRoot || "");
        this.groupLabel = String(meta.groupLabel || "");
        this.query = String(meta.query || "");
        /** @type {Map<string, { relPath: string, absPath: string, matchCount: number, matches: any[] }>} */
        this._filesByAbs = new Map();
        this._totalMatches = 0;
    }

    /**
     * @param {{ groupRoot: string, groupLabel: string, query: string }} meta
     * @returns {GroupTextSearchResultModel}
     */
    static createEmpty(meta) {
        return new GroupTextSearchResultModel(meta);
    }

    /**
     * @param {string} absPath
     * @param {{
     *   line: number,
     *   preview: string,
     *   highlights: [number, number][],
     *   range: import('vscode').Range
     * }} match
     */
    addMatch(absPath, match) {
        const abs = String(absPath || "");
        if (!abs || !match) return;

        let relPath = abs;
        if (this.groupRoot) {
            relPath = path.relative(this.groupRoot, abs);
            if (!relPath || relPath.startsWith("..") || path.isAbsolute(relPath)) {
                relPath = abs;
            }
        }
        relPath = relPath.replace(/\\/g, "/");

        let file = this._filesByAbs.get(abs);
        if (!file) {
            file = { relPath, absPath: abs, matchCount: 0, matches: [] };
            this._filesByAbs.set(abs, file);
        }
        file.matches.push({
            line: Number(match.line) || 1,
            preview: String(match.preview || ""),
            highlights: Array.isArray(match.highlights) ? match.highlights : [],
            range: match.range,
        });
        file.matchCount = file.matches.length;
        this._totalMatches += 1;
    }

    /**
     * @returns {{
     *   groupRoot: string,
     *   groupLabel: string,
     *   query: string,
     *   totalMatches: number,
     *   totalFiles: number,
     *   files: Array<{ relPath: string, absPath: string, matchCount: number, matches: any[] }>
     * }}
     */
    finalize() {
        const files = [...this._filesByAbs.values()].sort((a, b) =>
            a.relPath.localeCompare(b.relPath)
        );
        for (const file of files) {
            file.matches.sort((a, b) => a.line - b.line || a.preview.localeCompare(b.preview));
        }
        return {
            groupRoot: this.groupRoot,
            groupLabel: this.groupLabel,
            query: this.query,
            totalMatches: this._totalMatches,
            totalFiles: files.length,
            files,
        };
    }
}

module.exports = GroupTextSearchResultModel;
