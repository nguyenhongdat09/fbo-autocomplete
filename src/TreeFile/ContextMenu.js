const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const app_dataChecker = require("./AppDataPathHelper");
const { exec } = require('child_process');
const os = require("os");
class ContextMenuHandler {
    constructor(context, treeDataProvider) {
        this.context = context;
        this.treeDataProvider = treeDataProvider;
        this.treeView = treeDataProvider.treeView;
        this.treeData = treeDataProvider.treeData;
        this.app_dataChecker = new app_dataChecker();
        // Đăng ký command cho context menu
        this.context.subscriptions.push(
            vscode.commands.registerCommand("fboFile.openRevealFolder", this.openRevealFolder)
        );
        this.context.subscriptions.push(
            vscode.commands.registerCommand("fboFile.CopyPath", () => this.CopyPath())
        );
        this.context.subscriptions.push(
            vscode.commands.registerCommand("fboFile.CopyPaths", () => this.CopyPaths())
        );
        this.context.subscriptions.push(
            vscode.commands.registerCommand('fboFile.CopyFile', () => this.copyFile())
        );
        this.context.subscriptions.push(
            vscode.commands.registerCommand('fboFile.DeleteFile', async () => await this.deleteFile())
        );
        this.context.subscriptions.push(
            vscode.commands.registerCommand('fboFile.FixWebConfig', async () => await this.fixWebConfig())
        );
        vscode.commands.registerCommand("fboFile.GenerateCopyFile", async (treeItem) => {
            let targets = [];
            // Ưu tiên từ treeView
            if (this.treeView?.selection?.length > 0) {
                targets = this.treeView.selection.filter(item => item?.resourceUri);
            }

            // Nếu không có thì lấy từ tab đang mở
            if (targets.length === 0 && vscode.window.activeTextEditor?.document?.uri) {
                targets = [{ resourceUri: vscode.window.activeTextEditor.document.uri }];
            }

            if (targets.length === 0) {
                vscode.window.showWarningMessage("Không có file nào được chọn để copy.");
                return;
            }
            await this.generateCopyForFiles(targets);
        }); 
        this.treeView.onDidChangeSelection((e) => {
            const isFileSelected = e.selection.length > 0 && e.selection.every(item => item.contextValue === 'file');
            vscode.commands.executeCommand('setContext', 'fboViewFileSelected', isFileSelected);
        });
        vscode.commands.registerCommand("fboFile.PasteFilesToGroup", async () => {
            let groupItem = null;
            // Ưu tiên lấy từ treeView selection
            if (this.treeView?.selection?.length === 1) {
                const selected = this.treeView.selection[0];
                if (selected?.contextValue === "group") {
                    groupItem = selected;
                }
            }
            if (!groupItem) {
                vscode.window.showWarningMessage("Vui lòng chọn một group để paste.");
                return;
            }
            const filePaths = await this.getCopiedFilePathsFromClipboard();
            if (!filePaths) return;
            await this.app_dataChecker.pasteFilesToGroup(groupItem.resourceUri.fsPath, filePaths, 0);
        });

        this.context.subscriptions.push(
            vscode.commands.registerCommand('fboFile.RenameFile', this.renameFileCommand)
        );
    }
    // Hàm đọc từ clipboard
    async getCopiedFilePathsFromClipboard() {
        try {
            const text = await vscode.env.clipboard.readText();
            const filePaths = JSON.parse(text);
            if (!Array.isArray(filePaths) || filePaths.length === 0) {
                vscode.window.showWarningMessage("Không có file nào để dán.");
                return null;
            }
            return filePaths;
        } catch (e) {
            vscode.window.showErrorMessage("Clipboard không chứa danh sách file hợp lệ.");
            return null;
        }
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
    async CopyPaths() {
        const selected = this.treeView?.selection ?? [];
        await vscode.env.clipboard.writeText(JSON.stringify(selected.map(f => f.resourceUri.fsPath)));
    }
    async CopyPath() {
        const paths = this.getPathsSelect();
        await vscode.env.clipboard.writeText(paths.join('\n'));
    } 

    async generateCopyForFiles(files) {
        if (!files?.length) return;
        const groupItems = Array.from(this.treeDataProvider.groupItems.values()).filter(groupItem => groupItem.label !== 'Other');
        // Bước 1: Nhập tên base
        const newBaseName = await vscode.window.showInputBox({
            prompt: 'Nhập tên file mới (không cần đuôi)',
            placeHolder: '',
            validateInput: (value) => !value ? 'Tên không được để trống' : null
        });
        if (!newBaseName) return;
        
        // Bước 2: Chọn group path đích
        const targetGroup = await vscode.window.showQuickPick(groupItems, {
            placeHolder: 'Chọn đường dẫn group để lưu các file copy'
        });
        if (!targetGroup) return;
        // Tạo tên file mới và đường dẫn mới
        var changedPaths = files.map((item) => {
            const sourcePath = item?.resourceUri?.fsPath; // Đường dẫn file nguồn
            if (!fs.existsSync(sourcePath)) return '';
            const ext = path.extname(sourcePath);
            const newFileName = path.join(path.dirname(sourcePath), `${newBaseName}${ext}`); 
            return [sourcePath, newFileName]
        }) 
        var targetPath = targetGroup.resourceUri.fsPath;
        console.log(targetPath, changedPaths)
        this.app_dataChecker.pasteFilesToGroup(targetPath, changedPaths, 1); 
    }


    async closeTabByUri(uriToClose) {
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

    copyFilesToClipboard(filePaths) {
        if (!filePaths || filePaths.length === 0) return;
        const psScript = `
            Add-Type -AssemblyName System.Windows.Forms
            $data = New-Object System.Collections.Specialized.StringCollection
            ${filePaths.map(p => `$data.Add("${p.replace(/"/g, '`"')}")`).join("\n")}
            [System.Windows.Forms.Clipboard]::SetFileDropList($data)
        `;
        const tempDir = os.tmpdir();
        const psFilePath = path.join(tempDir, "fbo_copy.ps1");
        fs.writeFileSync(psFilePath, psScript);
        // ⚡ Thực thi file PowerShell ngầm
        const command = `powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File "${psFilePath}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                vscode.window.showErrorMessage("⚠️ Copy file(s) failed: " + error.message);
                console.error("❌ Error:", error);
                return;
            }
            if (stderr) {
                console.warn("⚠️ PowerShell stderr:", stderr);
            }
        });
    }

    copyFile() {
        this.copyFilesToClipboard(this.getPathsSelect());
    }
    async fixWebConfig() {
        const paths = this.getPathsSelect();
        if (!paths || paths.length === 0) return;
        for (const filePath of paths) {
            try {
                const file = path.join(filePath, 'Web.config');
                if (!fs.existsSync(file)) continue;
                // 🧠 Đọc nội dung gốc
                const originalContent = fs.readFileSync(file, 'utf8');
                // ✅ Thêm 1 dấu cách cuối file
                const modifiedContent = originalContent + ' ';
                // 💾 Ghi lại để IIS nhận thay đổi
                fs.writeFileSync(file, modifiedContent, 'utf8');
                // ⏳ Chờ 100ms rồi trả lại như cũ
                await new Promise(resolve => setTimeout(resolve, 100));
                fs.writeFileSync(file, originalContent, 'utf8');
                vscode.window.showInformationMessage(`✅ Đã "fix" ${file}`);
            } catch (err) {
                vscode.window.showErrorMessage(`❌ Không thể fix ${filePath}: ${err.message}`);
            }
        }
    }
    async deleteFile() {
        const paths = this.getPathsSelect();
        if (!paths || paths.length === 0) return;
        
        const confirm = await vscode.window.showWarningMessage(
            `🗑️ Bạn có chắc muốn xoá ${paths.length} file không?`,
            { modal: true },
            'Yes', 'No'
        );

        if (confirm !== 'Yes') return;
        const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
        // 🔍 Lọc các tab thuộc nhóm cần đóng
        const targetTabs = tabs.filter(tab => {
            const input = tab.input; 
            return input && typeof input === "object" && "uri" in input && paths.includes(input.uri.fsPath);
        });
        
        if (targetTabs.length > 0) {
            // 🔥 Đóng tất cả các tab thuộc nhóm
            await vscode.window.tabGroups.close(targetTabs);
            // Delete files
            for (const filePath of paths) {
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath); // hoặc dùng fs.rmSync nếu cần xoá folder
                    }
                } catch (err) {
                    vscode.window.showErrorMessage(`❌ Không thể xoá ${filePath}: ${err.message}`);
                }
            }
        }  
    }
    getPathsSelect() {
        // Nếu dùng trong TreeView thì lấy từ selection của tree
        const selected = this.treeView?.selection ?? [];
        if (!selected || selected.length === 0) {
            vscode.window.showErrorMessage("Không có file nào được chọn.");
            return;
        }
        const paths = selected.map(item => item.resourceUri?.fsPath).filter(Boolean);
        if (paths.length === 0) {
            vscode.window.showErrorMessage("Không tìm thấy đường dẫn nào hợp lệ.");
            return [];
        }
        return paths
    }

}
module.exports = ContextMenuHandler;
