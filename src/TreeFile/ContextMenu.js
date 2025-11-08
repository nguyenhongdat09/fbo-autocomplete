const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const app_dataChecker = require("./AppDataPathHelper");
const { exec } = require('child_process');
const os = require("os");
const cp = require('child_process');

class ContextMenuHandler {
    constructor(context, treeDataProvider) {
        this.context = context;
        this.treeDataProvider = treeDataProvider;
        this.treeView = treeDataProvider.treeView;
        this.treeData = treeDataProvider.treeData;
        this.app_dataChecker = new app_dataChecker();
        this.config = vscode.workspace.getConfiguration('fbo-autocomplete');
        // Đăng ký command cho context menu   
        const commandMap = [
            { name: "fboFile.openRevealFolder", handler: this.openRevealFolder },
            { name: "fboFile.CopyPath", handler: () => this.CopyPath() },
            { name: "fboFile.CopyFile", handler: () => this.copyFile() },
            { name: "fboFile.CopyNameOfFile", handler: () => this.copyNameOfFile() },
            { name: "fboFile.DeleteFile", handler: async () => await this.deleteFile() },
            { name: "fboFile.FixWebConfig", handler: async (group) => await this.fixWebConfig(group) },
            { name: "fboFile.PasteFilesToGroup", handler: async (group) => await this.PasteFilesToGroup(group) },
            { name: "fboFile.GenerateCopyFile", handler: async () => await this.GenerateCopyFile() },
            { name: "fboFile.RenameFile", handler: async () => this.renameFileCommand() },

        ]
        for (const { name, handler } of commandMap) {
            this.context.subscriptions.push(
                vscode.commands.registerCommand(name, handler)
            )
        }
        this.treeView.onDidChangeSelection((e) => {
            const isFileSelected = e.selection.length > 0 && e.selection.every(item => item.contextValue === 'file');
            vscode.commands.executeCommand('setContext', 'fboViewFileSelected', isFileSelected);
        });
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
    //#region Generate Copy File
    getSelectedTargets() {
        // Ưu tiên từ treeView
        if (this.treeView?.selection?.length > 0) {
            return this.treeView.selection.filter(item => item?.resourceUri);
        }
        // Nếu không có thì lấy từ tab đang mở
        const uri = vscode.window.activeTextEditor?.document?.uri;
        return uri ? [{ resourceUri: uri }] : [];
    }
    parseRenameInput(input, oldName) {
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
    async generateCopyForFiles(files) {
        if (!files?.length) return;

        const groupItems = Array.from(this.treeDataProvider.groupItems.values()).filter(groupItem => groupItem.label !== 'Other');

        // Bước 1: Nhập tên base hoặc cú pháp thay thế
        const input = await vscode.window.showInputBox({
            prompt: 'Nhập tên file mới hoặc cú pháp rl(s|e, N, VALUE)',
            placeHolder: '',
            validateInput: (value) => !value ? 'Tên không được để trống' : null
        });
        if (!input) return;

        // Bước 2: Chọn group path đích
        const targetGroup = await vscode.window.showQuickPick(groupItems, {
            placeHolder: 'Chọn đường dẫn group để lưu các file copy'
        });
        if (!targetGroup) return;

        const targetPath = targetGroup.resourceUri.fsPath;
        var changedPaths = files.map((item) => {
            const sourcePath = item?.resourceUri?.fsPath;
            if (!fs.existsSync(sourcePath)) return '';
            const ext = path.extname(sourcePath);
            let newBaseName = input;
            const newFileName = path.join(path.dirname(sourcePath), `${this.parseRenameInput(newBaseName, path.basename(sourcePath, ext))}${ext}`);
            return [sourcePath, newFileName];
        });
        this.app_dataChecker.pasteFilesToGroup(targetPath, changedPaths, 1);
    }

    async GenerateCopyFile() {
        const targets = this.getSelectedTargets();
        if (targets.length === 0) {
            vscode.window.showWarningMessage("Không có file nào được chọn để copy.");
            return;
        }
        await this.generateCopyForFiles(targets);
    }
    //#endregion
    //#region Paste Files To Group
    async getFilePathsFromWindowsClipboard() {
        return new Promise((resolve, reject) => {
            const ps = cp.spawn('powershell.exe', [
                '-NoProfile',
                '-Command',
                'Get-Clipboard -Format FileDropList | ForEach-Object { $_.FullName }'
            ]);

            var output = '';
            var error = '';

            ps.stdout.on('data', (data) => {
                output += data.toString();
            });

            ps.stderr.on('data', (data) => {
                error += data.toString();
            });

            ps.on('close', (code) => {
                if (code !== 0 || error) {
                    console.error('❌ Clipboard read error:', error.trim());
                    return resolve([]);
                }

                const files = output
                    .split(/\r?\n/)
                    .map(line => line.trim())
                    .filter(line => line.length > 0);

                resolve(files);
            });

            ps.on('error', (err) => {
                console.error('❌ Spawn error:', err);
                resolve([]);
            });
        });
    }
    async PasteFilesToGroup(group) {
        if (!group) {
            vscode.window.showWarningMessage("Vui lòng chọn một group để paste.");
            return;
        }
        var filePaths = await this.getFilePathsFromWindowsClipboard();
        if (!filePaths || filePaths.length === 0) {
            vscode.window.showWarningMessage("Không tìm thấy file nào trong clipboard.");
            return;
        }
        await this.app_dataChecker.pasteFilesToGroup(group.resourceUri.fsPath, filePaths, 0);
    }
    //#endregion 
    //#region Open Reveal Folder
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
    //#endregion
    //#region Copy Path
    async CopyPath() {
        const paths = this.getPathsSelect();
        await vscode.env.clipboard.writeText(paths.join('\n'));
    }
    //#endregion 
    //#region Rename File
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
    //#endregion
    //#region Copy File
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
    //#endregion
    //#region  Copy Name of File
    async copyNameOfFile() {
        const paths = this.getPathsSelect();
        if (!paths || paths.length === 0) return;
        const ExtFileNameCopy = this.config.get('ExtFileNameCopy');
        console.log(ExtFileNameCopy)
        const fileNames = paths.map(p => {
            const fileName = path.basename(p);
            if (String(ExtFileNameCopy) === 'No') {
                return path.parse(fileName).name; // Lấy tên file không có extension
            } else {
                return fileName; // Giữ nguyên tên file có extension
            }
        });
        await vscode.env.clipboard.writeText(fileNames.join(','));
    }
    //#endregion
    //#region Fix Web.config
    async fixWebConfig(group) {
        if (!group) return;
        try {
            var file = path.join(group.resourceUri.fsPath, 'Web.config');
            if (!fs.existsSync(file)) vscode.window.showErrorMessage(`❌ Không tìm thấy file ${file}`)
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
            vscode.window.showErrorMessage(`❌ Không thể fix ${file}: ${err.message}`);
        }
    }
    //#endregion
    //#region Delete File
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
    //#endregion

}
module.exports = ContextMenuHandler;
