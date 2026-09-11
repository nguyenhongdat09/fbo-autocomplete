const vscode = require('vscode');
const CategoryHoverProvider = require('./CategoryHoverProvider');

function registerCategoryHover(context) {
    const provider = new CategoryHoverProvider();
    const hoverDisposable = vscode.languages.registerHoverProvider(
        { language: 'xml', scheme: 'file' },
        provider
    );

    const cmdDisposable = vscode.commands.registerCommand('fbo-autocomplete.goToCategory', async (args) => {
        if (!args || !args.filePath) return;
        try {
            const doc = await vscode.workspace.openTextDocument(args.filePath);
            const editor = await vscode.window.showTextDocument(doc);
            const line = Math.max(0, Math.min(doc.lineCount - 1, args.line || 0));
            const pos = new vscode.Position(line, args.character || 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        } catch (err) {
            vscode.window.showErrorMessage(`Không thể điều hướng đến category: ${err.message}`);
        }
    });

    context.subscriptions.push(hoverDisposable, cmdDisposable);
    console.log('⚡ [Category Hover] Registered Category & Tab Hover Provider with Navigation.');
}

module.exports = {
    registerCategoryHover,
    CategoryHoverProvider
};
