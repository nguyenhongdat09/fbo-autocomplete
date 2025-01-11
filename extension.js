// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const CompletionProvider = require('./CompleteProvider');
const renderXMLToDB = require('./renderXMLToDB');
const OpenWithVS2008 = require('./openWithVS2008');
const ReadXMLVS2008 = require('./ReadXMLVS2008');
const EntityHoverProvider = require("./EntityHoverProvider");
const EntityCodeLensProvider = require("./EntityCodeLensProvider");
const UpdateChecker = require('./UpdateChecker');  // Import class UpdateChecker
let codeLensDisposable = null; // Lưu trữ Disposable của CodeLensProvider
let isCodeLensEnabled = false; // Trạng thái bật/tắt CodeLens
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

	// Thêm sự kiện mở file XML
    const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument((document) => {
        if (document.languageId === 'xml' && document.uri.scheme === 'file') {
            ReadXMLVS2008.readXml(document.uri.fsPath);
        }
    });
    // Thêm sự kiện lưu file XML
    const onDidSaveTextDocument = vscode.workspace.onDidSaveTextDocument((document) => {
        if (document.languageId === 'xml' && document.uri.scheme === 'file') {
            ReadXMLVS2008.readXml(document.uri.fsPath);
        }
    });
      
    const entityHoverProvider = new EntityHoverProvider(__dirname);
    var onHoverEntity = vscode.languages.registerHoverProvider({ language: "xml", scheme: "file" }, {
        provideHover(document, position) {
            return entityHoverProvider.provideHover(document, position);
        },
    })

   
    const showEntityCodeLens = vscode.commands.registerCommand('fbo-autocomplete.showEntityCodeLens', () => {
        if (isCodeLensEnabled) {
            // Nếu đang bật, hủy CodeLensProvider
            if (codeLensDisposable) {
                codeLensDisposable.dispose();
                codeLensDisposable = null;
            }
        } else {
            // Nếu đang tắt, đăng ký lại CodeLensProvider
            codeLensDisposable = vscode.languages.registerCodeLensProvider(
                { language: "xml", scheme: "file" },
                {
                    provideCodeLenses(document, position) {
                        return EntityCodeLensProvider.provideCodeLenses(document, position);
                    },
                }
            )  
        }
        isCodeLensEnabled = !isCodeLensEnabled; // Cập nhật trạng thái
    });
    // Đăng ký lệnh Copy
    const copyEntityCommand = vscode.commands.registerCommand("fbo-autocomplete.copyEntity", (entity, document, position) => {
        var content = entityHoverProvider.findContent(entity, document.uri.fsPath); 
        vscode.env.clipboard.writeText(content).then(() => {
            vscode.window.showInformationMessage(`Copied: ${content}`);
        });
    }); 

    context.subscriptions.push(showEntityCodeLens);
    context.subscriptions.push(copyEntityCommand);
    context.subscriptions.push( onHoverEntity);
	context.subscriptions.push(render);
	context.subscriptions.push(providerAutoComplete);
	context.subscriptions.push(autoCompleteFields);
	context.subscriptions.push(genViewFromFields);
	context.subscriptions.push(openWithVS2008);
	context.subscriptions.push(onDidOpenTextDocument);
    context.subscriptions.push(onDidSaveTextDocument);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
