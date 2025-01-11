const axios = require('axios');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

class UpdateChecker {
    constructor(jsonFilePath) {
        this.jsonFilePath = jsonFilePath;
    }

    getCurrentVersion() {
        try {
            // Đọc file update.json để lấy phiên bản hiện tại
            const data = fs.readFileSync(this.jsonFilePath, 'utf8');
            const json = JSON.parse(data);
            return json.version; // Trả về phiên bản từ file update.json
        } catch (error) {
            console.error("Failed to read update.json:", error.message);
            return null;  // Trả về null nếu không thể đọc file
        }
    }

    async checkForUpdates() {
        const currentVersion = this.getCurrentVersion();
        if (!currentVersion) {
            vscode.window.showErrorMessage('Could not read the current version.');
            return;
        }

        try {
            // Gửi yêu cầu HTTP để lấy thông tin từ file update.json
            const response = await axios.get(this.updateUrl);
            const latestVersion = response.data.version;

            // So sánh phiên bản hiện tại với phiên bản mới nhất
            if (latestVersion !== currentVersion) {
                // Hiển thị thông báo cho người dùng về bản cập nhật
                const update = await vscode.window.showInformationMessage(
                    `A new version (${latestVersion}) of this extension is available!`,
                    "Update Now"
                );

                // Nếu người dùng nhấn "Update Now", mở liên kết để tải file .vsix
                if (update === "Update Now") {
                    vscode.env.openExternal(vscode.Uri.parse(response.data.downloadUrl));
                }
            }
        } catch (error) {
            console.error("Failed to check for updates:", error.message);
        }
    }
}

module.exports = UpdateChecker;
