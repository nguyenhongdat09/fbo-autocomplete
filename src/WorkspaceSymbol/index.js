// @ts-nocheck
// Đăng ký Workspace Symbol (Ctrl+T) + giữ index tươi theo file events + watcher.

const vscode = require("vscode");
const path = require("path");
const SymbolIndexService = require("./SymbolIndexService");
const SymbolLevelStore = require("./SymbolLevelStore");
const FboWorkspaceSymbolProvider = require("./WorkspaceSymbolProvider");
const { ALL_SCAN_EXTS } = require("./SymbolScanner");
const GroupFileWatcherService = require("../TreeFile/SearchFile/GroupFileWatcherService");
const { resolveGroupFileSearchStorageRoot } = require("../TreeFile/SearchFile/GroupFileStoragePaths");

/**
 * @param {vscode.ExtensionContext} context
 * @param {{
 *   getGroupRoots: () => {name:string, root:string}[],
 *   getIndexService?: () => any,
 * }} deps
 */
function resolveSymbolStorageRoot(context) {
    // Có workspace: per-workspace storage — cùng thư mục group-file-index (tránh LOCK nhiều IDE).
    if (context.storageUri && context.storageUri.fsPath) {
        return resolveGroupFileSearchStorageRoot(context);
    }
    // Không workspace (dev host F5): helper trên trả tmpdir RANDOM mỗi session → DB mới tinh
    // → cold build mãi. Dùng Database user (globalStorage/Database/searchFile) — ổn định,
    // cùng chỗ với group-file-index-leveldb.
    try {
        const { getUserDatabaseRoot } = require("../extensionDatabasePaths");
        return path.join(getUserDatabaseRoot(), "searchFile");
    } catch {
        return path.join(context.globalStorageUri.fsPath, "symbol-index");
    }
}

function registerWorkspaceSymbols(context, deps) {
    const store = new SymbolLevelStore(resolveSymbolStorageRoot(context));

    const symbolIndex = new SymbolIndexService({
        getIndexService: deps.getIndexService,
        store,
    });
    const provider = new FboWorkspaceSymbolProvider({
        getGroupRoots: deps.getGroupRoots,
        symbolIndex,
        getIndexService: deps.getIndexService,
    });

    // Watcher giống SearchFile: vscode watcher cho path trong workspace,
    // native fs.watch + reconnect cho UNC. "create" của nó gồm cả change.
    const watcherAdapter = {
        applyPathEvent: async (_root, absPath, action) => {
            if (action === "delete") {
                symbolIndex.removeFile(absPath);
                return false;
            }
            if (!ALL_SCAN_EXTS.has(path.extname(absPath).toLowerCase())) return false;
            if (!symbolIndex.isUnderIndexedRoot(absPath)) return false;
            await symbolIndex.rescanFile(absPath);
            return false;
        },
        reconcileGroup: async () => false,
    };
    const symbolWatcher = new GroupFileWatcherService({ indexService: watcherAdapter });
    symbolIndex.onRootIndexed = () => {
        const roots = deps.getGroupRoots().map(g => g.root);
        if (roots.length) symbolWatcher.syncRoots(roots);
    };

    context.subscriptions.push(
        vscode.languages.registerWorkspaceSymbolProvider(provider),

        vscode.commands.registerCommand("fbo-autocomplete.rebuildSymbolIndex", async () => {
            const roots = deps.getGroupRoots();
            if (!roots.length) {
                vscode.window.showInformationMessage("Chưa có group/project nào trên FBO File tree.");
                return;
            }
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "FBO: Rebuild symbol index",
            }, async (progress) => {
                for (const g of roots) {
                    progress.report({ message: g.name });
                    await symbolIndex.rebuild(g.root);
                }
            });
            vscode.window.showInformationMessage("FBO: Symbol index rebuilt.");
        }),

        // Incremental: save → rescan đúng file đó (kể cả file mới dưới root đã index)
        vscode.workspace.onDidSaveTextDocument((doc) => {
            const p = doc.uri && doc.uri.fsPath;
            if (!p || doc.uri.scheme !== "file") return;
            if (ALL_SCAN_EXTS.has(path.extname(p).toLowerCase()) && symbolIndex.isUnderIndexedRoot(p)) {
                void symbolIndex.rescanFile(p);
            }
        }),

        vscode.workspace.onDidDeleteFiles((e) => {
            for (const uri of e.files) symbolIndex.removeFile(uri.fsPath);
        }),
        vscode.workspace.onDidRenameFiles((e) => {
            for (const f of e.files) symbolIndex.renameFile(f.oldUri.fsPath, f.newUri.fsPath);
        }),
        vscode.workspace.onDidCreateFiles((e) => {
            for (const uri of e.files) void symbolIndex.rescanFile(uri.fsPath);
        }),

        { dispose: () => { symbolWatcher.dispose(); void store.close(); } }
    );

    return { symbolIndex, provider };
}

module.exports = { registerWorkspaceSymbols };
