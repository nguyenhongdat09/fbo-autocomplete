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
        try {
            if (fs.existsSync(autocompleteJsonPath)) {
                const data = JSON.parse(fs.readFileSync(autocompleteJsonPath, 'utf8')); 
                this.companyFunctions = data;
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
    
    createCompletionItem(func) {
        const item = new vscode.CompletionItem(func.label, vscode.CompletionItemKind.Function);
        item.detail = func.detail;
        item.insertText = new vscode.SnippetString(func.insertText);
        return item;
    }
}

module.exports = CompleteCodeByHandle;
 