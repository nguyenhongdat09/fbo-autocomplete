const vscode = require('vscode');
const level = require('level-rocksdb');
const path = require('path');

class CompletionProvider {
    static async provideCompletionItems(document, position) {
        var line = document.lineAt(position) 
        const textBeforeCursor = line.text.substring(0, position.character).trim(); // Văn bản trước con trỏ
        var completionItems = [];
        
        // Kiểm tra xem có bắt đầu với $f.ma_kh hay không
        if (!textBeforeCursor.startsWith('$f.m')) {
            return completionItems; // Không trả về gợi ý nếu không phải $f.
        }
        
        const dbPath = path.join(__dirname, 'Dir');
        const db = level(dbPath);
            
        try {
            // Đợi dữ liệu từ cơ sở dữ liệu
            // Tạo nội dung gợi ý sau khi dữ liệu được tải xong
            var key = line.b.split('.')[1].replace(';', '');
            const text = await db.get(key);
            const completionItem = new vscode.InlineCompletionItem(text.trim());
            completionItem.command = {
                command: 'fbo-autocomplete.applyCompletionItem',
                title: 'Replace with completion',
                arguments: [line]
            };
            completionItems.push(completionItem);
        } catch (error) {
            //console.error('Error reading from LevelRocksDB:', error);
        } finally {
            db.close(); // Đóng cơ sở dữ liệu
        }

        return completionItems;
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
