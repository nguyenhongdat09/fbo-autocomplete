const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

class TreeFileProvider {
    constructor() {
        this.refreshEvent = new vscode.EventEmitter();
        this.onDidChangeTreeData = this.refreshEvent.event;
        this.treeData = new Map();
        // ⚡ Bổ sung để hỗ trợ Drag & Drop
        this.dropMimeTypes = ["text/uri-list"];
        this.dragMimeTypes = ["text/uri-list"];
        // 🌟 Thêm biến lưu trạng thái mở rộng
        this.expandedGroups = new Set();
        // 🌟 Lưu treeView để gọi `reveal()`
        this.treeView = null;
    }
    async run(context) {
        // Khởi tạo tree view
        this.treeView = vscode.window.createTreeView("fbo_file", {
            treeDataProvider: this,
            dragAndDropController: this,
            showCollapseAll: true,
            canSelectMany: true // 🔥 Cho phép chọn nhiều file
        });

        vscode.window.onDidChangeVisibleTextEditors(async () => {
            await this.refresh();
        });

        vscode.commands.registerCommand("fbo-autocomplete.reloadTree", async () => {
            if (this.treeView.visible) {
                await this.refresh();
            }
        });
        vscode.commands.registerCommand("fbo-autocomplete.closeFile", async (element) => {
            await this.closeFile(element);
        });
        vscode.commands.registerCommand('fbo-autocomplete.closeGroupFiles', async (element) => {
            if (element && element.label) {
                await this.closeGroupFiles(element.label);
            }
        });
        

        // Đăng ký lệnh reload tree
        let disposable = vscode.commands.registerCommand("fbo-autocomplete.TreeTabReload", () => {
            this.refresh();
            vscode.window.showInformationMessage("FBO File Tree đã được reload!");
        });

        // Thêm vào subscriptions để tự động clean up khi extension bị tắt
        context.subscriptions.push(this.treeView, disposable);
    }
    async closeFile(element) {
        if (!element || !element.resourceUri) return;
        const fileUri = element.resourceUri.toString();
        // 📌 Lấy tất cả các tab đang mở trong VSCode
        const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
        // 🔍 Kiểm tra từng tab xem có phải file cần đóng không
        const targetTab = tabs.find(tab => {
            const input = tab.input;
            return input && typeof input === "object" && "uri" in input && input.uri.toString() === fileUri;
        });
        if (targetTab) {
            // 🔥 **Đóng tab mà không cần mở**
            await vscode.window.tabGroups.close([targetTab]);
        } else {
            console.warn(`⚠️ File không có trong Open Editors: ${fileUri}`);
        }
        await this.refresh()
    }
    async closeGroupFiles(groupName) {
        if (!this.treeData.has(groupName)) return;
    
        const files = this.treeData.get(groupName).map(item => item.resourceUri.toString());
        // 📌 Lấy tất cả các tab đang mở trong VSCode
        const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
        
        // 🔍 Lọc các tab thuộc nhóm cần đóng
        const targetTabs = tabs.filter(tab => {
            const input = tab.input;
            return input && typeof input === "object" && "uri" in input && files.includes(input.uri.toString());
        }); 
        if (targetTabs.length > 0) {
            // 🔥 Đóng tất cả các tab thuộc nhóm
            await vscode.window.tabGroups.close(targetTabs);
        } else {
            console.warn(`⚠️ Không tìm thấy file nào trong Open Editors cho nhóm: ${groupName}`);
        }
    
        await this.refresh(); // Làm mới cây
    }
    

