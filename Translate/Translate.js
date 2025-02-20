const tr = require("googletrans").default;
const vscode = require('vscode');

class TranslatedText {

    constructor() {
        this.fr_lan = 'vi'
        this.to_lan = 'en'
    }

    async trans_to_en(text_to_trans) {
        const { text } = await tr(text_to_trans, { from: "vi", to: "en" })
        return text
    }
    async trans_to_vi_batch(texts) {
        const {textArray} = await tr(texts, { from: "vi", to: "en" });
        return textArray
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
            let match;
            const matches = [], vietnameseTexts = [];
            while ((match = regex.exec(document.getText())) !== null) {
                const vietnameseText = match[1];
                matches.push({
                    match,
                    vietnameseText,
                    start: document.positionAt(match.index),
                    end: document.positionAt(match.index + match[0].length)
                });
                vietnameseTexts.push(vietnameseText);
            }
            if (vietnameseTexts.length === 0) {
                return undefined;
            }
            try {
                // Dịch toàn bộ mảng từ tiếng Việt sang tiếng Anh
                const translatedTexts = await this.trans_to_vi_batch(vietnameseTexts);
        
                // Áp dụng thay thế cho từng kết quả đã dịch
                const edit = new vscode.WorkspaceEdit();
                matches.forEach((item, index) => {
                    const { match, vietnameseText, start, end } = item;
                    const translatedText = translatedTexts[index];
                    const updatedSegment = `v="${vietnameseText}" e="${translatedText}"`;
                    edit.replace(document.uri, new vscode.Range(start, end), updatedSegment);
                });
        
                // Thực thi chỉnh sửa trên tệp
                await vscode.workspace.applyEdit(edit);
            } catch (error) {
                vscode.window.showErrorMessage(`Batch translation failed: ${error.message}`);
            } 
        }); 
    }
    
}   

module.exports = TranslatedText