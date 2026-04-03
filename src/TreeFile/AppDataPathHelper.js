const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

class AppDataPathHelper {
    constructor(filePath) {
        this.filePath = filePath; 
    }

    getProjectPath() {
        var parts = this.filePath.split(path.sep);
        const index = parts.findIndex(p => p.toLowerCase() === "customerpro");
        if (index === -1 || parts.length < index + 4) {
            return '';
        }
        const index2 = parts.findIndex(p => p.toLowerCase() === "fdn");
        return parts.slice(0, index + (index2 === -1 ? 4 : 3)).join(path.sep);
    }

    getGroupName() {
        var projectPath = this.getProjectPath().split('\\'); 
        return projectPath.length != 1 ? projectPath.slice(-2).join(' - ') : 'Other';
    }

    getPathAfterProject() {
        const projectPath = this.getProjectPath();
        if (!projectPath) return [];
        const remainingPath = this.filePath.substring(projectPath.length);
        const cleanRemaining = remainingPath.replace(/^[/\\]+/, ""); // loại bỏ dấu `\` đầu nếu có
        return [projectPath, cleanRemaining];
    }

    async pasteFilesToGroup(targetGroupPath, filePaths, generate = 0) {
        //generate = 1 => chuc nang gereateCopyFile
        let count = 0;
        const openedUris = [];
        for (const originalPath of filePaths) {
            if(generate == 0)
                this.filePath = originalPath;
            else
                this.filePath = originalPath[0];
            if (this.getGroupName() == 'Other') continue;
            if (this.getPathAfterProject().length == 1) continue;
            var destinationPath = path.join(targetGroupPath, this.getPathAfterProject()[1]);
            if(generate == 1)
                destinationPath = destinationPath.replace(path.basename(destinationPath), path.basename(originalPath[1]));
            // Nếu file đã tồn tại thì xác nhận từng cái
            if (fs.existsSync(destinationPath)) {
                const result = await vscode.window.showWarningMessage(
                    `"${destinationPath}" đã tồn tại. Bạn có muốn ghi đè không?`,
                    { modal: true },
                    "Ghi đè", "Bỏ qua"
                );
                if (result !== "Ghi đè") continue; // bỏ qua nếu không chọn ghi đè
            }
            try {
                fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
                fs.copyFileSync(this.filePath, destinationPath);
                openedUris.push(vscode.Uri.file(destinationPath));
                count++;
            } catch (err) {
                vscode.window.showErrorMessage(`❌ Lỗi khi copy file: ${this.filePath} -> ${err.message}`);
            }
        }
        // ✅ Mở tất cả các file đã paste
        for (const uri of openedUris) {
            try {
                await vscode.window.showTextDocument(uri, { preview: false, viewColumn: vscode.ViewColumn.Active });
            } catch (err) {
                vscode.window.showWarningMessage(`Không thể mở file: ${uri.fsPath}`);
            }
        } 
    } 
}

module.exports = AppDataPathHelper;