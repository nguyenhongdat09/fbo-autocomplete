const vscode = require("vscode");

function getPathsSelect() {
    // Nếu dùng trong TreeView thì lấy từ selection của tree
    const selected = this.treeView?.selection ?? [];
    if (!selected || selected.length === 0) {
        vscode.window.showErrorMessage("Không có file nào được chọn.");
        return;
    }
    const paths = selected.map(item => item.resourceUri?.fsPath).filter(Boolean);
    if (paths.length === 0) {
        vscode.window.showErrorMessage("Không tìm thấy đường dẫn nào hợp lệ.");
        return [];
    }
    return paths;
}

function getSelectedTargets() {
    // Ưu tiên từ treeView
    if (this.treeView?.selection?.length > 0) {
        return this.treeView.selection.filter(item => item?.resourceUri);
    }
    // Nếu không có thì lấy từ tab đang mở
    const uri = vscode.window.activeTextEditor?.document?.uri;
    return uri ? [{ resourceUri: uri }] : [];
}

module.exports = {
    getPathsSelect,
    getSelectedTargets
};
