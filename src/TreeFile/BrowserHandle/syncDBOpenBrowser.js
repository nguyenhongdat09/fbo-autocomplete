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
    checkAccessUrlSync() {
        try {
            fs.accessSync(this.urlSync, fs.constants.R_OK | fs.constants.W_OK);
            return true;
        } catch (err) {
            console.error("Cannot access URL Sync:", err);
            return false;
        }
    }
    // Hàm quét tất cả các folder trong một đường dẫn cho trước
    getAllProjectPaths(targetPath) {
        let projectPaths = [];
        if (!this.checkAccessUrlSync()) {
            return projectPaths;
        }
        try {
            const folders = fs.readdirSync(targetPath);
            folders.forEach(folder => {
                const fullPath = path.join(targetPath, folder);
                if (fs.statSync(fullPath).isDirectory()) {
                    projectPaths.push(fullPath);
                }
            });
        } catch (err) {
            console.error("Error reading project paths:", err);
        }
        return projectPaths;
    }
    /*
    Hàm check xem có folder trùng với folder truyền vào không và check folder đó có file bên trong không
    */
    checkFolderExistInProjectPaths(projectPaths, folderName) {
        for (const projectPath of projectPaths) {
            //Cắt folderName từ đường dẫn projectPath VD E:\Customize Extension\fbo-autocomplete\src\Database\OpenBrowser\CCI_FBI_FBISP24 thì lấy ra CCI_FBI_FBISP24
            const parts = projectPath.split(/[/\\]/);
            const lastPart = parts[parts.length - 1];
            if (lastPart === folderName) {
                // Tìm thấy folder, giờ check xem có file bên trong không
                try {
                    const entries = fs.readdirSync(projectPath, { withFileTypes: true });
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
    copyFolder(source, destination) {
        //Ví dụ E:\Customize Extension\fbo-autocomplete\src\Database\OpenBrowser\ có folder CCI_FBI_FBISP24 mà \\172.168.5.17\Users\DATNH\Database\OpenBrowser không có thì copy CCI_FBI_FBISP24 từ local database lên urlSync để \\172.168.5.17\Users\DATNH\Database\OpenBrowser có CCI_FBI_FBISP24 kết quả mong đợi \\172.168.5.17\Users\DATNH\Database\OpenBrowser\CCI_FBI_FBISP24
        try {
            const baseNames = path.basename(source);
            const baseNamed = path.basename(destination);
            var finalDestination =  destination;
            if(baseNamed !== baseNames){ 
                finalDestination = path.join(destination, baseNames)
            }
            if (!fs.existsSync(finalDestination)) {
                fs.mkdirSync(finalDestination, { recursive: true });
            }
            
            const entries = fs.readdirSync(source, { withFileTypes: true });
            
            for (let entry of entries) {
                const srcPath = path.join(source, entry.name);
                const destPath = path.join(finalDestination, entry.name);

                if (entry.isDirectory()) {
                    this.copyFolderRecursive(srcPath, destPath);
                } else {
                    if (!fs.existsSync(path.dirname(destPath))) {
                        fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    }
                    fs.copyFileSync(srcPath, destPath);
                }
            }
            
            return true;
        } catch (err) {
            console.error("Error copying folder:", err);
            return false;
        }
    }
    
    // Hàm đệ quy để copy subfolder (không thêm baseName nữa)
    copyFolderRecursive(source, destination) {
        try {
            // Tạo folder đích nếu chưa có
            if (!fs.existsSync(destination)) {
                fs.mkdirSync(destination, { recursive: true });
            }
            
            // Đọc tất cả entries trong source
            const entries = fs.readdirSync(source, { withFileTypes: true });
            
            for (let entry of entries) {
                const srcPath = path.join(source, entry.name);
                const destPath = path.join(destination, entry.name);

                if (entry.isDirectory()) {
                    this.copyFolderRecursive(srcPath, destPath);
                } else {
                    fs.copyFileSync(srcPath, destPath);
                }
            }
        } catch (err) {
            console.error("Error copying folder recursively:", err);
        }
    }
}

module.exports = SyncDBOpenBrowser;