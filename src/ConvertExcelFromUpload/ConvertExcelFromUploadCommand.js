const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { detectUploadVersion } = require('./parser/UploadVersionDetector');
const { parseUploadFields } = require('./parser/UploadFieldsParser');
const {
    deriveSearchPrefix,
    filterDirGridPaths,
    filterExactBaseName,
    isUploadFolderPath
} = require('./parser/SearchPrefixDeriver');
const { buildHeaderCatalog, mergeUploadWithHeaders } = require('./parser/DirGridHeaderCatalog');
const { exportUploadExcel } = require('./excel/UploadExcelExporter');
const AppDataPathHelper = require('../TreeFile/AppDataPathHelper');
const entityResolver = require('../ReadXMLByJS/entityResolver');
const { expandXmlEntities } = require('../ReadXMLByJS/XmlFlatPreview/XmlEntityExpander');

class ConvertExcelFromUploadCommand {
    /**
     * Thực thi lệnh chuyển đổi file Upload XML thành file Excel upload chuẩn
     * @param {vscode.ExtensionContext} context
     * @param {{ getIndexService: () => any }} deps
     */
    static async run(context, deps) {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('Không có file đang mở.');
                return;
            }

            const doc = editor.document;
            const fs_path = (doc && doc.uri && doc.uri.fsPath) || '';

            // 1. Kiểm tra folder Upload
            if (!isUploadFolderPath(fs_path)) {
                vscode.window.showErrorMessage('Chức năng này chỉ chạy trên file trong Templates/Upload.');
                return;
            }

            const xml_text = doc.getText();

            // 2. Kiểm tra phiên bản (chặn phiên bản có thẻ <template>)
            const version = detectUploadVersion(xml_text);
            if (version === 'template') {
                vscode.window.showErrorMessage('Upload phiên bản mới (có thẻ <template>) không dùng Convert Excel From Upload.');
                return;
            }

            // 3. Parse fields từ file Upload XML
            const { fields: upload_fields, warnings: parse_warnings } = parseUploadFields(xml_text);
            if (!upload_fields || upload_fields.length === 0) {
                vscode.window.showErrorMessage('Không tìm thấy trường nào có khai báo cột (column) trong file Upload.');
                return;
            }

            if (parse_warnings && parse_warnings.length > 0) {
                vscode.window.showWarningMessage(`Upload XML: ${parse_warnings.join('; ')}`);
            }

            // 4. Suy luận prefix tìm kiếm Dir/Grid
            const file_base_name = path.basename(fs_path);
            const derive = deriveSearchPrefix(file_base_name);

            // 5. Xác định thư mục root của project
            const helper = new AppDataPathHelper(fs_path);
            const group_root = helper.getProjectPath();
            if (!group_root) {
                vscode.window.showErrorMessage('Không xác định được thư mục gốc của project (Controllers).');
                return;
            }

            // 6. Lấy service index
            const index_service = (deps && typeof deps.getIndexService === 'function')
                ? deps.getIndexService()
                : null;

            if (!index_service) {
                vscode.window.showErrorMessage('Index SearchFile chưa sẵn sàng. Mở FBO Tree hoặc đợi index xong rồi thử lại.');
                return;
            }

            // 7. Tìm kiếm file Dir/Grid
            const search_result = await index_service.search(group_root, derive.keyword);
            let matched_paths = filterDirGridPaths(search_result.filesRel || []);

            if (derive.mode === 'exact') {
                matched_paths = filterExactBaseName(matched_paths, derive.prefix);
            } else if (derive.mode === 'prefix') {
                matched_paths = matched_paths.filter(rel => {
                    const base_name = path.basename(rel, path.extname(rel)).toLowerCase();
                    return base_name.startsWith(derive.prefix.toLowerCase());
                });
            }

            if (!matched_paths || matched_paths.length === 0) {
                console.warn(`[FBO ConvertExcelFromUpload] Không tìm thấy file. group_root: "${group_root}", keyword: "${derive.keyword}", totalIndexed: ${search_result.totalIndexed}, totalMatched: ${search_result.totalMatched}`);
                vscode.window.showErrorMessage(`Không tìm thấy file Dir/Grid khớp với "${derive.prefix}".`);
                return;
            }

