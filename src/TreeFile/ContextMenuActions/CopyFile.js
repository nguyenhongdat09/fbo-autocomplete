const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { exec } = require('child_process');

function copyFilesToClipboard(filePaths) {
    if (!filePaths || filePaths.length === 0) return;
    const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        $data = New-Object System.Collections.Specialized.StringCollection
        ${filePaths.map(p => `$data.Add("${p.replace(/"/g, '`"')}")`).join("\n")}
        [System.Windows.Forms.Clipboard]::SetFileDropList($data)
    `;
    const tempDir = os.tmpdir();
    const psFilePath = path.join(tempDir, "fbo_copy.ps1");
    fs.writeFileSync(psFilePath, psScript);
    const command = `powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File "${psFilePath}"`;
    exec(command, (error, stdout, stderr) => {
        if (error) {
            vscode.window.showErrorMessage("⚠️ Copy file(s) failed: " + error.message);
            return;
        }
    });
}

function copyFile() {
    this.copyFilesToClipboard(this.getPathsSelect());
}

module.exports = {
    copyFilesToClipboard,
    copyFile
};
