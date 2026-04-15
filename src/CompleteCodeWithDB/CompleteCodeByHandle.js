const vscode = require('vscode');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
var level = require('level-rocksdb');

class CompleteCodeByHandle {
    constructor(sheetId) {
        this.sheetId = sheetId;
        this.companyFunctions = [];
        this.optionField = [];
        this.shortCutField = [];
        this.providerHandles = [];
    }

    _userDbRoot() {
        const { getUserDatabaseRoot } = require('../extensionDatabasePaths');
        return getUserDatabaseRoot();
    }

    _autoCompleteDir() {
        return path.join(this._userDbRoot(), 'AutoComplete');
    }

    _autocompleteJsonPath() {
        return path.join(this._autoCompleteDir(), 'AutoComplete.json');
    }

    _optionsJsonPath() {
        return path.join(this._autoCompleteDir(), 'Options.json');
    }

    _shortcutJsonPath() {
        return path.join(this._autoCompleteDir(), 'Shortcut.json');
    }

    /** Credentials đi kèm extension (bundle), không ghi trong user DB */
    _getGoogleSheetsAuth() {
        const { resolveBundledDatabaseRoot } = require('../extensionDatabasePaths');
        const credPath = path.join(resolveBundledDatabaseRoot(), 'autocompletesheet-447706-3cfebe8ddb5a.json');
        if (!fs.existsSync(credPath)) {
            vscode.window.showErrorMessage('Không tìm thấy file credentials Google Sheets trong extension.');
            return null;
        }
        const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
        return new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
    }

    run(context) {
        this.loadFromJson();
        const getDataGGS = vscode.commands.registerCommand('fbo-autocomplete.getDataAutocomplete', async () => {
            await this.loadFunctions();
        });
        context.subscriptions.push(getDataGGS);
        this.registerComplete(context);
    }
    registerComplete(context) {
        const providers = [
            [this.provideCompletionItems.bind(this), '.'],
            [this.provideCompletionTwoDotItems.bind(this), '.'],
            [this.provideCompletionFieldItems.bind(this), '.'],
            [this.provideOptionsCompletionItems.bind(this), '@'],
            [this.provideShortCutCompletionItems.bind(this), '$']
        ];
        this.providerHandles = providers.map(([providerFn, triggerChar]) =>
            vscode.languages.registerCompletionItemProvider(
                { language: 'xml' },
                { provideCompletionItems: providerFn },
                triggerChar
            )
        );
        context.subscriptions.push(...this.providerHandles);
    }

