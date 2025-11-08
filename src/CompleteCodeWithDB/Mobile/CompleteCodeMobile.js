const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const AnalystXMLFile = require('../AnalystXMLFile')
class CompleteCodeMobile extends AnalystXMLFile {
    constructor() {
        super();
        this.shortcut_rule = {
            'filter': [
                { '$mgp;': this.genProccessingCodeFilter.bind(this) },
                { '$mgr;': this.genRowFromFilter.bind(this) }
            ],
            'grid': [
                { '$mgr;': this.genRowFromGrid.bind(this) }
            ],
            'dir': [
                { '$mgr;': this.genRowFromFilter.bind(this) }
            ]
        }
    }

    run(context) {
        const genViewFromFields = vscode.languages.registerInlineCompletionItemProvider(
            { language: 'xml', scheme: 'file' }, // Áp dụng cho file XML
            {
                provideInlineCompletionItems: this.genViewFromFields.bind(this),
            }
        );

        context.subscriptions.push(genViewFromFields);
    }

    get folder() {
        return path.basename(path.dirname(vscode.window.activeTextEditor.document.uri.fsPath)).toLowerCase()
    }

    checkMobilePathValid() {
        return path.basename(path.dirname(path.dirname(vscode.window.activeTextEditor.document.uri.fsPath))) == 'Mobile';
    }

    getFuncByFolder(shortcut) {
        return Object.entries(this.shortcut_rule).flatMap(([key, values]) => {
            if (key === this.folder) {
                return values.filter(obj => Object.keys(obj).includes(shortcut));
            }
            return [];
        });
    }

    checkShortcutIsValid(shortcut) {
        if (!this.checkMobilePathValid())
            return [];
        return this.getFuncByFolder(shortcut)
    }

    async genViewFromFields(document, position) {
        const line = document.lineAt(position);
        const completionItems = [];
        const textBeforeCursor = line.text.substring(0, position.character).trim(); // Văn bản trước con trỏ
        const func_json = this.checkShortcutIsValid(textBeforeCursor);

        if (func_json.length < 1) {
            return completionItems;
        }
        const func = func_json[0][textBeforeCursor];
        var name_and_field = await this.getListField('', document.getText());
        var textComplete = func(name_and_field);
        // Tạo CompletionItem như cũ
        const completionItem = this.createCompleteItem(textComplete, line, position);
        completionItems.push(completionItem);
        return completionItems;
    }


    genProccessingCodeFilter(name_and_field) {
        const delcare_arr = [], select_arr = [], convert_arr = [], arr_field = [];

        for (const { key, value } of name_and_field) {
            const isDateTime = /type\s*=\s*["']DateTime["']/i.test(value);
            const isLookup = /style\s*=\s*["']Lookup["']/i.test(value);

            delcare_arr.push(`@${key} ${isDateTime ? 'smalldatetime' : isLookup ? 'varchar(4000)' : 'varchar(33)'}`);
            select_arr.push(`@${key} = ${key}`);
            convert_arr.push(isDateTime ? `convert(varchar, @${key}, 103) as ${key}` : `@${key} as ${key}`);
            arr_field.push(`@${key}`);
        }

        return [
            'declare ' + delcare_arr.join(', '),
            '',
            'select ' + select_arr.join(', ') + '\n from @$Table2',
            '',
            'select ' + convert_arr.join(', '),
            '',
            '-- ' + arr_field.join(', ')
        ].join('\n');
    }
 
    genRowFromGrid(name_and_field) {
        const row_arr = []
        for (const { key, value } of name_and_field) {
            row_arr.push(`<row width="_,_" align="left,left" style="b,*" fontSize="*,*" color="*,*" value="[${key}].Title,[${key}]"></row>`)
        }
        return row_arr.join('\n')
    }

    genRowFromFilter(name_and_field) {
        const row_arr = []
        for (const { key, value } of name_and_field) {
            row_arr.push(`<row width="_" value="[${key}]"/>`)
        }
        return row_arr.join('\n')
    }
 
    createCompletionItem(func) {
        const item = new vscode.CompletionItem(func.label, vscode.CompletionItemKind.Function);
        item.detail = func.detail;
        item.insertText = new vscode.SnippetString(func.insertText);
        return item;
    }
}

module.exports = CompleteCodeMobile;
