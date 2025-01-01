const vscode = require('vscode');
const level = require('level-rocksdb');
const path = require('path');

class CompletionProvider {
     async provideCompletionItems(document, position) {
        var pvd = new CompletionProvider();
        const line = document.lineAt(position);
        const textBeforeCursor = line.text.substring(0, position.character).trim(); // Văn bản trước con trỏ
        const completionItems = []; 
        const folderName = pvd.getFolderName(textBeforeCursor, document); 
        if (folderName == '') {
            return completionItems;
        } 
        try { 
            const text = await pvd.getTextComplete(line.b, folderName);
            const completionItem = new vscode.InlineCompletionItem(text.trim());
            completionItem.command = {
                command: 'fbo-autocomplete.applyCompletionItem',
                title: 'Replace with completion',
                arguments: [line]
            };
            completionItems.push(completionItem);
        } catch (error) {
            console.error('Error ', error);
        }  
        return completionItems;
    }

    async getTextComplete(inputKey, folderName) {
        var db_path_name = '/Database/';
        const dbPath = path.join(__dirname, db_path_name, folderName);
        const db = level(dbPath, { createIfMissing: false }, function (err) {
            if (err instanceof level.errors.OpenError) {
              console.log('failed to open database')
            }
         });
        const key_split = inputKey.split('.');
        try {
            if (key_split.length < 2 || !key_split[1].includes(';')) {
                return '';
            }
            const key = key_split[1].replace(';', ''); // Tách lấy key từ inputKey 
            var text = await db.get(key); // Sử dụng Promise API của level
            const match = text.match(/reference="([^"]+)"/);
            if (match) {
                const reference = match[1].replace('%l', ''); // Tách lấy reference từ text
                text += '\n' + await db.get(reference);
            } 
            return text; // Trả về kết quả nếu tìm thấy
        } catch (err) {
            if (err.notFound) {
                console.error(`Key not found: ${key_split[1].replace(';', '')}`);
                return ''; // Trả về chuỗi rỗng nếu không tìm thấy
            }
            console.error('Error accessing database:', err);
            throw err; // Ném lỗi ra nếu gặp vấn đề khác
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
    applyCompletionItem(line){
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
