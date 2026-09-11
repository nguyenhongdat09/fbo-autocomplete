const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

async function renameFileCommand(treeItem) {
    let oldUri;

    if (treeItem && treeItem.resourceUri) {
        oldUri = treeItem.resourceUri;
    } else if (vscode.window.activeTextEditor?.document?.uri) {
        oldUri = vscode.window.activeTextEditor.document.uri;
    } else {
        vscode.window.showErrorMessage("Không xác định được file để đổi tên.");
        return;
    }

    const oldPath = oldUri.fsPath;
    const dir = path.dirname(oldPath);
    const oldName = path.basename(oldPath);
    await vscode.window.showTextDocument(oldUri, { preview: false });
    const newName = await vscode.window.showInputBox({
        prompt: 'Nhập tên mới cho file',
        value: oldName,
        validateInput: (input) => {
            if (!input.trim()) return 'Tên không hợp lệ';
            if (input.includes('/') || input.includes('\\')) return 'Tên không được chứa dấu / hoặc \\';
            return null;
        }
    });

    if (!newName || newName === oldName) return;

    const newPath = path.join(dir, newName);
    const newUri = vscode.Uri.file(newPath);

    try {
        if (vscode.window.activeTextEditor?.document?.uri.toString() === oldUri.toString()) {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
        fs.renameSync(oldPath, newPath);
        await vscode.window.showTextDocument(newUri, { preview: false });

    } catch (err) {
        vscode.window.showErrorMessage(`Không thể đổi tên file: ${err.message}`);
    }
}

module.exports = {
    renameFileCommand
};
