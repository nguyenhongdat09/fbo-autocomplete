// @ts-nocheck

const vscode = require("vscode");
const path = require("path");

const SEARCH_RESULT_CONTAINER_CMD = "workbench.view.extension.fbo_search_result_panel_container";
const SEARCH_RESULT_VIEW_ID = "fbo_search_result_view";
const OPEN_SEARCH_RESULT_FILE_CMD = "fbo-autocomplete.openSearchResultFile";

class SearchResultTreeView {
    constructor() {
        this.refreshEvent = new vscode.EventEmitter();
        this.onDidChangeTreeData = this.refreshEvent.event;
        this.treeView = null;
        this.typeDr = "text/uri-list";
        this.dragMimeTypes = [this.typeDr];
        this.dropMimeTypes = [];
        /** @type {import('vscode').TreeItem[]} */
        this.rootItems = [];
        /** @type {Map<string, import('vscode').TreeItem[]>} */
        this.childrenMap = new Map();
        this._activeGroupRoot = null;
    }

    run(context) {
        this.treeView = vscode.window.createTreeView("fbo_search_result_view", {
            treeDataProvider: this,
            dragAndDropController: this,
            showCollapseAll: true,
            canSelectMany: true,
        });
        const openFileCommand = vscode.commands.registerCommand(OPEN_SEARCH_RESULT_FILE_CMD, async (uri) => {
            await this.openFile(uri);
        });
        context.subscriptions.push(this.treeView, openFileCommand);
    }

    /**
     * @param {{groupRoot:string,groupLabel?:string,totalMatched:number,totalIndexed:number,filesRel:string[]}} result
     * @param {{ reveal?: boolean }} [options] reveal=true: mở panel (chỉ khi user search). false: cập nhật ngầm.
     */
    publishResult(result, options) {
        if (!result || !result.groupRoot) {
            return;
        }
        const nextRoot = this._normalizeGroupRoot(result.groupRoot);
        const isUserSearch = options && options.reveal === true;
        if (!isUserSearch && this._activeGroupRoot && nextRoot !== this._activeGroupRoot) {
            return;
        }
        this._activeGroupRoot = nextRoot;
        this._buildTree(result);
        this.refreshEvent.fire();
        if (this.treeView) {
            this.treeView.badge = { value: Number(result.totalMatched || 0), tooltip: "Matched files" };
            this.treeView.description = `${result.totalMatched}/${result.totalIndexed}`;
        }
        if (options && options.reveal === true) {
            this.showPanel();
        }
    }

    showPanel() {
        try {
            void vscode.commands.executeCommand(SEARCH_RESULT_CONTAINER_CMD);
            void vscode.commands.executeCommand(`${SEARCH_RESULT_VIEW_ID}.focus`);
        } catch (err) {
            console.error("[FBO SearchResult] showPanel:", err);
        }
    }

