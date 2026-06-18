// @ts-nocheck

const vscode = require("vscode");
const path = require("path");
const GroupTextSearchKinds = require("./GroupTextSearchKinds");

class TextSearchResultTreeView {
    constructor() {
        this.refreshEvent = new vscode.EventEmitter();
        this.onDidChangeTreeData = this.refreshEvent.event;
        this.treeView = null;
        /** @type {import('vscode').TreeItem[]} */
        this.rootItems = [];
        /** @type {Map<string, import('vscode').TreeItem[]>} */
        this.childrenMap = new Map();
        /** @type {any|null} */
        this._lastResult = null;
    }

    /**
     * @param {import('vscode').ExtensionContext} context
     */
    run(context) {
        this.treeView = vscode.window.createTreeView(GroupTextSearchKinds.VIEW_ID, {
            treeDataProvider: this,
            showCollapseAll: true,
        });
        context.subscriptions.push(this.treeView);
    }

    /**
     * @param {any} result
     * @param {{ reveal?: boolean }} [options]
     */
    publishResult(result, options) {
        this._lastResult = result || null;
        this._buildTree(result);
        this.refreshEvent.fire();
        if (this.treeView && result) {
            this.treeView.badge = {
                value: Number(result.totalMatches || 0),
                tooltip: "Text search matches",
            };
            this.treeView.description = `${result.totalMatches || 0} in ${result.totalFiles || 0} files`;
        }
        if (options && options.reveal === true) {
            this.showPanel();
        }
    }

    showPanel() {
        try {
            void vscode.commands.executeCommand(GroupTextSearchKinds.PANEL_CMD);
            void vscode.commands.executeCommand(`${GroupTextSearchKinds.VIEW_ID}.focus`);
        } catch (err) {
            console.error("[FBO TextSearchResult] showPanel:", err);
        }
    }

    /**
     * Root summary + file nodes + line previews.
     * @param {any} result
     */
    _buildTree(result) {
        this.rootItems = [];
        this.childrenMap.clear();
        if (!result || !result.groupRoot) {
            return;
        }

        const displayGroup = String(result.groupLabel || "").trim()
            || path.basename(result.groupRoot)
            || result.groupRoot;
        const totalMatches = Number(result.totalMatches || 0);
        const totalFiles = Number(result.totalFiles || 0);
        const rootLabel = `${displayGroup} (${totalMatches} result${totalMatches === 1 ? "" : "s"} in ${totalFiles} file${totalFiles === 1 ? "" : "s"})`;

        const root = new vscode.TreeItem(rootLabel, vscode.TreeItemCollapsibleState.Expanded);
        root.contextValue = "textSearchResultRoot";
        root.resourceUri = vscode.Uri.file(result.groupRoot);
        root.iconPath = new vscode.ThemeIcon("folder-library");
        const rootKey = `root::${result.groupRoot}`;
        root.fboTextSearchNodeKey = rootKey;
        this.rootItems.push(root);
        this.childrenMap.set(rootKey, []);

        for (const file of (result.files || [])) {
            if (!file || !file.absPath) continue;
            const relPath = String(file.relPath || file.absPath).replace(/\\/g, "/");
            const segs = relPath.split("/").filter(Boolean);
            const fileName = segs.length ? segs[segs.length - 1] : path.basename(file.absPath);
            const dirPart = segs.length > 1 ? segs.slice(0, -1).join("/") : "";
            const matchCount = Number(file.matchCount || (file.matches && file.matches.length) || 0);

            const fileKey = `file::${file.absPath}`;
            const hasLines = Array.isArray(file.matches) && file.matches.length > 0;
            const fileItem = new vscode.TreeItem(
                fileName,
                hasLines ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
            );
            fileItem.contextValue = "textSearchResultFile";
            fileItem.resourceUri = vscode.Uri.file(file.absPath);
            fileItem.iconPath = vscode.ThemeIcon.File;
            fileItem.fboTextSearchNodeKey = fileKey;
            fileItem.fboTextSearchFile = file;
            fileItem.description = dirPart
                ? `${dirPart} — ${matchCount}`
                : String(matchCount);

            if (!this.childrenMap.has(rootKey)) {
                this.childrenMap.set(rootKey, []);
            }
            this.childrenMap.get(rootKey).push(fileItem);
            this._buildLineNodes(file, fileKey);
        }

        const rootChildren = this.childrenMap.get(rootKey) || [];
        rootChildren.sort((a, b) => {
            const la = String(a.label && (a.label.label || a.label) || "");
            const lb = String(b.label && (b.label.label || b.label) || "");
            return la.localeCompare(lb);
        });
    }

    /**
     * @param {{ absPath: string, matches?: any[] }} file
     * @param {string} fileKey
     */
    _buildLineNodes(file, fileKey) {
        /** @type {import('vscode').TreeItem[]} */
        const lines = [];
        const matches = Array.isArray(file.matches) ? file.matches : [];

        for (let i = 0; i < matches.length; i++) {
            const m = matches[i];
            const lineKey = `${fileKey}::line::${i}`;
            const preview = String(m.preview || "").trim();
            const lineItem = new vscode.TreeItem(
                {
                    label: preview || "(empty line)",
                    highlights: Array.isArray(m.highlights) ? m.highlights : [],
                },
                vscode.TreeItemCollapsibleState.None
            );
            lineItem.contextValue = "textSearchResultLine";
            lineItem.description = `L${Number(m.line) || 1}`;
            lineItem.fboTextSearchNodeKey = lineKey;
            lineItem.iconPath = new vscode.ThemeIcon("debug-stackframe");

            const payload = TextSearchResultTreeView._matchPayload(file.absPath, m.range);
            if (payload) {
                lineItem.command = {
                    command: GroupTextSearchKinds.CMD_OPEN_MATCH,
                    title: "Open match",
                    arguments: [payload],
                };
            }
            lines.push(lineItem);
        }

        this.childrenMap.set(fileKey, lines);
    }

    /**
     * Payload JSON-serializable cho command open match (bước 18).
     * @param {string} absPath
     * @param {import('vscode').Range|undefined} range
     */
    static _matchPayload(absPath, range) {
        if (!absPath || !range || !range.start || !range.end) {
            return null;
        }
        return {
            uri: String(absPath),
            startLine: range.start.line,
            startCharacter: range.start.character,
            endLine: range.end.line,
            endCharacter: range.end.character,
        };
    }

    getTreeItem(element) {
        return element;
    }

    async getChildren(element) {
        if (!element) {
            return this.rootItems;
        }
        return this.childrenMap.get(element.fboTextSearchNodeKey) || [];
    }
}

module.exports = TextSearchResultTreeView;
