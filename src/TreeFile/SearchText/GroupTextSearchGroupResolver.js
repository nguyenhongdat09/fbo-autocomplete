// @ts-nocheck

/**
 * Tách logic lấy groupRoot/groupName khỏi TreeFileProvider.
 * @see TreeFileProvider.runGroupFilterSearch
 */
class GroupTextSearchGroupResolver {
    /**
     * @param {import('vscode').TreeItem} groupElement
     * @returns {{ ok: true, groupRoot: string, groupName: string } | { ok: false, reason: string, groupName?: string }}
     */
    static resolve(groupElement) {
        if (!groupElement || !GroupTextSearchGroupResolver._isGroupContext(groupElement.contextValue)) {
            return { ok: false, reason: "invalid_element" };
        }
        const groupName = GroupTextSearchGroupResolver._treeLabel(groupElement.label);
        if (String(groupName).toUpperCase() === "OTHER") {
            return { ok: false, reason: "other_group", groupName };
        }
        const groupRoot = groupElement.resourceUri && groupElement.resourceUri.fsPath;
        if (!groupRoot) {
            return { ok: false, reason: "no_root", groupName };
        }
        return { ok: true, groupRoot: String(groupRoot), groupName: String(groupName) };
    }

    /**
     * @param {string|undefined} contextValue
     * @returns {boolean}
     */
    static _isGroupContext(contextValue) {
        return contextValue === "group" || contextValue === "groupOther";
    }

    /**
     * @param {import('vscode').TreeItemLabel|string|undefined} label
     * @returns {string}
     */
    static _treeLabel(label) {
        if (label == null) return "";
        return typeof label === "string" ? label : (label.label || "");
    }
}

module.exports = GroupTextSearchGroupResolver;
