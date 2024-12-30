// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

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
	
	const provider = vscode.languages.registerCompletionItemProvider(
		{language: 'xml', scheme: 'file'},
		{
			provideCompletionItems(document, position, token, context){
				const completionItems = [];
				const item = new vscode.CompletionItem("$f.ma_kh", vscode.CompletionItemKind.Snippet);
				item.insertText = new vscode.SnippetString(`<field name="ma_kh" clientDefault="Default">
					<header v="Mã khách hàng" e="Customer ID"></header>
					<items style="AutoComplete" controller="Customer" reference="ten_kh%l" key="status = '1' and (kh_yn = 1 or nv_yn = 1)" check="kh_yn = 1 or nv_yn = 1" information="ma_kh$dmkh.ten_kh%l" new="Default" row="1"/>
				</field>
				<field name="ten_kh%l" readOnly="true" external="true" clientDefault="Default" defaultValue="''">
					<header v="" e=""></header>
				</field>`);
				item.documentation = new vscode.MarkdownString("Autocomplete cho `ma_kh`.");
				completionItems.push(item);
				return completionItems; 
			}


		}, 
		'$'// Ký tự kích hoạt autocomplete
	)
	context.subscriptions.push(provider);
	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
