const vscode = require('vscode');
const level = require('level-rocksdb');
const path = require('path');
const ana = require('./AnalystXMLFile');

class CompletionProvider {
    constructor() {

    }
    run(context) {
        const providerAutoComplete = vscode.languages.registerInlineCompletionItemProvider(
            { language: 'xml', scheme: 'file' }, // Áp dụng cho file XML
            {
                provideInlineCompletionItems: this.provideCompletionItems.bind(this),
            }
        );
        const genViewFromFields = vscode.languages.registerInlineCompletionItemProvider(
            { language: 'xml', scheme: 'file' }, // Áp dụng cho file XML
            {
                provideInlineCompletionItems: this.genViewFromFields.bind(this),
            }
        );
        const autoCompleteFields = vscode.commands.registerCommand('fbo-autocomplete.applyCompletionItem', async (line, position) => {
            this.applyCompletionItem(line, position);
        });
        context.subscriptions.push(autoCompleteFields, providerAutoComplete, genViewFromFields);
    }

    async provideCompletionItems(document, position) {
        const line = document.lineAt(position);
        const textBeforeCursor = line.text.substring(0, position.character).trim(); // Văn bản trước con trỏ
        const completionItems = [];
        const folderName = this.getFolderName(textBeforeCursor, document);
        if (folderName == '') {
            return completionItems;
        }
        try {
            const text = await this.getTextComplete(line.b, folderName);
            const completionItem = this.createCompleteItem(text, line, position);
            completionItems.push(completionItem);
        } catch (error) {
            vscode.window.showErrorMessage(error);
        }
        return completionItems;
    }

    createCompleteItem(text, line, position) {
        const completionItem = new vscode.InlineCompletionItem(text.trim());
        completionItem.command = {
            command: 'fbo-autocomplete.applyCompletionItem',
            title: 'zlkqlksk',
            arguments: [line, position]
        };
        completionItem.range = new vscode.Range(position, position); // Đảm bảo chỉ thay đổi từ vị trí hiện tại
        return completionItem;
    }

    async getTextComplete(inputKey, folderName) {
        var db_path_name = '/Database/';
        const dbPath = path.join(__dirname, '..', db_path_name, folderName);
        const key_split = inputKey.split('.');
        if (key_split.length < 2 || !key_split[1].includes(';')) {
            return '';
        }
        const db = level(dbPath, { createIfMissing: false }, function (err) {
            if (err instanceof level.errors.OpenError) {
                vscode.window.showErrorMessage(`failed to open database: ${err}`);
            }
        });
        var text = '';
        try {
            const key = key_split[1].replace(';', ''); // Tách lấy key từ inputKey 

            var text = await db.get(key); // Sử dụng Promise API của level
            const match = text.match(/reference="([^"]+)"/);
            if (match) {
                const reference = match[1] + 'ex' // Tách lấy reference từ text
                var ref_text = await db.get(reference)
                if (ref_text)
                    text += '\n' + ref_text;
            }
            return text; // Trả về kết quả nếu tìm thấy
        } catch (err) {
            if (err.notFound) {
                vscode.window.showErrorMessage(err);
                return text ? text : '';
            }
            vscode.window.showErrorMessage(err);
            return text ? text : '';
        } finally {
            db.close(); // Đảm bảo đóng database
        }
    }


    getFolderName(inputText, document) {
        let prefixFolder = '';
        const path = document.uri.path;

        if (inputText.startsWith('$f')) {
            if (path.includes('Dir')) {
                prefixFolder = 'Dir';
            } else if (path.includes('Filter')) {
                prefixFolder = 'Filter';
            }
        } else if (path.includes('Grid')) {
            if (inputText.startsWith('$gv')) {
                prefixFolder = 'GridView';
            } else if (inputText.startsWith('$gi')) {
                prefixFolder = 'GridInput';
            }
        }
        return prefixFolder;
    }
    applyCompletionItem(line, position) {
        const activeTextEditor = vscode.window.activeTextEditor;
        const document = activeTextEditor.document;
        const edit = new vscode.WorkspaceEdit();
        var lineNumber = line.a;
        var textToReplace = line.b;
        var text = document.lineAt(lineNumber).text.replace(textToReplace, '');
        // Tìm vị trí chính xác của từ trong dòng (bao gồm khoảng trắng)
        const lineText = document.lineAt(lineNumber).text;
        var index = lineText.indexOf(textToReplace.trim());
        // Thay thế nội dung trong dòng bằng chuỗi rỗng new(startLine:Int, startCharacter:Int, endLine:Int, endCharacter:Int)
        edit.replace(document.uri, new vscode.Range(lineNumber, index, lineNumber, document.lineAt(lineNumber).text.length), text);
        vscode.workspace.applyEdit(edit);
    }
    async genViewFromFields(document, position) {
        const line = document.lineAt(position);
        const completionItems = [];
        const textBeforeCursor = line.text.substring(0, position.character).trim(); // Văn bản trước con trỏ
        if (textBeforeCursor != '$gff;') {
            return completionItems;
        }
        if (!document.uri.path.includes('Grid')) {
            return completionItems;
        }
        var name_and_field = await ana.getListField('', document.getText());
        var name_and_viewItem = await ana.getListViewOnGrid('', document.getText());

        const existingKeysInView = new Set(name_and_viewItem.map(item => item.key));
        // Lọc ra các field bị thiếu trong <view>
        const missingFields = name_and_field.filter(item => !existingKeysInView.has(item.key));
        // Chuyển thành chuỗi XML
        let textComplete = missingFields.map(item => `<field name="${item.key}"/>`).join('\n');
        // Tạo CompletionItem như cũ
        const completionItem = this.createCompleteItem(textComplete, line, position);
        completionItems.push(completionItem);
        return completionItems;
    }
 
}

module.exports = CompletionProvider;
