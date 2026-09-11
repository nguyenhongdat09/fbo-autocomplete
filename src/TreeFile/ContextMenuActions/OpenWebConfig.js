const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

async function openWebConfig(group) {
    if (!group) return;
    try {
        const file = path.join(group.resourceUri.fsPath, "Web.config");
        if (!fs.existsSync(file)) {
            vscode.window.showErrorMessage(`❌ Không tìm thấy file ${file}`);
            return;
        }
        const doc = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(doc, { preview: false });
    } catch (err) {
        vscode.window.showErrorMessage(`❌ Không thể mở Web.config: ${err.message}`);
    }
}

module.exports = {
    openWebConfig
};