    getActiveGroupRoot() {
        return this._activeGroupRoot;
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

    async openFile(uriLike) {
        if (!uriLike) return;
        const uri = uriLike instanceof vscode.Uri
            ? uriLike
            : vscode.Uri.file(String(uriLike.fsPath || uriLike.path || uriLike));
        await vscode.window.showTextDocument(uri, {
            preview: false,
            viewColumn: vscode.ViewColumn.Active,
        });
    }

    _buildTree(result) {
        this.rootItems = [];
        this.childrenMap.clear();
        if (!result || !result.groupRoot) {
            return;
        }

        const displayGroup = String(result.groupLabel || "").trim() || (path.basename(result.groupRoot) || result.groupRoot);
        const rootLabel = `${displayGroup} (${result.totalMatched}/${result.totalIndexed})`;
        const root = new vscode.TreeItem(rootLabel, vscode.TreeItemCollapsibleState.Expanded);
        root.contextValue = "searchResultRoot";
        root.resourceUri = vscode.Uri.file(result.groupRoot);
        root.iconPath = new vscode.ThemeIcon("folder-library");
        const rootKey = `root::${result.groupRoot}`;
        root.fboSearchNodeKey = rootKey;
        this.rootItems.push(root);
        this.childrenMap.set(rootKey, []);

        /** @type {Map<string, import('vscode').TreeItem>} */
        const folderNodeMap = new Map();
        folderNodeMap.set(rootKey, root);

        for (const relPathRaw of (result.filesRel || [])) {
            const relPath = String(relPathRaw || "");
            if (!relPath) continue;
            const segs = relPath.split(/[\\/]+/).filter(Boolean);
            if (!segs.length) continue;

            let parentKey = rootKey;
            let accRel = "";
            for (let i = 0; i < segs.length - 1; i++) {
                const seg = segs[i];
                accRel = accRel ? (accRel + "/" + seg) : seg;
                const folderKey = `folder::${root.resourceUri.fsPath}::${accRel}`;
                if (!folderNodeMap.has(folderKey)) {
                    const folderAbs = path.join(root.resourceUri.fsPath, ...segs.slice(0, i + 1));
                    const folderItem = new vscode.TreeItem(seg, vscode.TreeItemCollapsibleState.Expanded);
                    folderItem.contextValue = "searchResultFolder";
                    folderItem.resourceUri = vscode.Uri.file(folderAbs);
                    folderItem.iconPath = vscode.ThemeIcon.Folder;
                    folderItem.fboSearchNodeKey = folderKey;
                    folderNodeMap.set(folderKey, folderItem);
                    if (!this.childrenMap.has(parentKey)) this.childrenMap.set(parentKey, []);
                    this.childrenMap.get(parentKey).push(folderItem);
                    this.childrenMap.set(folderKey, []);
                }
                parentKey = folderKey;
            }

            const fileName = segs[segs.length - 1];
            const fileAbs = path.join(root.resourceUri.fsPath, ...segs);
            const fileItem = new vscode.TreeItem(fileName, vscode.TreeItemCollapsibleState.None);
            fileItem.contextValue = "searchResultFile";
            fileItem.resourceUri = vscode.Uri.file(fileAbs);
            fileItem.description = segs.length > 1 ? segs.slice(0, -1).join("/") : "";
            fileItem.command = {
                command: OPEN_SEARCH_RESULT_FILE_CMD,
                title: "Open file",
                arguments: [fileItem.resourceUri],
            };
            if (!this.childrenMap.has(parentKey)) this.childrenMap.set(parentKey, []);
            this.childrenMap.get(parentKey).push(fileItem);
        }

        for (const [key, children] of this.childrenMap.entries()) {
            children.sort((a, b) => {
                const af = a.contextValue === "searchResultFile";
                const bf = b.contextValue === "searchResultFile";
                if (!af && bf) return -1;
                if (af && !bf) return 1;
                const la = String(a.label && (a.label.label || a.label) || "");
                const lb = String(b.label && (b.label.label || b.label) || "");
                return la.localeCompare(lb);
            });
        }
    }

    getTreeItem(element) {
        return element;
    }

    async getChildren(element) {
        if (!element) return this.rootItems;
        return this.childrenMap.get(element.fboSearchNodeKey) || [];
    }

    /**
     * Allow dragging file nodes to other trees/explorer using standard uri-list mime.
     * @param {import('vscode').TreeItem[]} source
     * @param {import('vscode').DataTransfer} dataTransfer
     */
    handleDrag(source, dataTransfer) {
        const fileItems = (source || []).filter((item) => item && item.contextValue === "searchResultFile" && item.resourceUri);
        if (!fileItems.length) return;
        const uriList = fileItems
            .map((item) => item.resourceUri.toString())
            .join("\r\n");
        if (!uriList) return;
        dataTransfer.set(this.typeDr, new vscode.DataTransferItem(uriList));
    }

    // Search Result tree is drag-source only for now.
    async handleDrop() { }
}

module.exports = SearchResultTreeView;
