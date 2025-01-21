const { translate } = require('@vitalets/google-translate-api');
const vscode = require('vscode');

class TranslatedText {

    constructor() {
        this.fr_lan = 'vi'
        this.to_lan = 'en'
    }

    async trans_to_vi(text_to_trans) {
        const { text } = await translate(text_to_trans, { from: 'vi', to: 'en' });
        return text
    }
    
    async  translateXmlFile() {
        const editor = vscode.window.activeTextEditor;
    
        if (!editor) {
            vscode.window.showErrorMessage('Please open an XML file to translate.');
            return;
        }
        const document = editor.document, text = document.getText();
        // Regular Expression to find pattern: v="some text" e=""
        const regex = /v="([^"]+)"\s+e=""/g, edit = new vscode.WorkspaceEdit();
        let match; // Để điều chỉnh vị trí khi thay đổi văn bản
        vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Translating`,
                        cancellable: false
        }, async (progress, token) => {
            while ((match = regex.exec(text)) !== null) {
                const vietnameseText = match[1];
                try {
                    // Sử dụng Translator để dịch
                    const translatedText = await this.trans_to_vi(vietnameseText);
                    // Xác định vị trí cần thay thế trong văn bản
                    // Lấy vị trí bắt đầu và kết thúc của match
                    const start = document.positionAt(match.index);
                    const end = document.positionAt(match.index + match[0].length); 
                    // Chuẩn bị đoạn văn bản thay thế
                    const updatedSegment = `v="${vietnameseText}" e="${translatedText}"`; 
                    // Áp dụng thay thế vào WorkspaceEdit
                    edit.replace(document.uri, new vscode.Range(start, end), updatedSegment);
                } catch (error) {
                    vscode.window.showErrorMessage(`Translation failed: ${error.message}`);
                }
            } 
            await vscode.workspace.applyEdit(edit);
        }); 
    }
    
}   

module.exports = TranslatedText