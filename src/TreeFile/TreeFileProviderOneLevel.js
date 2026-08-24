
// @ts-nocheck

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

function fboTreeLabel(label) {
    if (label == null) return "";
    return typeof label === "string" ? label : (label.label || "");
}

function fboIsGroupTreeContext(contextValue) {
    return contextValue === "group" || contextValue === "groupOther";
}

const app_dataChecker = require("./AppDataPathHelper");
const OpenBrowser = require("./BrowserHandle/OpenBrowser");
const DBStatusBarManager = require("../DBQuery/dbBar");
const GroupQuickFilterKinds = require("./searchFile/GroupQuickFilterKinds");
const GroupFileIndexService = require("./searchFile/GroupFileIndexService");
const GroupFileWatcherService = require("./searchFile/GroupFileWatcherService");
const GroupTreeIndexBridge = require("./searchFile/GroupTreeIndexBridge");
const { resolveGroupFileSearchStorageRoot } = require("./searchFile/GroupFileStoragePaths");
const GroupTextSearchFacade = require("./SearchText/GroupTextSearchFacade");

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
            console.warn(`âš ï¸ File khÃ´ng cÃ³ trong Open Editors: ${fileUri}`);
        }
        await this.parent.refresh()
    }

    async closeGroupFiles(element) {
        if (!element || !fboIsGroupTreeContext(element.contextValue)) return;

        const groupName = fboTreeLabel(element.label);
        if (!this.parent.treeData.has(groupName)) return;

        const files = this.parent.treeData.get(groupName).map(item => item.resourceUri.toString());
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
            console.warn(`âš ï¸ KhÃ´ng tÃ¬m tháº¥y file nÃ o trong Open Editors cho nhÃ³m: ${groupName}`);
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
            if (fboTreeLabel(group_label) !== fboTreeLabel(cur_Item.parentGroup.label)) return;
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
                vscode.window.showWarningMessage(`KhÃ´ng thá»ƒ má»Ÿ file: ${fp}`);
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
        this.context = null;
        this.debouncedRefresh = this.debounce(() => this.refresh(), 300);
        this._isInitialized = false;
        this._buildPromise = null;
        this._lastSelect = { path: null, time: 0 };
        this.dbStatusBar = null;
        this._treeFilterRaw = "";
        this._treeFilterSubstr = "";
        this._treeFilterGlobRe = null;
        this._groupFileIndexService = null;
        this._groupFileWatcherService = null;
        this._groupIndexBridge = null;
        this._searchResultPublisher = null;
        this._searchActiveGroupGetter = null;
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

    /** CÃ¢y 1 cáº¥p: chá»‰ cÃ¡c node file dÆ°á»›i group. */
    _applyTreeFilterToFlatFileItems(items) {
        if (!items || !items.length) {
            return [];
        }
        if (!this._hasActiveTreeFilter()) {
            return items;
        }
        return items.filter((it) => it.contextValue === "file" && this._treeFilterFileMatches(it));
    }

    _filterRootGroupItems(roots) {
        if (!this._hasActiveTreeFilter() || !roots || !roots.length) {
            return roots || [];
        }
        return roots.filter((g) => {
            const label = fboTreeLabel(g.label);
            const raw = this.treeData.get(label) || [];
            const filtered = this._applyGroupQuickFilterFlat(label, this._applyTreeFilterToFlatFileItems(raw));
            if (filtered.length > 0) return true;
            return this._treeFilterLabelMatches(label);
        });
    }

    _applyGroupQuickFilterFlat(groupName, items) {
        return items || [];
    }

    async applyGroupQuickFilter(groupElement, kind) {
        await this.runGroupFilterSearch(groupElement);
    }

    _collectGroupRootsForWarmup() {
        const out = [];
        for (const [, groupItem] of this.groupItems.entries()) {
            if (!groupItem || !groupItem.resourceUri) continue;
            const label = fboTreeLabel(groupItem.label).toUpperCase();
            if (label === "OTHER") continue;
            out.push(groupItem.resourceUri.fsPath);
        }
        return out;
    }

    async runGroupFilterSearch(groupElement) {
        if (!groupElement || !fboIsGroupTreeContext(groupElement.contextValue)) {
            return;
        }
        const groupName = fboTreeLabel(groupElement.label);
        if (String(groupName).toUpperCase() === "OTHER") {
            return;
        }
        const groupRoot = groupElement.resourceUri && groupElement.resourceUri.fsPath;
        if (!groupRoot) {
            vscode.window.showWarningMessage(`Group ${groupName} has no root path.`);
            return;
        }
        if (!this._groupFileIndexService) {
            vscode.window.showWarningMessage("Group search service is not initialized yet.");
            return;
        }
        const keyword = await vscode.window.showInputBox({
            title: `Search files in group: ${groupName}`,
            placeHolder: "Keywords support: * and % (many chars), ? and _ (one char). Space = AND.",
            ignoreFocusOut: true,
        });
        if (keyword === undefined) {
            return;
        }
        const result = await this._groupFileIndexService.search(groupRoot, keyword);
        result.groupLabel = groupName;
        if (this._groupIndexBridge) {
            this._groupIndexBridge.rememberSearch(groupRoot, groupName, keyword);
        }
        this._groupFileIndexService.publishSearchResult(result, { reveal: true });
    }

    async runGroupTextSearch(groupElement) {
        return GroupTextSearchFacade.runFromProvider(this, groupElement);
    }

    /**
     * @param {string} groupRoot
     * @param {{ paths?: string[] }|null|undefined} pasteResult
     */
    async notifyGroupFilesPasted(groupRoot, pasteResult) {
        if (!this._groupIndexBridge || !pasteResult || !pasteResult.paths || !pasteResult.paths.length) {
            return;
        }
        await this._groupIndexBridge.notifyFilesAdded(groupRoot, pasteResult.paths);
    }

    /**
     * @param {(result:any)=>void} publisher
     */
    setSearchResultPublisher(publisher) {
        this._searchResultPublisher = typeof publisher === "function" ? publisher : null;
        if (this._groupFileIndexService) {
            this._groupFileIndexService.onSearchResult = this._searchResultPublisher;
        }
    }

    setSearchActiveGroupGetter(getter) {
        this._searchActiveGroupGetter = typeof getter === "function" ? getter : null;
    }

    _syncTreeViewFilterBadge() {
        if (!this.treeView) {
            return;
        }
        this.treeView.description = undefined;
        vscode.commands.executeCommand("setContext", "fboFileTreeFilterActive", !!this._treeFilterRaw);
    }

    async run(context) {
        this.context = context;
        const storageRoot = resolveGroupFileSearchStorageRoot(context);
        this._groupFileIndexService = new GroupFileIndexService({
            storageRoot,
            ttlMs: GroupQuickFilterKinds.INDEX_TTL_MS,
            outputChannelName: GroupQuickFilterKinds.OUTPUT_CHANNEL_NAME,
            warmupConcurrency: GroupQuickFilterKinds.WARMUP_CONCURRENCY,
            onSearchResult: this._searchResultPublisher,
        });
        try {
            const tInit = Date.now();
            console.log(`[FBO_PERF_DEBUG] [TreeOneLevel] Index service init START`);
            await this._groupFileIndexService.init();
            console.log(`[FBO_PERF_DEBUG] [TreeOneLevel] Index service init END took ${Date.now() - tInit}ms`);
        } catch (e) {
            console.error("[FBO TreeOneLevel] Index service init error:", e);
        }
        this._groupIndexBridge = new GroupTreeIndexBridge({
            addFileToTree: (fp) => this.addFileToTree(fp),
            refreshTree: () => this.refreshEvent.fire(),
            getIndexService: () => this._groupFileIndexService,
            publishSearchResult: (r, options) => {
                if (this._groupFileIndexService) {
                    this._groupFileIndexService.publishSearchResult(r, options);
                }
            },
            getActiveDisplayedGroupRoot: () => {
                return this._searchActiveGroupGetter ? this._searchActiveGroupGetter() : null;
            },
        });
        this._groupFileWatcherService = new GroupFileWatcherService({
            indexService: this._groupFileIndexService,
            debounceMs: GroupQuickFilterKinds.WATCH_FLUSH_DEBOUNCE_MS,
            onIndexChanged: (root) => {
                if (this._groupIndexBridge) {
                    this._groupIndexBridge.scheduleRefreshFromIndex(root);
                }
            },
        });
        const ttlTimer = setInterval(() => {
            if (this._groupFileIndexService) {
                this._groupFileIndexService.clearExpired();
            }
        }, GroupQuickFilterKinds.CLEANUP_INTERVAL_MS);
        let focus_debounce_timer = null;
        const focus_sub = vscode.window.onDidChangeWindowState((state) => {
            if (state && state.focused) {
                if (focus_debounce_timer) clearTimeout(focus_debounce_timer);
                focus_debounce_timer = setTimeout(() => {
                    focus_debounce_timer = null;
                    if (this._groupFileWatcherService) {
                        void this._groupFileWatcherService.reconcileAll();
                    }
                }, 800);
            }
        });
        context.subscriptions.push(focus_sub);

        context.subscriptions.push({
            dispose: () => {
                if (focus_debounce_timer) {
                    clearTimeout(focus_debounce_timer);
                    focus_debounce_timer = null;
                }
                if (this._groupIndexBridge) {
                    this._groupIndexBridge.dispose();
                    this._groupIndexBridge = null;
                }
                if (this._groupFileIndexService) {
                    void this._groupFileIndexService.dispose();
                    this._groupFileIndexService = null;
                }
                if (this._groupFileWatcherService) {
                    this._groupFileWatcherService.dispose();
                    this._groupFileWatcherService = null;
                }
            }
        });

        const savedFilter = context.workspaceState.get("fboFileTree.filter", "");
        this._setFilterFromString(savedFilter);

        this.treeView = vscode.window.createTreeView("fbo_file", {
            treeDataProvider: this,
            dragAndDropController: this,
            showCollapseAll: true,
            canSelectMany: true
        });

        // ✅ Build tree trong background với try-catch an toàn
        Promise.resolve().then(async () => {
            try {
                const tBuild = Date.now();
                console.log(`[FBO_PERF_DEBUG] [TreeOneLevel] buildTreeOptimized START`);
                await this.buildTreeOptimized();
                console.log(`[FBO_PERF_DEBUG] [TreeOneLevel] buildTreeOptimized END took ${Date.now() - tBuild}ms`);
            } catch (err) {
                console.error("[FBO TreeOneLevel] buildTreeOptimized error:", err);
            }
            this._isInitialized = true;
            this.refreshEvent.fire();
            if (this._groupFileIndexService) {
                const tWarmup = Date.now();
                console.log(`[FBO_PERF_DEBUG] [TreeOneLevel] warmup START`);
                const roots = this._collectGroupRootsForWarmup();
                this._groupFileIndexService.warmup(roots);
                console.log(`[FBO_PERF_DEBUG] [TreeOneLevel] warmup END took ${Date.now() - tWarmup}ms`);
                if (this._groupFileWatcherService) {
                    this._groupFileWatcherService.syncRoots(roots);
                }
            }

            // âœ… AUTO EXPAND & REVEAL sau khi build xong
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

        // âœ… onDidChangeTextDocument - Update dirty + Auto reveal
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            if (!this._isInitialized) return;

            const filePath = event.document.uri.fsPath;
            const treeItem = this.getTreeItemByPath(filePath);

            if (treeItem) {
                const folderName = path.basename(path.dirname(filePath));
                treeItem.description = `(${folderName})`;
                this.refreshEvent.fire(treeItem);
            }

            // âœ… AUTO REVEAL khi gÃµ phÃ­m
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

        // âœ… onDidSaveTextDocument
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
                this.refreshEvent.fire();
                treeItem = this.getTreeItemByPath(filePath);
            }

            // Reveal file trong tree (không await — tránh giữ extension host khi mở từ Search)
            if (treeItem) {
                const parentGroup = this.getParentGroup(treeItem);
                if (parentGroup) {
                    void this.treeView.reveal(parentGroup, { select: false, expand: true })
                        .then(() => this.revealActiveFile(parentGroup.label))
                        .catch(() => { });
                }
            }
        });

        // âœ… onDidChangeVisibleTextEditors - Khi thay Ä‘á»•i editor hiá»ƒn thá»‹
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

            const filePath = editor.document.uri.fsPath;
            let treeItem = this.getTreeItemByPath(filePath);

            // Nếu file chưa có trong tree, add vào
            if (!treeItem) {
                this.addFileToTree(filePath);
                this.refreshEvent.fire();
                treeItem = this.getTreeItemByPath(filePath);
            }

            if (!treeItem) return;

            const parentGroup = this.getParentGroup(treeItem);
            if (parentGroup) {
                void this.treeView.reveal(parentGroup, { select: false, expand: true })
                    .then(() => this.revealActiveFile(parentGroup.label))
                    .catch(() => { });
                const gLabel = fboTreeLabel(parentGroup.label);
                if (this.dbStatusBar && gLabel && gLabel.toUpperCase() !== "OTHER") {
                    const apply_db_label = () => {
                        if (typeof this.dbStatusBar.tryAutoUpdateText === "function") {
                            this.dbStatusBar.tryAutoUpdateText(gLabel + " (App)");
                        } else {
                            this.dbStatusBar.updateText(gLabel + " (App)");
                        }
                    };
                    if (typeof this.dbStatusBar.reloadDbOptionsFromGroups === "function") {
                        Promise.resolve(this.dbStatusBar.reloadDbOptionsFromGroups())
                            .then(apply_db_label)
                            .catch((e) => {
                                console.error("[FBO dbBar] reloadDbOptionsFromGroups error:", e);
                                apply_db_label();
                            });
                    } else {
                        apply_db_label();
                    }
                }
            }
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
            vscode.window.showInformationMessage("FBO File Tree Ä‘Ã£ Ä‘Æ°á»£c reload!");
        });

        // âœ… onDidExpandElement - Reveal khi expand group
        this.treeView.onDidExpandElement(async (event) => {
            const element = event.element;
            if (fboIsGroupTreeContext(element.contextValue)) {
                await this.revealActiveFile(element.label);
            }
        });

        // âœ… OpenBrowser - ÄÄƒng kÃ½ commands má»Ÿ browser
        const openBrowser = new OpenBrowser();
        openBrowser.registerCommands(context);
     
        // trong constructor hoáº·c run, khá»Ÿi táº¡o biáº¿n lÆ°u tráº¡ng thÃ¡i
        //await openBrowser.openBrowserForFile(filePath);
        // sau khi this.treeView Ä‘Æ°á»£c táº¡o (trong run)
       
        this.dbStatusBar = new DBStatusBarManager(context); 
        this.dbStatusBar.show();
        this._syncTreeViewFilterBadge();
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
                    groupItem.contextValue = groupName === "OTHER" ? "groupOther" : "group";

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

                item.description = `(${folderName})`;

                item.command = {
                    command: "vscode.open",
                    arguments: [uri],
                    title: "Má»Ÿ file"
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

        // Cáº­p nháº­t groupItems cho status bar DB vÃ  reload láº¡i danh sÃ¡ch DB
        if (this.dbStatusBar) {
            this.dbStatusBar.groupItems = this.groupItems;
            if (typeof this.dbStatusBar.reloadDbOptionsFromGroups === 'function') {
                try {
                    await this.dbStatusBar.reloadDbOptionsFromGroups();
                } catch (e) {
                    console.error("[FBO dbBar] reloadDbOptionsFromGroups error:", e);
                    console.error("[FBO dbBar] stack:", e && e.stack);
                }
            }
        }
        if (this._groupFileWatcherService) {
            this._groupFileWatcherService.syncRoots(this._collectGroupRootsForWarmup());
        }

        return result;
    }

    async buildTree() {
        return this.buildTreeOptimized();
    }

    ensureFileInTree(file_path) {
        let tree_item = this.getTreeItemByPath(file_path);
        if (tree_item) {
            return tree_item;
        }

        this.addFileToTree(file_path);
        tree_item = this.getTreeItemByPath(file_path);
        if (!tree_item) {
            return null;
        }

        const parent_group = this.getParentGroup(tree_item);
        const group_name = parent_group ? fboTreeLabel(parent_group.label) : "";
        const items = this.treeData.get(group_name);
        if (items && items.length > 1) {
            const config = vscode.workspace.getConfiguration("fbo-autocomplete");
            const sort_type = config.get("sortTree", "FileName");
            items.sort((item_a, item_b) => {
                const file_path_a = item_a.resourceUri.fsPath;
                const file_path_b = item_b.resourceUri.fsPath;
                const ext_a = path.extname(file_path_a).toLowerCase();
                const ext_b = path.extname(file_path_b).toLowerCase();
                if (ext_a !== ext_b) {
                    return ext_a.localeCompare(ext_b);
                }
                if (String(sort_type) === "folderName") {
                    const folder_a = path.basename(path.dirname(file_path_a));
                    const folder_b = path.basename(path.dirname(file_path_b));
                    const folder_compare = folder_a.localeCompare(folder_b);
                    if (folder_compare !== 0) {
                        return folder_compare;
                    }
                }
                return path.basename(file_path_a).localeCompare(path.basename(file_path_b));
            });
        }

        this.refreshEvent.fire();
        return tree_item;
    }

    addFileToTree(filePath) {
        const uri = vscode.Uri.file(filePath);
        if (uri.scheme !== 'file') return;

        const folderName = path.basename(path.dirname(filePath));
        this.app_dataChecker.filePath = filePath;
        let groupName = this.app_dataChecker.getGroupName().toUpperCase();
        if (filePath.toLowerCase().endsWith(".md.plan")) {
            groupName = "OTHER";
        }
        if (!groupName) return;

        const item = new vscode.TreeItem(uri, vscode.TreeItemCollapsibleState.None);
        item.resourceUri = uri;
        item.contextValue = "file";
        item.description = `(${folderName})`;

        item.command = {
            command: "vscode.open",
            arguments: [uri],
            title: "Má»Ÿ file"
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
            groupItem.contextValue = groupName === "OTHER" ? "groupOther" : "group";

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
            const roots = await this.buildTreeOptimized();
            return this._filterRootGroupItems(roots);
        }
        const label = fboTreeLabel(element.label);
        const raw = this.treeData.get(label) || [];
        return this._applyGroupQuickFilterFlat(label, this._applyTreeFilterToFlatFileItems(raw));
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

    async promptTreeFilter() {
        if (!this.context) {
            return;
        }
        const value = await vscode.window.showInputBox({
            title: "Filter FBO project tree (flat)",
            placeHolder: "e.g. SI, Grid, *.xml - leave empty to clear filter",
            value: this._treeFilterRaw,
            prompt: "Substring match on file name or full path (case-insensitive). Use * for glob on file or group label. Press Enter to apply, Escape to cancel.",
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

    async handleDrop(target, dataTransfer, token) {
        const filePaths = this._parseDroppedFsPaths(dataTransfer);
        if (!filePaths.length) return;

        // KÃ©o vÃ o vÃ¹ng trá»‘ng / khÃ´ng pháº£i nhÃ³m: chá»‰ má»Ÿ file (khÃ´ng paste).
        if (!target || !target.resourceUri || !fboIsGroupTreeContext(target.contextValue)) {
            await this._openDroppedFsPaths(filePaths);
            return;
        }

        const destPath = target.resourceUri.fsPath;
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
                const pasteResult = await this.app_dataChecker.pasteFilesToGroup(destPath, toPaste, 0);
                await this.notifyGroupFilesPasted(destPath, pasteResult);
            } catch (ex) {
                console.log(ex);
            }
        }
    }
}

module.exports = TreeFileProvider;


