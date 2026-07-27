
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const pathModule = require('path');
const fs = require('fs');
const CompletionProvider = require('./CompleteCodeWithDB/CompleteProvider');
const RenderXMLToDB = require('./CompleteCodeWithDB/renderXMLToDB');
const OpenWithVS2008 = require('./VS2008/openWithVS2008');
const ReadXMLVS2008 = require('./VS2008/ReadXMLVS2008');
const ReloadEntityBySave = require('./VS2008/ReloadEntityBySave');
const EntityHoverProvider = require("./VS2008/EntityHoverProvider");
const EntityDefinitionProvider = require("./VS2008/EntityDefinitionProvider");
const CompleteCodeByHandle = require("./CompleteCodeWithDB/CompleteCodeByHandle");
const Trans = require("./Translate/Translate")
const cnv = require("./ConvertToExcel/ConvertGridToHeader")
const TranslateAuto = require("./Translate/TranslateAuto")
const CheckLegacyCode = require("./CheckLegacy/CheckLegacyCode")
const updateSettings = require("./updateSettings")
const DBStatusBarManagerCls = require("./DBQuery/dbBar");
const QueryDatabase = require("./DBQuery/QueryDatabase_old");
const ViewPanelResult = require("./DBQuery/QueryResultPanel");
const TreeFileProvider = require("./TreeFile/TreeFileProvider");
const TreeFileProviderOneLevel = require("./TreeFile/TreeFileProviderOneLevel");
const TreeFileProviderDynamic = require("./TreeFile/TreeFileProviderDynamic");
const { registerDirtyFileDecorations } = require("./TreeFile/DirtyFileDecoration");
const ContextMenuHandler = require("./TreeFile/ContextMenu");
const CheckLegacyMessage = require("./CheckLegacy/CheckLagacyMessage");
const CompleteCodeMobile = require("./CompleteCodeWithDB/Mobile/CompleteCodeMobile");
const CustomDefinition = require("./Definition/CustomDefinition");
const { toggleGrammar } = require("./HighLightSyntax/EnableGrammar.js");
const AnalystXML = require('./TreeFile/BrowserHandle/AnalystXML'); 
var Constant = require('./constant')
const showAllFileShowForm = require('./Definition/showAllFileShowForm');
const calculationProvider = require('./CalculationGridDetail/provider');
const { runCurrentSqlFileVisual } = require("./DBQuery/QueryDatabaseVisualResult");
const PeekSqlClass = require("./DBQuery/PeekSql");
const { registerFormatXml } = require("./FormatXML/registerFormatXml");
const ConvertGridToPivotExcel = require("./ConvertToExcel/ConvertGridToPivotExcel");
const SearchResultTreeView = require("./TreeFile/SearchFile/SearchResultTreeView");
const { activateGroupTextSearch } = require("./TreeFile/SearchText/GroupTextSearchBootstrap");
const { registerXmlFlatPreview } = require("./ReadXMLByJS/XmlFlatPreview");
const { registerCheckingError } = require('./ReadXMLByJS/CheckingError');
const { removeBlankRows } = require('./Utils/removeBlankRows');
const formulaHover = require('./ReadXMLByJS/FormulaHover');
const EntityWatcherEngine = require('./ReadXMLByJS/EntityWatcherEngine');
/**
 * @param {vscode.ExtensionContext} context
 */ 
