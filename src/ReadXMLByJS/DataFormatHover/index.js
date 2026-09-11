const vscode = require('vscode');
const { DataFormatHoverProvider } = require('./DataFormatHoverProvider');

function registerDataFormatHover(context) {
    const provider = new DataFormatHoverProvider();

    // Đăng ký HoverProvider cho file xml
    const hoverDisposable = vscode.languages.registerHoverProvider(
        { language: 'xml', scheme: 'file' },
        provider
    );

    // Đăng ký lệnh nhảy đến dòng tương ứng trong Options.xml
    const cmdDisposable = vscode.commands.registerCommand('fbo-autocomplete.goToOptionVar', async (args) => {
        if (!args || !args.filePath) return;
        try {
            const doc = await vscode.workspace.openTextDocument(args.filePath);
            const editor = await vscode.window.showTextDocument(doc);
            const line = Math.max(0, Math.min(doc.lineCount - 1, args.line || 0));
            const pos = new vscode.Position(line, args.character || 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        } catch (err) {
            vscode.window.showErrorMessage(`Không thể mở file Options.xml: ${err.message}`);
        }
    });

    context.subscriptions.push(hoverDisposable, cmdDisposable);
    console.log('⚡ [DataFormat Hover] Registered DataFormat Hover Provider with Options Navigation.');
}

module.exports = {
    registerDataFormatHover
};
