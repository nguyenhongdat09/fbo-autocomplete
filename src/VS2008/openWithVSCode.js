const vscode = require('vscode');
const path = require('path');
const { spawn } = require('child_process');

class OpenWithVSCode {
    static open(uri) {
        // Nếu uri undefined, lấy file hiện tại từ editor
        if (!uri) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('❌ No file is open!');
                return;
            }
            uri = editor.document.uri;
        }
        
        const filePath = uri.fsPath;
        
        // Lấy đường dẫn VS Code từ configuration
        const config = vscode.workspace.getConfiguration('fbo-autocomplete');
        const vsCodePath = config.get('PathVsCode', 'C:\\Program Files\\Microsoft VS Code\\Code.exe');
        
        
    }
}
module.exports = OpenWithVSCode;