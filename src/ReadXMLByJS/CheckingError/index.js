const vscode = require('vscode');
const { run_checking_error } = require('./CheckingErrorCommand');

/**
 * @param {vscode.ExtensionContext} context
 * @param {*} treeDataProvider - TreeFileProvider (có treeView, notifyGroupFilesPasted)
 */
function registerCheckingError(context, treeDataProvider) {
    const disposable = vscode.commands.registerCommand('fboFile.CheckingError', async () => {
        await run_checking_error(context, treeDataProvider);
    });
    context.subscriptions.push(disposable);
}

module.exports = { registerCheckingError };
