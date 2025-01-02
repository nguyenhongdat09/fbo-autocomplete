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
            const completionItem = pvd.createCompleteItem(text, line, position);
            completionItems.push(completionItem);
        } catch (error) {
            console.error('Error ', error);
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
        const dbPath = path.join(__dirname, db_path_name, folderName);
        const key_split = inputKey.split('.');
        if (key_split.length < 2 || !key_split[1].includes(';')) {
            return '';
        }
        const db = level(dbPath, { createIfMissing: false }, function (err) {
            if (err instanceof level.errors.OpenError) {
              console.log('failed to open database: ', err)
            }
         });
        try {  
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
    applyCompletionItem(line, position){
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
    async genViewFromFields(document, position){
        var pvd = new CompletionProvider();
        const line = document.lineAt(position);
        const completionItems = [];
        const textBeforeCursor = line.text.substring(0, position.character).trim(); // Văn bản trước con trỏ
        if (textBeforeCursor != '$gff;') {
            return completionItems;
        }
        if(!document.uri.path.includes('Grid')){
            return completionItems;
        }
        const content = document.getText();
        const fieldsRegex = /<fields>([\s\S]*?)<\/fields>/g;
        const fieldsMatches = content.match(fieldsRegex);
        if (!fieldsMatches) {
            console.error('No fields found');
            return completionItems;
        }
        var xmlFields = fieldsMatches[0];
        let match;
        const fieldRegex = /<field[^>]*name="([^"]+)"[^>]*>[\s\S]*?<\/field>/g;
        var textComplete = '';
        // Lặp qua từng kết quả match
        while ((match = fieldRegex.exec(xmlFields)) !== null) {
            try { 
                const match_name = match[0].match(/name="([^"]+)"/);
                if(match_name){
                    textComplete += textComplete == '' ? `<field name="${match_name[1]}"/>` : `\n<field name="${match_name[1]}"/>`;
                }
            }
            catch (error) {
                throw error;
            }
        }
         
        const completionItem = pvd.createCompleteItem(textComplete, line, position);
        completionItems.push(completionItem);
        return completionItems;
    }

}

module.exports = CompletionProvider;
