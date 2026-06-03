// @ts-nocheck

const GroupQuickFilterKinds = require("./GroupQuickFilterKinds");
const GroupQuickFilterState = require("./GroupQuickFilterState");
const GroupQuickFilterApplier = require("./GroupQuickFilterApplier");

class GroupQuickFilterService {
    /**
     * @param {{
     *   getFolderChildren: (folderKey: string) => import('vscode').TreeItem[],
     *   isGroupContext: (contextValue: string) => boolean,
     *   getGroupNameFromElement: (groupElement: import('vscode').TreeItem) => string,
     *   onChanged: () => void
     * }} deps
     */
    constructor(deps) {
        this.isGroupContext = deps.isGroupContext;
        this.getGroupNameFromElement = deps.getGroupNameFromElement;
        this.onChanged = deps.onChanged;
        this.state = new GroupQuickFilterState();
        this.applier = new GroupQuickFilterApplier({
            getFolderChildren: deps.getFolderChildren,
        });
    }

    /**
     * @param {string} groupName
     * @param {import('vscode').TreeItem[]} items
     * @returns {import('vscode').TreeItem[]}
     */
    filterItems(groupName, items) {
        const kind = this.state.getKind(groupName);
        return this.applier.apply(kind, items);
    }

    /**
     * @param {import('vscode').TreeItem} groupElement
     * @param {string} kind
     */
    async applyToGroup(groupElement, kind) {
        if (!groupElement || !this.isGroupContext(groupElement.contextValue)) {
            return;
        }
        const groupName = this.getGroupNameFromElement(groupElement);
        if (!groupName || String(groupName).toUpperCase() === "OTHER") {
            return;
        }
        this.state.setKind(groupName, GroupQuickFilterKinds.normalize(kind));
        this.onChanged();
    }
}

module.exports = GroupQuickFilterService;
