// @ts-nocheck â€” TreeItem Ä‘Æ°á»£c gáº¯n thÃªm thuá»™c tÃ­nh fbo* cho cÃ¢y nhiá»u cáº¥p.

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

function fboTreeLabel(label) {
    if (label == null) return "";
    return typeof label === "string" ? label : (label.label || "");
}

/** Group node FBO vs nhóm OTHER (không hiện nút lọc nhanh). */
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

    _findFileInItems(items, filePath) {
        if (!items || !items.length || !filePath) return null;
        const normTarget = path.normalize(filePath).toLowerCase();
        for (const it of items) {
            if (fboIsFileTreeContext(it.contextValue) && it.resourceUri && it.resourceUri.fsPath) {
                if (path.normalize(it.resourceUri.fsPath).toLowerCase() === normTarget) {
                    return it;
                }
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
            if (fboIsFileTreeContext(it.contextValue) && it.resourceUri) {
                outSet.add(it.resourceUri.toString());
            } else if (it.contextValue === "folder" && it.fboFolderKey) {
                this._collectFileUrisFromItems(this.parent.folderChildren.get(it.fboFolderKey), outSet);
            }
        }
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
        if (!treeItem || !fboIsFileTreeContext(treeItem.contextValue)) return null;
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
        if (!filePath) return null;
        const norm = path.normalize(filePath).toLowerCase();
        if (this.parent.fileItemMap && this.parent.fileItemMap.has(norm)) {
            return this.parent.fileItemMap.get(norm);
        }
        for (const [, items] of this.parent.treeData) {
            const foundItem = this._findFileInItems(items, filePath);
            if (foundItem) {
                if (this.parent.fileItemMap) this.parent.fileItemMap.set(norm, foundItem);
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

        // 3. Fast-Path: Plans / Markdown in ~/.cursor/plans or brain
        if (!fp && tab.label) {
            const rawLabel = String(tab.label).trim();
            const baseLabel = path.basename(rawLabel.replace(/\\/g, "/"));

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
        if (!element) return;

        const filePaths = [];
        if (fboIsGroupTreeContext(element.contextValue)) {
            const groupName = fboTreeLabel(element.label);
            if (!this.parent.treeData.has(groupName)) return;
            const uriSet = new Set();
            this._collectFileUrisFromItems(this.parent.treeData.get(groupName), uriSet);
            for (const u of uriSet) {
                try { filePaths.push(path.normalize(vscode.Uri.parse(u).fsPath).toLowerCase()); } catch {}
            }
        } else if (element.contextValue === "folder" && element.fboFolderKey) {
            const children = this.parent.folderChildren.get(element.fboFolderKey);
            const uriSet = new Set();
            this._collectFileUrisFromItems(children || [], uriSet);
            for (const u of uriSet) {
                try { filePaths.push(path.normalize(vscode.Uri.parse(u).fsPath).toLowerCase()); } catch {}
            }
        } else {
            return;
        }

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

        if (fboIsGroupTreeContext(element.contextValue)) {
            const groupName = fboTreeLabel(element.label);
            this.parent._clearFolderMapsForGroup(groupName);
            this.parent.treeData.delete(groupName);
            this.parent.groupItems.delete(groupName);
        }

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
        this._groupFileIndexService = null;
        this._groupFileWatcherService = null;
        this._groupIndexBridge = null;
        this._searchResultPublisher = null;
        this._searchActiveGroupGetter = null;
        /** Chuá»—i gá»‘c ngÆ°á»i dÃ¹ng nháº­p (Ä‘á»ƒ hiá»ƒn thá»‹ / lÆ°u workspace). */
        this._treeFilterRaw = "";
        /** Lá»c dáº¡ng substring (lowercase); rá»—ng náº¿u chá»‰ dÃ¹ng glob. */
        this._treeFilterSubstr = "";
        /** Glob Ä‘Æ¡n giáº£n trÃªn tÃªn file / nhÃ£n folder khi cÃ³ kÃ½ tá»± `*`. */
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
            if (fboIsFileTreeContext(it.contextValue)) {
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
            if (String(label).toUpperCase() === "OTHER") {
                return true;
            }
            const raw = this.treeData.get(label) || [];
            const filtered = this._applyGroupQuickFilterToGroupItems(label, this._applyTreeFilterToItems(raw));
            if (filtered.length > 0) {
                return true;
            }
            return this._treeFilterLabelMatches(label);
        });
    }

    _applyGroupQuickFilterToGroupItems(groupName, items) {
        return items || [];
    }

    /**
     * @param {import('vscode').TreeItem} groupElement node group trên cây
     * @param {string} kind dir|grid|filter|lookup|report|upload|all
     */
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
     * Sau paste/copy file vào group — cập nhật cây FBO + index search.
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

    /**
     * @param {string} groupName
     * @param {number} fileCountInGroup
     * @returns {boolean}
     */
    _shouldNestGroup(groupName, fileCountInGroup) {
        if (String(groupName).toUpperCase() === "OTHER") {
            return false;
        }
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
     * Pháº§n suffix cá»§a fboFolderKey: luÃ´n dÃ¹ng segment chá»¯ thÆ°á»ng Ä‘á»ƒ gá»™p Lookup/lookup
     * (UNC/Windows khÃ´ng phÃ¢n biá»‡t hoa thÆ°á»ng; VS Code cÃ³ thá»ƒ tráº£ vá» path khÃ¡c nhau tá»«ng tab).
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
            const af = fboIsFileTreeContext(a.contextValue);
            const bf = fboIsFileTreeContext(b.contextValue);
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
            if (fboIsFileTreeContext(it.contextValue) && it.resourceUri) {
                outSet.add(it.resourceUri.fsPath);
            } else if (it.contextValue === "folder" && it.fboFolderKey) {
                this._collectFileFsPathsFromItems(this.folderChildren.get(it.fboFolderKey), outSet);
            }
        }
    }

    _removeFileFromItems(items, filePath) {
        if (!items || !items.length || !filePath) return false;
        const normTarget = path.normalize(filePath).toLowerCase();
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (fboIsFileTreeContext(it.contextValue) && it.resourceUri && it.resourceUri.fsPath) {
                if (path.normalize(it.resourceUri.fsPath).toLowerCase() === normTarget) {
                    items.splice(i, 1);
                    return true;
                }
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
            console.log(`[FBO_PERF_DEBUG] [Tree] Index service init START`);
            await this._groupFileIndexService.init();
            console.log(`[FBO_PERF_DEBUG] [Tree] Index service init END took ${Date.now() - tInit}ms`);
        } catch (e) {
            console.error("[FBO Tree] Index service init error:", e);
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
                console.log(`[FBO_PERF_DEBUG] [Tree] buildTreeOptimized START`);
                await this.buildTreeOptimized();
                console.log(`[FBO_PERF_DEBUG] [Tree] buildTreeOptimized END took ${Date.now() - tBuild}ms`);
            } catch (err) {
                console.error("[FBO Tree] buildTreeOptimized error:", err);
            }
            this._isInitialized = true;
            this.refreshEvent.fire();
            if (this._groupFileIndexService) {
                const tWarmup = Date.now();
                console.log(`[FBO_PERF_DEBUG] [Tree] warmup START`);
                const roots = this._collectGroupRootsForWarmup();
                this._groupFileIndexService.warmup(roots);
                console.log(`[FBO_PERF_DEBUG] [Tree] warmup END took ${Date.now() - tWarmup}ms`);
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

        vscode.workspace.onDidOpenTextDocument(async (document) => {
            if (!this._isInitialized) return;

            if (document.uri.scheme !== 'file') return;

            const filePath = document.uri.fsPath;

            let treeItem = this.getTreeItemByPath(filePath);

            if (!treeItem) {
                this.addFileToTree(filePath);
                this.refreshEvent.fire();
                treeItem = this.getTreeItemByPath(filePath);
            }

            if (treeItem) {
                const parentGroup = this.getParentGroup(treeItem);
                if (parentGroup) {
                    void this.treeView.reveal(parentGroup, { select: false, expand: true })
                        .then(() => this.revealActiveFile(parentGroup.label))
                        .catch(() => { });
                }
            }
        });

        const debouncedVisibleChange = this.debounce(async () => {
            if (!this._isInitialized) return;
            await this.smartRefresh();
        }, 500);

        vscode.window.onDidChangeVisibleTextEditors(() => {
            debouncedVisibleChange();
        });

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

        vscode.window.onDidChangeActiveTextEditor(async (editor) => {
            if (!editor || !this._isInitialized) return;

            const filePath = editor.document.uri.fsPath;
            let treeItem = this.getTreeItemByPath(filePath);

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

        this.treeView.onDidExpandElement(async (event) => {
            const element = event.element;
            if (fboIsGroupTreeContext(element.contextValue)) {
                await this.revealActiveFile(element.label);
            }
        });

        const openBrowser = new OpenBrowser();
        openBrowser.registerCommands(context);
       
        this.dbStatusBar = new DBStatusBarManager(context); 
        this.dbStatusBar.show();
        context.subscriptions.push(this.treeView, disposable);
    }

    async promptTreeFilter() {
        if (!this.context) {
            return;
        }
        const value = await vscode.window.showInputBox({
            title: "Filter FBO project tree",
            placeHolder: "e.g. SI, Grid, *.xml - leave empty to clear filter",
            value: this._treeFilterRaw,
            prompt: "Substring match on file name or full path (case-insensitive). Use * for glob on file or folder name. Press Enter to apply, Escape to cancel.",
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

            for (const data of fileData) {
                const { filePath, folderName, ext, groupName } = data;

                if (!this.treeData.has(groupName)) {
                    const groupItemState = groupName === "OTHER" ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
                    const groupItem = new vscode.TreeItem(groupName, groupItemState);
                    groupItem.contextValue = groupName === "OTHER" ? "groupOther" : "group";

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
                const fileExt = path.extname(filePath).toLowerCase();
                item.contextValue = fileExt === ".f" ? "file_f" : "file";
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

                this.fileItemMap.set(path.normalize(filePath).toLowerCase(), item);
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
        this.refreshEvent.fire();
        return tree_item;
    }

    addFileToTree(filePath) {
        if (!filePath) return;
        const uri = vscode.Uri.file(filePath);
        if (uri.scheme !== 'file') {
            return;
        }
        if (this.getTreeItemByPath(filePath)) {
            return;
        }

        const folderName = path.basename(path.dirname(filePath));
        let groupName = this.getGroupName(filePath);
        if (!groupName) return;

        const config = vscode.workspace.getConfiguration('fbo-autocomplete');
        const sortType = config.get('sortTree', 'FileName');
        const iconRule = config.get('sortTree', 'iconRule');

        const item = new vscode.TreeItem(uri, vscode.TreeItemCollapsibleState.None);
        item.resourceUri = uri;
        const addFileExt = path.extname(filePath).toLowerCase();
        item.contextValue = addFileExt === ".f" ? "file_f" : "file";
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

        this.fileItemMap.set(path.normalize(filePath).toLowerCase(), item);
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
        this.fileItemMap.delete(path.normalize(filePath).toLowerCase());
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
        if (fboIsGroupTreeContext(element.contextValue)) {
            const label = fboTreeLabel(element.label);
            const raw = this.treeData.get(label) || [];
            return this._applyGroupQuickFilterToGroupItems(label, this._applyTreeFilterToItems(raw));
        }
        if (element.contextValue === "folder" && element.fboFolderKey) {
            const raw = this.folderChildren.get(element.fboFolderKey) || [];
            const gn = element.fboGroupName || "";
            return this._applyGroupQuickFilterToGroupItems(gn, this._applyTreeFilterToItems(raw));
        }
        return [];
    }

    getParent(element) {
        if (!element) return null;
        if (fboIsFileTreeContext(element.contextValue)) {
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

    /**
     * Gá»‘c paste luÃ´n lÃ  project path cá»§a nhÃ³m (level 1), ká»ƒ cáº£ khi kÃ©o tháº£ vÃ o folder level 2+.
     * TrÃ¡nh join(pathFolderCon, Ä‘Æ°á»ngDáº«nTÆ°Æ¡ngÄá»‘iTá»«Project) táº¡o thÃªm App_data/App_data/...
     */
    _getGroupRootPathForDropTarget(target) {
        if (!target || !target.resourceUri) return null;
        if (fboIsGroupTreeContext(target.contextValue)) {
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
        if (!fboIsGroupTreeContext(target.contextValue) && target.contextValue !== "folder") {
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
                const pasteResult = await this.app_dataChecker.pasteFilesToGroup(destPath, toPaste, 0);
                await this.notifyGroupFilesPasted(destPath, pasteResult);
            } catch (ex) {
                console.log(ex);
            }
        }
    }
}

module.exports = TreeFileProvider;


