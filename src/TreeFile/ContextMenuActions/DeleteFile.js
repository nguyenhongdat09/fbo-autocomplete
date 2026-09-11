const vscode = require("vscode");
const fs = require("fs");

async function deleteFile() {
    const paths = this.getPathsSelect();
    if (!paths || paths.length === 0) return;

    const confirm = await vscode.window.showWarningMessage(
        `🗑️ Bạn có chắc muốn xoá ${paths.length} file không?`,
        { modal: true },
        'Yes', 'No'
    );

    if (confirm !== 'Yes') return;
    const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
    const targetTabs = tabs.filter(tab => {
        const input = tab.input;
        return input && typeof input === "object" && "uri" in input && paths.includes(input.uri.fsPath);
    });

    if (targetTabs.length > 0) {
        await vscode.window.tabGroups.close(targetTabs);
        for (const filePath of paths) {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (err) {
                vscode.window.showErrorMessage(`❌ Không thể xoá ${filePath}: ${err.message}`);
            }
        }
    }
}

module.exports = {
    deleteFile
};
