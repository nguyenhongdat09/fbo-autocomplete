const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

async function fixWebConfig(group) {
    if (!group) return;
    try {
        var file = path.join(group.resourceUri.fsPath, 'Web.config');
        if (!fs.existsSync(file)) vscode.window.showErrorMessage(`❌ Không tìm thấy file ${file}`)
        const originalContent = fs.readFileSync(file, 'utf8');
        const modifiedContent = originalContent + ' ';
        fs.writeFileSync(file, modifiedContent, 'utf8');
        await new Promise(resolve => setTimeout(resolve, 100));
        fs.writeFileSync(file, originalContent, 'utf8');
        vscode.window.showInformationMessage(`✅ Đã "fix" ${file}`);
    } catch (err) {
        vscode.window.showErrorMessage(`❌ Không thể fix ${file}: ${err.message}`);
    }
}

module.exports = {
    fixWebConfig
};
