
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const pathModule = require('path');
const fs = require('fs');
const CompletionProvider = require('./CompleteCodeWithDB/CompleteProvider');
const RenderXMLToDB = require('./CompleteCodeWithDB/renderXMLToDB');
const OpenWithVS2008 = require('./VS2008/openWithVS2008');
const OpenWithVSCode = require('./VS2008/openWithVSCode');
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
const ViewPanelResult = require("./DBQuery/QueryResultPanel");
const TreeFileProvider = require("./TreeFile/TreeFileProvider");
const ContextMenuHandler = require("./TreeFile/ContextMenu");
const CheckLegacyMessage = require("./CheckLegacy/CheckLagacyMessage");
const CompleteCodeMobile = require("./CompleteCodeWithDB/Mobile/CompleteCodeMobile");
const CustomDefinition = require("./Definition/CustomDefinition");
const { toggleGrammar } = require("./HighLightSyntax/EnableGrammar.js");
const AnalystXML = require('./TreeFile/BrowserHandle/AnalystXML'); 
var Constant = require('./constant')
const showAllFileShowForm = require('./Definition/showAllFileShowForm');
const calculationProvider = require('./CalculationGridDetail/provider');
let codeLensDisposable = null; // Lưu trữ Disposable của CodeLensProvider
let isCodeLensEnabled = false; // Trạng thái bật/tắt CodeLens
/**
 * @param {vscode.ExtensionContext} context
 */ 
async function activate(context) {
    
    var anl = new AnalystXML();
    anl.run(context);

    var constant = new Constant(context);
    // ✅ Sử dụng license check mới (by key)
    var { checkLicense } = require('./license/checklicense_byKey');
    var license = await checkLicense();
    if (!license) {
        vscode.window.showErrorMessage('❌ Invalid license. Extension disabled.');
        return;
    }
    const config = vscode.workspace.getConfiguration('fbo-autocomplete');
    const enableGrammar = config.get('enableGrammar', true);
    toggleGrammar(enableGrammar, context.extensionPath);

    // Theo dõi khi user thay đổi setting:
    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('fbo-autocomplete.enableGrammar')) {
            const newValue = vscode.workspace.getConfiguration('fbo-autocomplete').get('enableGrammar');
            toggleGrammar(newValue, context.extensionPath);
        }
    });
    
    const provider = new CompletionProvider();
    provider.run(context);

    const upsettings = new updateSettings();
    upsettings.updateSettingsJson.bind(upsettings)(context);

    const checkLegacyWhenSave = config.get('checkLegacyWhenSave', false);
    const completeCodeByHandle = new CompleteCodeByHandle(constant.sheetId);
    completeCodeByHandle.run(context);

    var renderdb = new RenderXMLToDB();
    renderdb.run(context);

    let openWithVS2008 = vscode.commands.registerCommand('my-fbo-toolkit.openWithVS2008', (uri) => {
        OpenWithVS2008.open(uri);
    });
    let openWithVSCode = vscode.commands.registerCommand('fbo-autocomplete.OpenWithVSCode', (uri) => {
        OpenWithVSCode.open(uri);
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
    });

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
            );
        }
        isCodeLensEnabled = !isCodeLensEnabled; // Cập nhật trạng thái
    });

    // Đăng ký lệnh Copy
    const copyEntityCommand = vscode.commands.registerCommand("fbo-autocomplete.copyEntity", (entity, document) => {
        var content = entityHoverProvider.findContent.bind(entityHoverProvider)(entity, document.uri.fsPath);
        content = entityHoverProvider.formatXml(content);
        content = content.replace(/<(\w+)([^>]*)>\s*<\/\1>/g, '<$1$2></$1>');
        vscode.env.clipboard.writeText(content).then(() => {
            vscode.window.showInformationMessage(`Copied: ${content}`);
        });
    });

    //Translate
    const trans = new Trans();
    let transAll = vscode.commands.registerCommand('fbo-autocomplete.ApplyTranslateFBO', async (uri) => {
        await trans.translateXmlFile.bind(trans)();
    });

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
                const translatedText = await trans.trans_to_en.bind(trans)(text);
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

    const cvtToEx = new cnv();
    let AddFieldToReport = vscode.commands.registerCommand('fbo-autocomplete.AddFieldToReport', function () {
        var path = vscode.window.activeTextEditor.document.uri.fsPath;

        const folderPath = pathModule.dirname(path);
        const folderName = pathModule.basename(folderPath);
        if (folderName != 'Grid') {
            vscode.window.showErrorMessage(`Only Work On Grid File`);
            return;
        }
        const reportPath = path.replace('\\Grid\\', '\\Report\\');

        if (fs.existsSync(reportPath)) {
            const xmlReport = cvtToEx.CvtToFieldReport.bind(cvtToEx)(path);

            const ReportXml = cvtToEx.addFieldToReport(xmlReport[0], reportPath);

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
            translateAuto.transWithKeyBoards();
        }
    });

    const chk = new CheckLegacyCode(context);

    let CheckLegacy = vscode.commands.registerCommand('fbo-autocomplete.CheckLegacyDirFilter', async () => {
        chk.run.bind(chk)();
    });

    const chkMessage = new CheckLegacyMessage();
    chkMessage.run(context);

    if (checkLegacyWhenSave) {
        vscode.workspace.onDidSaveTextDocument((document) => {
            chk.run.bind(chk)();
        });
    }

    /*
    console.time('💾 Database dbBar');
    //Database dbBar
    const dbstatus = new DBStatusBarManagerCls(context);
    dbstatus.show()
    const queryDb = new QueryDatabase(context, dbstatus);
    console.timeEnd('💾 Database dbBar');
    */
   /*
    const dbStatusBar = new DBStatusBarManagerCls(context);
    dbStatusBar.show();
    const queryDb = new QueryDatabase(context, dbStatusBar);
*/
    //
    /*Tree view*/
    const treeDataProvider = new TreeFileProvider();
    treeDataProvider.run(context);

    const contextMenu = new ContextMenuHandler(context, treeDataProvider);
    const cmpl_mobile = new CompleteCodeMobile();
    cmpl_mobile.run(context);

    const defi = new CustomDefinition();
    defi.run(context);
    var shaf = vscode.commands.registerCommand('fbo-autocomplete.showAllFileShowForm', showAllFileShowForm);
 
    context.subscriptions.push(shaf);
    context.subscriptions.push(CheckLegacy);
    context.subscriptions.push(cvtExcel);
    context.subscriptions.push(transautoWithKey);
    context.subscriptions.push(transautoComplete);
    context.subscriptions.push(AddFieldToReport);
    context.subscriptions.push(translatePaste);
    context.subscriptions.push(transAll);
    context.subscriptions.push(showEntityCodeLens);
    context.subscriptions.push(copyEntityCommand);
    context.subscriptions.push(onHoverEntity);
    context.subscriptions.push(openWithVS2008);
    context.subscriptions.push(openWithVSCode);
    context.subscriptions.push(onDidOpenTextDocument);
    context.subscriptions.push(onDidSaveTextDocument);
    calculationProvider.register(context); 
    /*
     var viewpanelsql = new ViewPanelResult(context)
     var disposable = vscode.commands.registerCommand('fbo-autocomplete.showQueryResult', function () {
         viewpanelsql.show();
       });
     
       context.subscriptions.push(disposable);
    */
}

// This method is called when your extension is deactivated
function deactivate() {
    console.log('🛑 Extension deactivated');
}

module.exports = {
    activate,
    deactivate
}