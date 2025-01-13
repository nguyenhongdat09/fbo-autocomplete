const vscode = require("vscode");

class EntityCodeLensProvider {
    constructor(extensionDirectory) {
        this.extensionDirectory = extensionDirectory;
    } 
    static provideCodeLenses(document, position) {
        const codeLenses = [];
        const regex =  /&[\w.]+;/g; // Regex tìm entity dạng &EntityName;
        const text = document.getText();
        let match;
        
        while ((match = regex.exec(text)) !== null) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);
            
            // Tạo CodeLens với hành động Copy
            codeLenses.push(
                new vscode.CodeLens(range, {
                    title: `${match[0]}`,
                    tooltip: "Copy this entity's content to clipboard",
                    command: "fbo-autocomplete.copyEntity",
                    arguments: [match[0], document], // Truyền entity vào lệnh
                })
            );
        } 
        return codeLenses;
    }
}

module.exports = EntityCodeLensProvider;