    async loadFunctions() {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Saving To AutoComplete.json`,
            cancellable: false
        }, async (progress, token) => {
            try {
                const auth = this._getGoogleSheetsAuth();
                if (!auth) {
                    return;
                }
                const sheets = google.sheets({ version: 'v4', auth });
                const range = 'AutoComplete!A2:C';
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: this.sheetId,
                    range,
                });
                const rows = response.data.values;
                if (rows && rows.length) {
                    const data = rows.map(([label, detail, insertText]) => ({
                        label,
                        detail: detail || '',
                        insertText: insertText || '',
                    }));

                    fs.mkdirSync(this._autoCompleteDir(), { recursive: true });
                    const outPath = this._autocompleteJsonPath();
                    fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
                    this.companyFunctions = data;

                    console.log('Data saved to AutoComplete.json');
                } else {
                    console.warn('No data found in the sheet.');
                }
            } catch (error) {
                console.error('Error loading Google Sheets data:', error);
            }
        });
    }

    loadFromJson() {
        const autocompleteJsonPath = this._autocompleteJsonPath();
        const files = [
            ['companyFunctions', autocompleteJsonPath],
            ['optionField', this._optionsJsonPath()],
            ['shortCutField', this._shortcutJsonPath()],
        ];
        try {
            if (fs.existsSync(autocompleteJsonPath)) {
                files.forEach(([prop, filePath]) => {
                    this[prop] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                });
            } else {
                console.warn('AutoComplete.json not found. Please run "Get Data Autocomplete" command.');
            }
        } catch (error) {
            console.error('Error loading data from JSON:', error);
        }
    }

    provideCompletionItems(document, position) {
        const linePrefix = document.lineAt(position).text.substr(0, position.character);
        const exclude = ['$gi.', '$gv.', '$f.'];
        if (exclude.some(prefix => linePrefix.includes(prefix))) {
            return undefined;
        }
        const match = linePrefix.match(/\b([a-zA-Z_][a-zA-Z0-9_]*\.)?([a-zA-Z0-9_]*)$/);
        if (!match) {
            return undefined;
        }
        const [, objectPrefix, partialFunction] = match;
        if (objectPrefix) {
            return this.companyFunctions
                .filter(func => func.label.toLowerCase().includes(partialFunction.toLowerCase()))
                .map(func => this.createCompletionItem(func));
        }

        return undefined;
    }
    provideOptionsCompletionItems(document, position) {
        const lineText = document.lineAt(position).text, linePrefix = lineText.substr(0, position.character);
        if (linePrefix.endsWith('@')) {
            return this.optionField.map(func => this.createCompletionItem(func));
        }
    }
    provideShortCutCompletionItems(document, position) {
        const lineText = document.lineAt(position).text, linePrefix = lineText.substr(0, position.character);
        if (linePrefix.endsWith('$')) {
            return this.shortCutField.map(func => this.createCompletionItem(func));
        }
    }
    provideCompletionTwoDotItems(document, position) {
        const linePrefix = document.lineAt(position).text.substr(0, position.character);

        const twoDotsMatch = linePrefix.match(/([a-zA-Z_][a-zA-Z0-9_]*)\(([^)]*)\)\.$/);
        if (twoDotsMatch) {
            return [
                this.createCompletionItem({ label: 'value', detail: 'Get or set the value', insertText: 'value' }),
                this.createCompletionItem({ label: 'focus', detail: 'Set focus to the element', insertText: 'focus()' }),
            ];
        }

        return undefined;
    }

    async provideCompletionFieldItems(document, position) {
        const linePrefix = document.lineAt(position).text.substr(0, position.character);
        var f_prefix = linePrefix.trim().substring(0, 2);
        var gi_prefix = linePrefix.trim().substring(0, 3);
        if (!(f_prefix === '$f' || gi_prefix === '$gi' || gi_prefix === '$gv')) {
            return undefined;
        }
        var name_folder = this.getFolderName(linePrefix, document);
        if (name_folder == '') {
            return undefined;
        }
        const match = linePrefix.match(/\b([a-zA-Z_][a-zA-Z0-9_]*\.)?([a-zA-Z0-9_]*)$/);
        if (!match) {
            return undefined;
        }
        const [, objectPrefix, partialFunction] = match;
        if (objectPrefix) {
            var folderdbPath = path.join(this._userDbRoot(), name_folder);
            var arr_field = await this.getAllKeys(folderdbPath, name_folder);

            return arr_field.map(item => this.createCompletionItem(item));
        }
        return undefined;
    }

    getFolderName(inputText, document) {
        let prefixFolder = '';
        const pathDoc = document.uri.path;
        var controller = 'Controllers';
        if (inputText.trim().startsWith('$f')) {
            if (pathDoc.includes(`${controller}/Dir`)) {
                prefixFolder = 'Dir';
            } else if (pathDoc.includes(`${controller}/Filter`)) {
                prefixFolder = 'Filter';
            }
        } else if (pathDoc.includes(`${controller}/Grid`)) {
            if (inputText.trim().startsWith('$gv')) {
                prefixFolder = 'GridView';
            } else if (inputText.trim().startsWith('$gi')) {
                prefixFolder = 'GridInput';
            }
        }

        return prefixFolder;
    }

    createCompletionItem(func) {
        const item = new vscode.CompletionItem(func.label, vscode.CompletionItemKind.Function);
        item.detail = func.detail;
        item.insertText = new vscode.SnippetString(func.insertText);
        return item;
    }
    async getAllKeys(folderPath, name_folder) {
        var db = level(folderPath);
        var keys = [];
        try {
            await new Promise((resolve, reject) => {
                db.createReadStream()
                    .on('data', (data) => {
                        keys.push(data.key);
                    })
                    .on('end', resolve)
                    .on('error', reject);
            });
            keys = keys.filter(key => !key.includes('&'));
            var arr_field = keys.map((key) => {
                return {
                    "label": key,
                    "detail": `${name_folder}`,
                    "insertText": `${key};`
                };
            });
            return arr_field;
        } finally {
            await db.close();
        }
    }

}

module.exports = CompleteCodeByHandle;
