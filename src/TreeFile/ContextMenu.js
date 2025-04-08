const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

class ContextMenuHandler {
    constructor(context) {
        this.context = context;

        // Đăng ký command cho context menu
        this.context.subscriptions.push(
            vscode.commands.registerCommand("fboFile.openRevealFolder", this.openRevealFolder)
        );
        // Đăng ký command cho context menu
        this.context.subscriptions.push(
            vscode.commands.registerCommand("fboFile.CopyPath", this.CopyPath)
        );
        //
        vscode.commands.registerCommand("fboFile.GenerateCopyFile", async (selectedItem, allSelectedItems) => {
            // Nếu không gọi từ context menu thì lấy file đang active
            let targets = [];
        
            if (Array.isArray(allSelectedItems) && allSelectedItems.length > 0) {
                targets = allSelectedItems;
            } else if (selectedItem?.resourceUri) {
                targets = [selectedItem];
            } else {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    targets = [{ resourceUri: activeEditor.document.uri }];
                }
            }
        
            if (targets.length === 0) {
                vscode.window.showWarningMessage("Không có file nào được chọn để copy.");
                return;
            }
        
            await this.generateCopyForFiles(targets);
        });
        
        this.context.subscriptions.push(
            vscode.commands.registerCommand('fboFile.RenameFile', this.renameFileCommand)
        );
    }

    openRevealFolder(uri) {
        if (!uri) {
            vscode.window.showErrorMessage("Không tìm thấy đường dẫn file.");
            return;
        }
        const filePath = uri.resourceUri.fsPath;
        const openCommand = process.platform === "win32"
            ? `explorer /select,"${filePath}"`  // Windows
            : `open -R "${filePath}"`;          // macOS

        require("child_process").exec(openCommand);
    }
    CopyPath(uri) {
        if (!uri || !uri.resourceUri.fsPath) {
            vscode.window.showErrorMessage("Không có đường dẫn hợp lệ để sao chép.");
            return;
        }
        vscode.env.clipboard.writeText(uri.resourceUri.fsPath)
    }

    async generateCopyForFiles(files) {
        const createdFiles = [];
        for (const item of files) {
            const filePath = item.resourceUri?.fsPath;
            if (!filePath) continue;

            const dir = path.dirname(filePath);
            const ext = path.extname(filePath);
            const base = path.basename(filePath, ext);

            // Tên cơ bản: zcbctdns-copy.xml
            let copyBase = `${base}-copy`;
            let copyPath = path.join(dir, `${copyBase}${ext}`);

            let counter = 1;
            while (fs.existsSync(copyPath)) {
                copyPath = path.join(dir, `${copyBase} (${counter})${ext}`);
                counter++;
            }

            const content = fs.readFileSync(filePath, 'utf8');
            fs.writeFileSync(copyPath, content, 'utf8');
            createdFiles.push(vscode.Uri.file(copyPath));
        }
        // Mở tất cả các file copy lên
        for (const uri of createdFiles) {
            await vscode.window.showTextDocument(uri, { preview: false, viewColumn: vscode.ViewColumn.Active });
        }
        vscode.window.showInformationMessage(`✅ Đã tạo bản sao cho ${files.length} file`);
    }


    async  closeTabByUri(uriToClose) {
        const allTabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
        for (const tab of allTabs) {
            const input = tab.input;
            if (input instanceof vscode.TabInputText && input.uri.toString() === uriToClose.toString()) {
                await vscode.window.tabGroups.close([tab]);
                break;
            }
        }
    }
    async renameFileCommand(treeItem) {
        let oldUri;
    
        if (treeItem && treeItem.resourceUri) {
            oldUri = treeItem.resourceUri;
        } else if (vscode.window.activeTextEditor?.document?.uri) {
            oldUri = vscode.window.activeTextEditor.document.uri;
        } else {
            vscode.window.showErrorMessage("Không xác định được file để đổi tên.");
            return;
        }
    
        const oldPath = oldUri.fsPath;
        const dir = path.dirname(oldPath);
        const oldName = path.basename(oldPath);
        // 👉 Trước khi rename, đảm bảo tab đó đang được active (để tránh edge case khi rename từ phím F2)
        await vscode.window.showTextDocument(oldUri, { preview: false });
        const newName = await vscode.window.showInputBox({
            prompt: 'Nhập tên mới cho file',
            value: oldName,
            validateInput: (input) => {
                if (!input.trim()) return 'Tên không hợp lệ';
                if (input.includes('/') || input.includes('\\')) return 'Tên không được chứa dấu / hoặc \\';
                return null;
            }
        });
    
        if (!newName || newName === oldName) return;
    
        const newPath = path.join(dir, newName);
        const newUri = vscode.Uri.file(newPath);
    
        try { 
            // 👉 Đóng đúng tab đang active (vì ta đã ép nó active ở trên)
            if (vscode.window.activeTextEditor?.document?.uri.toString() === oldUri.toString()) {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
    
            // 🔁 Rename file
            fs.renameSync(oldPath, newPath);
    
            // 🔼 Mở lại file đã rename
            await vscode.window.showTextDocument(newUri, { preview: false });
    
        } catch (err) {
            vscode.window.showErrorMessage(`Không thể đổi tên file: ${err.message}`);
        }
    }
    
    
    

}
module.exports = ContextMenuHandler;
