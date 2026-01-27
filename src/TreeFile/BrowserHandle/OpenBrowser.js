const vscode = require("vscode");
const path = require("path");
const AnalystXML = require("./AnalystXML");
const OpenLinkByChrome = require('./OpenLinkByChrome');

class OpenBrowser {
    constructor() {
        this.config = vscode.workspace.getConfiguration('fbo-autocomplete');
        this.analystXML = new AnalystXML();
        this.lastOpenedFilePath = null; // Lưu file path được mở lần cuối
    }

    /**
     * Trích xuất tên project từ đường dẫn (AVANTI, THAICHAU, etc.)
     * Input: \\172.168.5.14\CustomerPro\FBI\EPLUS_FBI\FBISP24\...
     * Output: EPLUS_FBI hoặc folder con thứ 2 sau CustomerPro
     */
    extractProjectNameFromPath(filePath) {
        const normalizedPath = filePath.replace(/\//g, '\\');
        if (!normalizedPath.includes('CustomerPro')) {
            return null;
        }
        const parts = normalizedPath.split('\\');
        const customerProIndex = parts.findIndex(part => part === 'CustomerPro');

        if (customerProIndex === -1) {
            return null;
        }

        // Lấy folder con thứ 2 sau CustomerPro (bỏ qua FBI)
        const projectName = parts[customerProIndex + 2];
        return projectName || null;
    }

    /**
     * Lấy URL từ file hiện tại đang mở
     */
    async getUrlFromCurrentFile(filePath = null) {
        const editor = vscode.window.activeTextEditor;

        // Ưu tiên: Nếu có editor đang mở, lấy file từ editor
        if (editor && filePath === null) {
            filePath = editor.document.uri.fsPath;
        }
         // Lưu cache nếu file hợp lệ
        if (filePath && (filePath.endsWith('.xml') || filePath.endsWith('.aspx'))) {
            this.lastOpenedFilePath = filePath;
        }
        // Nếu không có editor, dùng file được lưu trước đó
        else if (this.lastOpenedFilePath) {
            filePath = this.lastOpenedFilePath;
            console.log(`Sử dụng file được mở lần cuối: ${filePath}`);
        }
        // Không tìm thấy file
        else {
            vscode.window.showWarningMessage('Không có file nào đang mở. Vui lòng mở file XML hoặc ASPX.');
            return null;
        }

        // Chỉ xử lý file .xml hoặc .aspx
        if (!filePath.endsWith('.xml') && !filePath.endsWith('.aspx')) {
            vscode.window.showWarningMessage('File hiện tại không phải là XML hoặc ASPX.');
            return null;
        }
        // Lấy project name từ đường dẫn
        const projectName = this.extractProjectNameFromPath(filePath);
        if (!projectName) {
            vscode.window.showWarningMessage('Không thể xác định tên project từ đường dẫn.');
            return null;
        }
        // Nếu file là .aspx thì dùng trực tiếp
        if (filePath.endsWith('.aspx')) {
            const fileName = filePath.split(/[/\\]/).pop();
            const baseUrl = this.config.get('browserBaseUrl', 'http://172.168.5.14');
            return `${baseUrl}/${projectName}/Main/${fileName}`;
        }
        // Nếu file là .xml, tra cứu aspxName từ JSON
        var aspxName = await this.analystXML.lookupAspxNameByXmlPath(filePath);
        

        const baseUrl = this.config.get('browserBaseUrl', 'http://172.168.5.14');
        if (!aspxName) {
            //Chạy lại phân tích toàn bộ để cập nhật dữ liệu
            this.analystXML.refreshXmlFileOnSave(filePath);
        }
        //Load lại aspxName lần nữa sau khi phân tích
        aspxName = await this.analystXML.lookupAspxNameByXmlPath(filePath);
        if (!aspxName) {
            vscode.window.showWarningMessage('Không tìm thấy ASPX file tương ứng. Vui lòng chạy phân tích trước.');
            return `${baseUrl}/${projectName}`;
        }
        return `${baseUrl}/${projectName}/Main/${aspxName}`;
    }

    /**
     * Mở Simple Browser với URL của file hiện tại
     */
    async openBrowser(groupItem = null) {
        // Ưu tiên lấy URL từ file hiện tại đang mở
        let url = await this.getUrlFromCurrentFile();

        // Nếu không lấy được từ file hiện tại, fallback sang group (legacy)
        if (!url && groupItem) {
            url = this.getUrlFromGroup(groupItem);
        }

        if (!url) {
            vscode.window.showWarningMessage('Không thể xác định URL để mở.');
            return;
        }

        try {
            // Sử dụng VS Code Simple Browser
            await vscode.commands.executeCommand('simpleBrowser.show', url);
        } catch (err) {
            // Fallback: mở bằng browser ngoài
            vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }
    async openBrowserForItem(itemInGroup) {
        var filePath = itemInGroup.resourceUri._fsPath;
        var url = await this.getUrlFromCurrentFile(filePath);
        if (!url) {
            vscode.window.showWarningMessage('Không thể xác định URL để mở.');
            return;
        }
        try {
            // Mở trực tiếp bằng Chrome (nếu có cấu hình hoặc cài sẵn)
            await OpenLinkByChrome.openUrlInChrome(url);
        } catch (err) {
            console.error('Open in Chrome failed, fallback to default browser', err);
            // Fallback: mở bằng browser mặc định
            await vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }
    /**
     * Lấy URL từ group name (legacy - giữ lại cho tương thích)
     * Group name format: "THAICHAU - FBISP242" → lấy phần đầu "THAICHAU"
     */
    getUrlFromGroup(groupItem) {
        if (!groupItem || !groupItem.label) return null;

        // Group label: "THAICHAU - FBISP242" → lấy "THAICHAU"
        const groupLabel = groupItem.label;
        const projectName = groupLabel.split(' - ')[0].trim();

        if (!projectName || projectName === 'OTHER') {
            return null;
        }

        // Có thể config base URL trong settings
        const baseUrl = this.config.get('browserBaseUrl', 'http://172.168.5.14');
        const loginPath = this.config.get('browserLoginPath', '/Main/Login.aspx');

        return `${baseUrl}/${projectName}${loginPath}`;
    }

    /**
     * Mở URL tùy chọn (cho phép user nhập URL)
     */
    async openCustomUrl(groupItem = null) {
        // Ưu tiên lấy URL từ file hiện tại
        const defaultUrl = await this.getUrlFromCurrentFile()
            || (groupItem ? this.getUrlFromGroup(groupItem) : null)
            || 'http://172.168.5.14';

        const url = await vscode.window.showInputBox({
            prompt: 'Nhập URL để mở',
            value: defaultUrl,
            validateInput: (value) => {
                if (!value.startsWith('http://') && !value.startsWith('https://')) {
                    return 'URL phải bắt đầu bằng http:// hoặc https://';
                }
                return null;
            }
        });

        if (!url) return;

        try {
            await vscode.commands.executeCommand('simpleBrowser.show', url);
        } catch (err) {
            vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }
 
    /**
     * Mở browser cho file path cụ thể
     */
    async openBrowserForFile(filePath) {
        const url = await this.getUrlFromCurrentFile(filePath);
        if (!url) {
            vscode.window.showWarningMessage('Không thể xác định URL để mở.');
            return;
        }
        try {
            await vscode.commands.executeCommand('simpleBrowser.show', url);
        } catch (err) {
            await vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }

    /**
     * Đăng ký commands
     */
    registerCommands(context) {
        // Command: Mở browser với URL mặc định
        context.subscriptions.push(
            vscode.commands.registerCommand('fboFile.openBrowser', async (groupItem) => {
                await this.openBrowser(groupItem);
            })
        );
        // Command: Mở browser với URL mặc định
        context.subscriptions.push(
            vscode.commands.registerCommand('fbo-autocomplete.openBrowserForFile', async (IteminGroup) => {
               
               console.log(this.openBrowserForItem(IteminGroup));    

            })
        );

        // Command: Mở browser với URL tùy chọn
        context.subscriptions.push(
            vscode.commands.registerCommand('fboFile.openCustomBrowser', async (groupItem) => {
                await this.openCustomUrl(groupItem);
            })
        );
    }

  

}

module.exports = OpenBrowser;
