const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { createSqlTempFile, resolveSqlTempFolder, isAntigravityIde } = require("../../Utils/sqlTempFile");

async function newSqlTemp(group) {
    if (!group) return;
    try {
        const folder_path = this.config.get('sqlTempFolder');
        if (!folder_path) {
            vscode.window.showErrorMessage(`Chưa cấu hình đường dẫn thư mục tạo file .sql. Vui lòng cấu hình 'fbo-autocomplete.sqlTempFolder' trong Settings.`);
            return;
        }

        const is_antigravity = isAntigravityIde();
        const target_folder = resolveSqlTempFolder(folder_path, is_antigravity);

        if (!is_antigravity && !fs.existsSync(target_folder)) {
            vscode.window.showErrorMessage(`Thư mục '${target_folder}' không tồn tại. Vui lòng kiểm tra lại cấu hình.`);
            return;
        }

        const raw_label = group ? (typeof group.label === "string" ? group.label : (group.label?.label || "temp")) : "temp";
        const { filePath: file_path, fileName: file_name } = createSqlTempFile(target_folder, raw_label, '');

        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file_path));
        await vscode.window.showTextDocument(document);

        vscode.window.showInformationMessage(`Đã tạo file ${file_name}`);
    } catch (err) {
        vscode.window.showErrorMessage(`Không thể tạo file .sql: ${err.message}`);
    }
}

async function newSqlTempOnWorkspace(group) {
    try {
        const workspace_folders = vscode.workspace.workspaceFolders;
        if (!workspace_folders || workspace_folders.length === 0) {
            vscode.window.showErrorMessage(`Workspace chưa mở thư mục nào. Vui lòng mở workspace trước khi sử dụng chức năng này.`);
            return;
        }

        let workspace_folder = workspace_folders[0];
        if (group?.resourceUri) {
            const matched = vscode.workspace.getWorkspaceFolder(group.resourceUri);
            if (matched) {
                workspace_folder = matched;
            }
        }

        const workspace_root = workspace_folder.uri.fsPath;
        const scripts_folder = path.join(workspace_root, 'Scripts');
        if (!fs.existsSync(scripts_folder)) {
            fs.mkdirSync(scripts_folder, { recursive: true });
        }

        const raw_label = group ? (typeof group.label === "string" ? group.label : (group.label?.label || "temp")) : "temp";
        const { filePath: file_path, fileName: file_name } = createSqlTempFile(scripts_folder, raw_label, '');

        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file_path));
        await vscode.window.showTextDocument(document);

        vscode.window.showInformationMessage(`Đã tạo file ${file_name}`);
    } catch (err) {
        vscode.window.showErrorMessage(`Không thể tạo file .sql trong workspace: ${err.message}`);
    }
}

module.exports = {
    newSqlTemp,
    newSqlTempOnWorkspace
};
