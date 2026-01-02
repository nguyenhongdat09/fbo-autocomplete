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
        
        // Mở file bằng VS Code sử dụng spawn (không parse nội dung file)
        try {
            const proc = spawn(vsCodePath, [filePath], {
                detached: true,
                stdio: 'ignore'
            });
            
            proc.unref(); // Cho phép parent process thoát
            vscode.window.showInformationMessage(`📁 Opened in VS Code: ${path.basename(filePath)}`);
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to open file in VS Code: ${err.message}\n\nFile: ${filePath}\nVS Code Path: ${vsCodePath}\n\nPlease check if the path is correct in settings.`);
        }
    }
}
module.exports = OpenWithVSCode;