    async revealActiveFile(e) {
        if (!e.visible) return;
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || !activeEditor.document) return;
        setTimeout(async () => {
            const filePath = activeEditor.document.uri.fsPath;
            const treeItem = this.getTreeItemByPath(filePath);
            if (!treeItem) return; // Tránh lỗi nếu file không có trong cây
            const parentGroup = this.getParentGroup(treeItem);
            if (parentGroup) {
                try {
                    // Kiểm tra xem group đã mở chưa, nếu chưa thì mở
                    if (!this.expandedGroups.has(parentGroup.label)) {
                        await this.treeView.reveal(parentGroup, { select: false, expand: true });
                        this.expandedGroups.add(parentGroup.label); // Đánh dấu group đã mở
                    }
                    // Sau khi mở parentGroup, mới reveal file
                    await this.treeView.reveal(treeItem, { select: true, expand: false });
                } catch (error) {
                    //   console.error("❌ Lỗi khi reveal tree item:", error);
                }
            }
        }, 20);
    }

    getTreeItem(element) {
        return element; // Nếu là group cha thì giữ nguyên
    }
    async getChildren(element) {
        if (!element) {
            return this.buildTree();
        }
        await this.revealActiveFile({ visible: true });
        return this.treeData.get(element.label) || [];
    }
    async buildTree() {
        this.treeData.clear();
        const openFiles = await this.getOpenEditors();

        // 🆕 Sắp xếp file theo groupName trước khi add vào cây
        openFiles.sort((a, b) => {
            const groupA = this.getGroupName(a);
            const groupB = this.getGroupName(b);
            return groupA.localeCompare(groupB); // So sánh chuỗi để sort
        });
        openFiles.sort((a, b) => {
            const extA = path.extname(a).toLowerCase(); // Lấy phần mở rộng file
            const extB = path.extname(b).toLowerCase();
            if (extA !== extB) {
                return extA.localeCompare(extB); // Ưu tiên sắp xếp theo loại file trước
            }
            return path.basename(a).localeCompare(path.basename(b)); // Sau đó mới so sánh theo tên file
        });
        openFiles.forEach(filePath => this.addFileToTree(filePath));
        return [...this.treeData.keys()].map((groupName) => {
           // new vscode.TreeItem(groupName, vscode.TreeItemCollapsibleState.Collapsed)
            const groupItem = new vscode.TreeItem(groupName, vscode.TreeItemCollapsibleState.Collapsed);
            groupItem.contextValue = "group"; // Đặt context cho group
            return groupItem;
        }
        );
    }

    addFileToTree(filePath) {
        const groupName = this.getGroupName(filePath);
        if (!groupName) return;
        const folderName = path.basename(path.dirname(filePath));
        const item = new vscode.TreeItem(vscode.Uri.file(filePath), vscode.TreeItemCollapsibleState.None);
        item.resourceUri = vscode.Uri.file(filePath);
        item.contextValue = "file"; // Chỉ file mới có context menu
        item.description = `(${folderName})`;
        item.command = {
            command: "vscode.open",
            arguments: [vscode.Uri.file(filePath)],
            title: "Mở file"
        };

        if (!this.treeData.has(groupName)) {
            const groupItem = new vscode.TreeItem(groupName, vscode.TreeItemCollapsibleState.Collapsed);
            groupItem.contextValue = "group"; // Đặt context cho group
            this.treeData.set(groupName, []);
        }
        this.treeData.get(groupName).push(item);
    }

    async getOpenEditors() {
        const openTabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
        return openTabs
            .map(tab => {
                if (tab.input instanceof vscode.TabInputText) {
                    const uri = tab.input.uri;
                    // ❌ Loại nếu là Untitled hoặc không có fsPath
                    if (uri.scheme === 'untitled' || !uri.fsPath || uri.fsPath.includes('Untitled')) {
                        return null;
                    }
                    return uri.fsPath;
                }
                return null;
            })
            .filter(filePath => filePath !== null);
    }
     
     
    getParentGroup(treeItem) {
        for (const [group, items] of this.treeData) {
            if (items.includes(treeItem)) return new vscode.TreeItem(group, vscode.TreeItemCollapsibleState.Expanded);
        }
        return null;
    }

    getTreeItemByPath(filePath) {
        for (const [group, items] of this.treeData) {
            const foundItem = items.find(item => item.resourceUri.fsPath === filePath);
            if (foundItem) return foundItem;
        }
        return null; // Không tìm thấy
    }

    getParent(element) {
        if (!element) return null;
        // Nếu phần tử là file, trả về group chứa nó
        if (element.contextValue === "file") {
            return this.getParentGroup(element);
        }
        // Nếu là group, không có parent
        return null;
    }
    getGroupName(filePath) {
        const parts = filePath.split(path.sep);
        const index = parts.findIndex(part => part === "App_Data");

        if (index > 1) {
            // ✅ Nếu file nằm trong App_Data -> Trả về theo chuẩn cũ
            return `${parts[index - 1]} - ${parts[index - 2]}`.toUpperCase();
        } else {
            // ✅ Kiểm tra nếu file nằm trong folder cùng cấp với App_Data
            const parentFolder = parts[parts.length - 2]; // Lấy tên thư mục cha của file
            const rootPath = parts.slice(0, -2).join(path.sep); // Lấy phần path trước folder cha

            if (fs.existsSync(path.join(rootPath, "App_Data"))) {
                // ✅ Nếu file nằm trong một folder cùng cấp với App_Data
                return `${parts[parts.length - 3]} - ${path.basename(parts.slice(0, -3).join(path.sep))}`.toUpperCase();
            }

            // ✅ Nếu file nằm trực tiếp cùng cấp với App_Data (không nằm trong folder nào)
            if (fs.existsSync(path.join(path.dirname(filePath), "App_Data"))) {
                return `${parts[parts.length - 2]} - ${path.basename(parts.slice(0, -2).join(path.sep))}`.toUpperCase();
            }
        }

        return "Other"; // Trường hợp không khớp với điều kiện nào
    }

    async refresh() {
        await this.buildTree(); // Cập nhật dữ liệu
        await this.refreshEvent.fire();
    }
}

module.exports = TreeFileProvider;