const vscode = require('vscode');
const path = require('path');

class CheckLegacyMessage {
    constructor() {
        this.diagnostics = vscode.languages.createDiagnosticCollection("xml-duplicate-fields");
    }

    run(context) {
        let disposable = vscode.commands.registerCommand('fbo-autocomplete.CheckLegacyMessage', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;

            const document = editor.document;
            if (document.languageId !== 'xml') {
                vscode.window.showWarningMessage("This only works on XML files.");
                return;
            }
        });
         // Tự động kiểm tra khi lưu file
         const onSave = vscode.workspace.onDidSaveTextDocument((doc) => {
            this.check(doc);
        }); 
        context.subscriptions.push(disposable, onSave);
    }
    
    getContent(document) {
        return document.getText();
    }

    extractFields(content) {
        const lines = content.split('\n');
        const fields = [];

        let insideFieldsBlock = false;
        let currentGroup = [];
        let groupIndex = 0;

        lines.forEach((line, idx) => {
            if (line.includes('<fields')) {
                insideFieldsBlock = true;
                currentGroup = [];
            }

            if (insideFieldsBlock) {
                const match = line.match(/<field\s+name="([^"]+)"/);
                if (match) {
                    currentGroup.push({
                        name: match[1],
                        line: idx,
                        fullLine: line,
                        groupIndex: groupIndex
                    });
                }
            }

            if (line.includes('</fields>')) {
                insideFieldsBlock = false;
                fields.push(...currentGroup);
                groupIndex++;
            }
        });

        return fields;
    }


    findDuplicateFieldInFields(fields) {
        const grouped = new Map();

        // Gom nhóm theo groupIndex
        for (const field of fields) {
            if (!grouped.has(field.groupIndex)) {
                grouped.set(field.groupIndex, []);
            }
            grouped.get(field.groupIndex).push(field);
        }

        const duplicates = [];

        for (const group of grouped.values()) {
            const map = new Map();
            for (const field of group) {
                if (map.has(field.name)) {
                    duplicates.push(field);
                } else {
                    map.set(field.name, field);
                }
            }
        }

        return duplicates;
    }

    pushErrorDiag(document, duplicates) {
        const diagnostics = [];

        for (const dup of duplicates) {
            const range = new vscode.Range(
                new vscode.Position(dup.line, 0),
                new vscode.Position(dup.line, dup.fullLine.length)
            );

            const diagnostic = new vscode.Diagnostic(
                range,
                `Duplicate field name "${dup.name}"`,
                vscode.DiagnosticSeverity.Error
            );

            diagnostics.push(diagnostic);
        }

        this.diagnostics.set(document.uri, diagnostics);
    }
    isValidFile(document) {
        const fileName = path.basename(document.fileName);
        const folderName = path.basename(path.dirname(document.fileName));
        return fileName === 'Message.xml' && folderName === 'Options';
    }
    check(document) {
        if (!this.isValidFile(document)) {
            return;
        }
        const content = this.getContent(document);
        const fields = this.extractFields(content);
        const dups = this.findDuplicateFieldInFields(fields);
        this.pushErrorDiag(document, dups);
    }

    dispose() {
        this.diagnostics.clear();
        this.diagnostics.dispose();
    }
}

module.exports = CheckLegacyMessage;
