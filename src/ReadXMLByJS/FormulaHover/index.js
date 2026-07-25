const vscode = require('vscode');
const FormulaHoverProvider = require('./FormulaHoverProvider');

function register(context) {
    const provider = new FormulaHoverProvider();
    const hoverRegistration = vscode.languages.registerHoverProvider(
        { language: 'xml', scheme: 'file' },
        provider
    );
    context.subscriptions.push(hoverRegistration);
}

module.exports = {
    register
};
