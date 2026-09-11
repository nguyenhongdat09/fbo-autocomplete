const vscode = require("vscode");
const ProjectMappingHelper = require("../../Database/ProjectMappingHelper");

async function configProjectRoot(group) {
    if (!group) return;
    try {
        this.app_dataChecker.filePath = group.resourceUri.fsPath;
        const baseRoot = this.app_dataChecker.getBaseProjectPath();
        if (!baseRoot) {
            vscode.window.showErrorMessage("Không xác định được đường dẫn gốc của dự án.");
            return;
        }
        const input = await vscode.window.showInputBox({
            prompt: `Nhập thư mục con (ví dụ: Program) cho dự án ${this.app_dataChecker.getGroupName()}`,
            placeHolder: "Để trống nếu muốn xóa cấu hình ngoại lệ",
            ignoreFocusOut: true
        });
        if (input === undefined) return; // User cancelled
        
        ProjectMappingHelper.setMapping(baseRoot, input.trim());
        
        vscode.window.showInformationMessage(`✅ Đã lưu cấu hình ngoại lệ. Đang tải lại cây...`);
        vscode.commands.executeCommand('fbo-autocomplete.reloadTree');
    } catch (err) {
        vscode.window.showErrorMessage(`❌ Lỗi cấu hình Project Root: ${err.message}`);
    }
}

module.exports = {
    configProjectRoot
};
