// @ts-nocheck — TreeItem được gắn thêm thuộc tính fbo* cho cây nhiều cấp.

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

function fboTreeLabel(label) {
    if (label == null) return "";
    return typeof label === "string" ? label : (label.label || "");
}
const app_dataChecker = require("./AppDataPathHelper");
const OpenBrowser = require("./BrowserHandle/OpenBrowser");
const DBStatusBarManager = require("../DBQuery/dbBar");

class TreeHelper {
    constructor() {
        this.app_dataChecker = new app_dataChecker()
        this.config = vscode.workspace.getConfiguration('fbo-autocomplete');
    }

    set parentSet(parent) {
        this.parent = parent;
    }

    _findFileInItems(items, filePath) {
        if (!items || !items.length) return null;
        for (const it of items) {
            if (it.contextValue === "file" && it.resourceUri && it.resourceUri.fsPath === filePath) {
                return it;
            }
            if (it.contextValue === "folder" && it.fboFolderKey) {
                const children = this.parent.folderChildren.get(it.fboFolderKey);
                const found = this._findFileInItems(children, filePath);
                if (found) return found;
            }
        }
        return null;
    }

    _collectFileUrisFromItems(items, outSet) {
        if (!items || !items.length) return;
        for (const it of items) {
            if (it.contextValue === "file" && it.resourceUri) {
                outSet.add(it.resourceUri.toString());
            } else if (it.contextValue === "folder" && it.fboFolderKey) {
                this._collectFileUrisFromItems(this.parent.folderChildren.get(it.fboFolderKey), outSet);
            }
        }
    }

    getGroupName(filePath) {
        this.app_dataChecker.filePath = filePath;
        return this.app_dataChecker.getGroupName().toUpperCase();
    }

    getParentGroup(treeItem) {
        if (!treeItem || treeItem.contextValue !== "file") return null;
        const groupName = treeItem.fboGroupName;
        if (groupName && this.parent.groupItems && this.parent.groupItems.has(groupName)) {
            return this.parent.groupItems.get(groupName);
        }
        const fp = treeItem.resourceUri && treeItem.resourceUri.fsPath;
        if (!fp) return null;
        for (const [group, items] of this.parent.treeData) {
            const found = this._findFileInItems(items, fp);
            if (found === treeItem) {
                return this.parent.groupItems.get(group) || null;
            }
        }
        return null;
    }

    getTreeItemByPath(filePath) {
        for (const [, items] of this.parent.treeData) {
            const foundItem = this._findFileInItems(items, filePath);
            if (foundItem) return foundItem;
        }
        return null;
    }

    async getOpenEditors() {
        const openTabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
        const filePaths = openTabs
            .map(tab => {
                if (tab.input instanceof vscode.TabInputText) {
                    const uri = tab.input.uri;
                    if (uri.scheme === 'untitled' || !uri.fsPath || uri.fsPath.includes('Untitled')) {
                        return null;
                    }
                    return uri.fsPath;
                }
                return null;
            })
            .filter(filePath => filePath !== null);
        return [...new Set(filePaths)];
    }

    getGroupRootPath(filePath) {
        this.app_dataChecker.filePath = filePath;
        return this.app_dataChecker.getProjectPath();
    }

    async closeFile(element) {
        if (!element || !element.resourceUri) return;
        const fileUri = element.resourceUri.toString();
        const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
        const targetTab = tabs.find(tab => {
            const input = tab.input;
            if (!input || typeof input !== "object") return false;
            if ("uri" in input && input.uri.toString() === fileUri) {
                return true;
            }
            if ("resource" in input && input.resource.toString() === fileUri) {
                return true;
            }
            return false;
        });

        if (targetTab) {
            await vscode.window.tabGroups.close([targetTab]);
        } else {
            console.warn(`⚠️ File không có trong Open Editors: ${fileUri}`);
        }
        await this.parent.refresh()
    }

    async closeGroupFiles(element) {
        if (!element) return;

        const uriSet = new Set();
        if (element.contextValue === "group") {
            const groupName = fboTreeLabel(element.label);
            if (!this.parent.treeData.has(groupName)) return;
            this._collectFileUrisFromItems(this.parent.treeData.get(groupName), uriSet);
        } else if (element.contextValue === "folder" && element.fboFolderKey) {
            const children = this.parent.folderChildren.get(element.fboFolderKey);
            this._collectFileUrisFromItems(children || [], uriSet);
        } else {
            return;
        }

        const files = [...uriSet];
        const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);

        const targetTabs = tabs.filter(tab => {
            const input = tab.input;
            if (!input || typeof input !== "object") return false;
            if ("uri" in input && files.includes(input.uri.toString())) return true;
            if ("resource" in input && files.includes(input.resource.toString())) return true;
            return false;
        });

        if (targetTabs.length > 0) {
            await vscode.window.tabGroups.close(targetTabs);
        } else {
            const scope =
                element.contextValue === "folder" && element.resourceUri
                    ? element.resourceUri.fsPath
                    : fboTreeLabel(element.label);
            console.warn(`⚠️ Không tìm thấy file nào trong Open Editors trong phạm vi: ${scope}`);
        }

