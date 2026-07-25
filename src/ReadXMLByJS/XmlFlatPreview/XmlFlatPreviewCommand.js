const vscode = require('vscode');
const path = require('path');
const XmlFlatPreviewPanel = require('./XmlFlatPreviewPanel');

class XmlFlatPreviewCommand {
    /**
     * @param {vscode.ExtensionContext} context
     */
    static async run(context) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("Mở file XML để preview.");
            return;
        }

        const doc = editor.document;
        const file_path = doc.fileName;
        const ext = path.extname(file_path).toLowerCase();

        if (doc.uri.scheme !== 'file' || ext !== '.xml') {
            vscode.window.showWarningMessage("Chức năng chỉ hỗ trợ file XML.");
            return;
        }

        if (doc.isDirty) {
            const choice = await vscode.window.showWarningMessage(
                `File XML '${path.basename(file_path)}' có thay đổi chưa lưu. Bạn có muốn lưu trước khi preview?`,
                "Lưu và Preview",
                "Preview từ đĩa"
            );
            if (choice === "Lưu và Preview") {
                const saved = await doc.save();
                if (!saved) {
                    vscode.window.showErrorMessage("Không thể lưu file XML.");
                    return;
                }
            } else if (!choice) {
                return; // Người dùng hủy thao tác
            }
        }

        // Chạy với progress notification để tăng chất lượng UX, đặc biệt khi load network path
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Đang tải Flat Preview cho ${path.basename(file_path)}...`,
            cancellable: false
        }, async () => {
            XmlFlatPreviewPanel.createOrShow(context, file_path);
        });
    }
}

module.exports = XmlFlatPreviewCommand;
