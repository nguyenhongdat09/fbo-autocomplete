
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

function fboIsFileTreeContext(contextValue) {
    return contextValue === "file" || contextValue === "file_f";
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
        if (!filePath) return "OTHER";
        const norm = filePath.replace(/\\/g, "/").toLowerCase();
        if (this._groupNameCache && this._groupNameCache.has(norm)) {
            return this._groupNameCache.get(norm);
        }
        if (norm.includes("/.cursor") || norm.includes("/.gemini") || norm.endsWith(".plan.md") || norm.endsWith("/plan.md") || norm.endsWith(".md.plan") || norm.endsWith(".plan") || norm.endsWith("/implementation_plan.md")) {
            if (this._groupNameCache) this._groupNameCache.set(norm, "OTHER");
            return "OTHER";
        }
        this.app_dataChecker.filePath = filePath;
        const g = (this.app_dataChecker.getGroupName() || "OTHER").toUpperCase();
        if (this._groupNameCache) this._groupNameCache.set(norm, g);
        return g;
    }

    getParentGroup(treeItem) {
        if (!treeItem) return null;
        for (const [group, items] of this.parent.treeData) {
            if (items.includes(treeItem)) {
                return this.parent.groupItems.get(group) || new vscode.TreeItem(group, vscode.TreeItemCollapsibleState.Expanded);
            }
        }
        return null;
    }

    getTreeItemByPath(filePath) {
        if (!filePath) return null;
        const normTarget = path.normalize(filePath).toLowerCase();
        if (this.parent.fileItemMap && this.parent.fileItemMap.has(normTarget)) {
            return this.parent.fileItemMap.get(normTarget);
        }
        for (const [, items] of this.parent.treeData) {
            const foundItem = items.find(
                item => fboIsFileTreeContext(item.contextValue) && item.resourceUri && item.resourceUri.fsPath && path.normalize(item.resourceUri.fsPath).toLowerCase() === normTarget
            );
            if (foundItem) {
                if (this.parent.fileItemMap) this.parent.fileItemMap.set(normTarget, foundItem);
                return foundItem;
            }
        }
        return null;
    }

    _extractFsPathFromTab(tab) {
        if (!tab) return null;
        const input = tab.input;

        // 1. Ultra Fast-Path: Standard VS Code TabInputText / TabInputCustom
        if (input) {
            if (input.uri && input.uri.scheme === "file" && input.uri.fsPath) {
                return input.uri.fsPath;
            }
            if (input.modified && input.modified.scheme === "file" && input.modified.fsPath) {
                return input.modified.fsPath;
            }
            if (input.original && input.original.scheme === "file" && input.original.fsPath) {
                return input.original.fsPath;
            }
        }

        const cleanWindowsPath = (p) => {
            if (!p || typeof p !== "string") return null;
            let cleaned = p.trim();
            if (cleaned.startsWith("file:///")) {
                cleaned = decodeURIComponent(cleaned.substring(8));
            } else if (cleaned.startsWith("file://")) {
                cleaned = decodeURIComponent(cleaned.substring(7));
            }
            // Strip leading slash before drive letter on Windows (e.g. /C:/ -> C:/)
            cleaned = cleaned.replace(/^\/([a-zA-Z]:)/, "$1").replace(/\//g, "\\");
            if (/^[a-zA-Z]:\\/.test(cleaned) || cleaned.startsWith("\\\\")) {
                return path.normalize(cleaned);
            }
            return null;
        };

        const parsePossibleUri = (val) => {
            if (!val) return null;
            if (typeof val === "string") {
                const cleaned = cleanWindowsPath(val);
                if (cleaned) return cleaned;
                try {
                    if (val.startsWith("file://")) {
                        return vscode.Uri.parse(val).fsPath;
                    }
                    if (val.includes("/") || val.includes("\\")) {
                        return cleanWindowsPath(val) || vscode.Uri.file(val).fsPath;
                    }
                } catch {
                    return val;
                }
                return val;
            }
            if (typeof val === "object") {
                if (val.fsPath && typeof val.fsPath === "string") {
                    const cleaned = cleanWindowsPath(val.fsPath);
                    if (cleaned) return cleaned;
                    return val.fsPath;
                }
                if (val.path && typeof val.path === "string") {
                    const cleaned = cleanWindowsPath(val.path);
                    if (cleaned) return cleaned;
                }
                if (val.scheme === "file" && val.path) {
                    try {
                        return vscode.Uri.from(val).fsPath;
                    } catch {
                        return cleanWindowsPath(val.path) || val.path;
                    }
                }
            }
            return null;
        };

        let fp = null;

        // 2. Fast-Path: check direct fields on input
        if (input && typeof input === "object") {
            fp = parsePossibleUri(input.sourceUri)
                || parsePossibleUri(input.uri)
                || parsePossibleUri(input.modified)
                || parsePossibleUri(input.original)
                || parsePossibleUri(input.resource)
                || parsePossibleUri(input.targetUri);

            // 3) Deep search in input object properties
            if (!fp) {
                const deepFindPath = (obj, depth = 0) => {
                    if (!obj || depth > 2) return null;
                    if (typeof obj === "string") {
                        const p = parsePossibleUri(obj);
                        if (p && (p.includes("/") || p.includes("\\"))) return p;
                    }
                    if (typeof obj === "object") {
                        const p = parsePossibleUri(obj);
                        if (p && (p.includes("/") || p.includes("\\"))) return p;
                        for (const key of Object.keys(obj)) {
                            const res = deepFindPath(obj[key], depth + 1);
                            if (res) return res;
                        }
                    }
                    return null;
                };
                fp = deepFindPath(input);
            }
        }

        // 3) Special for Cursor plans / Antigravity plans: check if tab.label matches any plan in ~/.cursor/plans or brain
        if (!fp && tab.label) {
            const rawLabel = String(tab.label).trim();
            const baseLabel = path.basename(rawLabel.replace(/\\/g, "/"));

            // Fast path: Only perform disk lookup if label looks like a plan / md file
            if (/\.(plan(\.md)?|md)$/i.test(baseLabel) || /plan/i.test(rawLabel)) {
                const userHome = process.env.USERPROFILE || process.env.HOME || "";
                const cursorPlansDir = path.join(userHome, ".cursor", "plans");
                const geminiBrainDir = path.join(userHome, ".gemini", "antigravity-ide", "brain");

                const candidate1 = path.join(cursorPlansDir, rawLabel);
                const candidate2 = path.join(cursorPlansDir, baseLabel);
                const candidate3 = path.join(geminiBrainDir, rawLabel);

                if (fs.existsSync(candidate1)) {
                    fp = candidate1;
                } else if (fs.existsSync(candidate2)) {
                    fp = candidate2;
                } else if (fs.existsSync(candidate3)) {
                    fp = candidate3;
                } else if (fs.existsSync(cursorPlansDir)) {
                    try {
                        const planFiles = fs.readdirSync(cursorPlansDir);
                        const cleanLabel = baseLabel.toLowerCase().replace(/\.plan\.md$/, "").replace(/\.md$/, "");
                        const found = planFiles.find(f => {
                            const fl = f.toLowerCase();
                            return fl === baseLabel.toLowerCase() || fl.includes(cleanLabel) || cleanLabel.includes(fl.replace(/\.plan\.md$/, ""));
                        });
                        if (found) {
                            fp = path.join(cursorPlansDir, found);
                        }
                    } catch { }
                }
            }
        }

        if (fp && typeof fp === "string") {
            if (fp.includes("Untitled") || fp.includes("untitled")) {
                return null;
            }
            return fp;
        }
        return null;
    }

    async getOpenEditors() {
        const openTabs = (vscode.window.tabGroups && vscode.window.tabGroups.all)
            ? vscode.window.tabGroups.all.flatMap(group => group.tabs)
            : [];

        const filePaths = openTabs
            .map(tab => this._extractFsPathFromTab(tab))
            .filter(filePath => filePath !== null);
        return [...new Set(filePaths)];
    }

    getGroupRootPath(filePath) {
        this.app_dataChecker.filePath = filePath;
        return this.app_dataChecker.getProjectPath();
    }

    async closeFile(element) {
        if (!element || !element.resourceUri) return;
        const targetPath = path.normalize(element.resourceUri.fsPath).toLowerCase();
        const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
        const targetTab = tabs.find(tab => {
            const fp = this._extractFsPathFromTab(tab);
            return fp && path.normalize(fp).toLowerCase() === targetPath;
        });

        if (targetTab) {
            try {
                await vscode.window.tabGroups.close([targetTab]);
            } catch (err) {
                console.warn(`Lỗi khi đóng tab: ${err}`);
            }
        }
        this.parent.removeSingleFile(element.resourceUri.fsPath);
        this.parent.refreshEvent.fire();
    }

    async closeGroupFiles(element) {
        if (!element || !fboIsGroupTreeContext(element.contextValue)) return;

        const groupName = fboTreeLabel(element.label);
        if (!this.parent.treeData.has(groupName)) return;

        const filePaths = (this.parent.treeData.get(groupName) || [])
            .map(item => item.resourceUri && item.resourceUri.fsPath)
            .filter(Boolean)
            .map(fp => path.normalize(fp).toLowerCase());

        const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);

        const targetTabs = tabs.filter(tab => {
            const fp = this._extractFsPathFromTab(tab);
            return fp && filePaths.includes(path.normalize(fp).toLowerCase());
        });

        if (targetTabs.length > 0) {
            try {
                await vscode.window.tabGroups.close(targetTabs);
            } catch (err) {
                console.warn(`Lỗi khi đóng tabs nhóm: ${err}`);
            }
        }

        this.parent.treeData.delete(groupName);
        this.parent.groupItems.delete(groupName);
        this.parent.refreshEvent.fire();
    }

    getCurrentPathActive() {
        let filePath = null;
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document && activeEditor.document.uri && activeEditor.document.uri.scheme === "file") {
            filePath = activeEditor.document.uri.fsPath;
        } else {
            const activeTab = vscode.window.tabGroups?.activeTabGroup?.activeTab;
            filePath = this._extractFsPathFromTab(activeTab);
        }
        if (!filePath) return null;
        const treeItem = this.getTreeItemByPath(filePath);
        if (!treeItem) return null;
        const parentGroup = this.getParentGroup(treeItem);
        return { filePath: filePath, treeItem: treeItem, parentGroup: parentGroup };
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
        const results = [];
        const processString = (str) => {
            if (!str || typeof str !== "string") return;
            const lines = str.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            for (const line of lines) {
                if (line.startsWith("#")) continue;
                // Bỏ qua nếu là JSON hoặc chứa ký tự đặc trưng của VS Code TreeView mime
                if (line.startsWith("{") || line.startsWith("[") || line.includes("itemHandles") || line.includes('"id":')) continue;
                try {
                    if (line.startsWith("file://")) {
                        const parsed = vscode.Uri.parse(line).fsPath;
                        if (parsed) results.push(parsed);
                    } else if (line.includes("/") || line.includes("\\")) {
                        results.push(vscode.Uri.file(line).fsPath);
                    }
                } catch {
                    if (line.includes("/") || line.includes("\\")) {
                        results.push(line);
                    }
                }
            }
        };

        // 1. Check text/uri-list
        const uriListItem = dataTransfer.get("text/uri-list") || dataTransfer.get(this.typeDr);
        if (uriListItem) {
            const val = typeof uriListItem.value === "string" ? uriListItem.value : (typeof uriListItem.asString === "function" ? uriListItem.asString() : null);
            processString(val);
        }

        // Nếu text/uri-list đã có kết quả thì dùng luôn, tránh đọc các mime khác
        if (!results.length) {
            // 2. Check text/plain
            const textPlainItem = dataTransfer.get("text/plain");
            if (textPlainItem) {
                const val = typeof textPlainItem.value === "string" ? textPlainItem.value : (typeof textPlainItem.asString === "function" ? textPlainItem.asString() : null);
                processString(val);
            }
        }

        // 3. Fallback iterate through all items in dataTransfer (bỏ qua mime nội bộ của VS Code tree)
        if (!results.length && typeof dataTransfer.forEach === "function") {
            try {
                dataTransfer.forEach((item, mimeType) => {
                    if (mimeType && (mimeType.startsWith("application/vnd.code.tree") || mimeType.includes("tree"))) return;
                    if (mimeType === "text/uri-list" || mimeType === this.typeDr || mimeType === "text/plain") return;
                    const val = typeof item.value === "string" ? item.value : (typeof item.asString === "function" ? item.asString() : null);
                    processString(val);
                });
            } catch { }
        }

        // Chỉ giữ lại các đường dẫn file thực sự tồn tại trên ổ đĩa
        return [...new Set(results.filter(fp => {
            if (!fp || typeof fp !== "string") return false;
            try {
                return fs.existsSync(fp);
            } catch {
                return false;
            }
        }))];
    }

    async _openDroppedFsPaths(filePaths) {
        for (const fp of filePaths) {
            // Add directly to tree first
            this.parent.addFileToTree(fp);
            this.parent.refreshEvent.fire();

            try {
                await vscode.window.showTextDocument(vscode.Uri.file(fp), { preview: false, viewColumn: vscode.ViewColumn.Active });
            } catch (err) {
                try {
                    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(fp));
                } catch {
                    vscode.window.showWarningMessage(`Không thể mở file: ${fp}`);
                }
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
        this.fileItemMap = new Map();
        this._groupNameCache = new Map();
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
        return items.filter((it) => fboIsFileTreeContext(it.contextValue) && this._treeFilterFileMatches(it));
    }

    _filterRootGroupItems(roots) {
        if (!this._hasActiveTreeFilter() || !roots || !roots.length) {
            return roots || [];
        }
        return roots.filter((g) => {
            const label = fboTreeLabel(g.label);
            if (String(label).toUpperCase() === "OTHER") {
                return true;
            }
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

    getGroupFileIndexService() {
        return this._groupFileIndexService;
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

        // ✅ onDidChangeVisibleTextEditors - Khi thay đổi editor hiển thị
        const debouncedVisibleChange = this.debounce(async () => {
            if (!this._isInitialized) return;
            await this.smartRefresh();
        }, 500);

        vscode.window.onDidChangeVisibleTextEditors(() => {
            debouncedVisibleChange();
        });

        // ✅ onDidChangeTabs - Khi mở/đổi tab (hỗ trợ cả custom editor, plan tabs, etc.)
        if (vscode.window.tabGroups && vscode.window.tabGroups.onDidChangeTabs) {
            const debouncedTabChange = this.debounce(async () => {
                if (!this._isInitialized) return;
                await this.smartRefresh();
            }, 300);

            context.subscriptions.push(vscode.window.tabGroups.onDidChangeTabs(async (event) => {
                if (!this._isInitialized) return;
                if (event && (event.opened?.length > 0 || event.changed?.length > 0)) {
                    const touchedTabs = [...(event.opened || []), ...(event.changed || [])];
                    let added = false;
                    for (const tab of touchedTabs) {
                        const fp = this._extractFsPathFromTab(tab);
                        if (fp && !this.getTreeItemByPath(fp)) {
                            this.addFileToTree(fp);
                            added = true;
                        }
                    }
                    if (added) {
                        this.refreshEvent.fire();
                    }
                }
                debouncedTabChange();
            }));
        }

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
        const refreshConfig = (config) => {
            this.refresh();
        };

        const config = vscode.workspace.getConfiguration('fbo-autocomplete');
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('fbo-autocomplete.sortTree') ||
                    e.affectsConfiguration('fbo-autocomplete.folderNestingThreshold')) {
                    refreshConfig(config);
                }
            })
        );

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

        // ✅ onDidExpandElement - Reveal khi expand group
        this.treeView.onDidExpandElement(async (event) => {
            const element = event.element;
            if (fboIsGroupTreeContext(element.contextValue)) {
                await this.revealActiveFile(element.label);
            }
        });

        // ✅ OpenBrowser - Đăng ký commands mở browser
        const openBrowser = new OpenBrowser();
        openBrowser.registerCommands(context);
     
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
            this.fileItemMap.clear();

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

                let groupName = this.getGroupName(filePath);

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
                    const groupItemState = groupName === "OTHER" ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
                    const groupItem = new vscode.TreeItem(groupName, groupItemState);
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
                const fileExt = path.extname(filePath).toLowerCase();
                item.contextValue = fileExt === ".f" ? "file_f" : "file";

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

                this.fileItemMap.set(path.normalize(filePath).toLowerCase(), item);
                this.treeData.get(groupName).push(item);
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

    getParentGroup(treeItem) {
        for (const [group, items] of this.treeData) {
            if (items.includes(treeItem)) {
                return this.groupItems.get(group);
            }
        }
        return null;
    }

    getTreeItemByPath(filePath) {
        if (!filePath) return null;
        const normTarget = path.normalize(filePath).toLowerCase();
        if (this.fileItemMap && this.fileItemMap.has(normTarget)) {
            return this.fileItemMap.get(normTarget);
        }
        for (const [, items] of this.treeData) {
            const foundItem = items.find(
                item => fboIsFileTreeContext(item.contextValue) && item.resourceUri && item.resourceUri.fsPath && path.normalize(item.resourceUri.fsPath).toLowerCase() === normTarget
            );
            if (foundItem) {
                if (this.fileItemMap) this.fileItemMap.set(normTarget, foundItem);
                return foundItem;
            }
        }
        return null;
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
        if (!filePath) return;
        const uri = vscode.Uri.file(filePath);
        if (uri.scheme !== 'file') {
            return;
        }

        const folderName = path.basename(path.dirname(filePath));
        let groupName = this.getGroupName(filePath);
        if (!groupName) return;

        const item = new vscode.TreeItem(uri, vscode.TreeItemCollapsibleState.None);
        item.resourceUri = uri;
        const addFileExt = path.extname(filePath).toLowerCase();
        item.contextValue = addFileExt === ".f" ? "file_f" : "file";
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
            const groupItemState = groupName === "OTHER" ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
            const groupItem = new vscode.TreeItem(groupName, groupItemState);
            groupItem.contextValue = groupName === "OTHER" ? "groupOther" : "group";

            this.app_dataChecker.filePath = filePath;
            const groupPath = this.app_dataChecker.getProjectPath();
            if (groupPath) {
                groupItem.resourceUri = vscode.Uri.file(groupPath);
            }

            this.treeData.set(groupName, []);
            this.groupItems.set(groupName, groupItem);
        }

        this.fileItemMap.set(path.normalize(filePath).toLowerCase(), item);
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
        if (!filePath) return;
        const normTarget = path.normalize(filePath).toLowerCase();
        if (this.fileItemMap) {
            this.fileItemMap.delete(normTarget);
        }
        for (const [group, items] of this.treeData) {
            const index = items.findIndex(item => item.resourceUri && item.resourceUri.fsPath && path.normalize(item.resourceUri.fsPath).toLowerCase() === normTarget);
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
        if (fboIsFileTreeContext(element.contextValue)) {
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
        const filesOnly = source.every(item => fboIsFileTreeContext(item.contextValue));
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


