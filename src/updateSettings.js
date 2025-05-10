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
                const extensionPath = path.join(context.extensionPath, 'src', 'Database', 'XSD');
                const extensionPathMobile = path.join(context.extensionPath, 'src', 'Database', 'XSD', 'Mobile');
                // 🛑 Xóa toàn bộ "xml.fileAssociations"
                settings["xml.fileAssociations"] = [
                    { "pattern": "**/Controllers/Dir/*.xml", "systemId": path.join(extensionPath, "Dir.xsd") },
                    { "pattern": "**/Controllers/Filter/*.xml", "systemId": path.join(extensionPath, "Dir.xsd") },
                    { "pattern": "**/Controllers/Grid/*.xml", "systemId": path.join(extensionPath, "Grid.xsd") },
                    { "pattern": "**/Controllers/Report/*.xml", "systemId": path.join(extensionPath, "Report.xsd") },
                    { "pattern": "**/Upload/*.xml", "systemId": path.join(extensionPath, "Import.xsd") },
                    { "pattern": "**/Controllers/Dir/*.f", "systemId": path.join(extensionPath, "Dir.xsd") },
                    { "pattern": "**/Controllers/Grid/*.f", "systemId": path.join(extensionPath, "Grid.xsd") },
                    { "pattern": "**/Controllers/Filter/*.f", "systemId": path.join(extensionPath, "Dir.xsd") },
                    { "pattern": "**/FastAPI/*.xml", "systemId": path.join(extensionPath, "FastAPI.xsd") },
                    { "pattern": "**/Mobile/Filter/*.xml", "systemId": path.join(extensionPathMobile, "Filter.xsd") },
                    { "pattern": "**/Mobile/Dir/*.xml", "systemId": path.join(extensionPathMobile, "Dir.xsd") },
                    { "pattern": "**/Mobile/Grid/*.xml", "systemId": path.join(extensionPathMobile, "Grid.xsd") }
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