        await this.parent.refresh();
    }

    getCurrentPathActive() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || !activeEditor.document) return null;
        const filePath = activeEditor.document.uri.fsPath;
        const treeItem = this.getTreeItemByPath(filePath);
        if (!treeItem) return null;
        const parentGroup = this.getParentGroup(treeItem);
        return { filePath: filePath, treeItem: treeItem, parentGroup: parentGroup }
    }

    async revealActiveFile(group_label) {
        var cur_Item = this.getCurrentPathActive();
        if (cur_Item && cur_Item.parentGroup) {
            if (group_label != cur_Item.parentGroup.label) return
            try {
                await this.parent.treeView.reveal(cur_Item.treeItem, { select: true, expand: false });
            } catch (error) {
                // Ignore errors
            }
        }
    }

    _parseDroppedFsPaths(dataTransfer) {
        const item = dataTransfer.get(this.typeDr);
        const droppedValue = item?.value;
        if (!droppedValue) return [];
        const uriListText = typeof droppedValue === "string"
            ? droppedValue
            : (typeof droppedValue?.asString === "function" ? droppedValue.asString() : null);
        if (!uriListText) return [];
        return uriListText
            .split(/\r?\n/)
            .map(s => s.trim())
            .filter(s => !!s && !s.startsWith("#"))
            .map(s => {
                try { return vscode.Uri.parse(s); } catch { return null; }
            })
            .filter(uri => !!uri && uri.scheme === "file")
            .map(uri => uri.fsPath);
    }

    async _openDroppedFsPaths(filePaths) {
        for (const fp of filePaths) {
            try {
                await vscode.window.showTextDocument(vscode.Uri.file(fp), { preview: false, viewColumn: vscode.ViewColumn.Active });
            } catch (err) {
                vscode.window.showWarningMessage(`Không thể mở file: ${fp}`);
            }
        }
    }

    _getPasteDestinationForDropTarget(dropTargetFsPath, sourceFilePath) {
        this.app_dataChecker.filePath = sourceFilePath;
        const parts = this.app_dataChecker.getPathAfterProject();
        if (!parts || parts.length < 2 || !parts[1]) return null;
        return path.join(dropTargetFsPath, parts[1]);
    }

    _isDroppedFileAlreadyAtTarget(dropTargetFsPath, sourceFilePath) {
        const expected = this._getPasteDestinationForDropTarget(dropTargetFsPath, sourceFilePath);
        if (!expected) return false;
        try {
            return path.normalize(sourceFilePath) === path.normalize(expected);
        } catch {
            return false;
        }
    }
}

class TreeFileProvider extends TreeHelper {
    constructor() {
        super();
        this.parentSet = this;
        this.refreshEvent = new vscode.EventEmitter();
        this.onDidChangeTreeData = this.refreshEvent.event;
        this.treeData = new Map();
        this.app_dataChecker = new app_dataChecker();
        this.typeDr = "text/uri-list";
        this.dropMimeTypes = [this.typeDr];
        this.dragMimeTypes = [this.typeDr];
        this.treeView = null;
        this.groupItems = new Map();
        /** @type {Map<string, import('vscode').TreeItem[]>} */
        this.folderChildren = new Map();
        /** @type {Map<string, import('vscode').TreeItem>} */
        this.folderItems = new Map();
        this.context = null;
        this.debouncedRefresh = this.debounce(() => this.refresh(), 300);
        this._isInitialized = false;
        this._buildPromise = null;
        this._lastSelect = { path: null, time: 0 };
        this.dbStatusBar = null;
        /** Chuỗi gốc người dùng nhập (để hiển thị / lưu workspace). */
        this._treeFilterRaw = "";
        /** Lọc dạng substring (lowercase); rỗng nếu chỉ dùng glob. */
        this._treeFilterSubstr = "";
        /** Glob đơn giản trên tên file / nhãn folder khi có ký tự `*`. */
        this._treeFilterGlobRe = null;
    }

    _setFilterFromString(raw) {
        this._treeFilterRaw = String(raw || "").trim();
        this._treeFilterGlobRe = null;
        this._treeFilterSubstr = "";
        if (!this._treeFilterRaw) {
            return;
        }
        if (this._treeFilterRaw.includes("*")) {
            const esc = this._treeFilterRaw.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
            try {
                this._treeFilterGlobRe = new RegExp("^" + esc + "$", "i");
            } catch {
                this._treeFilterSubstr = this._treeFilterRaw.toLowerCase();
            }
        } else {
            this._treeFilterSubstr = this._treeFilterRaw.toLowerCase();
        }
    }

    _hasActiveTreeFilter() {
        return !!(this._treeFilterGlobRe || this._treeFilterSubstr);
    }

    _treeFilterLabelMatches(labelText) {
        if (!this._hasActiveTreeFilter()) {
            return true;
        }
        const s = labelText == null ? "" : String(labelText);
        if (this._treeFilterGlobRe) {
            return this._treeFilterGlobRe.test(s);
        }
        return s.toLowerCase().includes(this._treeFilterSubstr);
    }

