const vscode = require('vscode');
const ConvertExcelFromUploadCommand = require('./ConvertExcelFromUploadCommand');

/**
 * Đăng ký command ConvertExcelFromUpload vào context của VS Code extension
 * @param {vscode.ExtensionContext} context
 * @param {{ getIndexService: () => any }} deps
 */
function registerConvertExcelFromUpload(context, deps) {
    const cmd = vscode.commands.registerCommand(
        'fbo-autocomplete.ConvertExcelFromUpload',
        () => ConvertExcelFromUploadCommand.run(context, deps)
    );
    context.subscriptions.push(cmd);
}

module.exports = {
    registerConvertExcelFromUpload
};
