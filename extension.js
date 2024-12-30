// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const CompletionProvider = require('./CompleteProvider');
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
	
	const applyCompletionItem = vscode.commands.registerCommand('default:applyCompletionItem',  function (line) {
		const { activeTextEditor } = vscode.window;
		const { document } = activeTextEditor;
		const edit = new vscode.WorkspaceEdit();
		var { lineNumber } = line;
		var textToReplace = line.b;
		var text = document.lineAt(lineNumber).text.replace(textToReplace, '');
		// Thay thế nội dung trong dòng bằng chuỗi rỗng new(startLine:Int, startCharacter:Int, endLine:Int, endCharacter:Int)
		edit.replace(document.uri, new vscode.Range(lineNumber, 0, lineNumber, document.lineAt(lineNumber).text.length), text);
		vscode.workspace.applyEdit(edit);
		 
		
	});
	

	const provider = vscode.languages.registerInlineCompletionItemProvider(
        { language: 'xml', scheme: 'file' }, // Áp dụng cho file XML
        {
            provideInlineCompletionItems: CompletionProvider.provideCompletionItems
        }
    );
	
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
