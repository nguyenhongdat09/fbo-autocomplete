const vscode = require('vscode');
const level = require('level-rocksdb');
const path = require('path');
const ana = require('./AnalystXMLFile');

class CompletionProvider extends ana {
    constructor() {
        super()
        this.command = {
            '$gff;': this.genViewFromFields.bind(this),
            '$gpf;': this.genProcessingFromFields.bind(this),
        }
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
                provideInlineCompletionItems: this.shortCutGen.bind(this),
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
        if (folderName == '')
            return completionItems;

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



    getDatabase(folderName) {
        const dbPath = path.join(__dirname, '..', 'Database', folderName);
        return level(dbPath, { createIfMissing: false }, function (err) {
            if (err instanceof level.errors.OpenError) {
                vscode.window.showErrorMessage(`failed to open database: ${err}`);
            }
        });
    }
    async getValueFromDatabase(db, key_split) {
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
    }

    getFolderName(inputText, document) {
        const path = document.uri.path;
        if (inputText.startsWith('$f')) {
            return path.includes('Dir') ? 'Dir'
                : path.includes('Filter') ? 'Filter'
                    : '';
        }
        if (path.includes('Grid')) {
            if (inputText.startsWith('$gv')) return 'GridView';
            if (inputText.startsWith('$gi')) return 'GridInput';
        }
        return '';
    }
    async getTextComplete(inputKey, folderName) {
        var text = '';
        const key_split = inputKey.split('.');
        if (key_split.length < 2 || !key_split[1].includes(';')) {
            return '';
        }
        const db = this.getDatabase(folderName);
        try {
            return await this.getValueFromDatabase(db, key_split);
        } catch (err) {
            vscode.window.showErrorMessage(err);
            return text || '';
        } finally {
            db.close(); // Đảm bảo đóng database
        }
    }

    applyCompletionItem(line, position) {
        const activeTextEditor = vscode.window.activeTextEditor, document = activeTextEditor.document, edit = new vscode.WorkspaceEdit();
        var lineNumber = line.a, textToReplace = line.b, text = document.lineAt(lineNumber).text.replace(textToReplace, '');
        // Tìm vị trí chính xác của từ trong dòng (bao gồm khoảng trắng)
        const lineText = document.lineAt(lineNumber).text;
        var index = lineText.indexOf(textToReplace.trim());
        // Thay thế nội dung trong dòng bằng chuỗi rỗng new(startLine:Int, startCharacter:Int, endLine:Int, endCharacter:Int)
        edit.replace(document.uri, new vscode.Range(lineNumber, index, lineNumber, document.lineAt(lineNumber).text.length), text);
        vscode.workspace.applyEdit(edit);
    }
    checkFBOPathValid() {
        return path.basename(path.dirname(path.dirname(vscode.window.activeTextEditor.document.uri.fsPath))) != 'Mobile';
    }
    async genViewFromFields(document, position) {
        const completionItems = [];
        if (!document.uri.path.includes('Grid')) {
            return completionItems;
        }
        var name_and_field = await this.getListField('', document.getText());
        var name_and_viewItem = await this.getListViewOnGrid('', document.getText());

        const existingKeysInView = new Set(name_and_viewItem.map(item => item.key));
        // Lọc ra các field bị thiếu trong <view>
        const missingFields = name_and_field.filter(item => !existingKeysInView.has(item.key));
        // Chuyển thành chuỗi XML
        let textComplete = missingFields.map(item => `<field name="${item.key}"/>`).join('\n');
        // Tạo CompletionItem như cũ
        const completionItem = this.createCompleteItem(textComplete, document.lineAt(position), position);
        completionItems.push(completionItem);
        return completionItems;
    }

    async genProcessingFromFields(document, position) {
        var completionItems = [], select_str = '', declare_suggest = '';
        if (!document.uri.path.includes('Filter')) {
            return completionItems;
        }
        var name_and_field = await this.getListField('', document.getText());
        name_and_field = name_and_field.filter(ele =>
            !/external\s*=\s*["']true["']/.test(ele.value)
        );

        select_str = 'select ' + name_and_field.map(obj => {
            return `@${obj.key} as ${obj.key}`;
        }).join(', ')
        declare_suggest = '-- ' + name_and_field.map(obj => {
            return `@${obj.key}`;
        }).join(', ')
        var textComplete = select_str + '\n' + declare_suggest;
        const completionItem = this.createCompleteItem(textComplete, document.lineAt(position), position);
        completionItems.push(completionItem);
        return completionItems;
    }

    async shortCutGen(document, position) {
        if (!this.checkFBOPathValid())
            return [];
        const line = document.lineAt(position);
        const textBeforeCursor = line.text.substring(0, position.character).trim(); // Văn bản trước con trỏ

        if (!this.command.hasOwnProperty(textBeforeCursor))
            return []
        var func = this.command[textBeforeCursor];
        return func(document, position)
    }


}

module.exports = CompletionProvider;
