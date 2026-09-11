const fs = require("fs");
const path = require("path");
const { Worker } = require('worker_threads');
const AnalystASPX = require("./AnalystASPX");
const SyncDBOpenBrowser = require("./syncDBOpenBrowser");

let vscode;
function getVscode() {
    if (vscode !== undefined) {
        return vscode;
    }
    try {
        vscode = require('vscode');
    } catch (e) {
        vscode = null;
    }
    return vscode;
}

function showErrorMessage(message) {
    const v = getVscode();
    if (v && v.window) {
        v.window.showErrorMessage(message);
        return;
    }
    console.error(message);
}

function showInformationMessage(message) {
    const v = getVscode();
    if (v && v.window) {
        v.window.showInformationMessage(message);
        return;
    }
    console.log(message);
}

function showWarningMessage(message) {
    const v = getVscode();
    if (v && v.window) {
        v.window.showWarningMessage(message);
        return;
    }
    console.warn(message);
}

function setStatusBarMessage(message, timeoutMs) {
    const v = getVscode();
    if (v && v.window) {
        v.window.setStatusBarMessage(message, timeoutMs);
        return;
    }
    console.log(message);
}

const CURSORIGNORE_TEMPLATE = `# FBO Autocomplete — chỉ ignore file .f (còn lại mở hết cho Cursor)
**/*.f
`;


class AnalystXML {
    /**
     * @param {{ userDatabaseRoot?: string|null }} [options]
     */
    constructor(options = {}) {
        this._userDatabaseRootOverride = options.userDatabaseRoot || null;
        this.anl = new AnalystASPX();
        this.dir = ['App_Data', 'Controllers', 'Dir'];
        this.grid = ['App_Data', 'Controllers', 'Grid'];
        this.filter = ['App_Data', 'Controllers', 'Filter'];
        this.report = ['App_Data', 'Controllers', 'Report'];
        this.upload = ['App_Data', 'Controllers', 'Templates', 'Upload'];
        this.json_save_name = 'file_xml_to_aspx_info.json';
        this.fileSaveListener = null; // Lưu listener để cleanup sau này
        this.fileOpenListener = null; // Lưu listener cho sự kiện mở file
        this.pathDatabase = path.join(__dirname, '..', '..', 'Database');
        this.pathDatabaseOpenBrowser = '';
        this.pathDatabaseCursorIgnore = '';
        this.saveTimeouts = new Map(); // Debounce: lưu timeout theo từng file
        this.analystAllTimeouts = new Map(); // Debounce cho analystAll theo project
        this.syncDB = new SyncDBOpenBrowser();
        this.projectsMissingJsonWarned = new Set(); // Tránh spam cảnh báo khi thiếu JSON
        this.projectsAnalysisInProgress = new Set(); // Tránh chạy analystAll trùng nhau
        this.projectsDbSynced = new Set(); // Tránh sync DB lặp lại gây nặng
        this.workersByProject = new Map(); // Worker theo project
    }
    //Xử lý path Database (user: globalStorage/Database)
    setPathDatabase() {
        if (this._userDatabaseRootOverride) {
            this.pathDatabase = this._userDatabaseRootOverride;
            this.pathDatabaseOpenBrowser = path.join(this.pathDatabase, 'OpenBrowser');
            return;
        }
        try {
            const { getUserDatabaseRoot } = require('../../extensionDatabasePaths');
            this.pathDatabase = getUserDatabaseRoot();
        } catch {
            this.pathDatabase = path.join(__dirname, '..', '..', 'Database');
            if (!fs.existsSync(this.pathDatabase)) {
                this.pathDatabase = path.join(__dirname, '..', 'Database');
            }
        }
        this.pathDatabaseOpenBrowser = path.join(this.pathDatabase, 'OpenBrowser');
    }
    setPathDatabaseCursorIgore() {
        if (this._userDatabaseRootOverride) {
            this.pathDatabaseCursorIgnore = path.join(this._userDatabaseRootOverride, '.cursorignore');
            return;
        }
        try {
            const { getUserDatabaseRoot } = require('../../extensionDatabasePaths');
            this.pathDatabase = getUserDatabaseRoot();
        } catch {
            this.pathDatabase = path.join(__dirname, '..', '..', 'Database');
            if (!fs.existsSync(this.pathDatabase)) {
                this.pathDatabase = path.join(__dirname, '..', 'Database');
            }
        }
        this.pathDatabaseCursorIgnore = path.join(this.pathDatabase, '.cursorignore');
    }


