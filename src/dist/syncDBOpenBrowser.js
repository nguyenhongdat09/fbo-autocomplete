const fs = require('fs');
const path = require('path');

class SyncDBOpenBrowser {
    constructor() {
         this.urlSync = '\\\\172.168.5.17\\Users\\DATNH\\Database\\OpenBrowser'
        /*
        this.anaXML = new AnalystXML();
        this.anaASPX = new AnalystASPX();
        this.anaXML.setPathDatabase();
        this.databasePath = this.anaXML.pathDatabaseOpenBrowser;
        */
    }
    //Hàm check urlSync có truy cập  được không 
    async checkAccessUrlSync() {
        try {
            await fs.promises.access(this.urlSync, fs.constants.R_OK | fs.constants.W_OK);
            return true;
        } catch (err) {
            console.error("Cannot access URL Sync:", err);
            return false;
        }
    }
    // Hàm quét tất cả các folder trong một đường dẫn cho trước
    async getAllProjectPaths(targetPath) {
        let projectPaths = [];
        if (!(await this.checkAccessUrlSync())) {
            return projectPaths;
        }
        try {
            const folders = await fs.promises.readdir(targetPath);
            for (const folder of folders) {
                const fullPath = path.join(targetPath, folder);
                const stat = await fs.promises.stat(fullPath);
                if (stat.isDirectory()) {
                    projectPaths.push(fullPath);
                }
            }
        } catch (err) {
            console.error("Error reading project paths:", err);
        }
        return projectPaths;
    }
    /*
    Hàm check xem có folder trùng với folder truyền vào không và check folder đó có file bên trong không
    */
    async checkFolderExistInProjectPaths(projectPaths, folderName) {
        for (const projectPath of projectPaths) {
            //Cắt folderName từ đường dẫn projectPath VD E:\Customize Extension\fbo-autocomplete\src\Database\OpenBrowser\CCI_FBI_FBISP24 thì lấy ra CCI_FBI_FBISP24
            const parts = projectPath.split(/[/\\]/);
            const lastPart = parts[parts.length - 1];
            if (lastPart === folderName) {
                // Tìm thấy folder, giờ check xem có file bên trong không
                try {
                    const entries = await fs.promises.readdir(projectPath, { withFileTypes: true });
                    // Check xem có ít nhất 1 file (không phải folder)
                    const hasFiles = entries.some(entry => entry.isFile());
                    return hasFiles; // Trả về true nếu có file, false nếu folder rỗng
                } catch (err) {
                    console.error(`Error reading folder ${projectPath}:`, err);
                    return false;
                }
            }
        }   
        return false; // Không tìm thấy folder
    }
    //Copy folder từ urlSync về local database hoặc ngược lại 
    async copyFolder(source, destination) {
        //Ví dụ E:\Customize Extension\fbo-autocomplete\src\Database\OpenBrowser\ có folder CCI_FBI_FBISP24 mà \\172.168.5.17\Users\DATNH\Database\OpenBrowser không có thì copy CCI_FBI_FBISP24 từ local database lên urlSync để \\172.168.5.17\Users\DATNH\Database\OpenBrowser có CCI_FBI_FBISP24 kết quả mong đợi \\172.168.5.17\Users\DATNH\Database\OpenBrowser\CCI_FBI_FBISP24
        try {
            const baseNames = path.basename(source);
            const baseNamed = path.basename(destination);
            var finalDestination =  destination;
            if(baseNamed !== baseNames){ 
                finalDestination = path.join(destination, baseNames)
            }
            if (!fs.existsSync(finalDestination)) {
                await fs.promises.mkdir(finalDestination, { recursive: true });
            }
            
            const entries = await fs.promises.readdir(source, { withFileTypes: true });
            
            for (let entry of entries) {
                const srcPath = path.join(source, entry.name);
                const destPath = path.join(finalDestination, entry.name);

                if (entry.isDirectory()) {
                    await this.copyFolderRecursive(srcPath, destPath);
                } else {
                    if (!fs.existsSync(path.dirname(destPath))) {
                        await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
                    }
                    await fs.promises.copyFile(srcPath, destPath);
                }
            }
            
            return true;
        } catch (err) {
            console.error("Error copying folder:", err);
            return false;
        }
    }
    
    // Hàm đệ quy để copy subfolder (không thêm baseName nữa)
    async copyFolderRecursive(source, destination) {
        try {
            // Tạo folder đích nếu chưa có
            if (!fs.existsSync(destination)) {
                await fs.promises.mkdir(destination, { recursive: true });
            }
            
            // Đọc tất cả entries trong source
            const entries = await fs.promises.readdir(source, { withFileTypes: true });
            
            for (let entry of entries) {
                const srcPath = path.join(source, entry.name);
                const destPath = path.join(destination, entry.name);

                if (entry.isDirectory()) {
                    await this.copyFolderRecursive(srcPath, destPath);
                } else {
                    await fs.promises.copyFile(srcPath, destPath);
                }
            }
        } catch (err) {
            console.error("Error copying folder recursively:", err);
        }
    }
}

module.exports = SyncDBOpenBrowser;