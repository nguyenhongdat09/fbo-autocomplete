const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const entityResolver = require("../ReadXMLByJS/entityResolver");

class CheckLegacyCode {
    constructor(context) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection("checkLegacyCode");
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.currentCheckId = 0;
    }
    
    async run() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const dirPath = path.dirname(editor.document.uri.fsPath).replace(/\\/g, '/').toLowerCase(); // 👈 chỉ lấy thư mục chứa file
        if (!(dirPath.includes('controllers/dir') || dirPath.includes('controllers/filter'))) {
            return;
        }
        
        // Sinh ID cho lần chạy này để hủy bỏ (abort) nếu user bấm Ctrl+S liên tục
        this.currentCheckId++;
        const checkId = this.currentCheckId;

        this.statusBarItem.text = "$(sync~spin) Checking legacy...";
        this.statusBarItem.tooltip = "Đang kiểm tra lỗi thiếu field trong XML...";
        this.statusBarItem.show();

        const tStart = Date.now();
        console.log("[FBO_PERF_DEBUG] [CheckLegacy] Running check for:", editor.document.uri.fsPath);
        var content = vscode.window.activeTextEditor.document.getText();

        // 🎯 Tối ưu: Chỉ trích xuất & giải mã Entity trong khối <fields> và <views> (bao gồm <category>)
        // Giúp bỏ qua toàn bộ phần SQL <query>, <commands>, <clientScript>... nặng nề
        const fieldsBlockRegex = /<fields>([\s\S]*?)<\/fields>/gi;
        const viewsBlockRegex = /<(views|category)>([\s\S]*?)<\/(views|category)>/gi;

        let iterations = 0;
        const maxIterations = 5;
        let hasReplaced = true;
        
        while (hasReplaced && iterations < maxIterations) {
            hasReplaced = false;
            iterations++;
            await new Promise(resolve => setTimeout(resolve, 2));
            if (this.currentCheckId !== checkId) return;

            // Tìm tất cả các entity chỉ nằm trong phạm vi <fields> hoặc <views>/<category>
            let targetSections = "";
            let match;
            fieldsBlockRegex.lastIndex = 0;
            while ((match = fieldsBlockRegex.exec(content)) !== null) {
                targetSections += match[0] + "\n";
            }
            viewsBlockRegex.lastIndex = 0;
            while ((match = viewsBlockRegex.exec(content)) !== null) {
                targetSections += match[0] + "\n";
            }

            if (!targetSections) break;

            var ent_content = this.replaceEntity(targetSections);
            if (ent_content.length === 0) break;

            try {
                const entityMap = new Map();
                for (var ent of ent_content) {
                    if (ent.content !== '') {
                        entityMap.set(ent.entity, ent.content.replace(/\r?\n/g, ' '));
                    }
                }
                if (entityMap.size === 0) break;

                const entityRegex = new RegExp(
                    [...entityMap.keys()].map(k => this.escapeRegExp(k)).join('|'), 'g'
                );
                const nextContent = content.replace(
                    entityRegex, match => entityMap.get(match) || match
                );
                if (nextContent !== content) {
                    content = nextContent;
                    hasReplaced = true;
                }
            } catch (er) {
                console.error(er);
                break;
            }
        }

        if (this.currentCheckId !== checkId) return;
        
        // Giữ nguyên 100% logic trích xuất field và so sánh
        var field_item = this.getFieldOnView(content);
        var fields_declare = this.getFieldOnFields(content);

        this.checkLegacyItem(editor, field_item, fields_declare);
        console.log(`[FBO_PERF_DEBUG] [CheckLegacy] END took ${Date.now() - tStart}ms`);
        
        if (this.currentCheckId === checkId) {
            this.statusBarItem.hide();
        }
    }

    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    replaceEntity(content) {
        const regex = /&[^;\s]+;/g;
        var entities = content.match(regex) || [];
        const uniqueEntities = [...new Set(entities)];
        
        var parsedEntities = uniqueEntities.map((entity) => {
            return { entity, entity_variable: entity.replace(/&|;/g, '') }
        });
        parsedEntities = parsedEntities.filter((item) =>
            !['&gt', '&lt', '&amp', '&quot', '&apos'].includes(item.entity)
        );
        var entityMapping = this.readEntity(parsedEntities.map((item) => item.entity_variable));
        if (entityMapping.length == 0) return [];
        
        var entities_content = parsedEntities.map((item) => {
            var entity = item.entity;
            var content = entityMapping.find((ent) =>
                ent.Name == item.entity_variable
            );
            if (content) {
                var ent_ct = content.Content;
                return { entity, content: ent_ct };
            } else {
                return { entity, content: '' };
            }
        });
        return entities_content;
    }

    checkLegacyItem(editor, field_item, fields_declare) {
        const self = this; // Giữ lại `this`
        const error_item = field_item.filter((item) => item.key.length !== item.fields.length);
        const diagnostics = [];
        const document = editor.document;
        let diagnostic;
        function thua_thieu(diagnostics) {
            error_item.forEach((item) => {
                let line = item.line || 0;
                if (item.key.length > item.fields.length) {
                    diagnostic = self.setDiag(line, `Lỗi "thừa" phần tử 1: \n - Số phần tử 1 là "${item.key.length}" \n - Số field là "${item.fields.length}" `, document);
                } else {
                    diagnostic = self.setDiag(line, `Lỗi "thiếu" phần tử 1: \n - Số phần tử 1 là "${item.key.length}" \n - Số field là "${item.fields.length}"`, document);
                }
                diagnostics.push(diagnostic);
            });
        }
    
        const field_distinct = field_item.map(item => ({
            fields: [...new Set(item.fields)],
            line: item.line
        }));
    
        function chua_khai_bao_Field(diagnostics) {
            const fieldDeclSet = new Set(fields_declare.map(item => item.key));
            field_distinct.forEach(item_distinct => {
                const fields = item_distinct.fields, line = item_distinct.line || 0;
                fields.forEach(field => {
                    if (!fieldDeclSet.has(field)) {
                        diagnostic = self.setDiag(line, `Field: ${field} chưa khai báo ở Fields.`, document);
                        diagnostics.push(diagnostic);
                    }
                });
            });
        }
    
        function chua_khai_bao_Field_xuong_view(diagnostics) {
            // Build Set tất cả field đã khai báo trên view → tra cứu O(1)
            const allViewFields = new Set();
            for (const item of field_distinct) {
                for (const f of item.fields) allViewFields.add(f);
            }
            fields_declare.forEach(item_field => {
                const field = item_field.key, line = item_field.line || 0;
                if (!allViewFields.has(field)) {
                    diagnostic = self.setDiag(line, `Chưa khai báo Field: ${field} xuống thẻ view`, document);
                    diagnostics.push(diagnostic);
                }
            });
        }
    
        // Gọi các hàm xử lý
        thua_thieu(diagnostics);
        chua_khai_bao_Field(diagnostics);
        chua_khai_bao_Field_xuong_view(diagnostics);
        self.diagnosticCollection.set(editor.document.uri, diagnostics);
    }
    

    setDiag(line, message, document) {
        let _line = line - 1
        let range = new vscode.Range(_line, 0, _line, document.lineAt(_line).text.length);
        return new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
    }

    getFieldOnFields(content) {
        try {
            const fieldsRegex = /<fields>([\s\S]*?)<\/fields>/g;
            const fieldsMatch = fieldsRegex.exec(content);
            if (!fieldsMatch) {
                return [];
            }
            var xmlFields = fieldsMatch[0];
            const xmlFieldsStart = fieldsMatch.index;
            const fieldRegex = /<field[^>]*name="([^"]+)"[^>]*>[\s\S]*?<\/field>/g;
            const result = [];
            
            // Đếm số newline trước xmlFieldsStart 1 lần O(N)
            let baseLineNumber = 1;
            for (let k = 0; k < xmlFieldsStart; k++) {
                if (content[k] === '\n') baseLineNumber++;
            }
            
            // Duyệt tuần tự: đếm newline tăng dần O(1) trung bình thay vì findIndex O(L) mỗi lần
            let lastMatchIdx = 0;
            let currentLine = baseLineNumber;

            let match;
            while ((match = fieldRegex.exec(xmlFields)) !== null) {
                var key_t = match[1];
                var value_t = match[0];
                // **Bỏ qua field có filterSource="Vacant"**
                if (/filterSource="Vacant"/.test(value_t)) continue;
                
                // Đếm newline từ lastMatchIdx đến match.index (tăng dần)
                for (let k = lastMatchIdx; k < match.index; k++) {
                    if (xmlFields[k] === '\n') currentLine++;
                }
                lastMatchIdx = match.index;

                result.push({ key: key_t, value: value_t, line: currentLine });
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
            // Đếm dòng tăng dần theo match.index thay vì findIndex O(L) mỗi lần
            let lastMatchIdx = 0;
            let currentLine = 1;
            
            while ((match = regex.exec(content)) !== null) {
                var key = match[1].trim().replace(/[0-]/g, '');
                // Tìm các field nằm trong ngoặc vuông []
                const fieldMatches = match[2].match(/\[([^\]]+)\]/g) || [];
                var fields = fieldMatches.map(field => field.replace(/\[|\]/g, "").trim());
                
                // Đếm newline từ lastMatchIdx đến match.index (tăng dần)
                for (let k = lastMatchIdx; k < match.index; k++) {
                    if (content[k] === '\n') currentLine++;
                }
                lastMatchIdx = match.index;
                
                results.push({ key, fields, line: currentLine });
            }
            return results;
        } catch (error) {
            vscode.window.showErrorMessage(`Error parsing XML`);
            return [];
        }
    }

    readEntity(entities) {
        try {
            const filePath = vscode.window.activeTextEditor.document.uri.fsPath;
            const generalEntities = entityResolver.getEntitiesForFile(filePath);
            if (!generalEntities) {
                return [];
            }
            
            const result = [];
            // DEDUPLICATE entities to avoid N * M redundant disk reads on the main thread
            const uniqueEntities = [...new Set(entities)];
            
            for (const name of uniqueEntities) {
                const entityDecl = generalEntities[name];
                if (entityDecl) {
                    let content = "";
                    if (entityDecl.systemUrl) {
                        try {
                            content = entityResolver.readFileContent(entityDecl.sourceFile);
                        } catch (err) {
                            content = "";
                        }
                    } else {
                        content = entityDecl.value || "";
                    }
                    result.push({
                        Name: name,
                        Content: content
                    });
                }
            }
            return result;
        } catch (err) {
            console.error("[FBO CheckLegacyCode] readEntity failed:", err);
            return [];
        }
    }

}

module.exports = CheckLegacyCode;