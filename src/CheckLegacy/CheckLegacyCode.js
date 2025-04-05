const vscode = require('vscode');
const fs = require('fs');
const path = require('path')
class CheckLegacyCode {
    constructor(extensionDirectory) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection("checkLegacyCode");
        this.jsonEntityFolder = path.join(extensionDirectory, '..', "ReadXML", "JsonEntity");
    }

    getFilePathEntity() {
        // Kiểm tra thư mục JsonEntity
        var filePath = vscode.window.activeTextEditor.document.uri.fsPath;
        var fileContent;
        if (!fs.existsSync(this.jsonEntityFolder)) {
            return;
        }
        const files = fs.readdirSync(this.jsonEntityFolder);
        for (const file of files) {
            // Dịch ngược tên file từ Base64
            const decodedPath = Buffer.from(path.basename(file, ".json"), "base64").toString("utf8");
            if (decodedPath === filePath) {
                const fileContent = JSON.parse(fs.readFileSync(path.join(this.jsonEntityFolder, file), "utf8"));
                return fileContent;
            }
            if (fileContent) break;
        }
    }
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape các ký tự đặc biệt
    }
    run() {
        var editor = vscode.window.activeTextEditor;
        if (!editor) return;
        var filePath = vscode.window.activeTextEditor.document.uri.fsPath;

        if (!(filePath.includes('Dir') || filePath.includes('Filter'))) {
            // vscode.window.showErrorMessage('This feature work on Dir/Fitler Folder')
            return
        }
        var content = vscode.window.activeTextEditor.document.getText();

        // Tách phần DOCTYPE (nếu có)
       
        let doctypeMatch = content.match(/<!DOCTYPE[\s\S]*?\]>/);
        let doctypeSection = doctypeMatch ? doctypeMatch[0] : "";
        let contentWithoutDoctype = doctypeMatch ? content.replace(doctypeSection, "") : content;
        // Thay thế entity chỉ trong phần ngoài DOCTYPE
        var ent_content = this.replaceEntity(contentWithoutDoctype);
        try {
            for (var ent of ent_content) {
                if (ent.content !== '') {
                    contentWithoutDoctype = contentWithoutDoctype.replace(ent.entity, ent.content);
                }
            }
        } catch (er) {
            console.error(er);
        }
        
        // Ghép lại DOCTYPE với nội dung đã thay thế
        content = doctypeSection + contentWithoutDoctype;
        
        var field_item = this.getFieldOnView(content);
        var fields_declare = this.getFieldOnFields(content); 

        this.checkLegacyItem(editor, field_item, fields_declare)
    }

    replaceEntity(content) {
        const regex = /&[^;\s]+;/g; //Lay ra entity 
        var entities = content.match(regex) || [];
        entities = entities.map((entity) => {
            return { entity, entity_variable: entity.replace(/&|;/g, '') }
        })
        entities = entities.filter((item) =>
            !['&gt', '&lt'].includes(item.entity)
        )
        var entityMapping = this.readEntity(entities.map((item) => item.entity_variable));
        if (entityMapping.length == 0) return []
        var entities_content = entities.map((item) => {
            var entity = item.entity;
            var content = entityMapping.find((ent) =>
                ent.Name == item.entity_variable
            )
            if (content) {
                var ent_ct = content.Content
                return { entity, content: ent_ct }
            } else
                return { entity, content: '' }
        })
        return entities_content
    }

    checkLegacyItem(editor, field_item, fields_declare) {
        const error_item = field_item.filter((item) => item.key.length !== item.fields.length);
        
        const diagnostics = [];
        const document = editor.document;
        let diagnostic;
        error_item.forEach((item) => {
            let line = item.line || 0; // Lấy số dòng, mặc định là 0 nếu không tìm thấy
            if (item.key.length > item.fields.length) {
                diagnostic = this.setDiag(line, `Lỗi "thừa" phần tử 1: \n - Số phần tử 1 là "${item.key.length}" \n - Số field là "${item.fields.length}" `, document)
            } else {
                diagnostic = this.setDiag(line, `Lỗi "thiếu" phần tử 1: \n - Số phần tử 1 là "${item.key.length}" \n - Số field là "${item.fields.length}"`, document)
            }
            diagnostics.push(diagnostic);
        });
        var field_distinct = field_item.map(item => ({
            fields: [...new Set(item.fields)], // Loại bỏ phần tử trùng trong fields
            line: item.line // Giữ nguyên số dòng
        }))
        var field_dlr = fields_declare.map((item) => {
            return item.key;
        })

        field_distinct.forEach((item_distinct) => {
            var fields = item_distinct.fields, line = item_distinct.line || 0;
            fields.map((field) => {
                if (!field_dlr.includes(field)) {
                    diagnostic = this.setDiag(line, `Field: ${field} chưa khai báo ở Fields.`, document)
                    diagnostics.push(diagnostic);
                }
            })
        })

        fields_declare.forEach((item_field) => {
            var field = item_field.key, line = item_field.line || 0, check = true;
            for (const item_distinct of field_distinct) {
                var fields = item_distinct.fields;
                if (fields.includes(field) && check) {
                    check = false;
                    break;
                }
            }
            if (check) {
                diagnostic = this.setDiag(line, `Chưa khai báo Field: ${field} xuống thẻ view`, document)
                diagnostics.push(diagnostic);
            }
        })
        this.diagnosticCollection.set(editor.document.uri, diagnostics);
    }

    setDiag(line, message, document) {
        let _line = line - 1
        let range = new vscode.Range(_line, 0, _line, document.lineAt(_line).text.length);
        return new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
    }

    getFieldOnFields(content) {
        try {
            const fieldsRegex = /<fields>([\s\S]*?)<\/fields>/g;
            const fieldsMatches = content.match(fieldsRegex);
            if (!fieldsMatches) {
                return [];
            }
            var xmlFields = fieldsMatches[0];
            const fieldRegex = /<field[^>]*name="([^"]+)"[^>]*>[\s\S]*?<\/field>/g;
            const result = []; 
            // Tách content thành từng dòng để xác định số dòng
            const lines = content.split('\n');

            let match;
            while ((match = fieldRegex.exec(xmlFields)) !== null) {
                var key_t = match[1];
                var value_t = match[0];
                 // **Bỏ qua field có filterSource="Vacant"**
                if (/filterSource="Vacant"/.test(value_t)) continue;
                // **Tìm dòng đầu tiên có chứa key**
                let lineNumber = lines.findIndex(line => line.includes(`name="${key_t}"`)) + 1;

                result.push({ key: key_t, value: value_t, line: lineNumber });
            }
            return result;
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error parsing XML`);
            return [];
        }
    }

    getFieldOnView(content) {
        try {
            const regex = /<item value="([^"]+):\s*([^"]+)"/g;
            let match;
            const results = [];
            // Tách content thành từng dòng
            const lines = content.split('\n');  
            while ((match = regex.exec(content)) !== null) {
                var key = match[1].trim().replace(/[0-]/g, '');
                // Tìm các field nằm trong ngoặc vuông []
                const fieldMatches = match[2].match(/\[([^\]]+)\]/g) || [];
                var fields = fieldMatches.map(field => field.replace(/\[|\]/g, "").trim());
                // Tìm số dòng chứa match
                let lineNumber = lines.findIndex(line => line.includes(match[0])) + 1; 
                results.push({ key, fields, line: lineNumber });
            }
            return results;
        } catch (error) {
            vscode.window.showErrorMessage(`Error parsing XML`);
            return [];
        }
    }

    readEntity(entities) {
        try {
            this.entitiesContent = this.getFilePathEntity()
            if (this.entitiesContent)
                return this.entitiesContent.filter((item) => entities.includes(item.Name));
            else
                return [];

        } catch (err) {
            console.log(err)
            return [];
        }
    }

}

module.exports = CheckLegacyCode;