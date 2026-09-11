const vscode = require('vscode');
const FormulaPreviewCommand = require('./FormulaPreviewCommand');

/**
 * Đăng ký chức năng Preview Công thức Grid XML vào extension
 * @param {vscode.ExtensionContext} context
 */
function registerFormulaPreview(context) {
    const disposable = vscode.commands.registerCommand(
        'fbo-autocomplete.previewFormula',
        () => FormulaPreviewCommand.run(context)
    );
    context.subscriptions.push(disposable);
}

module.exports = {
    registerFormulaPreview,
};
