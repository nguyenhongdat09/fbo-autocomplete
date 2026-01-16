const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const app_dataChecker = require("./AppDataPathHelper");
const OpenBrowser = require("./BrowserHandle/OpenBrowser");

class TreeHelper {
    constructor() {
        this.app_dataChecker = new app_dataChecker()
        this.config = vscode.workspace.getConfiguration('fbo-autocomplete');
    }

    set parentSet(parent) {
        this.parent = parent;
    }

    getGroupName(filePath) {
        this.app_dataChecker.filePath = filePath;
        return this.app_dataChecker.getGroupName().toUpperCase();
    }

    getParentGroup(treeItem) {
        for (const [group, items] of this.parent.treeData) {
            if (items.includes(treeItem)) return new vscode.TreeItem(group, vscode.TreeItemCollapsibleState.Expanded);
        }
        return null;
    }

    getTreeItemByPath(filePath) {
        for (const [group, items] of this.parent.treeData) {
            const foundItem = items.find(item => item.resourceUri.fsPath === filePath);
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

    async closeGroupFiles(groupName) {
        if (!this.parent.treeData.has(groupName)) return;

        const files = this.parent.treeData.get(groupName).map(item => item.resourceUri.toString());
        const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);

        const targetTabs = tabs.filter(tab => {
            const input = tab.input;
            return input && typeof input === "object" && "uri" in input && files.includes(input.uri.toString());
        });

        if (targetTabs.length > 0) {
            await vscode.window.tabGroups.close(targetTabs);
        } else {
            console.warn(`⚠️ Không tìm thấy file nào trong Open Editors cho nhóm: ${groupName}`);
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
        this.context = null;
        this.debouncedRefresh = this.debounce(() => this.refresh(), 300);
        this._isInitialized = false;
        this._buildPromise = null;
        this._lastSelect = { path: null, time: 0 };
    }

    async run(context) {
        this.context = context;

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
                treeItem.description = event.document.isDirty ? `(${folderName}) ●` : `(${folderName})`;
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
            if (element && element.label) {
                await this.closeGroupFiles(element.label);
            }
        });

        let disposable = vscode.commands.registerCommand("fbo-autocomplete.TreeTabReload", async () => {
            await this.refresh();
            vscode.window.showInformationMessage("FBO File Tree đã được reload!");
        });

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
       
        
        context.subscriptions.push(this.treeView, disposable);
    }

    async buildTreeOptimized() {
        if (this._buildPromise) {
            return this._buildPromise;
        }

        this._buildPromise = (async () => {
            this.treeData.clear();
            this.groupItems.clear();

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
                const groupName = this.app_dataChecker.getGroupName().toUpperCase();

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

            // Pre-compute dirty status
            const dirtyDocs = new Set();
            vscode.workspace.textDocuments.forEach(doc => {
                if (doc.isDirty) {
                    dirtyDocs.add(doc.uri.toString());
                }
            });

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

            // Build items
            for (const data of fileData) {
                const { filePath, folderName, fileName, ext, groupName, dirname } = data;

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

                const uri = vscode.Uri.file(filePath);
                const item = new vscode.TreeItem(uri, vscode.TreeItemCollapsibleState.None);
                item.resourceUri = uri;
                item.contextValue = "file";

                const isDirty = dirtyDocs.has(uri.toString());
                item.description = isDirty ? `(${folderName}) ●` : `(${folderName})`;

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

                this.treeData.get(groupName).push(item);
            }

            return [...this.treeData.keys()].map(groupName => this.groupItems.get(groupName));
        })();

        const result = await this._buildPromise;
        this._buildPromise = null;
        return result;
    }

    async buildTree() {
        return this.buildTreeOptimized();
    }

    addFileToTree(filePath) {
        const uri = vscode.Uri.file(filePath);
        if (uri.scheme !== 'file') return;

        const folderName = path.basename(path.dirname(filePath));
        this.app_dataChecker.filePath = filePath;
        const groupName = this.app_dataChecker.getGroupName().toUpperCase();
        if (!groupName) return;

        const item = new vscode.TreeItem(uri, vscode.TreeItemCollapsibleState.None);
        item.resourceUri = uri;
        item.contextValue = "file";
        item.description = `(${folderName})`;

        item.command = {
            command: "vscode.open",
            arguments: [uri],
            title: "Mở file"
        };

        const config = vscode.workspace.getConfiguration('fbo-autocomplete');
        const iconRule = config.get('sortTree', 'iconRule');

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

        this.treeData.get(groupName).push(item);
    }

    async smartRefresh() {
        const currentFiles = await this.getOpenEditors();
        const existingFiles = new Set();

        for (const [group, items] of this.treeData) {
            items.forEach(item => existingFiles.add(item.resourceUri.fsPath));
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
        for (const [group, items] of this.treeData) {
            const index = items.findIndex(item => item.resourceUri.fsPath === filePath);
            if (index !== -1) {
                items.splice(index, 1);
                if (items.length === 0) {
                    this.treeData.delete(group);
                    this.groupItems.delete(group);
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
            return this.buildTreeOptimized();
        }
        return this.treeData.get(element.label) || [];
    }

    getParent(element) {
        if (!element) return null;
        if (element.contextValue === "file") {
            return this.getParentGroup(element);
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
        dataTransfer.set(this.typeDr, new vscode.DataTransferItem(source));
    }

    handleDrop(target, dataTransfer, token) {
        const droppedItems = dataTransfer.get(this.typeDr)?.value;
        if (!droppedItems) return;

        const droppedFiles = droppedItems.filter(item => item.contextValue === 'file');
        const targetGroup = target?.label || 'Unknown';

        if (targetGroup !== 'Unknown') {
            const filePaths = droppedFiles.map(item => item.resourceUri.fsPath);
            try {
                this.app_dataChecker.pasteFilesToGroup(target.resourceUri.fsPath, filePaths, 0);
            } catch (ex) {
                console.log(ex);
            }
        }
    }
}

module.exports = TreeFileProvider;