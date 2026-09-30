const vscode = require("vscode");
const fs = require("fs");
const { createSqlTempFile, createTempFile, resolveSqlTempFolder, isAntigravityIde } = require("../../Utils/sqlTempFile");

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

async function newTxtTemp(group) {
    if (!group) return;
    try {
        const folder_path = this.config.get('sqlTempFolder');
        if (!folder_path) {
            vscode.window.showErrorMessage(`Chưa cấu hình đường dẫn thư mục tạo file .txt. Vui lòng cấu hình 'fbo-autocomplete.sqlTempFolder' trong Settings.`);
            return;
        }

        const is_antigravity = isAntigravityIde();
        const target_folder = resolveSqlTempFolder(folder_path, is_antigravity);

        if (!is_antigravity && !fs.existsSync(target_folder)) {
            vscode.window.showErrorMessage(`Thư mục '${target_folder}' không tồn tại. Vui lòng kiểm tra lại cấu hình.`);
            return;
        }

        const raw_label = group ? (typeof group.label === "string" ? group.label : (group.label?.label || "temp")) : "temp";
        const { filePath: file_path, fileName: file_name } = createTempFile(target_folder, raw_label, '.txt', '');

        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file_path));
        await vscode.window.showTextDocument(document);

        vscode.window.showInformationMessage(`Đã tạo file ${file_name}`);
    } catch (err) {
        vscode.window.showErrorMessage(`Không thể tạo file .txt: ${err.message}`);
    }
}

module.exports = {
    newSqlTemp,
    newTxtTemp
};