async function activate(context) { 

    var constant = new Constant(context);
    const { ensureUserDatabaseRoot } = require("./extensionDatabasePaths");
    ensureUserDatabaseRoot(context);

    // Kích hoạt Engine Watcher 2 chiều cho Entity Cache
    EntityWatcherEngine.init(context);

    // ✅ Sử dụng license check mới (by key)
   // var { checkLicense } = require('./license/checklicense');
    var { checkLicense } = require('./license/checklicense_byKey');
    var license = await checkLicense(context);
    if (!license) {
        vscode.window.showErrorMessage('❌ Invalid license. Extension disabled.');
        return;
    }

    registerFormatXml(context);
    // Đăng ký Query Results view trong Panel (Ctrl+J)
    ViewPanelResult.getShared(context);
    const searchResultView = new SearchResultTreeView();
    searchResultView.run(context);

    /*Tree view — chọn provider theo fbo-autocomplete.fileTreeLayout */
    const treeLayout = String(vscode.workspace.getConfiguration('fbo-autocomplete').get('fileTreeLayout', 'nested'));
    const TreeCtor =
        treeLayout === 'oneLevel'
            ? TreeFileProviderOneLevel
            : treeLayout === 'dynamic'
                ? TreeFileProviderDynamic
                : TreeFileProvider;
    const treeDataProvider = new TreeCtor();
    if (typeof treeDataProvider.setSearchResultPublisher === "function") {
        treeDataProvider.setSearchResultPublisher((result, options) => searchResultView.publishResult(result, options));
    }
    if (typeof treeDataProvider.setSearchActiveGroupGetter === "function") {
        treeDataProvider.setSearchActiveGroupGetter(() => searchResultView.getActiveGroupRoot());
    }
    const tTree = Date.now();
    console.log(`[FBO_PERF_DEBUG] [extension] treeDataProvider.run START`);
    await treeDataProvider.run(context);
    console.log(`[FBO_PERF_DEBUG] [extension] treeDataProvider.run END took ${Date.now() - tTree}ms`);
    searchResultView.setBeforeOpenFile((uri) => {
        if (uri && uri.fsPath && typeof treeDataProvider.ensureFileInTree === "function") {
            treeDataProvider.ensureFileInTree(uri.fsPath);
        }
    });
    activateGroupTextSearch(context, treeDataProvider);
    registerDirtyFileDecorations(context);

    const runGroupQuickFilter = async (element) => {
        if (treeDataProvider && typeof treeDataProvider.runGroupFilterSearch === 'function') {
            await treeDataProvider.runGroupFilterSearch(element);
            return;
        }
        if (treeDataProvider && typeof treeDataProvider.applyGroupQuickFilter === 'function') {
            await treeDataProvider.applyGroupQuickFilter(element, 'all');
        }
    };
    context.subscriptions.push(
        vscode.commands.registerCommand('fbo-autocomplete.fboFileTreeFilter', async () => {
            await treeDataProvider.promptTreeFilter();
        }),
        vscode.commands.registerCommand('fbo-autocomplete.fboFileTreeClearFilter', async () => {
            await treeDataProvider.clearTreeFilter();
        }),
        vscode.commands.registerCommand('fbo-autocomplete.groupQuickFilter', runGroupQuickFilter)
    );
    // Enđ trê 
    const config = vscode.workspace.getConfiguration('fbo-autocomplete');
    const enableGrammar = config.get('enableGrammar', true);
    toggleGrammar(enableGrammar, context.extensionPath);

    // Theo dõi khi user thay đổi setting:
    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('fbo-autocomplete.enableGrammar')) {
            const newValue = vscode.workspace.getConfiguration('fbo-autocomplete').get('enableGrammar');
            toggleGrammar(newValue, context.extensionPath);
        }
        if (e.affectsConfiguration('fbo-autocomplete.fileTreeLayout')) {
            vscode.window.showInformationMessage(
                'FBO: Để áp dụng kiểu cây mới (oneLevel / nested / dynamic), vui lòng Reload Window.',
                'Reload Window'
            ).then((choice) => {
                if (choice === 'Reload Window') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });
        }
        if (e.affectsConfiguration('fbo-autocomplete.fileTreeDynamicMinFiles')) {
            if (typeof treeDataProvider.refresh === 'function') {
                void treeDataProvider.refresh();
            }
        }
    });
    
    const provider = new CompletionProvider();
    provider.run(context);

    const upsettings = new updateSettings();
    upsettings.updateSettingsJson.bind(upsettings)(context);

    const checkLegacyWhenSave = config.get('checkLegacyWhenSave', true);
    const completeCodeByHandle = new CompleteCodeByHandle(constant.sheetId);
    completeCodeByHandle.run(context);

    var renderdb = new RenderXMLToDB();
    renderdb.run(context);

    let openWithVS2008 = vscode.commands.registerCommand('my-fbo-toolkit.openWithVS2008', (uri) => {
        OpenWithVS2008.open(uri);
    });

    let removeBlankRowsCmd = vscode.commands.registerCommand('fbo-autocomplete.removeBlankRows', removeBlankRows);
 
    // Mở file XML: Không gọi parse XML trước nữa, để tiết kiệm thời gian mở file. Parse sẽ chạy lazy khi hover hoặc check legacy.
    // const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument((document) => {
    //     ReadXMLVS2008.readXmlIfOpenFboDocument(document, context);
    // });
    // for (const doc of vscode.workspace.textDocuments) {
    //     ReadXMLVS2008.readXmlIfOpenFboDocument(doc, context);
    // }
    const reloadEntityBySave = new ReloadEntityBySave(context);

    // UTF-8 BOM bytes để ghi xuống đĩa (không chèn vào nội dung editor → tránh hiển thị dấu ?)
    const UTF8_BOM = Buffer.from([0xEF, 0xBB, 0xBF]);

    

    const entityHoverProvider = new EntityHoverProvider(__dirname, context);
    reloadEntityBySave.setOnReloaded((filePath) => {
        entityHoverProvider.invalidateFileCache(filePath);
    });
    entityHoverProvider.setReloadEntityBySave(reloadEntityBySave);


    var onHoverEntity = vscode.languages.registerHoverProvider({ language: "xml", scheme: "file" }, {
        provideHover(document, position) {
            return entityHoverProvider.provideHover.bind(entityHoverProvider)(document, position);
        },
    });
    const peekSql = new PeekSqlClass();
    const peekSqlHover = vscode.languages.registerHoverProvider(
        [{ language: "xml", scheme: "file" }, { language: "sql", scheme: "file" }],
        {
            provideHover(document, position) {
                return peekSql.provideHover(document, position);
            },
        }
    );

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
        const documentUri = vscode.window.activeTextEditor.document.uri;
        const currentFileName = pathModule.basename(documentUri.fsPath, pathModule.extname(documentUri.fsPath));
        const defaultUri = vscode.Uri.joinPath(documentUri, '..', `${currentFileName}.xlsx`);

        // Copy template folder path to clipboard
        const controllersFolder = pathModule.dirname(pathModule.dirname(documentUri.fsPath));
        const targetFolder = pathModule.join(controllersFolder, 'Templates', 'Excel');
        await vscode.env.clipboard.writeText(targetFolder);
        vscode.window.showInformationMessage(`Đã copy đường dẫn Templates\\Excel vào clipboard để bạn dễ dàng Paste.`);

        // Hiển thị hộp thoại chọn đường dẫn lưu file
        const options = {
            title: "Chọn vị trí lưu Excel",
            filters: { 'Excel Files': ['xlsx'] },
            defaultUri: defaultUri
        };

        const fileUri = await vscode.window.showSaveDialog(options);

        if (!fileUri) {
            vscode.window.showWarningMessage("Hủy xuất file Excel.");
            return;
        }
        // Gọi hàm export với đường dẫn đã chọn
        cvtToEx.exportToExcel.bind(cvtToEx)(path, fileUri.fsPath);
    });

    const pivotExcelConverter = new ConvertGridToPivotExcel();
    const convertGridToPivotExcelCmd = vscode.commands.registerCommand(
        "fbo-autocomplete.ConvertGridToPivotExcel",
        async () => {
            try {
                await pivotExcelConverter.run();
            } catch (err) {
                console.error("[FBO ConvertGridToPivotExcel] Error:", err);
            }
        }
    );

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

    let chkTimer = null;
    const runCheckForEditor = (editor) => {
        if (!editor) return;
        const filePath = editor.document.uri.fsPath.replace(/\\/g, '/').toLowerCase();
        const isCorrectLang = (editor.document.languageId || "").toLowerCase() === "xml";
        const isInCorrectDir = filePath.includes('/controllers/dir/') || filePath.includes('/controllers/filter/');
        
        if (isCorrectLang && isInCorrectDir) {
            if (chkTimer) {
                clearTimeout(chkTimer);
            }
            chkTimer = setTimeout(() => {
                chk.run.bind(chk)();
                chkTimer = null;
            }, 300); // Debounce 300ms khi chuyển editor hoặc mở file
        }
    };

    // 1. Quét lỗi khi chuyển tab hoặc mở file mới đã bị tắt theo yêu cầu user (để tăng tốc độ mở file)
    // const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
    //     runCheckForEditor(editor);
    // });
    // context.subscriptions.push(onDidChangeActiveEditor);

    // 2. Không quét ngay khi khởi động extension nữa
    // runCheckForEditor(vscode.window.activeTextEditor);

    // 3. Quét lỗi khi nhấn lưu bất kỳ file nào trong thư mục controllers/ (cho phép cập nhật khi sửa file DTD phụ)
    if (checkLegacyWhenSave) {
        vscode.workspace.onDidSaveTextDocument((document) => {
            const filePath = document.uri.fsPath.replace(/\\/g, '/').toLowerCase();
            if (filePath.includes('/controllers/')) {
                runCheckForEditor(vscode.window.activeTextEditor);
            }
        });
    }

    // Command chạy SQL từ file .sql hoặc .xml (selection hoặc toàn file), DB từ status bar
    const runSqlFileCmd = vscode.commands.registerCommand(
        "fbo-autocomplete.runSqlFile",
        async () => {
            const editorBeforeRun = vscode.window.activeTextEditor;
            const selectionBeforeRun = editorBeforeRun ? editorBeforeRun.selection : null;
            const selectionsBeforeRun = editorBeforeRun ? editorBeforeRun.selections : null;
            const viewColumnBeforeRun = editorBeforeRun ? editorBeforeRun.viewColumn : undefined;
            try {
                await runCurrentSqlFileVisual(context);
                if (editorBeforeRun && !editorBeforeRun.document.isClosed) {
                    const reopened = await vscode.window.showTextDocument(editorBeforeRun.document, {
                        viewColumn: viewColumnBeforeRun,
                        preserveFocus: false,
                        preview: false,
                        selection: selectionBeforeRun || undefined,
                    });
                    if (selectionsBeforeRun && selectionsBeforeRun.length > 1) {
                        reopened.selections = selectionsBeforeRun;
                    }
                }
            } catch (err) {
                console.error("[FBO runSqlFile] Error:", err);
                console.error("[FBO runSqlFile] Stack:", err && err.stack);
                vscode.window.showErrorMessage("Run SQL File: " + (err && err.message));
            }
        }
    );
    context.subscriptions.push(runSqlFileCmd);

    const peekSqlCmd = vscode.commands.registerCommand("fbo-autocomplete.peekSql", async () => {
        try {
            await peekSql.runPeekSql();
        } catch (err) {
            console.error("[FBO peekSql] Error:", err);
            vscode.window.showErrorMessage("Peek SQL: " + (err && err.message));
        }
    });
    const peekSqlCopyCmd = vscode.commands.registerCommand("fbo-autocomplete.peekSqlCopyContent", () => peekSql.copyContentToClipboard());
    const entityHoverCopyCmd = vscode.commands.registerCommand("fbo-autocomplete.entityHoverCopyContent", () => entityHoverProvider.copyContentToClipboard());
    const entityHoverCopyFlatCmd = vscode.commands.registerCommand("fbo-autocomplete.entityHoverCopyFlatContent", () => entityHoverProvider.copyFlatContentToClipboard());
    const entityHoverReloadCmd = vscode.commands.registerCommand("fbo-autocomplete.entityHoverReload", () => entityHoverProvider.reloadEntityForLastHover());
    const toggleHoverModeCmd = vscode.commands.registerCommand("fbo-autocomplete.toggleHoverMode", () => entityHoverProvider.toggleHoverMode());

    const entityDefinitionProvider = new EntityDefinitionProvider(context.extensionPath);

    // Đăng ký làm Definition Provider để hỗ trợ Ctrl + Click và F12 nhảy trực tiếp tới tệp tin/dòng khai báo thực thể XML
    const entityDefinitionRegister = vscode.languages.registerDefinitionProvider(
        { language: "xml", scheme: "file" },
        {
            provideDefinition(document, position) {
                return entityDefinitionProvider.resolveLocation(document, position);
            }
        }
    );
    context.subscriptions.push(entityDefinitionRegister);


    const contextMenu = new ContextMenuHandler(context, treeDataProvider);
    const cmpl_mobile = new CompleteCodeMobile();
    cmpl_mobile.run(context);

    const defi = new CustomDefinition();
    defi.run(context);
    var shaf = vscode.commands.registerCommand('fbo-autocomplete.showAllFileShowForm', showAllFileShowForm);
    context.subscriptions.push(peekSqlCmd);
    context.subscriptions.push(peekSqlCopyCmd);
    context.subscriptions.push(entityHoverCopyCmd);
    context.subscriptions.push(entityHoverCopyFlatCmd);
    context.subscriptions.push(entityHoverReloadCmd);
    context.subscriptions.push(toggleHoverModeCmd);
    context.subscriptions.push(peekSqlHover); 
    context.subscriptions.push(shaf);
    context.subscriptions.push(CheckLegacy);
    context.subscriptions.push(cvtExcel);
    context.subscriptions.push(convertGridToPivotExcelCmd);
    context.subscriptions.push(transautoWithKey);
    context.subscriptions.push(transautoComplete);
    context.subscriptions.push(AddFieldToReport);
    context.subscriptions.push(translatePaste);
    context.subscriptions.push(transAll);
    context.subscriptions.push(copyEntityCommand);
    context.subscriptions.push(onHoverEntity);
    context.subscriptions.push(openWithVS2008);
    context.subscriptions.push(removeBlankRowsCmd);
    // context.subscriptions.push(onDidOpenTextDocument);
    context.subscriptions.push(reloadEntityBySave);
    calculationProvider.register(context); 
    /*
     var viewpanelsql = new ViewPanelResult(context)
     var disposable = vscode.commands.registerCommand('fbo-autocomplete.showQueryResult', function () {
         viewpanelsql.show();
       });
     
       context.subscriptions.push(disposable);
    */
    registerXmlFlatPreview(context);
    registerCheckingError(context, treeDataProvider);
    formulaHover.register(context);
    var anl = new AnalystXML();
    anl.run(context);
}

// This method is called when your extension is deactivated
function deactivate() {
    console.log('🛑 Extension deactivated');
}

module.exports = {
    activate,
    deactivate
}