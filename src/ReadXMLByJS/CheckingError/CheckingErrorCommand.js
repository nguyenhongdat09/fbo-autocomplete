const vscode = require('vscode');
const { checkEntityErrors } = require('./entityResolverChecking');
const { is_valid_project_root, normalize_to_project_root } = require('./SourcePathHelper');
const { CheckingErrorPanel } = require('./CheckingErrorPanel');
const { resolve_checking_files } = require('./CheckingFileResolver');

async function run_checking_error(context, treeDataProvider) {
    const tree_view = treeDataProvider && treeDataProvider.treeView;
    const selected = tree_view && tree_view.selection ? tree_view.selection : [];
    const file_paths = selected
        .filter(item => item && item.contextValue === 'file' && item.resourceUri)
        .map(item => item.resourceUri.fsPath);

    if (!file_paths.length) {
        vscode.window.showErrorMessage('Không có file nào được chọn.');
        return;
    }

    // Xử lý phân tích ASPX và lọc file hợp lệ
    const { xml_files, skipped_files } = await resolve_checking_files(file_paths);

    if (skipped_files.length > 0) {
        const warning_msg = `Đã bỏ qua ${skipped_files.length} file (không phải .xml/.aspx hoặc ASPX không resolve được XML).`;
        vscode.window.showWarningMessage(warning_msg);
    }

    if (!xml_files.length) {
        vscode.window.showErrorMessage('Không tìm thấy file XML hợp lệ nào để kiểm tra (các file chọn không được hỗ trợ).');
        return;
    }

    // Dialog Nguồn 1 lần đầu
    const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Chọn Nguồn 1 (project root)'
    });
    if (!picked || !picked[0]) return;

    const source1 = normalize_to_project_root(picked[0].fsPath) || picked[0].fsPath;
    if (!is_valid_project_root(source1, xml_files[0])) {
        vscode.window.showErrorMessage('Nguồn 1 không hợp lệ (phải nằm trong project kiểu group TreeFile / CustomerPro).');
        return;
    }

    const sources = [source1, '']; // sẵn Nguồn 2 trống
    let result;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Checking Error...",
        cancellable: false
    }, async (progress) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        result = checkEntityErrors(xml_files, sources);
    });

    if (!result.summary.total) {
        vscode.window.showInformationMessage('Không phát hiện lỗi entity.');
        return;
    }

    CheckingErrorPanel.create_or_show(context, treeDataProvider, xml_files, sources);
}

module.exports = { run_checking_error };
