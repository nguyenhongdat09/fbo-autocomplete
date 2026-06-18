// @ts-nocheck

/**
 * Hằng số dùng chung cho Search text in group.
 * @see src/TreeFile/SearchFile/GroupQuickFilterKinds.js (pattern tương tự)
 */
class GroupTextSearchKinds {
    /** @type {string} Tree view id — tab "Text Search" trong panel Search Result */
    static VIEW_ID = "fbo_text_search_result_view";

    /** @type {string} Lệnh focus panel chứa Search Result + Text Search */
    static PANEL_CMD = "workbench.view.extension.fbo_search_result_panel_container";

    /** @type {string} Context menu trên group FBO */
    static CMD_SEARCH = "fboFile.SearchTextInGroup";

    /** @type {string} Mở editor tại dòng match khi click kết quả */
    static CMD_OPEN_MATCH = "fbo-autocomplete.openTextSearchMatch";

    /** @type {string} Key settings trong package.json (prefix fbo-autocomplete.) */
    static SETTING_EXTENSIONS = "groupContentSearchExtensions";

    /** @type {string} */
    static SETTING_CASE_SENSITIVE = "groupContentSearchCaseSensitive";

    /** @type {string} Output channel diagnostics (tùy chọn) */
    static OUTPUT_CHANNEL_NAME = "FBO Group Text Search";

    /**
     * Glob mặc định — khớp lệnh rg user dùng benchmark.
     * @type {string[]}
     */
    static DEFAULT_EXTENSIONS = [
        "*.js",
        "*.xml",
        "*.txt",
        "*.aspx",
        "*.ent",
        "*.f",
    ];

    /**
     * Vẫn hiện trong QuickPick nhưng không chọn sẵn — user tự check khi cần.
     * @type {string[]}
     */
    static EXTENSIONS_UNCHECKED_BY_DEFAULT = [
        "*.js",
        "*.f",
    ];

    /** @type {string} Property gắn trên TreeFileProvider instance bởi Facade.attach */
    static FACADE_INSTANCE_KEY = "_groupTextSearchFacade";

    /**
     * @param {string[]} raw
     * @returns {string[]}
     */
    static normalizeExtensions(raw) {
        const list = Array.isArray(raw) ? raw : GroupTextSearchKinds.DEFAULT_EXTENSIONS;
        return list
            .map((x) => String(x || "").trim())
            .filter(Boolean);
    }

    /**
     * @param {string} glob
     * @returns {boolean}
     */
    static isExtensionPickedByDefault(glob) {
        const g = String(glob || "").trim().toLowerCase();
        const unchecked = GroupTextSearchKinds.EXTENSIONS_UNCHECKED_BY_DEFAULT
            .map((x) => String(x).trim().toLowerCase());
        return !unchecked.includes(g);
    }
}

module.exports = GroupTextSearchKinds;
