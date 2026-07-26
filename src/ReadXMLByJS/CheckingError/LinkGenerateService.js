const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

/**
 * Chỉ copy các row có source_index !== null && source_file_path.
 * Không hỏi ghi đè (đích đang thiếu).
 * @returns {{ copied: number, failed: number, pasted_paths: string[], opened_uris: vscode.Uri[], notify_group_root: string }}
 */
async function generate_missing_files(table1_missing, treeDataProvider) {
    let copied = 0;
    let failed = 0;
    const pasted_paths = [];
    const opened_uris = [];
    let notify_group_root = '';

    const rows = (table1_missing || []).filter(r => r.source_index !== null && r.source_file_path);

    for (const row of rows) {
        const dest_path = row.missing_path;
        const source_path = row.source_file_path;
        if (!fs.existsSync(source_path)) {
            failed++;
            continue;
        }
        // An toàn: nếu vì lý do nào đó đích đã có → bỏ qua (không hỏi)
        if (fs.existsSync(dest_path)) {
            continue;
        }
        try {
            fs.mkdirSync(path.dirname(dest_path), { recursive: true });
            fs.copyFileSync(source_path, dest_path);
            copied++;
            pasted_paths.push(dest_path);
            opened_uris.push(vscode.Uri.file(dest_path));
            if (!notify_group_root) {
                const AppDataPathHelper = require('../../TreeFile/AppDataPathHelper');
                const helper = new AppDataPathHelper(dest_path);
                const parts = helper.getPathAfterProject();
                if (parts && parts.length >= 1) notify_group_root = parts[0];
            }
        } catch (err) {
            failed++;
            vscode.window.showErrorMessage(`❌ Lỗi copy: ${source_path} → ${err.message}`);
        }
    }

    for (const uri of opened_uris) {
        try {
            await vscode.window.showTextDocument(uri, { preview: false, viewColumn: vscode.ViewColumn.Active });
        } catch (e) { /* ignore */ }
    }

    if (copied > 0 && notify_group_root && treeDataProvider && typeof treeDataProvider.notifyGroupFilesPasted === 'function') {
        await treeDataProvider.notifyGroupFilesPasted(notify_group_root, {
            count: copied,
            paths: pasted_paths,
            openedUris: opened_uris
        });
    }

    return { copied, failed, pasted_paths, opened_uris, notify_group_root };
}

module.exports = { generate_missing_files };