            // 8. Hiển thị QuickPick cho người dùng chọn file
            const pick_items = matched_paths.map(rel => {
                const norm = rel.replace(/\\/g, '/');
                const parts = norm.split('/');
                const ctrl_idx = parts.map(p => p.toLowerCase()).lastIndexOf('controllers');
                const short_label = ctrl_idx >= 0 ? parts.slice(ctrl_idx + 1).join('/') : path.basename(rel);

                return {
                    label: short_label,
                    description: rel,
                    abs_path: path.join(group_root, rel)
                };
            });

            const picked = await vscode.window.showQuickPick(pick_items, {
                canPickMany: true,
                placeHolder: 'Chọn file Dir/Grid để lấy header field',
                matchOnDescription: true,
                title: 'FBO: Convert Excel From Upload'
            });

            if (!picked || picked.length === 0) {
                vscode.window.showWarningMessage('Chưa chọn file Dir/Grid.');
                return;
            }

            // 9. Đọc và flatten entity từng file được chọn
            const sources = [];
            for (const item of picked) {
                try {
                    const source_text = entityResolver.readFileContent(item.abs_path);
                    const model = expandXmlEntities(item.abs_path, source_text);
                    sources.push({
                        fileLabel: item.label,
                        flatText: (model && model.flat_text) ? model.flat_text : source_text
                    });
                } catch (read_err) {
                    console.error(`[FBO ConvertExcelFromUpload] Lỗi đọc/flatten: ${item.abs_path}`, read_err);
                }
            }

            if (sources.length === 0) {
                vscode.window.showErrorMessage('Không đọc được nội dung từ các file Dir/Grid đã chọn.');
                return;
            }

            // 10. Trích xuất catalog header và gộp với Upload fields
            const { catalog } = buildHeaderCatalog(sources);
            if (!catalog || Object.keys(catalog).length === 0) {
                vscode.window.showWarningMessage('Không tìm thấy header tiếng Việt trong các file đã chọn; các cột sẽ dùng tên trường làm tiêu đề.');
            }
            const cells = mergeUploadWithHeaders(upload_fields, catalog);

            // 11. Copy đường dẫn thư mục Templates\Excel vào clipboard và chuẩn bị hộp thoại lưu file
            const current_clean_name = path.basename(fs_path, path.extname(fs_path));
            const target_folder = path.join(path.dirname(path.dirname(fs_path)), 'Excel');
            await vscode.env.clipboard.writeText(target_folder);
            vscode.window.showInformationMessage(`Đã copy đường dẫn Templates\\Excel vào clipboard để bạn dễ dàng Paste.`);

            let default_uri;
            if (fs.existsSync(target_folder)) {
                default_uri = vscode.Uri.file(path.join(target_folder, `${current_clean_name}_upload.xlsx`));
            } else {
                default_uri = vscode.Uri.joinPath(doc.uri, '..', `${current_clean_name}_upload.xlsx`);
            }

            const save_uri = await vscode.window.showSaveDialog({
                title: 'Chọn vị trí lưu Excel Upload',
                filters: { 'Excel Files': ['xlsx'] },
                defaultUri: default_uri,
                saveLabel: 'Xuất Excel'
            });

            if (!save_uri) {
                vscode.window.showWarningMessage('Hủy xuất file Excel.');
                return;
            }

            // 12. Ghi file Excel theo mẫu
            await exportUploadExcel(cells, save_uri.fsPath);
            vscode.window.showInformationMessage(`Đã xuất file: ${save_uri.fsPath}`);

            // 13. Tự động mở file Excel bằng ứng dụng mặc định
            try {
                const is_opened = await vscode.env.openExternal(save_uri);
                if (!is_opened && process.platform === 'win32') {
                    exec(`start "" "${save_uri.fsPath}"`);
                }
            } catch (open_err) {
                if (process.platform === 'win32') {
                    exec(`start "" "${save_uri.fsPath}"`);
                }
            }
        } catch (err) {
            console.error('[FBO ConvertExcelFromUpload] Lỗi thực thi:', err);
            vscode.window.showErrorMessage('Convert Excel From Upload lỗi: ' + err.message);
        }
    }
}

module.exports = ConvertExcelFromUploadCommand;
