const vscode = require("vscode");

function _fboTreeLabel(label) {
    if (label == null) return "";
    return typeof label === "string" ? label : (label.label || "");
}

async function _expandTreeNodeRecursive(element) {
    if (!element || !this.treeView) return;
    const provider = this.treeDataProvider;
    if (element.collapsibleState !== vscode.TreeItemCollapsibleState.None) {
        element.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        try {
            await this.treeView.reveal(element, { expand: true, focus: false, select: false });
        } catch (_) { /* node chưa render trong view */ }
    }
    const children = await provider.getChildren(element);
    for (const child of children || []) {
        if (child.contextValue === "file") continue;
        await this._expandTreeNodeRecursive(child);
    }
}

async function expandAll(group) {
    if (!group) return;
    try {
        const groupName = this._fboTreeLabel(group.label);
        const provider = this.treeDataProvider;

        group.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        const storedGroup = provider.groupItems?.get(groupName);
        if (storedGroup) {
            storedGroup.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
        if (provider.folderItems) {
            for (const folderItem of provider.folderItems.values()) {
                if (folderItem.fboGroupName === groupName) {
                    folderItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
                }
            }
        }

        await this._expandTreeNodeRecursive(group);
        provider.refreshEvent?.fire();
    } catch (err) {
        vscode.window.showErrorMessage(`Expand All: ${err.message}`);
    }
}

module.exports = {
    _fboTreeLabel,
    _expandTreeNodeRecursive,
    expandAll
};
