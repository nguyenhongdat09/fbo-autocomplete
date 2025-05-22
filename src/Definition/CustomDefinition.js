const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
class CustomDefinition {
    constructor() {
        this.relativeFilter = [['Filter', 'MultiForm'], ['Filter', 'Form'], ['Filter', 'Filter'], ['Grid', 'MultiGrid'], ['Grid', 'Grid'], ['Lookup', 'Lookup']]
    }

    run(context) {
        // Bind trước để đảm bảo context đúng
        const boundProvideDefinition = this.provideDefinition.bind(this);
        const defi = vscode.languages.registerDefinitionProvider(
            { scheme: 'file', language: 'xml' },
            {
                provideDefinition(document, position, token) {
                    return boundProvideDefinition(document, position, token);
                }
            }
        );
        context.subscriptions.push(defi);
    }


    provideDefinition(document, position, token) {
        const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_]+/);
        if (!wordRange) return;

        const word = document.getText(wordRange);

        return (
            this.resolveControllerDefinition(document, word, position) ||
            this.resolveShowFormDefinition(document, word, position) ||
            this.DefinitionActionCase(document, word, position) ||
            this.DefinitionButtonCase(document, word, position) ||
            null
        );
    }



    //#region Definition Lookup, Grid 
    resolveControllerDefinition(document, word, position) {
        const items = this.getLineContentItems(document);
        for (const item of items) {
            if (item.controller === word) {
                // Kiểm tra position người dùng đang hover có nằm trong đoạn controller="..."
                const start = item.position;
                const end = new vscode.Position(start.line, start.character + word.length);
                const range = new vscode.Range(start, end);
                if (!range.contains(position)) continue; // bỏ qua nếu không phải đang hover đúng chỗ controller

                const basePath = this.getPath(item.style);
                let targetFile = path.join(basePath, `${word}.xml`);

                if (!fs.existsSync(targetFile) && item.style === 'Grid') {
                    targetFile = path.join(basePath, `${word}.f`);
                }

                if (fs.existsSync(targetFile)) {
                    return new vscode.Location(vscode.Uri.file(targetFile), new vscode.Position(0, 0));
                } else {
                    vscode.window.showWarningMessage(`Không tìm thấy file: ${targetFile}`);
                }
            }
        }
        return null;
    }

    getLineContentItems(document) {
        const linesWithItemsStyle = [];
        const pattern = /<items[^>]*style=["'](Lookup|AutoComplete|Grid)["'][^>]*controller=["']([^"']+)["']/i;

        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            const match = lineText.match(pattern);
            if (match) {
                const style = match[1];
                const controllerName = match[2];
                const controllerIndex = lineText.indexOf(`controller="${controllerName}"`);

                if (controllerIndex >= 0) {
                    linesWithItemsStyle.push({
                        style,
                        controller: controllerName,
                        line: i,
                        position: new vscode.Position(i, controllerIndex + `controller="`.length),
                        text: lineText.trim()
                    });
                }
            }
        }

        return linesWithItemsStyle;
    }
    //#endregion
    //#region Definition ShowForm
    findShowFormRelative(word) {
        var isFilter = /Filter$/.test(word), file_rela = ['Filter', word]
        if (!isFilter)
            return [['Filter', word]]
        this.relativeFilter.forEach(([folder, name_rela]) => {
            file_rela.push([folder, word.slice(0, -6) + name_rela])
        })
        return file_rela
    }
    resolveShowFormDefinition(document, word, position) {
        const showForms = this.getLineContentShowForm(document), path_definition = [];

        for (const show of showForms) {
            if (show.formName === word) {
                const filterPath = path.join(
                    path.dirname(path.dirname(document.uri.fsPath))
                );
                var fileRela = this.findShowFormRelative(word);
                fileRela.forEach(([folder, name_rela]) => {
                    var filePath = path.join(filterPath, folder, `${name_rela}.xml`);
                    if (fs.existsSync(filePath)) {
                        path_definition.push(new vscode.Location(vscode.Uri.file(filePath), new vscode.Position(0, 0)))
                    }
                })
                return path_definition
            }
        }
        return null;
    }
    getLineContentShowForm(document) {
        const results = [];
        const pattern = /\b\w+\.showForm\s*\(\s*['"]([^'"]+)['"]\s*\)/;

        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            const match = lineText.match(pattern);
            if (match) {
                const formName = match[1];
                const index = lineText.indexOf(match[0]) + match[0].indexOf(formName);
                results.push({
                    formName,
                    line: i,
                    position: new vscode.Position(i, index),
                    text: lineText.trim()
                });
            }
        }

        return results;
    }

    //#endregion
    //#region Action => Case , Case => Action
    resolveActionDefinition(document, position, word) {
        const actions = this.getLineContentActionId(document);
        const cases = this.getLineContentCaseLine(document);
        const currentLine = position.line;
        // Nếu đang đứng tại dòng có case 'xxx'
        const caseMatch = cases.find(c => c.caseName === word && c.line === currentLine);
        if (caseMatch) {
            const targetAction = actions.find(a => a.id === word);
            if (targetAction) {
                return new vscode.Location(document.uri, targetAction.position);
            }
        }

        // Nếu đang đứng tại dòng có <action id="xxx">
        const actionMatch = actions.find(a => a.id === word && a.line === currentLine);
        if (actionMatch) {
            const targetCase = cases.find(c => c.caseName === word);
            if (targetCase) {
                return new vscode.Location(document.uri, targetCase.position);
            }
             // ✅ Nếu không có case, trỏ đến dòng có ExecuteCommand(sender, e)
            for (let i = 0; i < document.lineCount; i++) {
                const lineText = document.lineAt(i).text;
                if (/ResponseComplete\s*\(\s*sender\s*,\s*e\s*\)/.test(lineText)) {
                    return new vscode.Location(document.uri, new vscode.Position(i, 0));
                }
            }
        }
 
        return null;
    }

    getLineContentActionId(document) {
        const results = [];
        const pattern = /<action\b[^>]*\bid\s*=\s*["']([^"']+)["']/i;

        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            const match = lineText.match(pattern);
            if (match) {
                const actionId = match[1];
                const index = lineText.indexOf(match[0]) + match[0].indexOf(actionId);
                results.push({
                    id: actionId,
                    line: i,
                    position: new vscode.Position(i, index),
                    text: lineText.trim()
                });
            }
        }

        return results;
    }

    getLineContentCaseLine(document) {
        const results = [];
        const pattern = /case\s*['"]\s*([^'"]+)\s*['"]/;

        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            const match = lineText.match(pattern);
            if (match) {
                const caseName = match[1];
                const index = lineText.indexOf(match[0]) + match[0].indexOf(caseName);
                results.push({
                    caseName,
                    line: i,
                    position: new vscode.Position(i, index),
                    text: lineText.trim()
                });
            }
        }
        return results;
    }

    DefinitionActionCase(document, word, position) {
        const result = this.resolveActionDefinition(document, position, word);
        if (result) return result;
    }
    //#endregion

    //#region Button => Case , Case => Button
    resolveButtonDefinition(document, position, word) {
        const actions = this.getLineContentButtonId(document);
        const cases = this.getLineContentCaseLine(document);
        const currentLine = position.line;
        // Nếu đang đứng tại dòng có case 'xxx'
        const caseMatch = cases.find(c => c.caseName === word && c.line === currentLine);
        if (caseMatch) {
            const targetAction = actions.find(a => a.id === word);
            if (targetAction) {
                return new vscode.Location(document.uri, targetAction.position);
            }
        }

        // Nếu đang đứng tại dòng có <action id="xxx">
        const actionMatch = actions.find(a => a.id === word && a.line === currentLine);
        if (actionMatch) {
            const targetCase = cases.find(c => c.caseName === word);
            if (targetCase) {
                return new vscode.Location(document.uri, targetCase.position);
            }
            // ✅ Nếu không có case, trỏ đến dòng có ExecuteCommand(sender, e)
            for (let i = 0; i < document.lineCount; i++) {
                const lineText = document.lineAt(i).text;
                if (/ExecuteCommand\s*\(\s*sender\s*,\s*e\s*\)/.test(lineText)) {
                    return new vscode.Location(document.uri, new vscode.Position(i, 0));
                }
            }
        }

        return null;
    }

    getLineContentButtonId(document) {
        const results = [];
        const pattern = /<button\b[^>]*\bcommand\s*=\s*["']([^"']+)["']/i;

        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            const match = lineText.match(pattern);
            if (match) {
                const actionId = match[1];
                const index = lineText.indexOf(match[0]) + match[0].indexOf(actionId);
                results.push({
                    id: actionId,
                    line: i,
                    position: new vscode.Position(i, index),
                    text: lineText.trim()
                });
            }
        }

        return results;
    }


    DefinitionButtonCase(document, word, position) {
        const result = this.resolveButtonDefinition(document, position, word);
        if (result) return result;
    }
    //#endregion 



    checkFolderValid() {
        var folderName = this.getFolderName();
        return ['dir', 'grid', 'filter'].includes(folderName);
    }

    getFolderName() {
        return path.basename(path.dirname(vscode.window.activeTextEditor.document.uri.fsPath)).toLowerCase()
    }

    getPath(style) {
        var subfolder = ''
        switch (style) {
            case 'Lookup':
            case 'AutoComplete':
                subfolder = 'lookup';
                break;
            case 'Grid':
                subfolder = 'grid';
                break;
            default:
                return null;
        }
        return path.join(path.dirname(path.dirname(vscode.window.activeTextEditor.document.uri.fsPath)), subfolder);
    }
}

module.exports = CustomDefinition;