const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const AnalystWebConfig = require("./analystWebConfig");
class DBStatusBarManager {
    // Singleton hiện tại (được gán trong constructor)
    static current = null;
    constructor(context) {
        this.context = context;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.pinStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        this.selectedDB = "";  
        this.isPinned = !!context.workspaceState.get("fbo.dbStatusBar.pinned", false);
        this.statusBarItem.text = `$(database) DB: ${this.selectedDB}`;
        this.statusBarItem.tooltip = "Chọn database để chạy SQL";
        this.statusBarItem.command = "fbo-autocomplete.selectDatabase"; // Gọi command khi click
        this.dbOptions = [];
        this.groupItems = new Map();
        // Lưu snapshot gần nhất của groupItems để tránh reload 2 lần liên tục
        this.groupItems_old = new Map();
        // Lưu AnalystWebConfig theo group label
        this.listAnalystWebConfig = new Map();
        // Thông tin DB đang được chọn (group, loại app/sys, connection)
        this.dbInfoSelected = null;

        // Lưu singleton hiện tại để chỗ khác có thể truy cập (Sql runner)
        DBStatusBarManager.current = this;
    }
     
    async show() {  
        this.statusBarItem.show();
        this._renderPinStatusBar();
        this.pinStatusBarItem.show();
        this.context.subscriptions.push(this.statusBarItem);
        this.context.subscriptions.push(this.pinStatusBarItem);
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

        const togglePinCommand = vscode.commands.registerCommand("fbo-autocomplete.togglePinDatabase", async () => {
            this.isPinned = !this.isPinned;
            await this.context.workspaceState.update("fbo.dbStatusBar.pinned", this.isPinned);
            this._renderPinStatusBar();
            vscode.window.setStatusBarMessage(
                this.isPinned ? "FBO DB: Đã ghim DB hiện tại" : "FBO DB: Đã bỏ ghim DB",
                1800
            );
        });
        this.context.subscriptions.push(togglePinCommand);
    } 

    updateText(newDB) {
        this.selectedDB = newDB;
        // Đưa DB đang chọn lên đầu danh sách, giữ nguyên thứ tự các phần tử còn lại
        if (Array.isArray(this.dbOptions) && this.dbOptions.length > 0) {
            this.dbOptions = [newDB, ...this.dbOptions.filter(o => o !== newDB)];
        }
        this.statusBarItem.text = `$(database) DB: ${this.selectedDB}`;
        // Cập nhật lại thông tin DB đang chọn
        this.updateDbInfoSelected();
    }

    /**
     * Tự đổi DB theo group của XML khi đổi tab.
     * Nếu đang pin thì bỏ qua để giữ nguyên DB hiện tại.
     */
    tryAutoUpdateText(newDB) {
        if (this.isPinned) {
            return false;
        }
        this.updateText(newDB);
        return true;
    }

