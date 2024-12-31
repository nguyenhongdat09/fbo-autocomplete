// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const CompletionProvider = require('./CompleteProvider');
const renderXMLToDB = require('./renderXMLToDB');
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('Congratulations, your extension "fbo-autocomplete" is now active!');
	const disposable = vscode.commands.registerCommand('fbo-autocomplete.helloWorld', function () {
		vscode.window.showInformationMessage('Hello World from fbo-autocomplete!');
	}); 
	
	const applyCompletionItem = vscode.commands.registerCommand('fbo-autocomplete.applyCompletionItem', async (line) => {
		CompletionProvider.applyCompletionItem(line); 
	});	
	const render = vscode.commands.registerCommand('fbo-autocomplete.renderXmlTodDB', () => {
		renderXMLToDB.render(); 
	});	

	const provider = vscode.languages.registerInlineCompletionItemProvider(
        { language: 'xml', scheme: 'file' }, // Áp dụng cho file XML
        {
            provideInlineCompletionItems: CompletionProvider.provideCompletionItems
        }
    );
	context.subscriptions.push(render);
	context.subscriptions.push(provider);
	context.subscriptions.push(applyCompletionItem);
	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
