// @ts-nocheck

class GroupQuickFilterKinds {
    static ALL = "all";
    static DIR = "dir";
    static GRID = "grid";
    static FILTER = "filter";
    static LOOKUP = "lookup";
    static REPORT = "report";
    static UPLOAD = "upload";

    // Shared settings for group file indexing/search.
    static STORAGE_DIR_NAME = "searchFile";
    static OUTPUT_CHANNEL_NAME = "FBO Group Filter";
    static INDEX_TTL_MS = 10 * 60 * 1000;
    static CLEANUP_INTERVAL_MS = 30 * 1000;
    static WARMUP_CONCURRENCY = 2;
    static WATCH_FLUSH_DEBOUNCE_MS = 800;

    /**
     * @param {string} rawKind
     * @returns {string}
     */
    static normalize(rawKind) {
        const v = String(rawKind || "").trim().toLowerCase();
        if (!v) return GroupQuickFilterKinds.ALL;
        return v;
    }
}

module.exports = GroupQuickFilterKinds;