    _treeFilterFileMatches(item) {
        if (!this._hasActiveTreeFilter() || !item.resourceUri) {
            return true;
        }
        const fp = item.resourceUri.fsPath;
        const base = path.basename(fp);
        if (this._treeFilterGlobRe) {
            return this._treeFilterGlobRe.test(base);
        }
        const bl = base.toLowerCase();
        const fl = fp.toLowerCase();
        return bl.includes(this._treeFilterSubstr) || fl.includes(this._treeFilterSubstr);
    }

    _applyTreeFilterToItems(items) {
        if (!items || !items.length) {
            return [];
        }
        if (!this._hasActiveTreeFilter()) {
            return items;
        }
        const out = [];
        for (const it of items) {
            if (it.contextValue === "file") {
                if (this._treeFilterFileMatches(it)) {
                    out.push(it);
                }
            } else if (it.contextValue === "folder") {
                const subRaw = this.folderChildren.get(it.fboFolderKey) || [];
                const subFiltered = this._applyTreeFilterToItems(subRaw);
                const name = fboTreeLabel(it.label);
                if (subFiltered.length > 0 || this._treeFilterLabelMatches(name)) {
                    out.push(it);
                }
            }
        }
        return out;
    }

    _filterRootGroupItems(roots) {
        if (!this._hasActiveTreeFilter() || !roots || !roots.length) {
            return roots || [];
        }
        return roots.filter((g) => {
            const label = fboTreeLabel(g.label);
            const raw = this.treeData.get(label) || [];
            const filtered = this._applyTreeFilterToItems(raw);
            if (filtered.length > 0) {
                return true;
            }
            return this._treeFilterLabelMatches(label);
        });
    }

    _syncTreeViewFilterBadge() {
        if (!this.treeView) {
            return;
        }
        this.treeView.description = undefined;
        vscode.commands.executeCommand("setContext", "fboFileTreeFilterActive", !!this._treeFilterRaw);
    }

    /**
     * @param {string} groupName
     * @param {number} fileCountInGroup
     * @returns {boolean}
     */
    _shouldNestGroup(groupName, fileCountInGroup) {
        return true;
    }

    _countFilesInGroup(groupName) {
        const items = this.treeData.get(groupName);
        if (!items || !items.length) return 0;
        const s = new Set();
        this._collectFileFsPathsFromItems(items, s);
        return s.size;
    }

    _relDirSegments(groupPath, filePath) {
        if (!groupPath) return [];
        const dir = path.dirname(filePath);
        let relDir = path.relative(groupPath, dir);
        if (!relDir || relDir === ".") return [];
        if (relDir.startsWith("..") || path.isAbsolute(relDir)) return [];
        return relDir.split(path.sep).filter(Boolean);
    }

    /**
     * Phần suffix của fboFolderKey: luôn dùng segment chữ thường để gộp Lookup/lookup
     * (UNC/Windows không phân biệt hoa thường; VS Code có thể trả về path khác nhau từng tab).
     */
    _folderKeySuffixNormalized(segments, endExclusive) {
        return segments.slice(0, endExclusive).map((s) => s.toLowerCase()).join("/");
    }

