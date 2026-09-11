const vscode = require("vscode");
const path = require("path");

async function copyNameOfFile() {
    const paths = this.getPathsSelect();
    if (!paths || paths.length === 0) return;
    const ExtFileNameCopy = this.config.get('ExtFileNameCopy');
    const fileNames = paths.map(p => {
        const fileName = path.basename(p);
        if (String(ExtFileNameCopy) === 'No') {
            return path.parse(fileName).name;
        } else {
            return fileName;
        }
    });
    await vscode.env.clipboard.writeText(fileNames.join(','));
}

async function copyNameOfFileNoEx() {
    //Sửa lại hàm copyNameOfFile để không có phần mở rộng
    const paths = this.getPathsSelect();
    if (!paths || paths.length === 0) return;
    const ExtFileNameCopy = this.config.get('ExtFileNameCopy');
    const fileNames = paths.map(p => {
        var fileName = path.basename(p);
        fileName = path.parse(fileName).name; // Bỏ phần mở rộng luôn
        if (String(ExtFileNameCopy) === 'No') {
            return path.parse(fileName).name;
        } else {
            return fileName;
        }
    });
    await vscode.env.clipboard.writeText(fileNames.join(','));
}

module.exports = {
    copyNameOfFile,
    copyNameOfFileNoEx
};
