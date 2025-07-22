const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

module.exports = async function showAllFileShowForm() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const document = editor.document;
    const line = editor.selection.active.line;
    const lineText = document.lineAt(line).text;

    const pattern = /\b\w+\.showForm\s*\(\s*['"]([^'"]+)['"]\s*\)/;
    const match = lineText.match(pattern);

    if (!match) {
        vscode.window.showWarningMessage('Không tìm thấy lệnh showForm ở dòng hiện tại');
        return;
    }

    const formName = match[1];
    const baseDir = path.dirname(path.dirname(document.uri.fsPath));

    // Tìm ra các file liên quan
    const relativeFilter = [
        ['Filter', 'MultiForm'],
        ['Filter', 'Form'],
        ['Filter', 'Filter'],
        ['Grid', 'MultiGrid'],
        ['Grid', 'Grid'],
        ['Lookup', 'Lookup']
    ];

    const isFilter = /Filter$/.test(formName);
    const fileRela = [];

    if (!isFilter) {
        fileRela.push(['Filter', formName]);
    }

    for (const [folder, nameRela] of relativeFilter) {
        const fileName = formName.slice(0, -6) + nameRela;
        fileRela.push([folder, fileName]);
    }

    // Mở tất cả các file
    const opened = [];

    for (const [folder, name] of fileRela) {
        const filePath = path.join(baseDir, folder, `${name}.xml`);
        if (fs.existsSync(filePath)) {
            try {
                const doc = await vscode.workspace.openTextDocument(filePath);
                await vscode.window.showTextDocument(doc, {
                    preview: false,
                    preserveFocus: true
                });
                opened.push(filePath);
            } catch (err) {
                console.error('Lỗi khi mở file:', filePath, err);
            }
        }
    }

    if (opened.length === 0) {
        vscode.window.showInformationMessage(`Không tìm thấy file liên quan đến form "${formName}"`);
    }
};