    /**
     * @param {string} groupName
     * @param {string[]} segments
     * @param {string} groupPath
     * @returns {string|null} fboFolderKey of deepest folder, or null if segments empty
     */
    _ensureFolderNodes(groupName, segments, groupPath) {
        if (!segments.length || !groupPath) return null;
        let parentFolderKey = null;
        let accumPath = groupPath;
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const folderKey = `${groupName}::${this._folderKeySuffixNormalized(segments, i + 1)}`;
            if (!this.folderItems.has(folderKey)) {
                accumPath = path.join(accumPath, seg);
                const folderItem = new vscode.TreeItem(seg, vscode.TreeItemCollapsibleState.Collapsed);
                folderItem.resourceUri = vscode.Uri.file(accumPath);
                folderItem.contextValue = "folder";
                folderItem.fboFolderKey = folderKey;
                folderItem.fboGroupName = groupName;
                folderItem.fboParentFolderKey = parentFolderKey;
                folderItem.iconPath = vscode.ThemeIcon.Folder;
                this.folderItems.set(folderKey, folderItem);
                this.folderChildren.set(folderKey, []);
                if (parentFolderKey === null) {
                    this.treeData.get(groupName).push(folderItem);
                } else {
                    this.folderChildren.get(parentFolderKey).push(folderItem);
                }
            } else {
                const existing = this.folderItems.get(folderKey);
                if (existing && existing.resourceUri && existing.resourceUri.fsPath) {
                    accumPath = existing.resourceUri.fsPath;
                } else {
                    accumPath = path.join(accumPath, seg);
                }
            }
            parentFolderKey = folderKey;
        }
        return parentFolderKey;
    }

    _sortFolderTreeItems(items, sortType) {
        if (!items || !items.length) return;
        items.sort((a, b) => {
            const af = a.contextValue === "file";
            const bf = b.contextValue === "file";
            if (!af && bf) return -1;
            if (af && !bf) return 1;
            const labelA = typeof a.label === "string" ? a.label : (a.label && a.label.label) || "";
            const labelB = typeof b.label === "string" ? b.label : (b.label && b.label.label) || "";
            if (!af && !bf) return labelA.localeCompare(labelB);
            const fa = a.resourceUri.fsPath;
            const fb = b.resourceUri.fsPath;
            const ea = path.extname(fa).toLowerCase();
            const eb = path.extname(fb).toLowerCase();
            if (ea !== eb) return ea.localeCompare(eb);
            if (String(sortType) === "folderName") {
                const da = path.basename(path.dirname(fa));
                const db = path.basename(path.dirname(fb));
                const c = da.localeCompare(db);
                if (c !== 0) return c;
            }
            return labelA.localeCompare(labelB);
        });
    }

    _collectFileFsPathsFromItems(items, outSet) {
        if (!items || !items.length) return;
        for (const it of items) {
            if (it.contextValue === "file" && it.resourceUri) {
                outSet.add(it.resourceUri.fsPath);
            } else if (it.contextValue === "folder" && it.fboFolderKey) {
                this._collectFileFsPathsFromItems(this.folderChildren.get(it.fboFolderKey), outSet);
            }
        }
    }

    _removeFileFromItems(items, filePath) {
        if (!items || !items.length) return false;
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (it.contextValue === "file" && it.resourceUri && it.resourceUri.fsPath === filePath) {
                items.splice(i, 1);
                return true;
            }
            if (it.contextValue === "folder" && it.fboFolderKey) {
                const ch = this.folderChildren.get(it.fboFolderKey);
                if (ch && this._removeFileFromItems(ch, filePath)) {
                    return true;
                }
            }
        }
        return false;
    }

    _pruneEmptyFoldersForGroup(groupName) {
        let changed = true;
        while (changed) {
            changed = false;
            for (const [key, folderItem] of [...this.folderItems.entries()]) {
                if (folderItem.fboGroupName !== groupName) continue;
                const ch = this.folderChildren.get(key);
                if (!ch || ch.length !== 0) continue;
                const pk = folderItem.fboParentFolderKey;
                if (pk) {
                    const pl = this.folderChildren.get(pk);
                    if (pl) {
                        const idx = pl.indexOf(folderItem);
                        if (idx !== -1) pl.splice(idx, 1);
                    }
                } else {
                    const roots = this.treeData.get(groupName);
                    if (roots) {
                        const idx = roots.indexOf(folderItem);
                        if (idx !== -1) roots.splice(idx, 1);
                    }
                }
                this.folderChildren.delete(key);
                this.folderItems.delete(key);
                changed = true;
            }
        }
    }

    _clearFolderMapsForGroup(groupName) {
        const prefix = `${groupName}::`;
        for (const key of [...this.folderItems.keys()]) {
            if (key.startsWith(prefix)) {
                this.folderItems.delete(key);
                this.folderChildren.delete(key);
            }
        }
    }

    async run(context) {
        this.context = context;

        const savedFilter = context.workspaceState.get("fboFileTree.filter", "");
        this._setFilterFromString(savedFilter);

        this.treeView = vscode.window.createTreeView("fbo_file", {
            treeDataProvider: this,
            dragAndDropController: this,
            showCollapseAll: true,
            canSelectMany: true
        });

        // ✅ Build tree trong background
        Promise.resolve().then(async () => {
            await this.buildTreeOptimized();
            this._isInitialized = true;
            this.refreshEvent.fire();

            // ✅ AUTO EXPAND & REVEAL sau khi build xong
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const filePath = activeEditor.document.uri.fsPath;
                const treeItem = this.getTreeItemByPath(filePath);
                if (treeItem) {
                    const parentGroup = this.getParentGroup(treeItem);
                    if (parentGroup) {
                        try {
                            await this.treeView.reveal(parentGroup, { select: false, expand: true });
                            await this.revealActiveFile(parentGroup.label);
                        } catch (err) {
                            // Ignore error
                        }
                    }
                }
            }
        });

        // ✅ onDidChangeTextDocument - Update dirty + Auto reveal
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            if (!this._isInitialized) return;

            const filePath = event.document.uri.fsPath;
            const treeItem = this.getTreeItemByPath(filePath);

            if (treeItem) {
                const folderName = path.basename(path.dirname(filePath));
                treeItem.description = `(${folderName})`;
                this.refreshEvent.fire(treeItem);
            }

            // ✅ AUTO REVEAL khi gõ phím
            const cur_Item = this.getCurrentPathActive();
            if (!cur_Item || !cur_Item.parentGroup) return;

            const selected = this.treeView.selection[0];
            if (selected && event.document.uri.toString() === selected.resourceUri?.toString()) {
                return;
            }

            try {
                await this.treeView.reveal(cur_Item.parentGroup, { select: false, expand: true });
                await this.revealActiveFile(cur_Item.parentGroup.label);
            } catch (err) { }
        });

        // ✅ onDidSaveTextDocument
        vscode.workspace.onDidSaveTextDocument((doc) => {
            if (!this._isInitialized) return;
            const filePath = doc.uri.fsPath;
            const treeItem = this.getTreeItemByPath(filePath);
            if (treeItem) {
                const folderName = path.basename(path.dirname(filePath));
                treeItem.description = `(${folderName})`;
                this.refreshEvent.fire(treeItem);
            }
        });

        // ✅ 🆕 onDidOpenTextDocument - KHI MỞ FILE MỚI (Kéo thả, double click, etc.)
        vscode.workspace.onDidOpenTextDocument(async (document) => {
            if (!this._isInitialized) return;

            // Chỉ xử lý file trong workspace
            if (document.uri.scheme !== 'file') return;

            const filePath = document.uri.fsPath;

            // Kiểm tra xem file đã có trong tree chưa
            let treeItem = this.getTreeItemByPath(filePath);

            // Nếu chưa có, thêm vào tree (file mới kéo vào)
            if (!treeItem) {
                this.addFileToTree(filePath);
                await this.refreshEvent.fire();

                // Đợi tree update xong
                await new Promise(resolve => setTimeout(resolve, 100));

                // Lấy lại treeItem sau khi add
                treeItem = this.getTreeItemByPath(filePath);
            }

            // Reveal file trong tree
            if (treeItem) {
                const parentGroup = this.getParentGroup(treeItem);
                if (parentGroup) {
                    try {
                        await this.treeView.reveal(parentGroup, { select: false, expand: true });
                        await this.revealActiveFile(parentGroup.label);
                    } catch (err) {
                        // Ignore error
                    }
                }
            }
        });

        // ✅ onDidChangeVisibleTextEditors - Khi thay đổi editor hiển thị
        const debouncedVisibleChange = this.debounce(async () => {
            if (!this._isInitialized) return;
            await this.smartRefresh();
        }, 500);

        vscode.window.onDidChangeVisibleTextEditors(() => {
            debouncedVisibleChange();
        });

        // ✅ onDidChangeActiveTextEditor - Khi đổi tab
        vscode.window.onDidChangeActiveTextEditor(async (editor) => {
            if (!editor || !this._isInitialized) return;

            setTimeout(async () => {
                const filePath = editor.document.uri.fsPath;
                let treeItem = this.getTreeItemByPath(filePath);

                // Nếu file chưa có trong tree, add vào
                if (!treeItem) {
                    this.addFileToTree(filePath);
                    await this.refreshEvent.fire();
                    await new Promise(resolve => setTimeout(resolve, 100));
                    treeItem = this.getTreeItemByPath(filePath);
                }

                if (!treeItem) return;

                const parentGroup = this.getParentGroup(treeItem);
                if (parentGroup) {
                    try {
                        await this.treeView.reveal(parentGroup, { select: false, expand: true });
                        await this.revealActiveFile(parentGroup.label);
                    } catch (err) { }
                    const gLabel = fboTreeLabel(parentGroup.label);
                    if (this.dbStatusBar && gLabel && gLabel.toUpperCase() !== "OTHER") {
                        if (typeof this.dbStatusBar.reloadDbOptionsFromGroups === "function") {
                            this.dbStatusBar.reloadDbOptionsFromGroups();
                        }
                        this.dbStatusBar.updateText(gLabel + " (App)");
                    }
                }
            }, 100);
        });

        // Commands
        vscode.commands.registerCommand("fbo-autocomplete.reloadTree", async () => {
            if (this.treeView.visible) {
                await this.refresh();
                const cur_Item = this.getCurrentPathActive();
                if (cur_Item && cur_Item.parentGroup) {
                    await this.treeView.reveal(cur_Item.parentGroup, { select: false, expand: true });
                    await this.revealActiveFile(cur_Item.parentGroup.label);
                }
            }
        });

        vscode.commands.registerCommand("fbo-autocomplete.closeFile", async (element) => {
            await this.closeFile(element);
        });

        vscode.commands.registerCommand('fbo-autocomplete.closeGroupFiles', async (element) => {
            await this.closeGroupFiles(element);
        });

        let disposable = vscode.commands.registerCommand("fbo-autocomplete.TreeTabReload", async () => {
            await this.refresh();
            vscode.window.showInformationMessage("FBO File Tree đã được reload!");
        });

        this._syncTreeViewFilterBadge();

        // ✅ onDidExpandElement - Reveal khi expand group
        this.treeView.onDidExpandElement(async (event) => {
            const element = event.element;
            if (element.contextValue === "group") {
                await this.revealActiveFile(element.label);
            }
        });

        // ✅ OpenBrowser - Đăng ký commands mở browser
        const openBrowser = new OpenBrowser();
        openBrowser.registerCommands(context);
     
        // trong constructor hoặc run, khởi tạo biến lưu trạng thái
        //await openBrowser.openBrowserForFile(filePath);
        // sau khi this.treeView được tạo (trong run)
       
        this.dbStatusBar = new DBStatusBarManager(context); 
        this.dbStatusBar.show();
        context.subscriptions.push(this.treeView, disposable);
    }

    async promptTreeFilter() {
        if (!this.context) {
            return;
        }
        const value = await vscode.window.showInputBox({
            title: "Lọc cây FBO Project",
            placeHolder: "VD: SI, Grid, *.xml — để trống để xóa lọc",
            value: this._treeFilterRaw,
            prompt: "Khớp chuỗi trong tên/đường dẫn file (không phân biệt hoa thường). Có dấu * thì glob theo tên file hoặc tên folder.",
            ignoreFocusOut: true,
        });
        if (value === undefined) {
            return;
        }
        this._setFilterFromString(value);
        await this.context.workspaceState.update("fboFileTree.filter", this._treeFilterRaw);
        this._syncTreeViewFilterBadge();
        this.refreshEvent.fire();
    }

    async clearTreeFilter() {
        if (!this.context) {
            return;
        }
        this._setFilterFromString("");
        await this.context.workspaceState.update("fboFileTree.filter", "");
        this._syncTreeViewFilterBadge();
        this.refreshEvent.fire();
    }

    async buildTreeOptimized() {
        if (this._buildPromise) {
            return this._buildPromise;
        }

        this._buildPromise = (async () => {
            this.treeData.clear();
            this.groupItems.clear();
            this.folderChildren.clear();
            this.folderItems.clear();

            const openFiles = await this.getOpenEditors();

            if (openFiles.length === 0) {
                return [];
            }

            const config = vscode.workspace.getConfiguration('fbo-autocomplete');
            const sortType = config.get('sortTree', 'FileName');
            const iconRule = config.get('sortTree', 'iconRule');

            // Pre-compute metadata
            const fileData = openFiles.map(filePath => {
                const dirname = path.dirname(filePath);
                const folderName = path.basename(dirname);
                const fileName = path.basename(filePath);
                const ext = path.extname(filePath).toLowerCase();

                this.app_dataChecker.filePath = filePath;
                let groupName = this.app_dataChecker.getGroupName().toUpperCase();
                if (filePath.toLowerCase().endsWith(".md.plan")) {
                    groupName = "OTHER";
                }

                return {
                    filePath,
                    dirname,
                    folderName,
                    fileName,
                    ext,
                    groupName
                };
            });

            // Sort
            fileData.sort((a, b) => {
                if (a.groupName !== b.groupName) {
                    return a.groupName.localeCompare(b.groupName);
                }
                if (a.ext !== b.ext) {
                    return a.ext.localeCompare(b.ext);
                }
                if (String(sortType) === 'folderName') {
                    const folderCompare = a.folderName.localeCompare(b.folderName);
                    if (folderCompare !== 0) return folderCompare;
                    return a.fileName.localeCompare(b.fileName);
                } else {
                    return a.fileName.localeCompare(b.fileName);
                }
            });

            const groupCounts = new Map();
            for (const d of fileData) {
                groupCounts.set(d.groupName, (groupCounts.get(d.groupName) || 0) + 1);
            }

            // Pre-compute icon paths
            const iconCache = new Map();
            const getIconPath = (key) => {
                if (!iconCache.has(key)) {
                    iconCache.set(key, {
                        light: vscode.Uri.file(path.join(__dirname, '..', '..', 'images', 'light', `${key}_icon.svg`)),
                        dark: vscode.Uri.file(path.join(__dirname, '..', '..', 'images', 'dark', `${key}_icon.svg`))
                    });
                }
                return iconCache.get(key);
            };

            // Build items (group → folder* → file)
            for (const data of fileData) {
                const { filePath, folderName, ext, groupName } = data;

                if (!this.treeData.has(groupName)) {
                    const groupItem = new vscode.TreeItem(groupName, vscode.TreeItemCollapsibleState.Collapsed);
                    groupItem.contextValue = "group";

                    this.app_dataChecker.filePath = filePath;
                    const groupPathInit = this.app_dataChecker.getProjectPath();
                    if (groupPathInit) {
                        groupItem.resourceUri = vscode.Uri.file(groupPathInit);
                    }

                    this.treeData.set(groupName, []);
                    this.groupItems.set(groupName, groupItem);
                }

                const groupItemRef = this.groupItems.get(groupName);
                const groupPath = groupItemRef && groupItemRef.resourceUri && groupItemRef.resourceUri.fsPath;
                const totalInGroup = groupCounts.get(groupName);
                const nest = this._shouldNestGroup(groupName, totalInGroup);
                const segments = nest ? this._relDirSegments(groupPath || "", filePath) : [];
                const parentFolderKey = nest ? this._ensureFolderNodes(groupName, segments, groupPath || "") : null;
                const parentList = parentFolderKey
                    ? this.folderChildren.get(parentFolderKey)
                    : this.treeData.get(groupName);

                const uri = vscode.Uri.file(filePath);
                const item = new vscode.TreeItem(uri, vscode.TreeItemCollapsibleState.None);
                item.resourceUri = uri;
                item.contextValue = "file";
                item.fboGroupName = groupName;
                item.fboParentFolderKey = parentFolderKey;

                item.description = `(${folderName})`;

                item.command = {
                    command: "vscode.open",
                    arguments: [uri],
                    title: "Mở file"
                };

                if (String(iconRule) === 'Yes') {
                    item.iconPath = getIconPath(ext);
                } else {
                    const folderLower = folderName.toLowerCase();
                    if (['grid', 'dir', 'filter', 'report', 'lookup', 'upload'].includes(folderLower)) {
                        item.iconPath = getIconPath(folderLower);
                    }
                }

                parentList.push(item);
            }

            for (const [, items] of this.treeData) {
                this._sortFolderTreeItems(items, sortType);
            }
            for (const [, items] of this.folderChildren) {
                this._sortFolderTreeItems(items, sortType);
            }

            return [...this.treeData.keys()].map(groupName => this.groupItems.get(groupName));
        })();
        
        const result = await this._buildPromise;
        this._buildPromise = null; 

        // Cập nhật groupItems cho status bar DB và reload lại danh sách DB
        if (this.dbStatusBar) {
            this.dbStatusBar.groupItems = this.groupItems;
            if (typeof this.dbStatusBar.reloadDbOptionsFromGroups === 'function') {
                try {
                    this.dbStatusBar.reloadDbOptionsFromGroups();
                } catch (e) {
                    console.error("[FBO dbBar] reloadDbOptionsFromGroups error:", e);
                    console.error("[FBO dbBar] stack:", e && e.stack);
                }
            }
        }

        return result;
    }

    async buildTree() {
        return this.buildTreeOptimized();
    }

    addFileToTree(filePath) {
        const uri = vscode.Uri.file(filePath);
        if (uri.scheme !== 'file') return;
        if (this.getTreeItemByPath(filePath)) return;

        const folderName = path.basename(path.dirname(filePath));
        this.app_dataChecker.filePath = filePath;
        let groupName = this.app_dataChecker.getGroupName().toUpperCase();
        if (filePath.toLowerCase().endsWith(".md.plan")) {
            groupName = "OTHER";
        }
        if (!groupName) return;

        const config = vscode.workspace.getConfiguration('fbo-autocomplete');
        const sortType = config.get('sortTree', 'FileName');
        const iconRule = config.get('sortTree', 'iconRule');

        const item = new vscode.TreeItem(uri, vscode.TreeItemCollapsibleState.None);
        item.resourceUri = uri;
        item.contextValue = "file";
        item.fboGroupName = groupName;
        item.description = `(${folderName})`;

        item.command = {
            command: "vscode.open",
            arguments: [uri],
            title: "Mở file"
        };

        if (String(iconRule) === 'Yes') {
            const iconName = `${path.extname(filePath).toLowerCase()}_icon.svg`;
            item.iconPath = {
                light: vscode.Uri.file(path.join(__dirname, '..', '..', 'images', 'light', iconName)),
                dark: vscode.Uri.file(path.join(__dirname, '..', '..', 'images', 'dark', iconName))
            };
        } else {
            const folderLower = folderName.toLowerCase();
            if (['grid', 'dir', 'filter', 'report', 'lookup', 'upload'].includes(folderLower)) {
                const iconName = `${folderLower}_icon.svg`;
                item.iconPath = {
                    light: vscode.Uri.file(path.join(__dirname, '..', '..', 'images', 'light', iconName)),
                    dark: vscode.Uri.file(path.join(__dirname, '..', '..', 'images', 'dark', iconName))
                };
            }
        }

        if (!this.treeData.has(groupName)) {
            const groupItem = new vscode.TreeItem(groupName, vscode.TreeItemCollapsibleState.Collapsed);
            groupItem.contextValue = "group";

            this.app_dataChecker.filePath = filePath;
            const groupPath = this.app_dataChecker.getProjectPath();
            if (groupPath) {
                groupItem.resourceUri = vscode.Uri.file(groupPath);
            }

            this.treeData.set(groupName, []);
            this.groupItems.set(groupName, groupItem);
        }

        const prevCount = this._countFilesInGroup(groupName);
        const nextCount = prevCount + 1;
        if (this._shouldNestGroup(groupName, prevCount) !== this._shouldNestGroup(groupName, nextCount)) {
            void this.buildTreeOptimized().then(() => this.refreshEvent.fire());
            return;
        }

        const groupItemRef = this.groupItems.get(groupName);
        const groupPath = groupItemRef && groupItemRef.resourceUri && groupItemRef.resourceUri.fsPath;
        const nest = this._shouldNestGroup(groupName, nextCount);
        const segments = nest ? this._relDirSegments(groupPath || "", filePath) : [];
        const parentFolderKey = nest ? this._ensureFolderNodes(groupName, segments, groupPath || "") : null;
        item.fboParentFolderKey = parentFolderKey;
        const parentList = parentFolderKey
            ? this.folderChildren.get(parentFolderKey)
            : this.treeData.get(groupName);

        parentList.push(item);
        this._sortFolderTreeItems(parentList, sortType);
    }

    async smartRefresh() {
        const currentFiles = await this.getOpenEditors();
        const existingFiles = new Set();

        for (const [, items] of this.treeData) {
            this._collectFileFsPathsFromItems(items, existingFiles);
        }

        const newFiles = currentFiles.filter(f => !existingFiles.has(f));
        const removedFiles = [...existingFiles].filter(f => !currentFiles.includes(f));

        if (newFiles.length > 0 || removedFiles.length > 0) {
            newFiles.forEach(f => this.addFileToTree(f));
            removedFiles.forEach(f => this.removeSingleFile(f));
            this.refreshEvent.fire();
        }
    }

    removeSingleFile(filePath) {
        const treeItem = this.getTreeItemByPath(filePath);
        const trackedGroup = treeItem && treeItem.fboGroupName;
        const prevCount = trackedGroup != null ? this._countFilesInGroup(trackedGroup) : 0;

        for (const [groupName, items] of this.treeData) {
            if (this._removeFileFromItems(items, filePath)) {
                this._pruneEmptyFoldersForGroup(groupName);
                const roots = this.treeData.get(groupName);
                if (!roots || roots.length === 0) {
                    this._clearFolderMapsForGroup(groupName);
                    this.treeData.delete(groupName);
                    this.groupItems.delete(groupName);
                }
                if (trackedGroup != null && prevCount > 0) {
                    const nextCount = prevCount - 1;
                    if (this._shouldNestGroup(trackedGroup, prevCount) !== this._shouldNestGroup(trackedGroup, nextCount)) {
                        void this.buildTreeOptimized().then(() => this.refreshEvent.fire());
                    }
                }
                break;
            }
        }
    }

    getTreeItem(element) {
        return element;
    }

    async getChildren(element) {
        if (!this._isInitialized && !element) {
            return [];
        }

        if (!element) {
            const roots = await this.buildTreeOptimized();
            return this._filterRootGroupItems(roots);
        }
        if (element.contextValue === "group") {
            const raw = this.treeData.get(fboTreeLabel(element.label)) || [];
            return this._applyTreeFilterToItems(raw);
        }
        if (element.contextValue === "folder" && element.fboFolderKey) {
            const raw = this.folderChildren.get(element.fboFolderKey) || [];
            return this._applyTreeFilterToItems(raw);
        }
        return [];
    }

    getParent(element) {
        if (!element) return null;
        if (element.contextValue === "file") {
            if (element.fboParentFolderKey) {
                return this.folderItems.get(element.fboParentFolderKey) || null;
            }
            if (element.fboGroupName) {
                return this.groupItems.get(element.fboGroupName) || null;
            }
            return null;
        }
        if (element.contextValue === "folder") {
            if (element.fboParentFolderKey) {
                return this.folderItems.get(element.fboParentFolderKey) || null;
            }
            if (element.fboGroupName) {
                return this.groupItems.get(element.fboGroupName) || null;
            }
            return null;
        }
        return null;
    }

    debounce(func, delay) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => func.apply(this, args), delay);
        };
    }

    async refresh() {
        this.parentSet = this;
        await this.buildTreeOptimized();
        this.refreshEvent.fire();
    }

    handleDrag(source, dataTransfer, token) {
        const filesOnly = source.every(item => item.contextValue === 'file');
        if (!filesOnly) return;

        // Use standard "text/uri-list" so OS Explorer/VS Code Explorer drops work too.
        // Format: newline-separated URIs.
        const uriList = source
            .map(item => item.resourceUri)
            .filter(Boolean)
            .map(uri => uri.toString())
            .join("\r\n");

        if (!uriList) return;
        dataTransfer.set(this.typeDr, new vscode.DataTransferItem(uriList));
    }

    /**
     * Gốc paste luôn là project path của nhóm (level 1), kể cả khi kéo thả vào folder level 2+.
     * Tránh join(pathFolderCon, đườngDẫnTươngĐốiTừProject) tạo thêm App_data/App_data/...
     */
    _getGroupRootPathForDropTarget(target) {
        if (!target || !target.resourceUri) return null;
        if (target.contextValue === "group") {
            return target.resourceUri.fsPath || null;
        }
        if (target.contextValue === "folder" && target.fboGroupName) {
            const groupItem = this.groupItems.get(target.fboGroupName);
            const groupRoot = groupItem && groupItem.resourceUri && groupItem.resourceUri.fsPath;
            if (groupRoot) return groupRoot;
        }
        return target.resourceUri.fsPath || null;
    }

    async handleDrop(target, dataTransfer, token) {
        const filePaths = this._parseDroppedFsPaths(dataTransfer);
        if (!filePaths.length) return;

        if (!target || !target.resourceUri) {
            await this._openDroppedFsPaths(filePaths);
            return;
        }
        if (target.contextValue !== "group" && target.contextValue !== "folder") {
            await this._openDroppedFsPaths(filePaths);
            return;
        }

        const destPath = this._getGroupRootPathForDropTarget(target);
        if (!destPath) {
            await this._openDroppedFsPaths(filePaths);
            return;
        }

        const toOpen = [];
        const toPaste = [];
        for (const fp of filePaths) {
            this.app_dataChecker.filePath = fp;
            if (this.app_dataChecker.getGroupName() === "Other") {
                toOpen.push(fp);
                continue;
            }
            const parts = this.app_dataChecker.getPathAfterProject();
            if (!parts || parts.length < 2 || !parts[1]) {
                toOpen.push(fp);
                continue;
            }
            if (this._isDroppedFileAlreadyAtTarget(destPath, fp)) {
                toOpen.push(fp);
            } else {
                toPaste.push(fp);
            }
        }

        await this._openDroppedFsPaths(toOpen);
        if (toPaste.length) {
            try {
                await this.app_dataChecker.pasteFilesToGroup(destPath, toPaste, 0);
            } catch (ex) {
                console.log(ex);
            }
        }
    }
}

module.exports = TreeFileProvider;