// @ts-nocheck

const path = require("path");

class GroupQuickFilterApplier {
    /**
     * @param {{ getFolderChildren: (folderKey: string) => import('vscode').TreeItem[] }} deps
     */
    constructor(deps) {
        this.getFolderChildren = deps.getFolderChildren;
    }

    /**
     * @param {string|null} kind
     * @param {import('vscode').TreeItem[]} items
     * @returns {import('vscode').TreeItem[]}
     */
    apply(kind, items) {
        if (!kind || !items || !items.length) {
            return items || [];
        }
        const needle = (path.sep + String(kind).toLowerCase() + path.sep).toLowerCase();
        return this._applyRecursive(needle, items);
    }

    /**
     * @param {string} needle
     * @param {import('vscode').TreeItem[]} items
     * @returns {import('vscode').TreeItem[]}
     */
    _applyRecursive(needle, items) {
        const out = [];
        for (const it of items) {
            if (it.contextValue === "file" && it.resourceUri) {
                const fp = String(it.resourceUri.fsPath || "").toLowerCase();
                if (fp.includes(needle)) {
                    out.push(it);
                }
                continue;
            }
            if (it.contextValue === "folder" && it.fboFolderKey) {
                const sub = this.getFolderChildren(it.fboFolderKey) || [];
                const subFiltered = this._applyRecursive(needle, sub);
                if (subFiltered.length > 0) {
                    out.push(it);
                }
            }
        }
        return out;
    }
}

module.exports = GroupQuickFilterApplier;
