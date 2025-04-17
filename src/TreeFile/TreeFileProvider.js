const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const app_dataChecker = require("./AppDataPathHelper");

class TreeFileProvider {
    constructor() {
        this.refreshEvent = new vscode.EventEmitter();
        this.onDidChangeTreeData = this.refreshEvent.event;
        this.treeData = new Map();
        this.app_dataChecker = new app_dataChecker();
        // ⚡ Bổ sung để hỗ trợ Drag & Drop
        this.dropMimeTypes = ["text/uri-list"];
        this.dragMimeTypes = ["text/uri-list"];
        // 🌟 Thêm biến lưu trạng thái mở rộng
        this.expandedGroups = new Set();
        // 🌟 Lưu treeView để gọi `reveal()`
        this.treeView = null;
        this.groupItems = new Map(); // 🔥 Lưu groupItem có chứa resourceUri
    }
    async run(context) {
        // Khởi tạo tree view
        this.treeView = vscode.window.createTreeView("fbo_file", {
            treeDataProvider: this,
            dragAndDropController: this,
            showCollapseAll: true,
            canSelectMany: true // 🔥 Cho phép chọn nhiều file
        });
        // 🔄 Lắng nghe khi document bị sửa (dirty)
        vscode.workspace.onDidChangeTextDocument(() => {
            this.refreshEvent.fire();
        });

        // 💾 Lắng nghe khi document được lưu lại
        vscode.workspace.onDidSaveTextDocument(() => {
            this.refreshEvent.fire();
        });
        vscode.window.onDidChangeVisibleTextEditors(async () => {
            this.refreshEvent.fire();
        });

        vscode.commands.registerCommand("fbo-autocomplete.reloadTree", async () => {
            if (this.treeView.visible) {
                this.refreshEvent.fire();
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
            this.refreshEvent.fire();
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
            if (!input || typeof input !== "object") return false;
        
            // Một số loại tab đặc biệt (như settings.json) có uri nằm trong input.uri hoặc input.resource
            if ("uri" in input && input.uri.toString() === fileUri) {
                return true;
            }
            if ("resource" in input && input.resource.toString() === fileUri) {
                return true;
            }
            return false;
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
        return element;
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
            if (groupA !== groupB) {
                return groupA.localeCompare(groupB); // Ưu tiên groupName
            }
        
            const extA = path.extname(a).toLowerCase();
            const extB = path.extname(b).toLowerCase();
            if (extA !== extB) {
                return extA.localeCompare(extB); // Ưu tiên theo extension
            }
        
            return path.basename(a).localeCompare(path.basename(b)); // Cuối cùng so sánh tên file
        });
        
        openFiles.forEach(filePath => this.addFileToTree(filePath));
        
        return [...this.treeData.keys()].map((groupName) => {
            return this.groupItems.get(groupName); // 🔥 Dùng lại groupItem đã tạo
        });
    }
    addFileToTree(filePath) {
        const uri = vscode.Uri.file(filePath);
        // ❌ Không xử lý nếu không phải là file scheme 
        if (uri.scheme !== 'file') return;
        const groupName = this.getGroupName(filePath);
        if (!groupName) return;
        const folderName = path.basename(path.dirname(filePath));
        const item = new vscode.TreeItem(vscode.Uri.file(filePath), vscode.TreeItemCollapsibleState.None);
        item.resourceUri = vscode.Uri.file(filePath);
        item.contextValue = "file"; // Chỉ file mới có context menu
        item.description = `(${folderName})`;
        if (item.contextValue === 'file') {
            const openDoc = vscode.workspace.textDocuments.find(doc =>
                doc.uri.toString() === item.resourceUri.toString() && doc.isDirty
            );
            if (openDoc) {
                item.description =`(${folderName}) ●`; 
            }
        }
        item.command = {
            command: "vscode.open",
            arguments: [vscode.Uri.file(filePath)],
            title: "Mở file"
        };
        if (!this.treeData.has(groupName)) {
            const groupItem = new vscode.TreeItem(groupName, vscode.TreeItemCollapsibleState.Collapsed);
            groupItem.contextValue = "group";
            const groupPath = this.getGroupRootPath(filePath);
            
            if (groupPath) {
                groupItem.resourceUri = vscode.Uri.file(groupPath);
            } 
            groupItem.contextValue = "group";
            this.treeData.set(groupName, []);
            this.groupItems.set(groupName, groupItem); // 🔥 Lưu lại groupItem
        }
        this.treeData.get(groupName).push(item);
    }
    getGroupRootPath(filePath) {
        this.app_dataChecker.filePath = filePath;
        return this.app_dataChecker.getProjectPath();
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
        this.app_dataChecker.filePath = filePath;
        return this.app_dataChecker.getGroupName();
    }

    async refresh() {
       // await this.buildTree(); // Cập nhật dữ liệu
        await this.refreshEvent.fire();
    }
}

module.exports = TreeFileProvider;