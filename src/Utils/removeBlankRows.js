const vscode = require('vscode');

function removeBlankRows() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const document = editor.document;
    const selections = editor.selections;
    const hasSelection = selections.some(s => !s.isEmpty);
    
    const lineIndices = new Set();
    
    if (hasSelection) {
        for (const sel of selections) {
            if (sel.isEmpty) {
                continue;
            }
            for (let i = sel.start.line; i <= sel.end.line; i++) {
                const line = document.lineAt(i);
                if (line.text.trim() === '') {
                    lineIndices.add(i);
                }
            }
        }
    } else {
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            if (line.text.trim() === '') {
                lineIndices.add(i);
            }
        }
    }
    
    const indicesArray = Array.from(lineIndices);
    if (indicesArray.length === 0) {
        vscode.window.showInformationMessage('Không tìm thấy dòng trống nào để xóa.');
        return;
    }
    
    indicesArray.sort((a, b) => a - b);
    const segments = [];
    let start = indicesArray[0];
    let prev = indicesArray[0];
    
    for (let i = 1; i < indicesArray.length; i++) {
        const curr = indicesArray[i];
        if (curr === prev + 1) {
            prev = curr;
        } else {
            segments.push({ start, end: prev });
            start = curr;
            prev = curr;
        }
    }
    segments.push({ start, end: prev });
    
    const ranges = [];
    const lineCount = document.lineCount;
    
    for (const seg of segments) {
        const startLine = seg.start;
        const endLine = seg.end;
        
        if (endLine === lineCount - 1 && startLine > 0) {
            const prevLine = document.lineAt(startLine - 1);
            const lastLine = document.lineAt(endLine);
            ranges.push(new vscode.Range(prevLine.range.end, lastLine.range.end));
        } else if (startLine === 0) {
            if (endLine === lineCount - 1) {
                const lastLine = document.lineAt(endLine);
                ranges.push(new vscode.Range(new vscode.Position(0, 0), lastLine.range.end));
            } else {
                ranges.push(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(endLine + 1, 0)));
            }
        } else {
            ranges.push(new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(endLine + 1, 0)));
        }
    }
    
    editor.edit(editBuilder => {
        for (const range of ranges) {
            editBuilder.delete(range);
        }
    }).then(success => {
        if (success) {
            vscode.window.showInformationMessage(`Đã xóa ${indicesArray.length} dòng trống.`);
        } else {
            vscode.window.showErrorMessage('Không thể thực hiện xóa dòng trống.');
        }
    });
}

module.exports = {
    removeBlankRows
};
