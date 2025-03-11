const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
class updateSettingsJson {
    getUserSettingsPath() {
        let appDataPath = '';
        
        if (process.platform === 'win32') {
            appDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'settings.json');
        } else if (process.platform === 'darwin') { // macOS
            appDataPath = path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json');
        } else { // Linux
            appDataPath = path.join(os.homedir(), '.config', 'Code', 'User', 'settings.json');
        }
    
        return appDataPath;
    }
    updateSettingsJson(context) {
        const settingsPath = this.getUserSettingsPath();
        
        if (!fs.existsSync(settingsPath)) {
            vscode.window.showErrorMessage("Không tìm thấy settings.json!");
            return;
        }
        fs.readFile(settingsPath, 'utf8', (err, data) => {
            if (err) {
                vscode.window.showErrorMessage("Không thể đọc settings.json!");
                return;
            }
    
            try {
                let settings = JSON.parse(data);
                // Lấy đường dẫn thư mục XSD trong extension
                const extensionPath = path.join(context.extensionPath, 'Database', 'XSD');
                // 🛑 Xóa toàn bộ "xml.fileAssociations"
                settings["xml.fileAssociations"] = [
                    { "pattern": "**/Dir/*.xml", "systemId": path.join(extensionPath, "Dir.xsd") },
                    { "pattern": "**/Filter/*.xml", "systemId": path.join(extensionPath, "Dir.xsd") },
                    { "pattern": "**/Grid/*.xml", "systemId": path.join(extensionPath, "Grid.xsd") },
                    { "pattern": "**/Report/*.xml", "systemId": path.join(extensionPath, "Report.xsd") },
                    { "pattern": "**/Upload/*.xml", "systemId": path.join(extensionPath, "Import.xsd") },
                    { "pattern": "**/Dir/*.f", "systemId": path.join(extensionPath, "Dir.xsd") },
                    { "pattern": "**/Grid/*.f", "systemId": path.join(extensionPath, "Grid.xsd") },
                    { "pattern": "**/FastAPI/*.xml", "systemId": path.join(extensionPath, "FastAPI.xsd") }
                ];
    
                // 📝 Ghi lại file settings.json với danh sách mới
                fs.writeFile(settingsPath, JSON.stringify(settings, null, 4), 'utf8', (err) => {
                    if (err) {
                        vscode.window.showErrorMessage("Lỗi khi ghi settings.json!");
                        console.error(err)
                    } else {
                        console.log("Cập nhật settings.json thành công!");
                    }
                });
    
            } catch (parseError) {
                console.error(parseError)
                vscode.window.showErrorMessage("Lỗi khi phân tích settings.json!");
            }
        });
    }

}

module.exports = updateSettingsJson;