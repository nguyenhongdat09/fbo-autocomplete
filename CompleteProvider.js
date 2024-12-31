const vscode = require('vscode');
const level = require('level-rocksdb');
const path = require('path');

class CompletionProvider {
    static async provideCompletionItems(document, position) {
        const line = document.lineAt(position);
        const textBeforeCursor = line.text.substring(0, position.character).trim(); // Văn bản trước con trỏ
        const completionItems = []; 
        console.log('textBeforeCursor: ', CompletionProvider.getFolderName(textBeforeCursor, document));
        const folderName = CompletionProvider.getFolderName(textBeforeCursor, document); 
        if (folderName == '') {
            return completionItems;
        }
        const dbPath = path.join(__dirname, folderName);
        const db = level(dbPath);
        
        try {
            const key = line.b.split('.')[1].replace(';', '');
            const text = await db.get(key);
            const completionItem = new vscode.InlineCompletionItem(text.trim());
            completionItem.command = {
                command: 'fbo-autocomplete.applyCompletionItem',
                title: 'Replace with completion',
                arguments: [line]
            };
            completionItems.push(completionItem);
        } catch (error) {
           
        } finally {
            db.close();
        }
    
        return completionItems;
    }
    
    
    static getFolderName(inputText, document) {
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
    


    static applyCompletionItem(line){
        const { activeTextEditor } = vscode.window;
        const { document } = activeTextEditor;
        const edit = new vscode.WorkspaceEdit();
        var { lineNumber } = line;
        var textToReplace = line.b;
        var text = document.lineAt(lineNumber).text.replace(textToReplace, '');
        // Thay thế nội dung trong dòng bằng chuỗi rỗng new(startLine:Int, startCharacter:Int, endLine:Int, endCharacter:Int)
        edit.replace(document.uri, new vscode.Range(lineNumber, 0, lineNumber, document.lineAt(lineNumber).text.length), text);
        vscode.workspace.applyEdit(edit); 
    }
}

module.exports = CompletionProvider;
