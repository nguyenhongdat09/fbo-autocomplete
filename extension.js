// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const CompletionProvider = require('./CompleteProvider');
const renderXMLToDB = require('./renderXMLToDB');
const OpenWithVS2008 = require('./openWithVS2008');
const ReadXMLVS2008 = require('./ReadXMLVS2008');
const EntityHoverProvider = require("./EntityHoverProvider");
const EntityCodeLensProvider = require("./EntityCodeLensProvider");
const CompleteCodeByHandle = require("./CompleteCodeByHandle");
const Trans = require("./Translate/Translate")

let codeLensDisposable = null; // Lưu trữ Disposable của CodeLensProvider
let isCodeLensEnabled = false; // Trạng thái bật/tắt CodeLens
/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
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
            provideInlineCompletionItems: provider.provideCompletionItems.bind(provider),
        }
    );
    const genViewFromFields = vscode.languages.registerInlineCompletionItemProvider(
        { language: 'xml', scheme: 'file' }, // Áp dụng cho file XML
        {
            provideInlineCompletionItems: provider.genViewFromFields.bind(provider),
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
    const copyEntityCommand = vscode.commands.registerCommand("fbo-autocomplete.copyEntity", (entity, document) => {
        var content = entityHoverProvider.findContent(entity, document.uri.fsPath);
        vscode.env.clipboard.writeText(content).then(() => {
            vscode.window.showInformationMessage(`Copied: ${content}`);
        });
    });

    //const sheetId = '1ibZ3A0alAuin1q9EvSWlrMwQR_utBYl7bguDd55co0U'; // ID Google Sheet
    const sheetId = '1QQmIxycaz67WIWGqP8sYYegVuqJwQF9wnebgXg5TNyA'; // ID Google Sheet
    const completeCodeByHandle = new CompleteCodeByHandle(sheetId);

    const getDataGGS = vscode.commands.registerCommand('fbo-autocomplete.getDataAutocomplete', async () => {
        await completeCodeByHandle.loadFunctions();
    })
    completeCodeByHandle.loadFromJson(); // Load từ JSON khi extension khởi động
    const providerHandle = vscode.languages.registerCompletionItemProvider(
        { language: 'xml' }, // Áp dụng cho file XML
        {
            provideCompletionItems: completeCodeByHandle.provideCompletionItems.bind(completeCodeByHandle),
        },
        '.' // Các ký tự kích hoạt autocomplete
    );
    const providerTwpDotHandle = vscode.languages.registerCompletionItemProvider(
        { language: 'xml' }, // Áp dụng cho file XML
        {
            provideCompletionItems: completeCodeByHandle.provideCompletionTwoDotItems.bind(completeCodeByHandle),
        },
        '.' // Các ký tự kích hoạt autocomplete
    );
    //Complete cho $f, $gi, $gv
    const providerHandleField = vscode.languages.registerCompletionItemProvider(
        { language: 'xml' }, // Áp dụng cho file XML
        {
            provideCompletionItems: completeCodeByHandle.provideCompletionFieldItems.bind(completeCodeByHandle),
        },
        '.' // Các ký tự kích hoạt autocomplete
    );
    //Translate
    const trans = new Trans()
    let transAll = vscode.commands.registerCommand('fbo-autocomplete.ApplyTranslateFBO', async (uri) => {
        await trans.translateXmlFile.bind(trans)()
    });
    const provideroptionsHandle = vscode.languages.registerCompletionItemProvider(
        { language: 'xml' }, // Áp dụng cho file XML
        {
            provideCompletionItems: completeCodeByHandle.provideOptionsCompletionItems.bind(completeCodeByHandle),
        },
        '@' // Ký tự kích hoạt autocomplete
    );


    let translatePaste = vscode.commands.registerCommand('fbo-autocomplete.translatePaste', async function () {
        // Đọc nội dung bạn vừa copy vào clipboard
        const text = await vscode.env.clipboard.readText();
        const editor = vscode.window.activeTextEditor;

        // Kiểm tra xem có editor đang mở không
        if (!editor) {
            vscode.window.showInformationMessage('Không có editor đang mở!');
            return;
        }
        if (text) {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Translating`,
                cancellable: false
            }, async (progress, token) => {
                const translatedText = await trans.trans_to_vi.bind(trans)(text)
                // Ghi lại văn bản đã dịch vào clipboard
                await vscode.env.clipboard.writeText(translatedText);

                // Đảm bảo gọi lệnh paste khi có editor mở và sẵn sàng
                editor.edit(editBuilder => {
                    editBuilder.insert(editor.selection.active, translatedText);
                });
            });
            // Dịch nội dung qua Google Translate API 

        }
    });

    context.subscriptions.push(translatePaste);
    context.subscriptions.push(provideroptionsHandle);
    context.subscriptions.push(transAll);
    context.subscriptions.push(getDataGGS);
    context.subscriptions.push(providerTwpDotHandle);
    context.subscriptions.push(providerHandle);
    context.subscriptions.push(providerHandleField);
    context.subscriptions.push(showEntityCodeLens);
    context.subscriptions.push(copyEntityCommand);
    context.subscriptions.push(onHoverEntity);
    context.subscriptions.push(render);
    context.subscriptions.push(providerAutoComplete);
    context.subscriptions.push(autoCompleteFields);
    context.subscriptions.push(genViewFromFields);
    context.subscriptions.push(openWithVS2008);
    context.subscriptions.push(onDidOpenTextDocument);
    context.subscriptions.push(onDidSaveTextDocument);
}

// This method is called when your extension is deactivated
function deactivate() { }

module.exports = {
    activate,
    deactivate
}
