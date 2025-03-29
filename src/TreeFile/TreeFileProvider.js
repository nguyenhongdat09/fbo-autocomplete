const vscode = require("vscode");
const path = require("path");

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
    run(context) { 
        // Khởi tạo tree view
        this.treeView = vscode.window.createTreeView("fbo_file", {
            treeDataProvider: this,
            dragAndDropController: this
        });
        // Lắng nghe sự kiện khi TreeView được hiển thị hoặc ẩn đi
        this.treeView.onDidChangeVisibility((e) => {
            if (e.visible) {
                //console.log("📌 Người dùng đã mở Activity Bar tab fbo_file!");
                const activeEditor = vscode.window.activeTextEditor;
                if (!activeEditor || !activeEditor.document) return;
                const filePath = activeEditor.document.uri.fsPath;
                const treeItem = this.getTreeItemByPath(filePath);
                const parentGroup = this.getParentGroup(treeItem);
                if (treeItem) {
                    setTimeout(() => {
                        if (parentGroup) {
                            this.treeView.reveal(parentGroup, { select: true, expand: true, focus: false }).then(() => {
                                this.treeView.reveal(treeItem, { select: true, expand: true, focus: false });
                            });
                        } else {
                            this.treeView.reveal(treeItem, { select: true, expand: true, focus: false });
                        }
                    }, 200);
                }
                this.refresh()
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
    getTreeItem(element) {
        return element;
    }

   
    async getChildren(element) {
        if (!element) {
            return [
                new vscode.TreeItem("Group of File By Project FBO", vscode.TreeItemCollapsibleState.Collapsed)
            ];
        } 
        // Nếu element là group thì trả về danh sách file
        if (element.label === "Group of File By Project FBO") {
            if (this.treeData.size === 0) {
                await this.buildTree();
            }
            return [...this.treeData.keys()].map(groupName =>
                new vscode.TreeItem(groupName, vscode.TreeItemCollapsibleState.Collapsed)
            );
        }
    
        return this.treeData.get(element.label) || [];
    }
    
    async buildTree() {
        this.treeData.clear();
        const openFiles = await this.getOpenEditors();
        openFiles.forEach(filePath => this.addFileToTree(filePath));
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
            this.treeData.set(groupName, []);
        }
        this.treeData.get(groupName).push(item);
    }


    async getOpenEditors() {
        const openTabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
        return openTabs
            .map(tab => (tab.input instanceof vscode.TabInputText ? tab.input.uri?.fsPath : null))
            .filter(filePath => filePath !== null);
    }

    async handleDrop(target, sources) {
        for (const source of sources) {
            var data = source[1].value;
            // Dữ liệu file được kéo vào (có thể chứa nhiều dòng)
            const filePaths = data.split("\n").map(line => line.trim()).filter(line => line);
            for (const filePath of filePaths) {
                try {
                    const uri = vscode.Uri.parse(filePath);
                    this.addFileToTree(uri.fsPath);
                    await vscode.window.showTextDocument(uri, { preview: false });
                    // 🌟 Trỏ vào file trong TreeView
                    setTimeout(async () => {
                        const treeItem = this.getTreeItemByPath(uri.fsPath);
                        const parentGroup = this.getParentGroup(treeItem);
                        if (parentGroup) {
                             // 📌 Mở rộng Group gốc nếu cần
                            const rootGroup = new vscode.TreeItem("Group of File By Project FBO", vscode.TreeItemCollapsibleState.Expanded);
                            await this.treeView.reveal(rootGroup, { select: false, expand: true });
                            console.log(parentGroup )
                            this.treeView.reveal(parentGroup, { select: true, expand: true })
                            // Kiểm tra nếu group chưa mở rộng thì mở rộng trước
                            if (treeItem) {
                                this.treeView.reveal(treeItem, { select: true, expand: true });
                            } 
                        }
                    }, 100);

                } catch (error) {
                    console.error("Lỗi parse URI:", error);
                }
            }
        }
        this.refresh();
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
        return index > 1 ? `${parts[index - 1]} - ${parts[index - 2]}` : 'Other';
    }
    async refresh() {
        await this.buildTree(); // Cập nhật dữ liệu
        this.refreshEvent.fire();
    }
}

module.exports = TreeFileProvider;