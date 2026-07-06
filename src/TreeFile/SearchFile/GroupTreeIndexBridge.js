// @ts-nocheck

const path = require("path");

/**
 * Đồng bộ cây FBO + panel Search Result khi index/watcher hoặc paste thay đổi.
 */
class GroupTreeIndexBridge {
    /**
     * @param {{
     *   addFileToTree: (absPath: string) => void,
     *   refreshTree: () => void,
     *   getIndexService: () => any,
     *   publishSearchResult: (result: any, options?: { reveal?: boolean }) => void,
     *   getActiveDisplayedGroupRoot?: () => string|null,
     * }} deps
     */
    constructor(deps) {
        this.addFileToTree = deps.addFileToTree;
        this.refreshTree = deps.refreshTree;
        this.getIndexService = deps.getIndexService;
        this.publishSearchResult = deps.publishSearchResult;
        this.getActiveDisplayedGroupRoot = typeof deps.getActiveDisplayedGroupRoot === "function"
            ? deps.getActiveDisplayedGroupRoot
            : null;
        /** @type {Map<string, { keyword: string, groupLabel: string }>} */
        this._lastSearchByRoot = new Map();
        /** @type {Map<string, any>} */
        this._refreshTimers = new Map();
    }

    /**
     * @param {string} groupRoot
     * @param {string} groupLabel
     * @param {string} keyword
     */
    rememberSearch(groupRoot, groupLabel, keyword) {
        const root = String(groupRoot || "");
        if (!root) return;
        this._lastSearchByRoot.set(root, {
            keyword: String(keyword || ""),
            groupLabel: String(groupLabel || ""),
        });
    }

    clearSearchMemory(groupRoot) {
        this._lastSearchByRoot.delete(String(groupRoot || ""));
    }

    /**
     * @param {string} groupRoot
     * @param {string[]} absPaths
     */
    async notifyFilesAdded(groupRoot, absPaths) {
        const root = String(groupRoot || "");
        const paths = (absPaths || []).filter(Boolean);
        if (!root || !paths.length) return;

        for (const fp of paths) {
            this.addFileToTree(fp);
        }

        const indexService = this.getIndexService();
        if (indexService) {
            for (const fp of paths) {
                await indexService.applyPathEvent(root, fp, "create");
            }
        }

        this.refreshTree();
        await this._refreshLastSearchNow(root);
    }

    /**
     * Gọi sau khi watcher cập nhật index (debounce nhẹ).
     * @param {string} groupRoot
     */
    scheduleRefreshFromIndex(groupRoot) {
        const root = String(groupRoot || "");
        if (!root) return;
        const prev = this._refreshTimers.get(root);
        if (prev) clearTimeout(prev);
        const timer = setTimeout(() => {
            this._refreshTimers.delete(root);
            this.refreshTree();
            void this._refreshLastSearchNow(root);
        }, 400);
        this._refreshTimers.set(root, timer);
    }

    _normalizeGroupRoot(groupRoot) {
        const raw = String(groupRoot || "");
        if (!raw) return "";
        try {
            return path.normalize(raw).toLowerCase();
        } catch {
            return raw.toLowerCase();
        }
    }

    async _refreshLastSearchNow(groupRoot) {
        const root = String(groupRoot || "");
        if (this.getActiveDisplayedGroupRoot) {
            const activeRoot = this.getActiveDisplayedGroupRoot();
            if (activeRoot && this._normalizeGroupRoot(activeRoot) !== this._normalizeGroupRoot(root)) {
                return;
            }
        }
        const last = this._lastSearchByRoot.get(root);
        const indexService = this.getIndexService();
        if (!last || !indexService) return;
        try {
            const result = await indexService.search(root, last.keyword);
            result.groupLabel = last.groupLabel;
            this.publishSearchResult(result, { reveal: false });
        } catch {
            // ignore
        }
    }

    dispose() {
        for (const t of this._refreshTimers.values()) {
            clearTimeout(t);
        }
        this._refreshTimers.clear();
        this._lastSearchByRoot.clear();
    }
}

module.exports = GroupTreeIndexBridge;
