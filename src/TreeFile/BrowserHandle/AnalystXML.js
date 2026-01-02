const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const AnalystASPX = require("./AnalystASPX");

class AnalystXML {
    constructor() {
        this.anl = new AnalystASPX();
        this.dir = ['App_Data', 'Controllers', 'Dir'];
        this.grid = ['App_Data', 'Controllers', 'Grid'];
        this.filter = ['App_Data', 'Controllers', 'Filter'];
        this.report = ['App_Data', 'Controllers', 'Report'];
        this.upload = ['App_Data', 'Controllers', 'Templates', 'Upload'];
        this.json_save_name = 'file_xml_to_aspx_info.json';
        this.fileSaveListener = null; // Lưu listener để cleanup sau này
        this.fileOpenListener = null; // Lưu listener cho sự kiện mở file
    }
    //Lấy từ phần từ trong results VD : phân tử nó là {aspx: 'query_sothk.aspx', controller: 'QuerySalesSummaryByPeriod'} thì lấy controller để tìm file XML tương ứng trong các folder App_Data\Controllers\Dir, App_Data\Controllers\Grid, App_Data\Controllers\Filter, App_Data\Controllers\Report, App_Data\Controllers\Templates\Upload
    findXMLFilesForControllers(filePath, results) {
        var folders = [this.dir, this.filter, this.report, this.upload];
        var aspx_xml = [];
        results.forEach(item => {
            var controllerName = item.controller;
            var aspxName = item.aspx, fileXMLUrl = '';
            folders.forEach(folder => {
                var pathIncludeXML = this.anl.getUrlFromFilePath(filePath, folder);
                var fileXML = this.confirmExistsXML(aspxName, controllerName, pathIncludeXML);
                if (fileXML) {
                    aspx_xml.push(fileXML);
                    fileXMLUrl = fileXML.xmlPath;
                } else
                    fileXMLUrl = '';

                //Chỉ chạy đoạn này nếu là Dir, Grid, Filter 
                if ([this.dir, this.filter].includes(folder) && fileXMLUrl !== '') {
                    var contentXML = fs.readFileSync(fileXMLUrl, 'utf-8');
                    var DetailXML = this.regexAnalyzeXMLDetail(aspxName, pathIncludeXML, contentXML);
                    aspx_xml = aspx_xml.concat(DetailXML);
                }

                if (folder === this.filter && fileXMLUrl !== '') {
                    var ImportFormXML = this.regexAnalyzeXMLImportForm(aspxName, fileXMLUrl);
                    aspx_xml = aspx_xml.concat(ImportFormXML);
                    if (ImportFormXML.length > 0)
                        console.log("ImportFormXML:", ImportFormXML);
                }
            });
        })
        //loop aspx_xml để loại bỏ các phần tử trùng lặp dựa trên aspxName và xmlPath
        aspx_xml = aspx_xml.filter((item, index, self) =>
            index === self.findIndex((t) => (t.aspxName === item.aspxName && t.xmlPath === item.xmlPath))
        );
        var aspx_xml2 = aspx_xml
        //loop aspx_xml để chạy hàm regexAnalyzeXMLShowForm cho từng phần tử
        aspx_xml2.forEach(item => {
            var pathIncludeXML = this.anl.getUrlFromFilePath(item.xmlPath, this.grid);
            var contentXML = fs.readFileSync(item.xmlPath, 'utf-8');
            var showFormResults = this.regexAnalyzeXMLShowForm(item.aspxName, pathIncludeXML, contentXML);
            aspx_xml = aspx_xml.concat(showFormResults);
        });
        //Loại thêm các phần tử trùng lặp lần nữa
        aspx_xml = aspx_xml.filter((item, index, self) =>
            index === self.findIndex((t) => (t.aspxName === item.aspxName && t.xmlPath === item.xmlPath))
        );
        return aspx_xml;
    }

