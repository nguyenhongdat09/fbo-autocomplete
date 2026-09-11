/**
 * Thin entry: đăng ký command + gắn handlers từ ./ContextMenuActions.
 * Logic từng lệnh nằm trong ContextMenuActions/*.js
 */
const vscode = require("vscode");
const app_dataChecker = require("./AppDataPathHelper");

// ContextMenuActions modules
const registerCommands = require("./ContextMenuActions/registerCommands");
const selectionHelpers = require("./ContextMenuActions/selectionHelpers");
const GenerateCopyFile = require("./ContextMenuActions/GenerateCopyFile");
const PasteFilesToGroup = require("./ContextMenuActions/PasteFilesToGroup");
const OpenRevealFolder = require("./ContextMenuActions/OpenRevealFolder");
const CopyPath = require("./ContextMenuActions/CopyPath");
const RenameFile = require("./ContextMenuActions/RenameFile");
const CopyFile = require("./ContextMenuActions/CopyFile");
const CopyNameOfFile = require("./ContextMenuActions/CopyNameOfFile");
const OpenWebConfig = require("./ContextMenuActions/OpenWebConfig");
const ConfigProjectRoot = require("./ContextMenuActions/ConfigProjectRoot");
const ExpandAll = require("./ContextMenuActions/ExpandAll");
const FixWebConfig = require("./ContextMenuActions/FixWebConfig");
const DeleteStruct = require("./ContextMenuActions/DeleteStruct");
const NewSqlTemp = require("./ContextMenuActions/NewSqlTemp");
const DeleteFile = require("./ContextMenuActions/DeleteFile");

class ContextMenuHandler {
    constructor(context, treeDataProvider) {
        this.context = context;
        this.treeDataProvider = treeDataProvider;
        this.treeView = treeDataProvider.treeView;
        this.treeData = treeDataProvider.treeData;
        this.app_dataChecker = new app_dataChecker();
        this.config = vscode.workspace.getConfiguration("fbo-autocomplete");

        // Đăng ký command cho context menu
        registerCommands(this);

        if (this.treeView && typeof this.treeView.onDidChangeSelection === "function") {
            this.treeView.onDidChangeSelection((e) => {
                const isFileSelected =
                    e.selection.length > 0 &&
                    e.selection.every(
                        (item) => item.contextValue === "file" || item.contextValue === "file_f"
                    );
                vscode.commands.executeCommand("setContext", "fboViewFileSelected", isFileSelected);
            });
        }
    }
}

Object.assign(
    ContextMenuHandler.prototype,
    selectionHelpers,
    GenerateCopyFile,
    PasteFilesToGroup,
    OpenRevealFolder,
    CopyPath,
    RenameFile,
    CopyFile,
    CopyNameOfFile,
    OpenWebConfig,
    ConfigProjectRoot,
    ExpandAll,
    FixWebConfig,
    DeleteStruct,
    NewSqlTemp,
    DeleteFile
);

module.exports = ContextMenuHandler;

