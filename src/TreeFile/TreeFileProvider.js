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
         this.typeDr = "text/uri-list"
        // ⚡ Bổ sung để hỗ trợ Drag & Drop
        this.dropMimeTypes = [this.typeDr];
        this.dragMimeTypes = [this.typeDr]; 
        // 🌟 Lưu treeView để gọi `reveal()`
        this.treeView = null;
        this.groupItems = new Map(); // 🔥 Lưu groupItem có chứa resourceUri
        this.tree_helper = new TreeHelper(this)
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
        vscode.workspace.onDidChangeTextDocument( async () => {
            var cur_Item = this.tree_helper.getCurrentPathActive();
            this.refreshEvent.fire();
            await this.treeView.reveal(cur_Item.parentGroup, { select: false, expand: true });
            await this.tree_helper.revealActiveFile(cur_Item.parentGroup.label);
        });

        // 💾 Lắng nghe khi document được lưu lại
        vscode.workspace.onDidSaveTextDocument(() => {
            this.refresh();
        });
        vscode.window.onDidChangeVisibleTextEditors(async () => {
            this.refresh();
        });

        vscode.commands.registerCommand("fbo-autocomplete.reloadTree", async () => {
            if (this.treeView.visible) {
                this.refresh();
            }
        });
        vscode.commands.registerCommand("fbo-autocomplete.closeFile", async (element) => {
            await this.tree_helper.closeFile(element);
        });
        vscode.commands.registerCommand('fbo-autocomplete.closeGroupFiles', async (element) => {
            if (element && element.label) {
                await this.tree_helper.closeGroupFiles(element.label);
            }
        });
        vscode.window.onDidChangeActiveTextEditor( async (editor) => {
            if(!editor) return
            setTimeout(async () =>{
                const filePath = editor.document.uri.fsPath;
                const treeItem = this.tree_helper.getTreeItemByPath(filePath);
                if (!treeItem) return; // Tránh lỗi nếu file không có trong cây
                const parentGroup = this.tree_helper.getParentGroup(treeItem);
                await this.treeView.reveal(parentGroup, { select: false, expand: true });
                await this.tree_helper.revealActiveFile(parentGroup.label); 
            }, 100)
        });
        
        // Đăng ký lệnh reload tree
        let disposable = vscode.commands.registerCommand("fbo-autocomplete.TreeTabReload", () => {
            this.refresh();
            vscode.window.showInformationMessage("FBO File Tree đã được reload!");
        });
        // 👇 Bắt mỗi lần expand một node
        this.treeView.onDidExpandElement(async (event) => {
            const element = event.element;
            if (element.contextValue === "group") {
                // Gọi mỗi lần expand group
                await this.tree_helper.revealActiveFile(element.label);
            }
        });
         
        // Thêm vào subscriptions để tự động clean up khi extension bị tắt
        context.subscriptions.push(this.treeView, disposable);
    }
    
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!element) {
            return this.tree_helper.buildTree();
        }
        return this.treeData.get(element.label) || [];
    } 
    getParent(element) {
        if (!element) return null;
        // Nếu phần tử là file, trả về group chứa nó
        if (element.contextValue === "file") {
            return this.tree_helper.getParentGroup(element);
        }
        // Nếu là group, không có parent
        return null;
    }
    async refresh() {
        // await this.buildTree(); // Cập nhật dữ liệu
        this.tree_helper.parentSet = this;
        await this.refreshEvent.fire();
    }
    handleDrag(source, dataTransfer, token) {
        // Chỉ cho drag nếu tất cả item là file
        const filesOnly = source.every(item => item.contextValue === 'file');
        if (!filesOnly) {
            // Không cho kéo nếu có item không phải file
            return;
        }
        // Đặt dữ liệu kéo
        dataTransfer.set(this.typeDr, new vscode.DataTransferItem(source));
    }
    handleDrop(target, dataTransfer, token) {
        const droppedItems = dataTransfer.get(this.typeDr)?.value;
        if (!droppedItems) {
            console.log("❌ Không có item nào được thả vào.");
            return;
        }
        // 🧩 Lấy danh sách file được thả
        const droppedFiles = droppedItems.filter(item => item.contextValue === 'file');
        // 🧩 Tên group được thả vào
        const targetGroup = target?.label || 'Unknown';
        if (targetGroup != 'Unknown') {
            // console.log("📥 File(s) được thả vào:", targetGroup, target.resourceUri.fsPath);
            // droppedFiles.forEach((item, index) => {
            //     console.log(`  🔹 File ${index + 1}: ${item.resourceUri}`);
            // }); 
            var filePaths = droppedFiles.map(item => item.resourceUri.fsPath)
            try{
                this.app_dataChecker.pasteFilesToGroup(target.resourceUri.fsPath, filePaths);
            }
            catch(ex){
                console.log(ex)
            }
        } 
    
    }
    
}

