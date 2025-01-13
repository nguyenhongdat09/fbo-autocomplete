const vscode = require('vscode');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
// Đường dẫn tới file JSON chứa thông tin tài khoản dịch vụ
const credentialsPath = path.join(__dirname, 'autocompletesheet-447706-3cfebe8ddb5a.json');
const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
// Tạo client từ tài khoản dịch vụ
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
// Đường dẫn tới file JSON để lưu dữ liệu
const autocompleteJsonPath = path.join(__dirname, './Database/AutoComplete/AutoComplete.json');

class CompleteCodeByHandle {
    constructor(sheetId) {
        this.sheetId = sheetId;
        this.companyFunctions = [];
        this.dirField = [];
        this.gridInputField = [];
        this.gridViewField = [];
        this.filterField = [];
    }

    // Gọi API và lưu dữ liệu vào file JSON
    async loadFunctions() {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Saving To AutoComplete.json`,
            cancellable: false
        }, async (progress, token) => {
            try {
                const sheets = google.sheets({ version: 'v4', auth });
                const range = 'AutoComplete!A2:C'; // Lấy từ hàng 2 trở đi, cột A đến C
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: this.sheetId,
                    range,
                });
                const rows = response.data.values;
                if (rows && rows.length) {
                    const data = rows.map(([label, detail, insertText]) => ({
                        label,
                        detail: detail || '', // Đảm bảo không có giá trị undefined
                        insertText: insertText || '',
                    }));
    
                    // Lưu dữ liệu vào file JSON
                    fs.writeFileSync(autocompleteJsonPath, JSON.stringify(data, null, 2), 'utf8');
                    this.companyFunctions = data;
              
                    console.log('Data saved to AutoComplete.json');
                } else {
                    console.warn('No data found in the sheet.');
                }
            } catch (error) {
                console.error('Error loading Google Sheets data:', error);
            }
        });
        
    }

    // Đọc dữ liệu từ file JSON
    loadFromJson() {
        const gridViewJsonPath = path.join(__dirname, './Database/AutoComplete/GridView.json');
        const gridInputJsonPath = path.join(__dirname, './Database/AutoComplete/GridInput.json');
        const dirJsonPath = path.join(__dirname, './Database/AutoComplete/Dir.json');
        const filterInputJsonPath = path.join(__dirname, './Database/AutoComplete/Filter.json');
        try {
            if (fs.existsSync(autocompleteJsonPath)) {
                this.companyFunctions = JSON.parse(fs.readFileSync(autocompleteJsonPath, 'utf8')); 
                this.gridViewField = JSON.parse(fs.readFileSync(gridViewJsonPath, 'utf8')); 
                this.gridInputField = JSON.parse(fs.readFileSync(gridInputJsonPath, 'utf8')); 
                this.dirField = JSON.parse(fs.readFileSync(dirJsonPath, 'utf8')); 
                this.filterField = JSON.parse(fs.readFileSync(filterInputJsonPath, 'utf8'));  
            } else {
                console.warn('AutoComplete.json not found. Please run "Get Data Autocomplete" command.');
            }
        } catch (error) {
            console.error('Error loading data from JSON:', error);
        }
    }

    provideCompletionItems(document, position) {
        // Lấy toàn bộ đoạn văn bản trước vị trí hiện tại
        const linePrefix = document.lineAt(position).text.substr(0, position.character);
        const exclude = ['$gi.', '$gv.', '$f.'];
        if (exclude.some(prefix => linePrefix.includes(prefix))) {
            return undefined;
        }
        // Biểu thức chính quy được sửa đổi để hỗ trợ gạch dưới (_)
        const match = linePrefix.match(/\b([a-zA-Z_][a-zA-Z0-9_]*\.)?([a-zA-Z0-9_]*)$/);
        if (!match) {
            return undefined;
        }
        const [, objectPrefix, partialFunction] = match;
        // Nếu có objectPrefix (vd: "a."), tìm các chức năng liên quan
        if (objectPrefix) {
            return this.companyFunctions
                .filter(func => func.label.toLowerCase().includes(partialFunction.toLowerCase())) // So khớp bất kể chữ hoa/thường
                .map(func => this.createCompletionItem(func));
        }
    
        // Nếu không có objectPrefix, trả về undefined (không gợi ý gì)
        return undefined;
    }


    provideCompletionFieldItems(document, position) {
        // Lấy toàn bộ đoạn văn bản trước vị trí hiện tại
        const linePrefix = document.lineAt(position).text.substr(0, position.character);
    
    
        // Biểu thức chính quy kiểm tra tiền tố hợp lệ 
        var f_prefix = linePrefix.trim().substring(0, 2); 
        var gi_prefix = linePrefix.trim().substring(0, 3);
        // Kiểm tra nếu objectPrefix thuộc danh sách include
        if (!(f_prefix === '$f' || gi_prefix === '$gi' || gi_prefix === '$gv')) {
            return undefined;
        }
        var name_folder = this.getFolderName(linePrefix, document);
        
        if (name_folder == '') {
            return undefined;
        } 
        var arr = [];
        const match = linePrefix.match(/\b([a-zA-Z_][a-zA-Z0-9_]*\.)?([a-zA-Z0-9_]*)$/);
        if (!match) {
            return undefined;
        }
        const [, objectPrefix, partialFunction] = match;
        if (objectPrefix) {
           
        switch (name_folder) {
            case 'GridInput':
                arr = this.gridInputField;
                break;
            case 'GridView':
                arr = this.gridViewField;
                break;
            case 'Dir':
                arr = this.dirField;
                break;
            case 'Filter':
                arr = this.filterField;
                break;
            default:
                break;
        }
        
        return arr
        .filter(func => func.label.toLowerCase().includes(partialFunction.toLowerCase())) // So khớp bất kể chữ hoa/thường
            .map(func => this.createCompletionItem(func));
        }
        return undefined;
    }
    
    getFolderName(inputText, document) {
        let prefixFolder = '';
        const path = document.uri.path;
        
        if (inputText.trim().startsWith('$f')) {
            if (path.includes('Dir')) {
                prefixFolder = 'Dir';
            } else if (path.includes('Filter')) {
                prefixFolder = 'Filter';
            }
        } else if (path.includes('Grid')) {
            if (inputText.trim().startsWith('$gv')) {
                prefixFolder = 'GridView';
            } else if (inputText.trim().startsWith('$gi')) {
                prefixFolder = 'GridInput';
            }
        }
        return prefixFolder;
    } 

    createCompletionItem(func) {
        const item = new vscode.CompletionItem(func.label, vscode.CompletionItemKind.Function);
        item.detail = func.detail;
        item.insertText = new vscode.SnippetString(func.insertText);
        return item;
    }
}

module.exports = CompleteCodeByHandle;
 