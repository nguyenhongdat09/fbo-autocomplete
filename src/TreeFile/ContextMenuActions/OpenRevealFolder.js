const vscode = require("vscode");

function openRevealFolder(uri) {
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

module.exports = {
    openRevealFolder
};
