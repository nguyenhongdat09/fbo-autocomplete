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
        let basePath = relevantParts.join("\\");
        
        try {
            const ProjectMappingHelper = require('../../Database/ProjectMappingHelper');
            basePath = ProjectMappingHelper.getActualRoot(basePath);
        } catch (e) {}
        
        const projectPath = require('path').join(basePath, ...folderPlus);
        //Check xem projectPath có phải là đường dẫn có thật không
        if (!fs.existsSync(projectPath)) {
            console.log("Project path does not exist:", projectPath);
            return null;
        }
        return projectPath;
    }
    async getAllASSPXFiles(projectPath) {
        const mainDir = projectPath;
        let aspxFiles = []; // Mảng lưu trữ các file .aspx
        
        async function readDirectoryRecursively(dir) {
            try {
                const files = await fs.promises.readdir(dir);
                for (const file of files) {
                    const fullPath = `${dir}\\${file}`;
                    try {
                        const stat = await fs.promises.stat(fullPath);
                        //if fullpath la \\172.168.5.14\CustomerPro\FBI\LUMOS\R2SP223\Main\Z02Tran.aspx thi log ra 
                       
                        if (stat.isDirectory()) {
                            await readDirectoryRecursively(fullPath); // Đệ quy nếu là thư mục
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
        
        await readDirectoryRecursively(mainDir);
        
        return aspxFiles;
    }
    //Phân tích từng file aspx để lấy các thông tin cần thiết
    async processingASPXFile(filePath) {
        try {
            const fileName = filePath.split(/[/\\]/).pop();
            
            // Đọc file dạng Buffer để detect encoding
            const buffer = await fs.promises.readFile(filePath);
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
            
            // Tìm Controller trong ASPX.
            // Ưu tiên thẻ <FastBusiness:ReportExtender ... Controller="..."/>
            // Nếu không có thì fallback sang tìm bất kỳ attribute Controller="..."
            // Trả về tên file aspx và tên controller ví dụ {aspx: test.aspx, controller: DTTran}

            let controllerName = null;

            // Try FastBusiness:ReportExtender first (case-insensitive)
            let reportExtenderMatch = content.match(/<FastBusiness:ReportExtender\b[^>]*Controller=["']([^"']+)["'][^>]*>/i);
            if (reportExtenderMatch) {
                controllerName = reportExtenderMatch[1];
            }

            // Fallback: any Controller="..."
            if (!controllerName) {
                const controllerMatch = content.match(/Controller=["']([^"']+)["']/);
                if (controllerMatch) controllerName = controllerMatch[1];
            }

            // Nếu chưa tìm được và chưa thử UTF-16 LE, thử lại với UTF-16 LE encoding
            if (!controllerName && buffer[0] !== 0xFF) {
                content = buffer.toString('utf16le');

                reportExtenderMatch = content.match(/<FastBusiness:ReportExtender\b[^>]*Controller=["']([^"']+)["'][^>]*>/i);
                if (reportExtenderMatch) {
                    controllerName = reportExtenderMatch[1];
                }

                if (!controllerName) {
                    const controllerMatch2 = content.match(/Controller=["']([^"']+)["']/);
                    if (controllerMatch2) controllerName = controllerMatch2[1];
                }
            }

            if (controllerName) {
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
    async processAllASPXFiles(projectPath) {
        var aspxFiles = await this.getAllASSPXFiles(projectPath);
        //Chỉ lấy aspx cactbpc để test 
     //   aspxFiles = aspxFiles.filter(filePath => filePath.toLowerCase().includes('z02tran.aspx'));
        const results = await Promise.all(aspxFiles.map(filePath => this.processingASPXFile(filePath)));
        return results.filter(result => result !== null);
    }

    async run(filePath) { 
        const projectPath = this.getUrlFromFilePath(filePath, ['Main']);  
        var results = await this.processAllASPXFiles(projectPath);
        return results;
    }
}

module.exports = AnalystASPX;
