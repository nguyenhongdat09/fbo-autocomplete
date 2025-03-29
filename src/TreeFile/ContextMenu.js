const vscode = require("vscode");
const path = require("path");

class ContextMenuHandler {
    constructor(context) {
        this.context = context;

        // Đăng ký command cho context menu
        this.context.subscriptions.push(
            vscode.commands.registerCommand("fboFile.openRevealFolder", this.openRevealFolder)
        );
    }

    openRevealFolder(uri) {
        if (!uri) {
            vscode.window.showErrorMessage("Không tìm thấy đường dẫn file.");
            return;
        }
        const filePath = uri.resourceUri.fsPath;  
           const openCommand = process.platform === "win32" 
           ? `explorer /select,"${filePath}"`  // Windows
           : `open -R "${filePath}"`;          // macOS

       require("child_process").exec(openCommand);
    }
}
module.exports = ContextMenuHandler;