    //Hàm phân tích từng file xml để regex lấy ra các thông tin cần thiết
    regexAnalyzeXMLDetail(aspxName, folderPath, contentXML) {
        /*
        Regex <items style="Grid" controller="SVDetail" row="1"> lấy ra controller SVDetail yếu tố chính là thẻ items style="Grid"
        Sau đó nối pathIncludeXMLGrid + controllerName + .xml để lấy file xml tương ứng ví dụ .pathIncludeXMLGrid + \SVDetail.xml
        */
        var pathIncludeXMLGrid = this.anl.getUrlFromFilePath(folderPath, this.grid);
        const itemsRegex = /<items\s+style=["']Grid["']\s+controller=["']([^"']+)["']/g;

        var results = [];
        var match;
        while ((match = itemsRegex.exec(contentXML)) !== null) {
            var controllerName = match[1];
            var xmlFilePath = `${pathIncludeXMLGrid}\\${controllerName}.xml`;

            if (fs.existsSync(xmlFilePath)) {
                results.push({
                    aspxName: aspxName,
                    xmlPath: xmlFilePath
                });
            }
        }
        return results;
    }

    regexAnalyzeXMLShowForm(aspxName, folderPath, contentXML) {
        /*
        
        Regex showForm('ViewReceiptFilter') lấy ra ViewReceiptFilter yếu tố chính là .showForm('...') ví dụ g.showForm('LTBPO1Filter'); thì lấy ra LTBPO1Filter
        Sau đó nối pathIncludeXMLFilter + controllerName + .xml để lấy file xml tương ứng ví dụ .pathIncludeXMLFilter + \ViewReceiptFilter.xml
        */
        var pathIncludeXMLFilter = this.anl.getUrlFromFilePath(folderPath, this.filter);
        const showFormRegex = /\.showForm\(['"]([^'"]+)['"]\)/g;

        var results = [];
        var match;
        while ((match = showFormRegex.exec(contentXML)) !== null) {
            var controllerName = match[1];
            //console.log(` fileXMLUrl: ${filePath}` , ` controllerName: ${controllerName}`);
            var xmlFilePath = `${pathIncludeXMLFilter}\\${controllerName}.xml`;
            var excludeController = ['fsdGallerManager'];

            if (fs.existsSync(xmlFilePath) && !excludeController.includes(controllerName)) {
                results.push({
                    aspxName: aspxName,
                    xmlPath: xmlFilePath
                });
                var formExtractDataResults = this.regexAnalyzeXMLFormExtractData(aspxName, xmlFilePath);
                results = results.concat(formExtractDataResults);
            }
        }
        return results;
    }
    regexAnalyzeXMLFormExtractData(aspxName, xmlFilePath) {
        const pathParts = xmlFilePath.split(/[/\\]/);
        const fileName = pathParts.pop();
        const folderPath = pathParts.join("\\");
        const results = [];

        if (!fileName.endsWith('Filter.xml')) {
            return results;
        }

        const suffixes = [
            { suffix: ['MultiForm.xml', 'Form.xml'], folder: 'Filter' },
            { suffix: ['MultiGrid.xml', 'Grid.xml'], folder: 'Grid' },
            { suffix: ['Lookup.xml'], folder: 'Lookup' }
        ];

        suffixes.forEach(({ suffix, folder }) => {
            suffix.forEach(suf => {
                const baseName = fileName.replace('Filter.xml', suf);
                const newPath = `${folderPath.replace('Filter', folder)}\\${baseName}`;
                if (fs.existsSync(newPath)) {
                    results.push({ aspxName, xmlPath: newPath });
                }
            });
        });

        return results;
    }




    regexAnalyzeXMLImportForm(aspxName, filePathXML) {
        /*
        Cắt cái tên file xml từ filePathXML rồi lấy đường dẫn folder  ra thành 2 phần name là a.xml và folder là \\folder\subfolder
        Tạo tên folder mới là aImportForm.xml rồi nối ngược lại với folder để thành đường dẫn mới
        Kiểm tra file có tồn tại không, nếu có thì trả về object {aspxName, xmlPath}
        */
        var pathParts = filePathXML.split(/[/\\]/);
        var fileName = pathParts.pop(); // Lấy tên file
        var folderPath = pathParts.join("\\"); // Lấy đường dẫn folder
        var baseName = fileName.replace('.xml', 'ImportForm.xml');
        var importFormPath = `${folderPath}\\${baseName}`;
        var results = [];
        if (fs.existsSync(importFormPath)) {
            results.push({
                aspxName: aspxName,
                xmlPath: importFormPath
            });
        }
        return results;
    }


    confirmExistsXML(aspxName, controllerName, pathIncludeXML) {
        var xmlFilePath = `${pathIncludeXML}\\${controllerName}.xml`;
        //file path = \\172.168.5.14\CustomerPro\FBI\THW\SP229\App_Data\Controllers\Dir\ActiveUsers.xml then log it 
        if (!fs.existsSync(xmlFilePath)) {
            return null;
        }
        return {
            aspxName: aspxName,
            xmlPath: xmlFilePath
        }
    }

    /**
     * Trích xuất tên project từ đường dẫn XML
     * @param {string} xmlFilePath - Đường dẫn đến file XML
     * @returns {string|null} - Tên project hoặc null nếu không hợp lệ
     * 
     * Ví dụ:
     * Input: \\172.168.5.14\CustomerPro\FBI\EPLUS_FBI\FBISP24\App_Data\Controllers\Dir\LTBTran.xml
     * Output: EPLUS_FBI_FBISP24
     */
    extractProjectName(xmlFilePath) {
        // Chuẩn hóa đường dẫn (chuyển / thành \)
        const normalizedPath = xmlFilePath.replace(/\//g, '\\');

        // Kiểm tra có chứa CustomerPro không
        if (!normalizedPath.includes('CustomerPro')) {
            return null;
        }

        // Tách đường dẫn thành mảng các folder
        const parts = normalizedPath.split('\\');

        // Tìm vị trí của CustomerPro
        const customerProIndex = parts.findIndex(part => part === 'CustomerPro');

        if (customerProIndex === -1) {
            return null;
        }

        // Lấy folder con thứ 2 và thứ 3 sau CustomerPro (bỏ qua folder con thứ 1)
        const folder2 = parts[customerProIndex + 2]; // EPLUS_FBI
        const folder3 = parts[customerProIndex + 3]; // FBISP24

        if (!folder2 || !folder3) {
            return null;
        }

        // Nối lại với dấu gạch dưới
        return `${folder2}_${folder3}`;
    }

    /**
     * Tạo folder trong Database của extension để lưu các file XML đã phân tích
     * @param {string} xmlFilePath - Đường dẫn đến file XML
     * @returns {string|null} - Đường dẫn đến folder đã tạo hoặc null nếu thất bại
     */
    createProjectFolder(xmlFilePath) {
        // Trích xuất tên project
        const projectName = this.extractProjectName(xmlFilePath);
        if (!projectName) {
            return null;
        }
        // Lấy đường dẫn đến folder Database của extension
        const extensionPath = vscode.extensions.getExtension('fbo-autocomplete')?.extensionPath
            || path.join(__dirname, '..', '..', '..');
        const databasePath = path.join(extensionPath, 'src', 'Database');

        // Tạo đường dẫn đến folder project
        const projectFolderPath = path.join(databasePath, projectName);

        try {
            // Tạo folder Database nếu chưa có
            if (!fs.existsSync(databasePath)) {
                fs.mkdirSync(databasePath, { recursive: true });
            }

            // Tạo folder project nếu chưa có
            if (!fs.existsSync(projectFolderPath)) {
                fs.mkdirSync(projectFolderPath, { recursive: true });
            }
            return projectFolderPath;
        } catch (error) {
            vscode.window.showErrorMessage(`Lỗi khi tạo folder: ${error.message}`);
            return null;
        }
    }

    /**
     * Lưu xmlResults vào file JSON để tra cứu sau này
     * @param {string} projectFolderPath - Đường dẫn đến folder project
     * @param {Array} xmlResults - Mảng kết quả XML [{aspxName, xmlPath}, ...]
     * @returns {boolean} - true nếu thành công, false nếu thất bại
     */
    saveXmlResultsToJson(projectFolderPath, xmlResults) {
        if (!projectFolderPath || !xmlResults) {
            return false;
        }

        try {
            const jsonFilePath = path.join(projectFolderPath, this.json_save_name);
            // Tạo object map để tra cứu nhanh theo xmlPath
            const xmlPathMap = {};
            xmlResults.forEach(item => {
                // Chuẩn hóa đường dẫn để làm key
                const normalizedPath = item.xmlPath.replace(/\//g, '\\');
                xmlPathMap[normalizedPath] = {
                    aspxName: item.aspxName,
                    xmlPath: item.xmlPath
                };
            });
            // Cấu trúc JSON bao gồm cả mảng gốc và map để tra cứu
            const jsonData = {
                timestamp: new Date().toISOString(),
                totalFiles: xmlResults.length,
                xmlList: xmlResults, // Mảng gốc để duyệt
                xmlPathMap: xmlPathMap // Map để tra cứu nhanh
            };

            fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf-8');
            console.log(`Đã lưu ${xmlResults.length} file XML vào ${jsonFilePath}`);
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Lỗi khi lưu JSON: ${error.message}`);
            return false;
        }
    }

    /**
     * Tra cứu aspxName dựa vào xmlPath từ file JSON
     * @param {string} xmlFilePath - Đường dẫn đến file XML cần tra cứu
     * @returns {string|null} - aspxName hoặc null nếu không tìm thấy
     */
    lookupAspxNameByXmlPath(xmlFilePath) {
        const projectFolderPath = this.createProjectFolder(xmlFilePath);
        if (!projectFolderPath) {
            return null;
        }
        try {
            const jsonFilePath = path.join(projectFolderPath, this.json_save_name);
            if (!fs.existsSync(jsonFilePath)) {
                console.log('File JSON chưa được tạo. Vui lòng chạy phân tích trước.');
                return null;
            }
            const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
            const normalizedPath = xmlFilePath.replace(/\//g, '\\');
            // Tra cứu từ map
            if (jsonData.xmlPathMap && jsonData.xmlPathMap[normalizedPath]) {
                return jsonData.xmlPathMap[normalizedPath].aspxName;
            }
            // Fallback: tìm trong mảng nếu map không có
            if (jsonData.xmlList) {
                const found = jsonData.xmlList.find(item =>
                    item.xmlPath.replace(/\//g, '\\') === normalizedPath
                );
                return found ? found.aspxName : null;
            }
            return null;
        } catch (error) {
            vscode.window.showErrorMessage(`Lỗi khi tra cứu JSON: ${error.message}`);
            return null;
        }
    }

    /**
     * Lấy toàn bộ danh sách XML từ file JSON
     * @param {string} xmlFilePath - Đường dẫn bất kỳ trong project
     * @returns {Array|null} - Mảng xmlResults hoặc null nếu không tìm thấy
     */
    getAllXmlResultsFromJson(xmlFilePath) {
        const projectFolderPath = this.createProjectFolder(xmlFilePath);
        if (!projectFolderPath) {
            return null;
        }
        try {
            const jsonFilePath = path.join(projectFolderPath, this.json_save_name);

            if (!fs.existsSync(jsonFilePath)) {
                return null;
            }
            const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
            return jsonData.xmlList || [];
        } catch (error) {
            vscode.window.showErrorMessage(`Lỗi khi đọc JSON: ${error.message}`);
            return null;
        }
    }

    /**
     * Cập nhật JSON với các xmlPath mới tìm được
     * @param {string} projectFolderPath - Đường dẫn đến folder project
     * @param {string} aspxName - Tên file aspx
     * @param {Array} newXmlPaths - Mảng các xmlPath mới [{aspxName, xmlPath}]
     * @returns {boolean} - true nếu thành công
     */
    updateJsonWithNewXmlPaths(projectFolderPath, aspxName, newXmlPaths) {
        if (!projectFolderPath || !aspxName || !newXmlPaths || newXmlPaths.length === 0) {
            return false;
        }
        try {
            const jsonFilePath = path.join(projectFolderPath, this.json_save_name);

            // Đọc JSON hiện tại
            let jsonData = { xmlList: [], xmlPathMap: {} };
            if (fs.existsSync(jsonFilePath)) {
                jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
            }

            // Lấy danh sách hiện tại
            let xmlList = jsonData.xmlList || [];

            // Thêm các xmlPath mới (không trùng lặp)
            newXmlPaths.forEach(newItem => {
                const normalizedNewPath = newItem.xmlPath.replace(/\//g, '\\');
                const exists = xmlList.some(item =>
                    item.xmlPath.replace(/\//g, '\\') === normalizedNewPath
                );

                if (!exists) {
                    xmlList.push(newItem);
                    console.log(`Thêm mới: ${newItem.xmlPath}`);
                }
            });

            // Tạo lại map
            const xmlPathMap = {};
            xmlList.forEach(item => {
                const normalizedPath = item.xmlPath.replace(/\//g, '\\');
                xmlPathMap[normalizedPath] = {
                    aspxName: item.aspxName,
                    xmlPath: item.xmlPath
                };
            });

            // Lưu lại JSON
            const updatedJsonData = {
                timestamp: new Date().toISOString(),
                totalFiles: xmlList.length,
                xmlList: xmlList,
                xmlPathMap: xmlPathMap
            };

            fs.writeFileSync(jsonFilePath, JSON.stringify(updatedJsonData, null, 2), 'utf-8');
            console.log(`Đã cập nhật JSON: ${xmlList.length} file XML`);
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Lỗi khi cập nhật JSON: ${error.message}`);
            return false;
        }
    }

    /**
     * Phát hiện loại folder của file XML (Dir, Filter, Grid)
     * @param {string} xmlFilePath - Đường dẫn file XML
     * @returns {string|null} - 'dir', 'filter', 'grid', hoặc null
     */
    detectFolderType(xmlFilePath) {
        const normalizedPath = xmlFilePath.replace(/\//g, '\\');

        if (normalizedPath.includes('\\Controllers\\Dir\\')) {
            return 'dir';
        } else if (normalizedPath.includes('\\Controllers\\Filter\\')) {
            return 'filter';
        } else if (normalizedPath.includes('\\Controllers\\Grid\\')) {
            return 'grid';
        }

        return null;
    }

    /**
     * Refresh dữ liệu XML khi save file
     * @param {string} filePath - Đường dẫn file đang được save
     * @returns {boolean} - true nếu thành công
     */
    refreshXmlFileOnSave(filePath) {
        // Kiểm tra file có phải XML không
        if (!filePath.endsWith('.xml')) {
            return false;
        }

        // Tạo folder project và lấy đường dẫn
        const projectFolderPath = this.createProjectFolder(filePath);
        if (!projectFolderPath) {
            console.log('Không thể xác định project folder');
            return false;
        }

        // Lấy aspxName từ JSON dựa vào filePath
        const aspxName = this.lookupAspxNameByXmlPath(filePath);
        if (!aspxName) {
            console.log(`Không tìm thấy aspxName cho file: ${filePath}`);
            this.analystAll(filePath); // Chạy phân tích lại toàn bộ
            return false;
        }

        console.log(`Refreshing XML for aspx: ${aspxName}, file: ${filePath}`);

        // Phát hiện loại folder
        const folderType = this.detectFolderType(filePath);
        let newXmlPaths = [];

        try {
            const contentXML = fs.readFileSync(filePath, 'utf-8');

            // Nếu là Dir hoặc Filter: tìm Grid Detail
            if (folderType === 'dir' || folderType === 'filter') {
                const folderPath = path.dirname(filePath);
                const detailResults = this.regexAnalyzeXMLDetail(aspxName, folderPath, contentXML);
                newXmlPaths = newXmlPaths.concat(detailResults);
                if (folderType === 'dir') {
                const importFormResults = this.regexAnalyzeXMLImportForm(aspxName, filePath);
                newXmlPaths = newXmlPaths.concat(importFormResults);
                }
                // Nếu là Filter: tìm ImportForm
                if (folderType === 'filter') {
                    // Tìm Form/Grid/Lookup liên quan
                    const formExtractResults = this.regexAnalyzeXMLFormExtractData(aspxName, filePath);
                    newXmlPaths = newXmlPaths.concat(formExtractResults);
                }
            }

            // Nếu là Grid: tìm showForm
            if (folderType === 'grid') {
                const folderPath = path.dirname(filePath);
                const showFormResults = this.regexAnalyzeXMLShowForm(aspxName, folderPath, contentXML);
                newXmlPaths = newXmlPaths.concat(showFormResults);
            }

            // Cập nhật JSON với các xmlPath mới
            if (newXmlPaths.length > 0) {
                this.updateJsonWithNewXmlPaths(projectFolderPath, aspxName, newXmlPaths);
                console.log(`Đã tìm thêm ${newXmlPaths.length} file XML liên quan`);
                return true;
            } else {
                console.log('Không tìm thấy file XML mới');
                return true;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Lỗi khi refresh XML: ${error.message}`);
            return false;
        }
    }

    /**
     * Hook để gọi khi save file (dùng trong extension.js)
     * @param {string} filePath - Đường dẫn file đang được save
     */
    onFileSave(filePath) {
        // Chạy trong background, không block UI
        setTimeout(() => {
            try {
                const success = this.refreshXmlFileOnSave(filePath);
                if (success) {
                    console.log(`✓ Đã refresh dữ liệu cho file: ${path.basename(filePath)}`);
                }
            } catch (error) {
                console.error(`Lỗi khi refresh file: ${error.message}`);
            }
        }, 100);
    }

    /**
     * Đăng ký sự kiện lắng nghe khi save file
     * @returns {vscode.Disposable} - Disposable để cleanup
     */
    registerFileSaveListener() {
        // Hủy listener cũ nếu có
        if (this.fileSaveListener) {
            this.fileSaveListener.dispose();
        }
        // Đăng ký listener mới
        this.fileSaveListener = vscode.workspace.onDidSaveTextDocument((document) => {
            const filePath = document.uri.fsPath;
            // Chỉ xử lý file XML trong folder Controllers
            if (filePath.endsWith('.xml') && filePath.includes('\\Controllers\\')) {
                this.onFileSave(filePath);
            }
        });
        return this.fileSaveListener;
    }

    /**
     * Check xem project đã có JSON chưa
     * @param {string} filePath - Đường dẫn file
     * @returns {boolean} - true nếu đã có JSON, false nếu chưa
     */
    hasProjectJson(filePath) {
        const projectFolderPath = this.createProjectFolder(filePath);
        if (!projectFolderPath) {
            return false;
        }

        const jsonFilePath = path.join(projectFolderPath, this.json_save_name);
        return fs.existsSync(jsonFilePath);
    }

    /**
     * Đăng ký sự kiện lắng nghe khi mở file
     * @returns {vscode.Disposable} - Disposable để cleanup
     */
    registerFileOpenListener() {
        // Hủy listener cũ nếu có
        if (this.fileOpenListener) {
            this.fileOpenListener.dispose();
        }

        // Đăng ký listener mới
        this.fileOpenListener = vscode.workspace.onDidOpenTextDocument((document) => {
            const filePath = document.uri.fsPath;
            // Chỉ xử lý file .xml hoặc .aspx
            if (!filePath.endsWith('.xml') && !filePath.endsWith('.aspx')) {
                return;
            }
            // Check xem đã có JSON chưa
            if (this.hasProjectJson(filePath)) {
                console.log(`Project đã có JSON, bỏ qua phân tích cho file: ${path.basename(filePath)}`);
                return;
            }
            // Chưa có JSON, chạy phân tích
            console.log(`Project chưa có JSON, bắt đầu phân tích cho file: ${path.basename(filePath)}`);
            // Lưu file path tạm để analystAll có thể dùng
            this.analystAll(filePath);
        });

        return this.fileOpenListener;
    }

    /**
     * Hủy đăng ký sự kiện
     */
    disposeFileSaveListener() {
        if (this.fileSaveListener) {
            this.fileSaveListener.dispose();
            this.fileSaveListener = null;
        }
        if (this.fileOpenListener) {
            this.fileOpenListener.dispose();
            this.fileOpenListener = null;
        }
    }

    analystAll(filePath) {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Đang chạy phân tích lại tất cả ASPX file...",
            cancellable: false
        }, async (progress) => {
            const results = this.anl.run(filePath);
            // console.time('findXMLFilesForControllers');
            // Tạo folder project và lấy đường dẫn
            const projectFolderPath = this.createProjectFolder(filePath);
            // Tìm các file XML
            const xmlResults = this.findXMLFilesForControllers(filePath, results);
            // console.timeEnd('findXMLFilesForControllers');
            // Lưu kết quả vào JSON
            if (projectFolderPath && xmlResults && xmlResults.length > 0) {
                const success = this.saveXmlResultsToJson(projectFolderPath, xmlResults);
                if (success) {
                    vscode.window.showInformationMessage(`✓ Đã phân tích và lưu ${xmlResults.length} file XML.`);
                }
            }
        });
    }


    run(context) {
        this.registerFileSaveListener();
        this.registerFileOpenListener();
        // Push cả 2 listeners vào subscriptions để cleanup khi deactivate
        if (this.fileSaveListener) {
            context.subscriptions.push(this.fileSaveListener);
        }
        if (this.fileOpenListener) {
            context.subscriptions.push(this.fileOpenListener);
        }

        //   console.log("Analyst XML Results:", xmlResults);
    }

}

module.exports = AnalystXML;
