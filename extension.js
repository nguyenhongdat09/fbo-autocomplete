// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const CompletionProvider = require('./CompleteProvider');
const renderXMLToDB = require('./renderXMLToDB');
const OpenWithVS2008 = require('./openWithVS2008');
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('Congratulations, your extension "fbo-autocomplete" is now active!');
	const provider = new CompletionProvider();
	const autoCompleteFields = vscode.commands.registerCommand('fbo-autocomplete.applyCompletionItem', async (line, position) => {
		provider.applyCompletionItem(line, position); 
	});	

	const render = vscode.commands.registerCommand('fbo-autocomplete.renderXmlTodDB', () => {
		renderXMLToDB.render(); 
	});	

	const providerAutoComplete = vscode.languages.registerInlineCompletionItemProvider(
        { language: 'xml', scheme: 'file' }, // Áp dụng cho file XML
        {
            provideInlineCompletionItems: provider.provideCompletionItems,
			
        }
    );
	const genViewFromFields = vscode.languages.registerInlineCompletionItemProvider(
        { language: 'xml', scheme: 'file' }, // Áp dụng cho file XML
        {
            provideInlineCompletionItems: provider.genViewFromFields
        }
    );
	let openWithVS2008 = vscode.commands.registerCommand('my-fbo-toolkit.openWithVS2008', (uri) => {
		OpenWithVS2008.open(uri);
    });

 
 
	context.subscriptions.push(render);
	context.subscriptions.push(providerAutoComplete);
	context.subscriptions.push(autoCompleteFields);
	context.subscriptions.push(genViewFromFields);
	context.subscriptions.push(openWithVS2008);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
