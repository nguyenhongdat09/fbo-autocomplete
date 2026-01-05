const vscode = require("vscode");
const fs = require("fs");
class AnalystASPX {
    constructor() {
    }
    //Tạo hàm lấy url từ file đang đứng 
    getUrlFromFilePath(filePath, folderPlus) {
        //Xét đường dẫn có dạng  phần folder CustomerPro trở lên
        const pathParts = filePath.split(/[/\\]/);
        const customerProIndex = pathParts.findIndex(part => part.toLowerCase() === 'customerpro');
        if (customerProIndex === -1 || customerProIndex + 1 >= pathParts.length) {
            return null; // Không tìm thấy folder CustomerPro hoặc không có phần sau nó
        }
        //\\172.168.5.14\CustomerPro\FBI\THW\SP229\App_Data\Controllers\Grid\DCDetail.xml
        //Cắt đường dần từ App_Data trở đi VD: \\172.168.5.14\CustomerPro\FBI\THW\SP229\
        var relevantParts = pathParts.slice(0, customerProIndex + 4); // Lấy đến phần  SP229
        relevantParts = relevantParts.concat(folderPlus);
        const projectPath = relevantParts.join("\\");
        //Check xem projectPath có phải là đường dẫn có thật không
        if (!fs.existsSync(projectPath)) {
            console.log("Project path does not exist:", projectPath);
            return null;
        }
        return projectPath;
    }
    getAllASSPXFiles(projectPath) {
        const mainDir = projectPath;
        let aspxFiles = []; // Mảng lưu trữ các file .aspx
        
        function readDirectoryRecursively(dir) {
            try {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const fullPath = `${dir}\\${file}`;
                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.isDirectory()) {
                            readDirectoryRecursively(fullPath); // Đệ quy nếu là thư mục
                        } else if (stat.isFile() && file.toLowerCase().endsWith('.aspx')) {
                            aspxFiles.push(fullPath); // Thêm file .aspx vào mảng
                        }
                    } catch (statError) {
                        // Bỏ qua file/folder không đọc được (permission, symlink, etc.)
                    }
                }
            } catch (readError) {
                // Bỏ qua folder không đọc được
            }
        }
        
        readDirectoryRecursively(mainDir);
        return aspxFiles;
    }
    //Phân tích từng file aspx để lấy các thông tin cần thiết
    processingASPXFile(filePath) {
        try {
            const fileName = filePath.split(/[/\\]/).pop();
            
            // Đọc file dạng Buffer để detect encoding
            const buffer = fs.readFileSync(filePath);
            let content;
            
            // Check BOM để xác định encoding
            // UTF-16 LE BOM: FF FE
            // UTF-8 BOM: EF BB BF
            if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
                // UTF-16 LE
                content = buffer.toString('utf16le');
            } else if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
                // UTF-8 with BOM
                content = buffer.toString('utf-8');
            } else {
                // Default UTF-8 hoặc thử cả UTF-16 LE nếu không match
                content = buffer.toString('utf-8');
            }
            
            // Tìm trong ASPX có thẻ lấy ra nội dung bên trong Controller VD: <FastBusiness:ReportExtender ID="MainReport" runat="server" TargetControlID="panelReport" ReadOnly="true" Controller="DTTran"/>  thì lấy ra DTTran nếu không có thì bỏ qua file đó 
            //Trả về tên file aspx và tên controller ví dụ {aspx: test.aspx, controller: DTTran}
            let controllerMatch = content.match(/Controller=["']([^"']+)["']/);
            
            // Nếu không match và chưa thử UTF-16 LE, thử lại với UTF-16 LE
            if (!controllerMatch && buffer[0] !== 0xFF) {
                content = buffer.toString('utf16le');
                controllerMatch = content.match(/Controller=["']([^"']+)["']/);
            }
            
            if (controllerMatch) {
                const controllerName = controllerMatch[1];
                //đổi filePath thành tên file aspx
                return {
                    aspx: fileName,
                    controller: controllerName
                };
            }
            return null;
        } catch (error) {
            return null;
        }
    }
    // hàm gọi getAllASSPXFiles và xử lý từng file aspx
    processAllASPXFiles(projectPath) {
        const aspxFiles = this.getAllASSPXFiles(projectPath);
        const results = aspxFiles.map(filePath => this.processingASPXFile(filePath)).filter(result => result !== null);
        return results;
    }

    run(filePath) { 
        const projectPath = this.getUrlFromFilePath(filePath, ['Main']);  
        var results = this.processAllASPXFiles(projectPath);
        return results;
    }
}

module.exports = AnalystASPX;
