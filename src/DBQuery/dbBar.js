const vscode = require("vscode");
const path = require("path");
class DBStatusBarManager {
    constructor(context) {
        this.context = context;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.selectedDB = "App";  
        this.statusBarItem.text = `$(database) DB: ${this.selectedDB}`;
        this.statusBarItem.tooltip = "Chọn database để chạy SQL";
        this.statusBarItem.command = "fbo-autocomplete.selectDatabase"; // Gọi command khi click
        this.dbOptions = ['App', 'Sys']
    }
    show() {
        this.statusBarItem.show();
        this.context.subscriptions.push(this.statusBarItem);
        //
        let selectDbCommand = vscode.commands.registerCommand("fbo-autocomplete.selectDatabase", async () => { 
            const selected = await vscode.window.showQuickPick( this.dbOptions, {
                placeHolder: "Select Database" 
            });
            if (selected) {
                this.updateText(selected);
            }
        });
        this.context.subscriptions.push(selectDbCommand);
    } 
    updateText(newDB) {
        this.selectedDB = newDB;
        if (this.selectedDB === "App") {
            this.dbOptions = ['App', 'Sys']
        }else{
            this.dbOptions = ['Sys', 'App']
        }
        this.statusBarItem.text = `$(database) DB: ${this.selectedDB}`;
    }

    /**
     * Tìm folder cha của "App_Data" trong dự án hiện tại.
     * @returns {string | null} Đường dẫn folder trước "App_Data" hoặc null nếu không tìm thấy.
     */
    getProjectRootFolder() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) return null;

        const filePath = activeEditor.document.uri.fsPath;
        const parts = filePath.split(path.sep);
        
        const index = parts.findIndex(part => part.toLowerCase() === "app_data");
        if (index > 0) {
            return parts.slice(0, index).join(path.sep);
        }

        return null;
    } 
    dispose() {
        this.statusBarItem.dispose();
    }

    
}

module.exports = DBStatusBarManager;
