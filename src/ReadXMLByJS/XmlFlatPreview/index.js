const vscode = require('vscode');
const XmlFlatPreviewCommand = require('./XmlFlatPreviewCommand');

/**
 * Đăng ký chức năng XML Flat Preview vào extension
 * @param {vscode.ExtensionContext} context
 */
function registerXmlFlatPreview(context) {
    const disposable = vscode.commands.registerCommand('fbo-autocomplete.previewXmlFlat', () => {
        XmlFlatPreviewCommand.run(context);
    });
    context.subscriptions.push(disposable);
}

module.exports = {
    registerXmlFlatPreview
};