    /**
     * Reload lại danh sách dbOptions dựa trên groupItems.
     * Mỗi group (item.label) sẽ sinh ra 2 lựa chọn:
     *   "<label> (App)" và "<label> (Sys)"
     * Ví dụ: "HUNGTHINH_FBO - R2SP2254 (App)", "HUNGTHINH_FBO - R2SP2254 (Sys)"
     */
    async reloadDbOptionsFromGroups() {
        // So sánh groupItems hiện tại với snapshot cũ, nếu không đổi thì bỏ qua
        if (this.groupItems && this.groupItems_old) {
            const sameSize = this.groupItems.size === this.groupItems_old.size;
            let isSame = sameSize;
            if (sameSize) {
                for (const [key, item] of this.groupItems.entries()) {
                    const oldItem = this.groupItems_old.get(key);
                    const newLabel = item && item.label ? item.label : null;
                    const oldLabel = oldItem && oldItem.label ? oldItem.label : null;
                    if (newLabel !== oldLabel) {
                        isSame = false;
                        break;
                    }
                }
            }
            if (isSame) {
                return; // Không thay đổi gì, không cần build lại dbOptions
            }
        }

        // Nếu chưa có groupItems thì fallback về App/Sys đơn giản
        if (!this.groupItems || this.groupItems.size === 0) {
            this.dbOptions = [];
            return;
        }
        const options = [];
        const load_tasks = [];
        // groupItems là Map<string, TreeItem>, mỗi TreeItem có label & resourceUri
        this.groupItems.forEach((groupItem) => {
            if (!groupItem || !groupItem.label) {
                return;
            }
            if (!groupItem.resourceUri || typeof groupItem.resourceUri.fsPath !== "string") {
                console.warn("[FBO dbBar] Bỏ qua groupItem thiếu resourceUri.fsPath:", groupItem.label);
                return;
            }
            const webConfigPath = path.join(groupItem.resourceUri.fsPath, "Web.config");
            if (fs.existsSync(webConfigPath)) {
                const group_label = groupItem.label;
                load_tasks.push((async () => {
                    const analystWebConfig = new AnalystWebConfig();
                    await analystWebConfig.loadConfig(webConfigPath);
                    this.listAnalystWebConfig.set(group_label, analystWebConfig);
                })().catch((err) => {
                    console.error(`[FBO dbBar] loadConfig lỗi (${groupItem.label}):`, err && err.message);
                }));
            }
            const baseLabel = groupItem.label; // VD: "HUNGTHINH_FBO - R2SP2254"
            options.push(`${baseLabel} (App)`);
            options.push(`${baseLabel} (Sys)`);
        });

        if (load_tasks.length > 0) {
            await Promise.all(load_tasks);
        }

        this.dbOptions = options;
        // Cập nhật snapshot groupItems mới nhất
        this.groupItems_old = new Map(this.groupItems);

        // Nếu chưa có selectedDB thì chọn item đầu tiên
        if (!this.selectedDB && this.dbOptions.length > 0) {
            this.selectedDB = this.dbOptions[0];
        }
        // Đồng bộ lại status bar và thông tin DB đang chọn
        try {
            this.updateText(this.selectedDB);
        } catch (e) {
            console.error("[FBO dbBar] updateText error:", e);
            console.error("[FBO dbBar] stack:", e && e.stack);
            throw e;
        }
    }

    /**
     * Cập nhật thông tin kết nối DB đang chọn vào dbInfoSelected
     * Dựa trên selectedDB và listAnalystWebConfig
     */
    updateDbInfoSelected() {
        this.dbInfoSelected = null;
        if (!this.selectedDB) return;

        let label = this.selectedDB;
        let dbType = null; // 'app' hoặc 'sys'
        let groupLabel = null;

        // Trường hợp mới: "<GROUP_LABEL> (App)" hoặc "<GROUP_LABEL> (Sys)"
        const match = label.match(/^(.*)\s+\((App|Sys)\)$/i);
        if (match) {
            groupLabel = match[1];
            dbType = match[2].toLowerCase(); // app/sys
        } else {
            // Trường hợp cũ: chỉ "App" hoặc "Sys"
            if (/^App$/i.test(label)) dbType = "app";
            if (/^Sys$/i.test(label)) dbType = "sys";
            // Nếu chỉ có 1 group trong listAnalystWebConfig thì lấy group đó
            if (dbType && this.listAnalystWebConfig && this.listAnalystWebConfig.size === 1) {
                const firstEntry = this.listAnalystWebConfig.entries().next().value;
                if (firstEntry) {
                    groupLabel = firstEntry[0];
                }
            }
        }

        if (!dbType || !groupLabel) return;

        const analyst = this.listAnalystWebConfig.get(groupLabel);
        if (!analyst || !analyst.dbConnections || !analyst.dbConnections[dbType]) return;

        const conn = analyst.dbConnections[dbType];

        this.dbInfoSelected = {
            groupLabel,
            dbType,
            connection: conn
        };
    }

    dispose() {
        this.statusBarItem.dispose();
        this.pinStatusBarItem.dispose();
    }

    _renderPinStatusBar() {
        if (!this.pinStatusBarItem) {
            return;
        }
        this.pinStatusBarItem.text = this.isPinned
            ? "$(lock)"
            : "$(unlock)";
        this.pinStatusBarItem.tooltip = this.isPinned
            ? "DB đang được ghim. Bấm để bỏ ghim và cho phép tự đổi theo XML group."
            : "DB tự đổi theo XML group. Bấm để ghim DB hiện tại.";
        this.pinStatusBarItem.command = "fbo-autocomplete.togglePinDatabase";
    }

    
}

module.exports = DBStatusBarManager;
