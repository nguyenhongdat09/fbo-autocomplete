const vscode = require("vscode");
const cp = require('child_process');

async function getFilePathsFromWindowsClipboard() {
    return new Promise((resolve, reject) => {
        const ps = cp.spawn('powershell.exe', [
            '-NoProfile',
            '-Command',
            'Get-Clipboard -Format FileDropList | ForEach-Object { $_.FullName }'
        ]);

        var output = '';
        var error = '';

        ps.stdout.on('data', (data) => {
            output += data.toString();
        });

        ps.stderr.on('data', (data) => {
            error += data.toString();
        });

        ps.on('close', (code) => {
            if (code !== 0 || error) {
                return resolve([]);
            }

            const files = output
                .split(/\r?\n/)
                .map(line => line.trim())
                .filter(line => line.length > 0);

            resolve(files);
        });

        ps.on('error', (err) => {
            resolve([]);
        });
    });
}

async function PasteFilesToGroup(group) {
    if (!group) {
        vscode.window.showWarningMessage("Vui lòng chọn một group để paste.");
        return;
    }
    var filePaths = await this.getFilePathsFromWindowsClipboard();
    if (!filePaths || filePaths.length === 0) {
        vscode.window.showWarningMessage("Không tìm thấy file nào trong clipboard.");
        return;
    }
    const pasteResult = await this.app_dataChecker.pasteFilesToGroup(group.resourceUri.fsPath, filePaths, 0);
    if (typeof this.treeDataProvider.notifyGroupFilesPasted === "function") {
        await this.treeDataProvider.notifyGroupFilesPasted(group.resourceUri.fsPath, pasteResult);
    }
}

module.exports = {
    getFilePathsFromWindowsClipboard,
    PasteFilesToGroup
};
