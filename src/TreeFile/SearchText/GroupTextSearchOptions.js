// @ts-nocheck

const vscode = require("vscode");
const GroupTextSearchKinds = require("./GroupTextSearchKinds");

class GroupTextSearchOptions {
    /**
     * @param {import('vscode').WorkspaceConfiguration} [cfg]
     */
    constructor(cfg) {
        this._cfg = cfg || null;
    }

    /**
     * @returns {import('vscode').WorkspaceConfiguration}
     */
    _config() {
        return this._cfg || vscode.workspace.getConfiguration("fbo-autocomplete");
    }

    /**
     * Glob extensions từ settings (đã normalize).
     * @returns {string[]}
     */
    getExtensions() {
        const raw = this._config().get(
            GroupTextSearchKinds.SETTING_EXTENSIONS,
            GroupTextSearchKinds.DEFAULT_EXTENSIONS
        );
        const normalized = GroupTextSearchKinds.normalizeExtensions(raw);
        return normalized.length ? normalized : [...GroupTextSearchKinds.DEFAULT_EXTENSIONS];
    }

    /**
     * false = không phân biệt hoa thường (tương đương rg -i).
     * @returns {boolean}
     */
    isCaseSensitive() {
        return Boolean(this._config().get(GroupTextSearchKinds.SETTING_CASE_SENSITIVE, false));
    }
}

module.exports = GroupTextSearchOptions;
