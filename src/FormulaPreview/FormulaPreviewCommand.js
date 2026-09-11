const vscode = require('vscode');
const path = require('path');
const FormulaPreviewPanel = require('./FormulaPreviewPanel');

class FormulaPreviewCommand {
    /**
     * @param {vscode.ExtensionContext} context
     */
    static async run(context) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("[Formula Preview] Vui lòng mở file Grid XML để preview công thức.");
            return;
        }

        const doc = editor.document;
        const file_path = doc.fileName;
        const ext = path.extname(file_path).toLowerCase();

        if (doc.uri.scheme !== 'file' || ext !== '.xml') {
            vscode.window.showWarningMessage("[Formula Preview] Chức năng chỉ hỗ trợ file XML.");
            return;
        }

        // Kiểm tra xem có phải file thuộc thư mục Grid không
        const normalized_path = file_path.replace(/\\/g, '/');
        if (!/\/grid\//i.test(normalized_path)) {
            vscode.window.showWarningMessage("[Formula Preview] Chức năng chỉ hỗ trợ file Grid XML (Controllers/Grid/*.xml).");
            return;
        }

        if (doc.isDirty) {
            const choice = await vscode.window.showWarningMessage(
                `File Grid XML '${path.basename(file_path)}' có thay đổi chưa lưu. Bạn có muốn lưu trước khi preview?`,
                "Lưu và Preview",
                "Preview từ đĩa"
            );
            if (choice === "Lưu và Preview") {
                const saved = await doc.save();
                if (!saved) {
                    vscode.window.showErrorMessage("[Formula Preview] Không thể lưu file XML.");
                    return;
                }
            } else if (!choice) {
                return; // Người dùng hủy thao tác
            }
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Đang tải Preview Công thức cho ${path.basename(file_path)}...`,
            cancellable: false
        }, async () => {
            FormulaPreviewPanel.createOrShow(context, file_path);
        });
    }
}

module.exports = FormulaPreviewCommand;
