const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

class EntityHoverProvider {
    constructor(extensionDirectory) {
        this.jsonEntityFolder = path.join(extensionDirectory, "ReadXML" , "JsonEntity");
    }  
    provideHover(document, position) {
        const range = document.getWordRangeAtPosition(position, /&[\w.]+;/);
        if (!range) {
            return null;
        }
        const entity = document.getText(range).slice(1, -1); // Bỏ '&' và ';'
        const filePath = document.uri.fsPath
        // Kiểm tra thư mục JsonEntity
        if (!fs.existsSync(this.jsonEntityFolder)) {
            return new vscode.Hover("Error: JsonEntity folder not found.");
        } 
        const files = fs.readdirSync(this.jsonEntityFolder);
        for (const file of files) {
            // Dịch ngược tên file từ Base64
            const decodedPath = Buffer.from(path.basename(file, ".json"), "base64").toString("utf8");
            if (decodedPath === filePath) {
                // Đọc và tìm kiếm entity trong file JSON
                const fileContent = JSON.parse(fs.readFileSync(path.join(this.jsonEntityFolder, file), "utf8"));
                const entityContent = fileContent.find((item) => item.Name === entity);
                
                if (entityContent) {
                    // Markdown để hiển thị nội dung nổi bật
                    const markdownContent = new vscode.MarkdownString();
                    markdownContent.appendMarkdown(`### 🎯 Entity Content 🎯 \n`);
                    markdownContent.appendMarkdown("```plaintext\n" + entityContent.Content + "\n```");
                    markdownContent.isTrusted = true; // Cho phép markdown có nội dung nhúng
                    
                    return new vscode.Hover(markdownContent);
                }
            }
        }
        return new vscode.Hover("Entity not found.");
    }
    findContent (entity, filePath) {
        // Kiểm tra thư mục JsonEntity
        if (!fs.existsSync(this.jsonEntityFolder)) {
            return new vscode.Hover("Error: JsonEntity folder not found.");
        } 
        entity = entity.slice(1, -1); // Bỏ '&' và ';'
        const files = fs.readdirSync(this.jsonEntityFolder);
        for (const file of files) {
            // Dịch ngược tên file từ Base64
            const decodedPath = Buffer.from(path.basename(file, ".json"), "base64").toString("utf8");
            if (decodedPath === filePath) {
                // Đọc và tìm kiếm entity trong file JSON
                const fileContent = JSON.parse(fs.readFileSync(path.join(this.jsonEntityFolder, file), "utf8"));
                const entityContent = fileContent.find((item) => item.Name === entity);
                return entityContent.Content;
            }
        }
        return "";
    }

}

module.exports = EntityHoverProvider;