class TreeHelper{
    constructor(parent){
        this.parent = parent;
        this.app_dataChecker = new app_dataChecker()
    }
   
    set parentSet(parent){
        this.parent = parent;
    }
    getGroupName(filePath) {
        this.app_dataChecker.filePath = filePath;
        return this.app_dataChecker.getGroupName();
    }
    
    getParentGroup(treeItem) {
        for (const [group, items] of this.parent.treeData) {
            if (items.includes(treeItem)) return new vscode.TreeItem(group, vscode.TreeItemCollapsibleState.Expanded);
        }
        return null;
    }

    getTreeItemByPath(filePath) {
        for (const [group, items] of this.parent.treeData) {
            const foundItem = items.find(item => item.resourceUri.fsPath === filePath);
            if (foundItem) return foundItem;
        }
        return null; // Không tìm thấy
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
    getGroupRootPath(filePath) {
        this.app_dataChecker.filePath = filePath;
        return this.app_dataChecker.getProjectPath();
    }
    
    async buildTree() {
        this.parent.treeData.clear();
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

        return [...this.parent.treeData.keys()].map((groupName) => {
            return this.parent.groupItems.get(groupName); // 🔥 Dùng lại groupItem đã tạo
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
                item.description = `(${folderName}) ●`;
            }
        }
        item.command = {
            command: "vscode.open",
            arguments: [vscode.Uri.file(filePath)],
            title: "Mở file"
        };
        if (!this.parent.treeData.has(groupName)) {
            const groupItem = new vscode.TreeItem(groupName, vscode.TreeItemCollapsibleState.Collapsed);
            groupItem.contextValue = "group";
            const groupPath = this.getGroupRootPath(filePath);

            if (groupPath) {
                groupItem.resourceUri = vscode.Uri.file(groupPath);
            }
            groupItem.contextValue = "group";
            this.parent.treeData.set(groupName, []);
            this.parent.groupItems.set(groupName, groupItem); // 🔥 Lưu lại groupItem
        }
        this.parent.treeData.get(groupName).push(item);
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
        await this.parent.refresh()
    }
    async closeGroupFiles(groupName) {
        if (!this.parent.treeData.has(groupName)) return;

        const files = this.parent.treeData.get(groupName).map(item => item.resourceUri.toString());
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

        await this.parent.refresh(); // Làm mới cây
    }
    getCurrentPathActive(){
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || !activeEditor.document) return;
        const filePath = activeEditor.document.uri.fsPath;
        const treeItem = this.getTreeItemByPath(filePath);
        if (!treeItem) return; // Tránh lỗi nếu file không có trong cây
        const parentGroup = this.getParentGroup(treeItem);
        return {filePath: filePath, treeItem: treeItem, parentGroup: parentGroup}
    }
    async revealActiveFile(group_label) {
        var cur_Item = this.getCurrentPathActive();
        if (cur_Item.parentGroup) {
            if (group_label != cur_Item.parentGroup.label) return
            try { 
                await this.parent.treeView.reveal(cur_Item.treeItem, { select: true, expand: false });
            } catch (error) {
                //console.error("❌ Lỗi khi reveal tree item:", error);
            } 
        }  
    } 
}

module.exports = TreeFileProvider;