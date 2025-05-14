const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
class CustomDefinition {
    constructor() {

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

        const word = document.getText(wordRange); // ví dụ: ZDNDetail
        const items = this.getLineContentItems(document);

        for (const item of items) {
            if (item.controller === word) {
                const basePath = this.getPath(item.style); // thư mục cha 2 cấp

                var targetFile = path.join(basePath, `${word}.xml`);
                if (!fs.existsSync(targetFile) && item.style == 'Grid')
                    targetFile = path.join(basePath, `${word}.f`);

                if (fs.existsSync(targetFile)) {
                    const uri = vscode.Uri.file(targetFile);
                    const pos = new vscode.Position(0, 0); // mở lên đầu file
                    return new vscode.Location(uri, pos);
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