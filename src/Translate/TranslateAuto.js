const vscode = require('vscode');

class TranslateAuto {
    constructor(translator) {
        this.translator = translator;
        this.timeout = null;
        this.isEditing = false;
        this.arr_line = [];
       
    }

    activate() {
        return vscode.workspace.onDidChangeTextDocument(this.handleTextChange.bind(this));
    }
    transWithKeyBoards(){
        var optionsTranslate = vscode.workspace.getConfiguration("fbo-autocomplete").get("translateMode", "autocomplete");
        if(optionsTranslate != 'keyboard') return
        const editor = vscode.window.activeTextEditor;
        const position = editor.selection.active;
        const document = editor.document;
        if (!this.arr_line.includes(position.line)) {
            this.arr_line.push(position.line);
        }
        this.processLines(document)

    }
    async handleTextChange(event) {
        var optionsTranslate = vscode.workspace.getConfiguration("fbo-autocomplete").get("translateMode", "autocomplete");
        if(optionsTranslate != 'autocomplete') return
        if (this.isEditing) return; // Đang chỉnh sửa → bỏ qua
        if (event.reason === vscode.TextDocumentChangeReason.Undo || event.reason === vscode.TextDocumentChangeReason.Redo || event.contentChanges.length === 0)
            return; // Ctrl + Z hoặc Shift + Z không chạy

        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const document = event.document;
        const position = editor.selection.active;
        const lineText = document.lineAt(position.line).text;

        // Regex tìm `v="..."` trên dòng hiện tại
        const regex = /v="([^"]*)"/g;
        let match;
        let insideV = false;

        while ((match = regex.exec(lineText)) !== null) {
            let start = match.index + 3; // Vị trí sau `v="`
            let end = start + match[1].length; // Kết thúc trước dấu `"`

            if (position.character >= start && position.character <= end) {
                insideV = true;
                break;
            }
        }
        if (!insideV) return; // Con trỏ không nằm trong `v=""`, bỏ qua

        if (!this.arr_line.includes(position.line)) {
            this.arr_line.push(position.line);
        }

        let timeoutDelay = vscode.workspace.getConfiguration("fbo-autocomplete").get("delay", 1000);
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => this.processLines(document), timeoutDelay);
    }

    async processLines(document) {
        try {
            while (this.arr_line.length > 0) {
                const editor = vscode.window.activeTextEditor;
                if (!editor || editor.document !== document) {
                    vscode.window.showErrorMessage("Editor changed or file switched, stopping translation.");
                    return;
                }
                const position_line = this.arr_line.shift();
                const line = document.lineAt(position_line);
                const regex = /(<\w+\s+v="([^"]*)"\s+e=")([^"]*)(")/;
                const match = regex.exec(line.text);
                if (match) {
                    let vietnameseText = match[2];
                    if (this.arr_line.includes(position_line)) return;

                    if (vietnameseText.trim() !== "") {
                        vscode.window.withProgress({
                            location: vscode.ProgressLocation.Notification,
                            title: `Translating`,
                            cancellable: false
                        }, async (progress, token) => {
                            let translatedText = await this.translator.trans_to_en(vietnameseText);
                            if (translatedText) {
                                let newLine = line.text.replace(/e="([^"]*)"/, `e="${translatedText}"`);
                                if (newLine !== line.text) {
                                    this.isEditing = true;
                                    editor.edit(editBuilder => {
                                        let startPos = new vscode.Position(position_line, 0);
                                        let endPos = document.lineAt(position_line).range.end;
                                        editBuilder.replace(new vscode.Range(startPos, endPos), newLine);
                                    }).then(() => {
                                        this.isEditing = false;
                                    });
                                }
                            }
                        });
                    }
                }
            }
        } catch (err) {
            vscode.window.showErrorMessage(err.message);
        }
    }
}

module.exports = TranslateAuto;