    //Lấy từ phần từ trong results VD : phân tử nó là {aspx: 'query_sothk.aspx', controller: 'QuerySalesSummaryByPeriod'} thì lấy controller để tìm file XML tương ứng trong các folder App_Data\Controllers\Dir, App_Data\Controllers\Grid, App_Data\Controllers\Filter, App_Data\Controllers\Report, App_Data\Controllers\Templates\Upload
    async findXMLFilesForControllers(filePath, results) {
        const folders = [this.dir, this.filter, this.grid, this.report, this.upload];
        let aspx_xml = [];

        for (const item of (results || [])) {
            const controllerName = item.controller;
            const aspxName = item.aspx;

            for (const folder of folders) {
                const pathIncludeXML = this.anl.getUrlFromFilePath(filePath, folder);
                if (!pathIncludeXML) {
                    continue;
                } 

                const fileXML = this.confirmExistsXML(aspxName, controllerName, pathIncludeXML);
                const fileXMLUrl = fileXML ? fileXML.xmlPath : '';

                if (fileXML) {
                    aspx_xml.push(fileXML);
                }

                //Chỉ chạy đoạn này nếu là Dir, Filter
                if ([this.dir, this.filter].includes(folder) && fileXMLUrl !== '') {
                    try {
                        const contentXML = await fs.promises.readFile(fileXMLUrl, 'utf-8');
                        const DetailXML = this.regexAnalyzeXMLDetail(aspxName, pathIncludeXML, contentXML);
                        aspx_xml = aspx_xml.concat(DetailXML);
                    } catch (error) {
                        // Bỏ qua file không đọc được
                    }
                }

                if (folder === this.filter && fileXMLUrl !== '') {
                    const ImportFormXML = this.regexAnalyzeXMLImportForm(aspxName, fileXMLUrl);
                    aspx_xml = aspx_xml.concat(ImportFormXML);
                }
            }
        }

        //loop aspx_xml để loại bỏ các phần tử trùng lặp dựa trên aspxName và xmlPath
        aspx_xml = aspx_xml.filter((item, index, self) =>
            index === self.findIndex((t) => (t.aspxName === item.aspxName && t.xmlPath === item.xmlPath))
        );
        var aspx_xml2 = aspx_xml
        //loop aspx_xml để chạy hàm regexAnalyzeXMLShowForm cho từng phần tử
        for (const item of aspx_xml2) {
            var pathIncludeXML = this.anl.getUrlFromFilePath(item.xmlPath, this.grid);
            try {
                var contentXML = await fs.promises.readFile(item.xmlPath, 'utf-8');
                var showFormResults = this.regexAnalyzeXMLShowForm(item.aspxName, pathIncludeXML, contentXML);
                aspx_xml = aspx_xml.concat(showFormResults);
                var ApprovalXMLExternalResults = this.ApprovalXMLExternal(item.aspxName, item.xmlPath);
                aspx_xml = aspx_xml.concat(ApprovalXMLExternalResults);
            } catch (error) {
                // Bỏ qua file XML không đọc được
            }
        }
        //Loại thêm các phần tử trùng lặp lần nữa
        aspx_xml = aspx_xml.filter((item, index, self) =>
            index === self.findIndex((t) => (t.aspxName === item.aspxName && t.xmlPath === item.xmlPath))
        );
        return aspx_xml;
    }

