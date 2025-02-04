// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const pathModule = require('path');
const fs = require('fs');
const CompletionProvider = require('./CompleteProvider');
const renderXMLToDB = require('./renderXMLToDB');
const OpenWithVS2008 = require('./openWithVS2008');
const ReadXMLVS2008 = require('./ReadXMLVS2008');
const EntityHoverProvider = require("./EntityHoverProvider");
const EntityCodeLensProvider = require("./EntityCodeLensProvider");
const CompleteCodeByHandle = require("./CompleteCodeByHandle");
const Trans = require("./Translate/Translate")
const cnv = require("./ConvertToExcel/ConvertGridToHeader")
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
    let timeout = null;
    let isEditing = false; // Chặn vòng lặp vô tận
    let arr_line = []
    let overwriteE = vscode.workspace.onDidChangeTextDocument(async (event) => {
        if (isEditing) return; // Đang chỉnh sửa → bỏ qua

        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const document = event.document;
        const position = editor.selection.active;
        const lineText = document.lineAt(position.line).text;
    
        // Regex tìm `v="..."` trên dòng hiện tại
        const regex = /v="([^"]*)"/g;
        let match;
        let insideV = false;
        
        while ((match = regex.exec(lineText)) !== null) {
            let start = match.index + 3; // Vị trí sau `v="`
            let end = start + match[1].length; // Kết thúc trước dấu `"`
    
            if (position.character >= start && position.character <= end) {
                insideV = true;
                break;
            }
        }
        if (!insideV) return; // Con trỏ không nằm trong `v=""`, bỏ qua

        if (!arr_line.includes(position.line)) {
            arr_line.push(position.line);
        }
        clearTimeout(timeout); 
        timeout = setTimeout(async () => {
            while (arr_line.length > 0) {
                const position_line = arr_line.shift();
                const line = document.lineAt(position_line);
                const regex = /(<\w+\s+v="([^"]*)"\s+e=")([^"]*)(")/;
                const match = regex.exec(line.text);
                if (match) {
                    let vietnameseText = match[2]; 
                    if (arr_line.includes(position_line))
                        return
                    // 🔹 Chỉ dịch khi `v=""` thay đổi
                    if ( vietnameseText.trim() !== "") {
                        vscode.window.withProgress({
                            location: vscode.ProgressLocation.Notification,
                            title: `Translating`,
                            cancellable: false
                        }, async (progress, token) => {
                            let translatedText = await trans.trans_to_en(vietnameseText);
                            if (translatedText) {
                                // 🔹 Thay đúng phần `e="..."`, không thay cả dòng
                                let newLine = line.text.replace(/e="([^"]*)"/, `e="${translatedText}"`);
                                if (newLine !== line.text) { // Kiểm tra tránh thay thế dư thừa
                                    isEditing = true;
                                    editor.edit(editBuilder => {
                                        let startPos = new vscode.Position(position_line, 0);
                                        let endPos = document.lineAt(position_line).range.end; // Lấy vị trí cuối dòng
                                        editBuilder.replace(new vscode.Range(startPos, endPos), newLine);
                                    }).then(() => {
                                        isEditing = false;
                                    });
                                }
                            }
                        });
                    }
                }
            }
        }, 1000); // Đợi 1 giây sau khi người dùng ngừng nhập
    });


    const cvtToEx = new cnv()
    let convertToExcel = vscode.commands.registerCommand('fbo-autocomplete.ConvertToExcel', function () {
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
            const ReportXml = cvtToEx.addFieldToReport(xmlReport, reportPath)
            if (ReportXml != '') {
                fs.writeFileSync(reportPath, ReportXml, 'utf8');
                vscode.window.showInformationMessage('Report updated successfully!');
            }
        } else {
            vscode.window.showErrorMessage(`${reportPath} does not exist!`);
        }
    });

    context.subscriptions.push(overwriteE);
    context.subscriptions.push(convertToExcel);
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
