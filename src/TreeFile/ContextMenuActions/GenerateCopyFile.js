const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

function parseRenameInput(input, oldName) {
    var m1 = /^rl\((s|e),\s*(\d+),\s*([^)]+)\)$/i.exec(input);  // Kiểu 1
    if (m1) {
        var pos = m1[1], count = parseInt(m1[2]), replacement = m1[3];
        if (pos === 's') {
            return replacement + oldName.slice(count);
        } else { // pos === 'e'
            return oldName.slice(0, oldName.length - count) + replacement;
        }
    }

    var m2 = /^rl\(([^,]+),\s*([^)]+)\)$/i.exec(input); // Kiểu 2
    if (m2) {
        var from = m2[1], to = m2[2];
        return oldName.replace(from, to);
    }

    // Kiểu 3: Nhập nguyên chuỗi
    return input;
}

async function generateCopyForFiles(files) {
    if (!files?.length) return;

    const groupItems = Array.from(this.treeDataProvider.groupItems.values()).filter(groupItem => groupItem.label !== 'Other');

    // Bước 1: Nhập tên base hoặc cú pháp thay thế
    const input = await vscode.window.showInputBox({
        prompt: 'Nhập tên file mới hoặc cú pháp rl(s|e, N, VALUE)',
        placeHolder: '',
        validateInput: (value) => !value ? 'Tên không được để trống' : null
    });
    if (!input) return;

    let isReplaceExtension = false;
    if (/^rl\(/i.test(input)) {
        const options = [
            { label: 'Thay thế tên file', picked: true, id: 'name' },
            { label: 'Thay thế tên và đuôi file', picked: false, id: 'nameAndExt' }
        ];
        const selectedOptions = await vscode.window.showQuickPick(options, {
            placeHolder: 'Chọn phạm vi thay thế',
            canPickMany: true
        });
        
        if (!selectedOptions || selectedOptions.length === 0) return;
        
        if (selectedOptions.some(opt => opt.id === 'nameAndExt')) {
            isReplaceExtension = true;
        }
    }

    // Bước 2: Chọn group path đích
    const quickPickItems = groupItems.map(g => ({
        label: typeof g.label === 'string' ? g.label : g.label?.label || String(g.label),
        description: g.resourceUri ? g.resourceUri.fsPath : '',
        originalGroup: g
    }));

    const targetSelection = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Chọn đường dẫn group để lưu các file copy'
    });
    if (!targetSelection) return;

    const targetPath = targetSelection.originalGroup.resourceUri.fsPath;
    var changedPaths = files.map((item) => {
        const sourcePath = item?.resourceUri?.fsPath;
        if (!fs.existsSync(sourcePath)) return '';
        const ext = path.extname(sourcePath);
        let newFileName;
        
        if (isReplaceExtension) {
            newFileName = path.join(path.dirname(sourcePath), this.parseRenameInput(input, path.basename(sourcePath)));
        } else {
            newFileName = path.join(path.dirname(sourcePath), `${this.parseRenameInput(input, path.basename(sourcePath, ext))}${ext}`);
        }
        return [sourcePath, newFileName];
    });
    const pasteResult = await this.app_dataChecker.pasteFilesToGroup(targetPath, changedPaths, 1);
    if (typeof this.treeDataProvider.notifyGroupFilesPasted === "function") {
        await this.treeDataProvider.notifyGroupFilesPasted(targetPath, pasteResult);
    }
}

async function GenerateCopyFile() {
    const targets = this.getSelectedTargets();
    if (targets.length === 0) {
        vscode.window.showWarningMessage("Không có file nào được chọn để copy.");
        return;
    }
    await this.generateCopyForFiles(targets);
}

module.exports = {
    parseRenameInput,
    generateCopyForFiles,
    GenerateCopyFile
};