    warnMissingJsonOnce(filePath) {
        const projectName = this.extractProjectName(filePath);
        if (!projectName) {
            return;
        }
        if (this.projectsMissingJsonWarned.has(projectName)) {
            return;
        }
        this.projectsMissingJsonWarned.add(projectName);
        setStatusBarMessage(
            `$(info) Project ${projectName}: chưa có JSON mapping. Chạy lệnh "FBO: Analyze XML Project" để tạo dữ liệu.`,
            6000
        );
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
            } else {
                var fFilePath = `${pathIncludeXMLGrid}\\${controllerName}.f`;
                if (fs.existsSync(fFilePath)) {
                    results.push({
                        aspxName: aspxName,
                        xmlPath: fFilePath
                    });
                }
            }
        }
        return results;
    }

    regexAnalyzeXMLShowForm(aspxName, folderPath, contentXML) {
        /*
        Hỗ trợ 2 dạng gọi show form trong XML/JS:
        1) g.showForm('ViewReceiptFilter') hoặc .showForm('ViewReceiptFilter')
        2) show$Form(g, 'ViewReceiptFilter') (hoặc show$Form(someVar, "ViewReceiptFilter"))
        Lấy ra tên controller (ViewReceiptFilter) rồi nối pathIncludeXMLFilter + controller + .xml
        */
        var pathIncludeXMLFilter = this.anl.getUrlFromFilePath(folderPath, this.filter);

        // 1) dạng dot: .showForm('Name')
        const dotShowFormRegex = /\.showForm\(\s*['"]([^'\"]+)['"]\s*\)/g;
        // 2) dạng dollar: show$Form(someVar, 'Name') -> lấy arg thứ 2
        const showDollarFormRegex = /show\$Form\(\s*[^,()]+?\s*,\s*['"]([^'\"]+)['"]\s*\)/g;

        var results = [];
        var match;
        // Kiểm tra dạng .showForm(...)
        while ((match = dotShowFormRegex.exec(contentXML)) !== null) {
            var controllerName = match[1];
            var xmlFilePath = `${pathIncludeXMLFilter}\\${controllerName}.xml`;
            var excludeController = ['fsdGallerManager'];

            if (fs.existsSync(xmlFilePath) && !excludeController.includes(controllerName)) {
                results.push({ aspxName: aspxName, xmlPath: xmlFilePath }); 
                var formExtractDataResults = this.regexAnalyzeXMLFormExtractData(aspxName, xmlFilePath);
                var detailResults = this.regexAnalyzeXMLDetail(aspxName, pathIncludeXMLFilter, contentXML);
                results = results.concat(formExtractDataResults);
                results = results.concat(detailResults);
            } else if (!excludeController.includes(controllerName)) {
                var fFilePath = `${pathIncludeXMLFilter}\\${controllerName}.f`;
                if (fs.existsSync(fFilePath)) {
                    results.push({ aspxName: aspxName, xmlPath: fFilePath }); 
                    var formExtractDataResults = this.regexAnalyzeXMLFormExtractData(aspxName, fFilePath);
                    var detailResults = this.regexAnalyzeXMLDetail(aspxName, pathIncludeXMLFilter, contentXML);
                    results = results.concat(formExtractDataResults);
                    results = results.concat(detailResults);
                }
            }
        }

        // Kiểm tra dạng show$Form(var, ...)
        while ((match = showDollarFormRegex.exec(contentXML)) !== null) {
            var controllerName2 = match[1];
            var xmlFilePath2 = `${pathIncludeXMLFilter}\\${controllerName2}.xml`;
            var excludeController2 = ['fsdGallerManager'];
           
            if (fs.existsSync(xmlFilePath2) && !excludeController2.includes(controllerName2)) {
                results.push({ aspxName: aspxName, xmlPath: xmlFilePath2 });
                var formExtractDataResults2 = this.regexAnalyzeXMLFormExtractData(aspxName, xmlFilePath2);
                var detailResults = this.regexAnalyzeXMLDetail(aspxName, pathIncludeXMLFilter, contentXML);
                results = results.concat(formExtractDataResults2);
                results = results.concat(detailResults);
            } else if (!excludeController2.includes(controllerName2)) {
                var fFilePath2 = `${pathIncludeXMLFilter}\\${controllerName2}.f`;
                if (fs.existsSync(fFilePath2)) {
                    results.push({ aspxName: aspxName, xmlPath: fFilePath2 });
                    var formExtractDataResults2 = this.regexAnalyzeXMLFormExtractData(aspxName, fFilePath2);
                    var detailResults = this.regexAnalyzeXMLDetail(aspxName, pathIncludeXMLFilter, contentXML);
                    results = results.concat(formExtractDataResults2);
                    results = results.concat(detailResults);
                }
            }
        }

        // Loại trùng lặp (aspxName + xmlPath)
        results = results.filter((item, index, self) =>
            index === self.findIndex((t) => (t.aspxName === item.aspxName && t.xmlPath === item.xmlPath))
        );

        return results;
    }


    ApprovalXMLExternal(aspxName, filePath) {
        /*
        xét file filePath có tên cuối cùng là *Approval.xml hay không nếu có thì thay thế nó bằng Item, Detail, Files để tạo thành các file xml mới và kiểm tra các file xml đó có tồn tại không nếu có thì trả về mảng các object {aspxName, xmlPath}
        VD: \\172.168.5.14\CustomerPro\FBI\CCI_FBI\FBISP24\App_Data\Controllers\Grid\PD5Approval.xml thì tạo ra \\172.168.5.14\CustomerPro\FBI\CCI_FBI\FBISP24\App_Data\Controllers\Grid\PD5ApprovalItem.xml, \\172.168.5.14\CustomerPro\FBI\CCI_FBI\FBISP24\App_Data\Controllers\Grid\PD5ApprovalDetail.xml, \\172.168.5.14\CustomerPro\FBI\CCI_FBI\FBISP24\App_Data\Controllers\Grid\PD5ApprovalFiles.xml 
        và add vào results
        */
        const results = [];
        //Check thêm folder chứa nó có phải là Grid không   
        if (!filePath.endsWith('Approval.xml') && !filePath.endsWith('Approval.f') && !filePath.includes('\\Grid\\')) {
            return results;
        }

        // Split path to get folder and filename
        const pathParts = filePath.split(/[/\\]/);
        const fileName = pathParts.pop(); // Get filename
        const folderPath = pathParts.join("\\"); // Get folder path

        // Get base name by removing "Approval.xml" or "Approval.f"
        const baseName = fileName.replace('Approval.xml', '').replace('Approval.f', '');

        // Suffixes to check: Item, Detail, Files
        const suffixes = ['ApprovalItem.xml', 'ApprovalDetail.xml', 'ApprovalFiles.xml'];

        // Check each suffix
        suffixes.forEach(suffix => {
            const newFileName = baseName + suffix;
            const newFilePath = `${folderPath}\\${newFileName}`;

            if (fs.existsSync(newFilePath)) {
                results.push({
                    aspxName: aspxName,
                    xmlPath: newFilePath
                });
            } else {
                const fFilePath = `${folderPath}\\${baseName}${suffix.replace('.xml', '.f')}`;
                if (fs.existsSync(fFilePath)) {
                    results.push({
                        aspxName: aspxName,
                        xmlPath: fFilePath
                    });
                }
            }
        });

        return results;
    }

    regexAnalyzeXMLFormExtractData(aspxName, xmlFilePath) {
        const pathParts = xmlFilePath.split(/[/\\]/);
        const fileName = pathParts.pop();
        const folderPath = pathParts.join("\\");
        const results = [];

        if (!fileName.endsWith('Filter.xml') && !fileName.endsWith('Filter.f')) {
            return results;
        }

        const suffixes = [
            { suffix: ['MultiForm.xml', 'Form.xml'], folder: 'Filter' },
            { suffix: ['MultiGrid.xml', 'Grid.xml'], folder: 'Grid' },
            { suffix: ['Lookup.xml'], folder: 'Lookup' }
        ];

        suffixes.forEach(({ suffix, folder }) => {
            suffix.forEach(suf => {
                const baseName = fileName.replace('Filter.xml', suf).replace('Filter.f', suf);
                const newPath = `${folderPath.replace('Filter', folder)}\\${baseName}`;
                if (fs.existsSync(newPath)) {
                    results.push({ aspxName, xmlPath: newPath });
                } else {
                    const fPath = `${folderPath.replace('Filter', folder)}\\${baseName.replace('.xml', '.f')}`;
                    if (fs.existsSync(fPath)) {
                        results.push({ aspxName, xmlPath: fPath });
                    }
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
        var baseName = fileName.replace('.xml', 'ImportForm.xml').replace('.f', 'ImportForm.f');
        var importFormPath = `${folderPath}\\${baseName}`;
        var results = [];
        if (fs.existsSync(importFormPath)) {
            results.push({
                aspxName: aspxName,
                xmlPath: importFormPath
            });
        } else if (importFormPath.endsWith('.xml')) {
            var fPath = importFormPath.replace('.xml', '.f');
            if (fs.existsSync(fPath)) {
                results.push({
                    aspxName: aspxName,
                    xmlPath: fPath
                });
            }
        }
        return results;
    }


    confirmExistsXML(aspxName, controllerName, pathIncludeXML) {
        var xmlFilePath = `${pathIncludeXML}\\${controllerName}.xml`;
        if (!fs.existsSync(xmlFilePath)) {
            var fFilePath = `${pathIncludeXML}\\${controllerName}.f`;
            if (fs.existsSync(fFilePath)) {
                return {
                    aspxName: aspxName,
                    xmlPath: fFilePath
                };
            }
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
        const AppDataPathHelper = require('../AppDataPathHelper');
        const helper = new AppDataPathHelper(xmlFilePath);
        const base = helper.getBaseProjectPath();
        if (base) {
            const parts = base.split(/[/\\]/).filter(Boolean);
            if (parts.length >= 2) {
                return `${parts[parts.length - 2]}_${parts[parts.length - 1]}`;
            }
            if (parts.length === 1) {
                return parts[0];
            }
        }

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



    extractProjectPath(xmlFilePath) {
        const AppDataPathHelper = require('../AppDataPathHelper');
        const helper = new AppDataPathHelper(xmlFilePath);
        const project_path = helper.getProjectPath();
        if (project_path) {
            return project_path;
        }

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

        
        // Lấy đường dẫn đến folder project (CustomerPro + 3 folder con)
        const projectParts = parts.slice(0, customerProIndex + 4);
        let basePath = projectParts.join('\\');
        try {
            const ProjectMappingHelper = require('../../Database/ProjectMappingHelper');
            basePath = ProjectMappingHelper.getActualRoot(basePath);
        } catch (e) {}
        return basePath;
    }

    /**
     * Normalize a path for use as a JSON map key (consistent separators + lowercase)
     * @param {string} p
     * @returns {string}
     */
    normalizePathKey(p) {
        if (!p) return p;
        try {
            return p.replace(/\//g, '\\\\').replace(/\\+/g, '\\\\').toLowerCase();
        } catch (e) {
            return p.replace(/\//g, '\\\\').toLowerCase();
        }
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
        this.setPathDatabase();
        var databasePath = this.pathDatabaseOpenBrowser;
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
            showErrorMessage(`Lỗi khi tạo folder: ${error.message}`);
            return null;
        }
    }

    /**
     * Lưu xmlResults vào file JSON để tra cứu sau này
     * @param {string} projectFolderPath - Đường dẫn đến folder project
     * @param {Array} xmlResults - Mảng kết quả XML [{aspxName, xmlPath}, ...]
        * @returns {Promise<boolean>} - true nếu thành công, false nếu thất bại
     */
    async saveXmlResultsToJson(projectFolderPath, xmlResults) {
        if (!projectFolderPath || !xmlResults) {
            return false;
        }
        
        try {
            const jsonFilePath = path.join(projectFolderPath, this.json_save_name);
            // Tạo object map để tra cứu nhanh theo xmlPath
            const xmlPathMap = {};
            xmlResults.forEach(item => {
                // Chuẩn hóa đường dẫn để làm key (case-insensitive)
                const normalizedPath = this.normalizePathKey(item.xmlPath);
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

            await fs.promises.writeFile(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf-8');
            console.log(`Đã lưu ${xmlResults.length} file XML vào ${jsonFilePath}`);
            await this.syncDBFunc(projectFolderPath, 1);
            return true;
        } catch (error) {
            showErrorMessage(`Lỗi khi lưu JSON: ${error.message}`);
            return false;
        }
    }

    async syncDBFunc(projectFolderPath, override_yn = 0) {
        if (!projectFolderPath) {
            return;
        }
        const folderNameLocal = path.basename(projectFolderPath);
        if (this.projectsDbSynced.has(folderNameLocal) && override_yn != 2) {
            return;
        }
        //Sync cloud về trước 
        this.setPathDatabase();
        var databasePath = this.pathDatabaseOpenBrowser;
        try {
            var cloudDBPath = await this.syncDB.getAllProjectPaths(this.syncDB.urlSync); //array 
            var localDBPath = await this.syncDB.getAllProjectPaths(databasePath); //array 
            var checkHaveInLocal = await this.syncDB.checkFolderExistInProjectPaths(localDBPath, folderNameLocal);
            var checkHaveInCloud = await this.syncDB.checkFolderExistInProjectPaths(cloudDBPath, folderNameLocal);
            //Nếu không có trong local thì copy từ cloud về local
            if (!checkHaveInLocal) {
                await this.syncDB.copyFolder(path.join(this.syncDB.urlSync, folderNameLocal), projectFolderPath);
            }
            //Nếu không có trong cloud thì copy từ local lên cloud
            if (!checkHaveInCloud) {
                await this.syncDB.copyFolder(projectFolderPath, this.syncDB.urlSync);
            }
            //Nếu override_yn == 1 thì copy  đè từ local lên cloud
            if (override_yn == 1) {
                await this.syncDB.copyFolder(projectFolderPath, this.syncDB.urlSync);
            }
            //Nếu override_yn == 1 thì copy  đè từ cloud lên local
            if (override_yn == 2) {
                await this.syncDB.copyFolder(path.join(this.syncDB.urlSync, folderNameLocal), projectFolderPath);
                return;
            }
            this.projectsDbSynced.add(folderNameLocal);
        } catch (error) {
            // Sync DB lỗi thì bỏ qua để không ảnh hưởng luồng chính
        }
    }

    /**
     * Tra cứu aspxName dựa vào xmlPath từ file JSON
     * @param {string} xmlFilePath - Đường dẫn đến file XML cần tra cứu
        * @returns {Promise<string|null>} - aspxName hoặc null nếu không tìm thấy
     */
    async lookupAspxNameByXmlPath(xmlFilePath, options = {}) {
        const projectFolderPath = this.createProjectFolder(xmlFilePath);
        if (!projectFolderPath) {
            return null;
        }

        try {
            const jsonFilePath = path.join(projectFolderPath, this.json_save_name);
            if (!fs.existsSync(jsonFilePath)) {
                if (!options.silentMissingJson) {
                    this.warnMissingJsonOnce(xmlFilePath);
                }
                return null;
            }
            const jsonData = JSON.parse(await fs.promises.readFile(jsonFilePath, 'utf-8'));
            const normalizedPath = this.normalizePathKey(xmlFilePath);
            console.log(`Tra cứu aspxName cho XML: ${normalizedPath}`);

            // Rebuild a normalized map from any existing keys (handles older files with different casing)
            if (jsonData.xmlPathMap) {
                const normMap = {};
                for (const k in jsonData.xmlPathMap) {
                    if (!Object.prototype.hasOwnProperty.call(jsonData.xmlPathMap, k)) continue;
                    normMap[this.normalizePathKey(k)] = jsonData.xmlPathMap[k];
                }
                if (normMap[normalizedPath]) {
                    return normMap[normalizedPath].aspxName;
                }
            }

            // Fallback: tìm trong mảng nếu map không có
            if (jsonData.xmlList) {
                const found = jsonData.xmlList.find(item =>
                    this.normalizePathKey(item.xmlPath) === normalizedPath
                );
                return found ? found.aspxName : null;
            }
            return null;
        } catch (error) {
            showErrorMessage(`Lỗi khi tra cứu JSON: ${error.message}`);
            return null;
        }
    }

    /**
     * Lấy toàn bộ danh sách XML từ file JSON
     * @param {string} xmlFilePath - Đường dẫn bất kỳ trong project
        * @returns {Promise<Array|null>} - Mảng xmlResults hoặc null nếu không tìm thấy
     */
    async getAllXmlResultsFromJson(xmlFilePath) {
        const projectFolderPath = this.createProjectFolder(xmlFilePath);
        if (!projectFolderPath) {
            return null;
        }
        try {
            const jsonFilePath = path.join(projectFolderPath, this.json_save_name);

            if (!fs.existsSync(jsonFilePath)) {
                return null;
            }
            const jsonData = JSON.parse(await fs.promises.readFile(jsonFilePath, 'utf-8'));
            return jsonData.xmlList || [];
        } catch (error) {
            showErrorMessage(`Lỗi khi đọc JSON: ${error.message}`);
            return null;
        }
    }

    /**
     * Cập nhật JSON với các xmlPath mới tìm được
     * @param {string} projectFolderPath - Đường dẫn đến folder project
     * @param {string} aspxName - Tên file aspx
     * @param {Array} newXmlPaths - Mảng các xmlPath mới [{aspxName, xmlPath}]
        * @returns {Promise<boolean>} - true nếu thành công
     */
    async updateJsonWithNewXmlPaths(projectFolderPath, aspxName, newXmlPaths) {
        if (!projectFolderPath || !aspxName || !newXmlPaths || newXmlPaths.length === 0) {
            return false;
        }
        try {
            const jsonFilePath = path.join(projectFolderPath, this.json_save_name);

            // Đọc JSON hiện tại
            let jsonData = { xmlList: [], xmlPathMap: {} };
            if (fs.existsSync(jsonFilePath)) {
                jsonData = JSON.parse(await fs.promises.readFile(jsonFilePath, 'utf-8'));
            }

            // Lấy danh sách hiện tại
            let xmlList = jsonData.xmlList || [];

            // Thêm các xmlPath mới (không trùng lặp)
            newXmlPaths.forEach(newItem => {
                const normalizedNewPath = this.normalizePathKey(newItem.xmlPath);
                const exists = xmlList.some(item =>
                    this.normalizePathKey(item.xmlPath) === normalizedNewPath
                );

                if (!exists) {
                    xmlList.push(newItem);
                    console.log(`Thêm mới: ${newItem.xmlPath}`);
                }
            });

            // Tạo lại map
            const xmlPathMap = {};
            xmlList.forEach(item => {
                const normalizedPath = this.normalizePathKey(item.xmlPath);
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

            await fs.promises.writeFile(jsonFilePath, JSON.stringify(updatedJsonData, null, 2), 'utf-8');
            console.log(`Đã cập nhật JSON: ${xmlList.length} file XML`);
            return true;
        } catch (error) {
            showErrorMessage(`Lỗi khi cập nhật JSON: ${error.message}`);
            return false;
        }
    }

    _getWorkerPath() {
        return path.join(__dirname, 'AnalystXML.worker.js');
       // return require.resolve('./AnalystXML.worker.js');
    }

    /**
     * Start worker phân tích để tránh block UI.
     * @param {string} filePath
     * @param {{ projectName?: string, onProgress?: (p: {increment?: number, message?: string}) => void }} options
     * @returns {{ worker: import('worker_threads').Worker, promise: Promise<{xmlCount:number, projectFolderPath:string, durationMs:number}> }}
     */
    _startAnalysisWorker(filePath, options = {}) {
        const projectName = options.projectName || this.extractProjectName(filePath) || 'unknown';

        const existing = this.workersByProject.get(projectName);
        if (existing) {
            try { existing.terminate(); } catch (e) { }
            this.workersByProject.delete(projectName);
        }

        let userDatabaseRoot = null;
        try {
            const { getUserDatabaseRoot } = require('../../extensionDatabasePaths');
            userDatabaseRoot = getUserDatabaseRoot();
        } catch {
            userDatabaseRoot = null;
        }

        const worker = new Worker(this._getWorkerPath(), {
            workerData: { filePath, userDatabaseRoot },
        });
        this.workersByProject.set(projectName, worker);

        const promise = new Promise((resolve, reject) => {
            let settled = false;

            worker.on('message', (msg) => {
                if (!msg || typeof msg !== 'object') return;

                if (msg.type === 'progress') {
                    if (typeof options.onProgress === 'function') {
                        options.onProgress({ increment: msg.increment, message: msg.message });
                    }
                    return;
                }

                if (msg.type === 'done') {
                    settled = true;
                    this.workersByProject.delete(projectName);
                    if (msg.ok) {
                        resolve({
                            xmlCount: msg.xmlCount || 0,
                            projectFolderPath: msg.projectFolderPath || '',
                            durationMs: msg.durationMs || 0,
                        });
                    } else {
                        const err = new Error(msg.error && msg.error.message ? msg.error.message : 'Worker failed');
                        if (msg.error && msg.error.stack) {
                            err.stack = msg.error.stack;
                        }
                        reject(err);
                    }
                }
            });

            worker.on('error', (err) => {
                if (settled) return;
                settled = true;
                this.workersByProject.delete(projectName);
                reject(err);
            });

            worker.on('exit', (code) => {
                if (settled) return;
                this.workersByProject.delete(projectName);
                if (code !== 0) {
                    reject(new Error(`Worker exited with code ${code}`));
                }
            });
        });

        return { worker, promise };
    }

    /**
     * Phát hiện loại folder của file XML (Dir, Filter, Grid)
     * @param {string} xmlFilePath - Đường dẫn file XML
     * @returns {string|null} - 'dir', 'filter', 'grid', hoặc null
     */
    detectFolderType(xmlFilePath) {
        const normalizedPath = xmlFilePath.replace(/\//g, '\\');

        if (normalizedPath.includes('\\Controllers\\Dir\\')) {
            return 'Dir';
        } else if (normalizedPath.includes('\\Controllers\\Filter\\')) {
            return 'Filter';
        } else if (normalizedPath.includes('\\Controllers\\Grid\\')) {
            return 'Grid';
        }

        return null;
    }

    /**
     * Refresh dữ liệu XML khi save file (chạy ngầm, non-blocking)
     * @param {string} filePath - Đường dẫn file đang được save
     */
    refreshXmlFileOnSave(filePath) {
        // Debounce: Hủy timeout cũ nếu có
        if (this.saveTimeouts.has(filePath)) {
            clearTimeout(this.saveTimeouts.get(filePath));
        }

        // Tạo timeout mới: chỉ chạy sau 500ms không có save event
        const timeoutId = setTimeout(() => {
            // Xóa timeout khỏi Map
            this.saveTimeouts.delete(filePath);
            // Chạy ngầm không block UI
            setImmediate(async () => {
                try {
                    const projectFolderPath = this.createProjectFolder(filePath);
                    if (!projectFolderPath) {
                        return;
                    }
                    await this.syncDBFunc(projectFolderPath);
                    console.log(`Bắt đầu refresh XML cho: ${path.basename(filePath)}`);
                    // Nếu chưa có JSON thì chạy quét toàn project (giờ chạy qua worker nên không block UI)
                    if (!this.hasProjectJson(filePath)) {
                        this.analystAll(filePath);
                        return;
                    }
                    // Lấy aspxName từ JSON dựa vào filePath
                    const aspxName = await this.lookupAspxNameByXmlPath(filePath, { silentMissingJson: true });
                    if (!aspxName) {
                        console.log(`Không tìm thấy aspxName cho file: ${filePath} (JSON đã có nhưng chưa map)`);
                        await this.syncDBFunc(projectFolderPath, 2);
                        return;
                    }
                    console.log(`Refreshing XML for aspx: ${aspxName}, file: ${filePath}`);
                    // Phát hiện loại folder
                    const folderType = this.detectFolderType(filePath);
                    let newXmlPaths = [];

                    // Đọc file content (async)
                    const contentXML = await fs.promises.readFile(filePath, 'utf-8');

                    // Xử lý theo loại folder (wrap trong setImmediate)
                    await new Promise((resolve) => {
                        setImmediate(() => {
                            // Nếu là Dir hoặc Filter: tìm Grid Detail
                            if (folderType === 'Dir' || folderType === 'Filter') {
                                const folderPath = path.dirname(filePath);
                                const detailResults = this.regexAnalyzeXMLDetail(aspxName, folderPath, contentXML);
                                newXmlPaths = newXmlPaths.concat(detailResults);

                                if (folderType === 'Dir') {
                                    const importFormResults = this.regexAnalyzeXMLImportForm(aspxName, filePath);
                                    newXmlPaths = newXmlPaths.concat(importFormResults);
                                }

                                // Nếu là Filter: tìm ImportForm
                                if (folderType === 'Filter') {
                                    const formExtractResults = this.regexAnalyzeXMLFormExtractData(aspxName, filePath);
                                    newXmlPaths = newXmlPaths.concat(formExtractResults);
                                }
                            }

                            // Nếu là Grid: tìm showForm
                            if (folderType === 'Grid') {
                                const folderPath = path.dirname(filePath);
                                const showFormResults = this.regexAnalyzeXMLShowForm(aspxName, folderPath, contentXML);
                                newXmlPaths = newXmlPaths.concat(showFormResults);
                                const approvalExternalResults = this.ApprovalXMLExternal(aspxName, filePath);
                                newXmlPaths = newXmlPaths.concat(approvalExternalResults);
                            }
                            resolve();
                        });
                    });

                    // Cập nhật JSON với các xmlPath mới
                    if (newXmlPaths.length > 0) {
                        await this.updateJsonWithNewXmlPaths(projectFolderPath, aspxName, newXmlPaths);
                        console.log(`✓ Đã tìm thêm ${newXmlPaths.length} file XML liên quan`);
                        await this.syncDBFunc(projectFolderPath, 1);
                    } else {
                        console.log('Không tìm thấy file XML mới');
                    }
                } catch (error) {
                    console.error(`Lỗi khi refresh XML: ${error.message}`);
                }
            });
        }, 500); // Chờ 500ms sau lần save cuối

        // Lưu timeout vào Map
        this.saveTimeouts.set(filePath, timeoutId);
    }

    /**
     * Hook để gọi khi save file (dùng trong extension.js)
     * @param {string} filePath - Đường dẫn file đang được save
     */
    onFileSave(filePath) {
        // Gọi trực tiếp, không cần setTimeout vì refreshXmlFileOnSave đã non-blocking
        this.refreshXmlFileOnSave(filePath);
    }
    copyCursorIgnoreToProject(pathProject) {
        // Ghi .cursorignore vào project — chỉ ignore file .f, còn lại mở hết cho Cursor.
        try {
            if (!pathProject) {
                return;
            }
            this.setPathDatabaseCursorIgore();
            const destPath = path.join(pathProject, '.cursorignore');
            fs.writeFileSync(destPath, CURSORIGNORE_TEMPLATE, 'utf8');
            if (this.pathDatabaseCursorIgnore) {
                fs.mkdirSync(path.dirname(this.pathDatabaseCursorIgnore), { recursive: true });
                fs.writeFileSync(this.pathDatabaseCursorIgnore, CURSORIGNORE_TEMPLATE, 'utf8');
            }
        } catch (error) {
            console.error(`Lỗi khi copy cursor ignore: ${error.message}`);
        }
    }
    /**
     * Đăng ký sự kiện lắng nghe khi save file
        * @returns {import('vscode').Disposable|null} - Disposable để cleanup
     */
    registerFileSaveListener() {
        const v = getVscode();
        if (!v || !v.workspace) {
            return null;
        }
        // Hủy listener cũ nếu có
        if (this.fileSaveListener) {
            this.fileSaveListener.dispose();
        }
        // Đăng ký listener mới
        this.fileSaveListener = v.workspace.onDidSaveTextDocument((document) => {
            const filePath = document.uri.fsPath;
            this.copyCursorIgnoreToProject(this.extractProjectPath(filePath));
            // Chỉ xử lý file XML trong folder Controllers và Folder chứa nó là Dir, Filter, Grid, Upload, Report
            var isCorrectFile = this.checkFileToAnalyze(filePath);
            if (isCorrectFile) {
                this.onFileSave(filePath);
            }
        });
        return this.fileSaveListener;
    }
     

    checkFileToAnalyze(filePath) {
        // Chỉ xử lý file .xml hoặc .aspx hoặc XML trong folder Controllers và Folder chứa nó là Dir, Filter, Grid, Upload, Report
        const folderTypes = ['\\Dir\\', '\\Filter\\', '\\Grid\\', '\\Upload\\', '\\Report\\', '\\Main\\'];
        const isInControllers = filePath.includes('\\Controllers\\');
        const isInFolderType = folderTypes.some(type => filePath.includes(type));
        if (((filePath.endsWith('.xml') && isInFolderType) || filePath.endsWith('.aspx')) && isInControllers) {
            return true;
        }
        return false;
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
        * @returns {import('vscode').Disposable|null} - Disposable để cleanup
     */
    registerFileOpenListener() {
        const v = getVscode();
        if (!v || !v.workspace) {
            return null;
        }
        // Hủy listener cũ nếu có
        if (this.fileOpenListener) {
            this.fileOpenListener.dispose();
        }

        // Đăng ký listener mới
        this.fileOpenListener = v.workspace.onDidOpenTextDocument(async (document) => {
            // THEO YÊU CẦU: Tắt toàn bộ logic quét/sync ngầm DB khi mở file
            // Chỉ tạo DB khi user gọi Search (Lazy Load) để mở file nhanh tuyệt đối
            
            // const filePath = document.uri.fsPath;
            // this.copyCursorIgnoreToProject(this.extractProjectPath(filePath));
            // var isCorrectFile = this.checkFileToAnalyze(filePath);
            // // Chỉ xử lý file .xml hoặc .aspx
            // if (!isCorrectFile) {
            //     return;
            // }
            // const projectFolderPath = this.createProjectFolder(filePath);
            // if (projectFolderPath) {
            //     await this.syncDBFunc(projectFolderPath);
            // }
            // // Nếu chưa có JSON thì tự quét toàn project (worker)
            // if (!this.hasProjectJson(filePath)) {
            //     this.analystAll(filePath); 
            //     await this.syncDBFunc(projectFolderPath, 1);
            //     return;
            // }
        });

        return this.fileOpenListener;
    }

    /**
     * Hủy đăng ký sự kiện
     */
    disposeFileSaveListener() {
        // Hủy tất cả timeout đang pending
        this.saveTimeouts.forEach((timeoutId) => {
            clearTimeout(timeoutId);
        });
        this.saveTimeouts.clear();

        // Hủy tất cả analystAll timeout đang pending
        this.analystAllTimeouts.forEach((timeoutId) => {
            clearTimeout(timeoutId);
        });
        this.analystAllTimeouts.clear();

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
        // Lấy project name để debounce theo project
        const projectName = this.extractProjectName(filePath);
        if (!projectName) {
            console.log('Không thể xác định project name');
            return;
        }

        // Debounce: Hủy timeout cũ cho project này
        if (this.analystAllTimeouts.has(projectName)) {
            clearTimeout(this.analystAllTimeouts.get(projectName));
            console.log(`Hủy phân tích cũ cho project: ${projectName}`);
        }

        // Tạo timeout mới: chỉ chạy sau 1000ms không có gọi mới
        const timeoutId = setTimeout(() => {
            // Xóa timeout khỏi Map
            this.analystAllTimeouts.delete(projectName);

            console.log(`Bắt đầu phân tích toàn bộ cho project: ${projectName}`);

            if (this.projectsAnalysisInProgress.has(projectName)) {
                console.log(`Đang phân tích project ${projectName}, bỏ qua yêu cầu mới.`);
                return;
            }

            this.projectsAnalysisInProgress.add(projectName);
            console.log('Bắt đầu phân tích XML ở background (worker)...');

            const { promise } = this._startAnalysisWorker(filePath, {
                projectName,
                onProgress: (p) => {
                    if (p && p.message) {
                        console.log(`[${projectName}] ${p.message}`);
                    }
                }
            }); 

            promise.then((result) => {
                console.log(`✓ Worker xong: ${projectName}, XML=${result.xmlCount}, ${result.durationMs}ms`);
                setStatusBarMessage(`✓ Đã phân tích ${result.xmlCount} file XML`, 3000);
            }).catch((error) => {
                console.error('Lỗi khi phân tích XML (worker):', error);
                setStatusBarMessage(`✗ Lỗi phân tích XML: ${error.message}`, 5000);
            }).finally(() => {
                this.projectsAnalysisInProgress.delete(projectName);
            });
        }, 1000); // Chờ 1000ms (1 giây) sau lần gọi cuối

        // Lưu timeout vào Map
        this.analystAllTimeouts.set(projectName, timeoutId);
    }

    /**
     * Phiên bản analystAll với progress notification (blocking)
     * Dùng khi user chủ động gọi lệnh
     */
    analystAllWithProgress(filePath) {
        const v = getVscode();
        if (!v || !v.window) {
            throw new Error('VS Code API not available');
        }

        v.window.withProgress({
            location: v.ProgressLocation.Notification,
            title: "Đang phân tích dự án (worker)...",
            cancellable: true
        }, async (progress, token) => {
            const projectName = this.extractProjectName(filePath) || 'unknown';

            try {
                progress.report({ increment: 0, message: 'Khởi tạo...' });

                if (this.projectsAnalysisInProgress.has(projectName)) {
                    showWarningMessage(`Project ${projectName} đang phân tích, vui lòng đợi.`);
                    return;
                }
                this.projectsAnalysisInProgress.add(projectName);

                const { worker, promise } = this._startAnalysisWorker(filePath, {
                    projectName,
                    onProgress: (p) => {
                        progress.report({ increment: p.increment || 0, message: p.message || '' });
                    }
                });

                token.onCancellationRequested(() => {
                    try { worker.terminate(); } catch (e) { }
                });

                const result = await promise;
                progress.report({ increment: 100, message: 'Hoàn tất' });
                showInformationMessage(`✓ Đã phân tích và lưu ${result.xmlCount} file XML.`);
            } catch (error) {
                if (token.isCancellationRequested) {
                    showWarningMessage('Đã hủy phân tích.');
                    return;
                }
                showErrorMessage(`Lỗi khi phân tích: ${error.message}`);
            } finally {
                this.projectsAnalysisInProgress.delete(projectName);
            }
        });
    }

    run(context) {
        const v = getVscode();
        if (!v || !v.commands || !v.window) {
            return;
        }

        const analyzeXmlCommand = v.commands.registerCommand('fbo-autocomplete.analyzeXmlProject', () => {
            const editor = v.window.activeTextEditor;
            if (!editor) {
                showErrorMessage('Vui lòng mở một file XML trước!');
                return;
            }
            const filePath = editor.document.uri.fsPath;
            // Bắt đầu phân tích
            this.analystAllWithProgress(filePath);
        });
        context.subscriptions.push(analyzeXmlCommand);
        
        this.registerFileSaveListener();
        // this.registerFileOpenListener();
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
