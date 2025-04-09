// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const pathModule = require('path');
const fs = require('fs');
const CompletionProvider = require('./CompleteCodeWithDB/CompleteProvider');
const renderXMLToDB = require('./CompleteCodeWithDB/renderXMLToDB');
const OpenWithVS2008 = require('./VS2008/openWithVS2008');
const ReadXMLVS2008 = require('./VS2008/ReadXMLVS2008');
const EntityHoverProvider = require("./VS2008/EntityHoverProvider");
const EntityCodeLensProvider = require("./VS2008/EntityCodeLensProvider");
const CompleteCodeByHandle = require("./CompleteCodeWithDB/CompleteCodeByHandle");
const Trans = require("./Translate/Translate")
const cnv = require("./ConvertToExcel/ConvertGridToHeader")
const TranslateAuto = require("./Translate/TranslateAuto")
const CheckLegacyCode = require("./CheckLegacy/CheckLegacyCode")
const updateSettings = require("./updateSettings")
const DBStatusBarManagerCls = require("./DBQuery/dbBar");
const QueryDatabase = require("./DBQuery/QueryDatabase");
const TreeFileProvider = require("./TreeFile/TreeFileProvider");
const ContextMenuHandler = require("./TreeFile/ContextMenu");
const CheckLegacyMessage = require("./CheckLegacy/CheckLagacyMessage");
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
    const upsettings = new updateSettings();
    upsettings.updateSettingsJson.bind(upsettings)(context);
    const config = vscode.workspace.getConfiguration('fbo-autocomplete');
    const checkLegacyWhenSave = config.get('checkLegacyWhenSave', false);
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
            ReadXMLVS2008.readXml(document.uri.fsPath, context);
        }
    });
    // Thêm sự kiện lưu file XML
    const onDidSaveTextDocument = vscode.workspace.onDidSaveTextDocument((document) => {
        if (document.languageId === 'xml' && document.uri.scheme === 'file') {
            ReadXMLVS2008.readXml(document.uri.fsPath, context);
        }
    });

    const entityHoverProvider = new EntityHoverProvider(__dirname, context);
    var onHoverEntity = vscode.languages.registerHoverProvider({ language: "xml", scheme: "file" }, {
        provideHover(document, position) {
            return entityHoverProvider.provideHover.bind(entityHoverProvider)(document, position);
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
        var content = entityHoverProvider.findContent.bind(entityHoverProvider)(entity, document.uri.fsPath);
        content = entityHoverProvider.formatXml(content)
        content = content.replace(/<(\w+)([^>]*)>\s*<\/\1>/g, '<$1$2></$1>');
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
                const selection = editor.selection;
                const translatedText = await trans.trans_to_en.bind(trans)(text)
                // Ghi lại văn bản đã dịch vào clipboard
                await vscode.env.clipboard.writeText(translatedText);

                // Đảm bảo gọi lệnh paste khi có editor mở và sẵn sàng
                editor.edit(editBuilder => {
                    if (!selection.isEmpty) {
                        // Nếu có vùng chọn, thay thế nội dung vùng chọn
                        editBuilder.replace(selection, translatedText);
                    } else {
                        // Nếu không có vùng chọn, chèn tại vị trí con trỏ
                        editBuilder.insert(selection.active, translatedText);
                    }
                });
            });
            // Dịch nội dung qua Google Translate API 
        }
    });
    const cvtToEx = new cnv()
    let AddFieldToReport = vscode.commands.registerCommand('fbo-autocomplete.AddFieldToReport', function () {
        var path = vscode.window.activeTextEditor.document.uri.fsPath;

        const folderPath = pathModule.dirname(path);
        const folderName = pathModule.basename(folderPath);
        if (folderName != 'Grid') {
            vscode.window.showErrorMessage(`Only Work On Grid File`);
            return
        }
        const reportPath = path.replace('\\Grid\\', '\\Report\\')

        if (fs.existsSync(reportPath)) {
            const xmlReport = cvtToEx.CvtToFieldReport.bind(cvtToEx)(path)

            const ReportXml = cvtToEx.addFieldToReport(xmlReport[0], reportPath)

            if (ReportXml != '') {
                fs.writeFileSync(reportPath, ReportXml, 'utf8');
                vscode.window.showInformationMessage('Report updated successfully!');
            }
        } else {
            vscode.window.showErrorMessage(`${reportPath} does not exist!`);
        }
    });

    let cvtExcel = vscode.commands.registerCommand('fbo-autocomplete.ConvertToExcel', async function () {
        var path = vscode.window.activeTextEditor.document.uri.fsPath;
        const folderPath = pathModule.dirname(path);
        const folderName = pathModule.basename(folderPath);
        if (folderName !== 'Grid') {
            vscode.window.showErrorMessage(`This Feature is only Work On Grid File`);
            return;
        }
        // Hiển thị hộp thoại chọn đường dẫn lưu file
        const options = {
            title: "Chọn vị trí lưu Excel",
            filters: { 'Excel Files': ['xlsx'] },
            defaultUri: vscode.Uri.file('output.xlsx')
        };

        const fileUri = await vscode.window.showSaveDialog(options);

        if (!fileUri) {
            vscode.window.showWarningMessage("Hủy xuất file Excel.");
            return;
        }
        // Gọi hàm export với đường dẫn đã chọn
        cvtToEx.exportToExcel.bind(cvtToEx)(path, fileUri.fsPath);
    });

    const translateAuto = new TranslateAuto(trans);
    let transautoComplete = translateAuto.activate();

    let transautoWithKey = vscode.commands.registerCommand('fbo-autocomplete.translateAuto', async function () {
        // Đọc nội dung bạn vừa copy vào clipboard
        const text = await vscode.env.clipboard.readText();
        const editor = vscode.window.activeTextEditor;
        // Kiểm tra xem có editor đang mở không
        if (!editor) {
            vscode.window.showInformationMessage('Không có editor đang mở!');
            return;
        }
        if (text) {
            translateAuto.transWithKeyBoards()
        }
    });
    const chk = new CheckLegacyCode(__dirname);
    let CheckLegacy = vscode.commands.registerCommand('fbo-autocomplete.CheckLegacyDirFilter', async () => {
        chk.run.bind(chk)()
    });
    
    const chkMessage = new CheckLegacyMessage();
    chkMessage.run(context);

    if (checkLegacyWhenSave) {
        vscode.workspace.onDidSaveTextDocument((document) => {
            chk.run.bind(chk)()
        });
    }
/*
    //Database dbBar
    const dbstatus = new DBStatusBarManagerCls(context);
    dbstatus.show()
    const queryDb = new QueryDatabase(context, dbstatus);
    */
    //
    /*Tree view*/
    const treeDataProvider = new TreeFileProvider();
    treeDataProvider.run(context);
    const contextMenu = new ContextMenuHandler(context, treeDataProvider.treeView)


    context.subscriptions.push(CheckLegacy);
    context.subscriptions.push(cvtExcel);
    context.subscriptions.push(transautoWithKey);
    context.subscriptions.push(transautoComplete);
    context.subscriptions.push(AddFieldToReport);
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
function deactivate() {
}

module.exports = {
    activate,
    deactivate
}
