const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
  
class EntityHoverProvider {
    constructor(extensionDirectory) {
        this.jsonEntityFolder = path.join(extensionDirectory, '..', "ReadXML" , "JsonEntity");
    }  
     formatXml(xml) {
        const PADDING = ' '.repeat(2); // Đặt indent size
        const reg = /(>)(<)(\/*)/g;
        let pad = 0;
    
        // Thêm xuống dòng giữa các thẻ XML
        xml = xml.replace(reg, '$1\r\n$2$3');
        // Xử lý riêng các thẻ <title> và <header> để giữ format mong muốn
        xml = xml.replace(/<title([^>]*)>[\s\S]*?<\/title>/g, (match, attrs) => {
            return `<title${attrs}>\r\n</title>`;
        });
    
        xml = xml.replace(/<header([^>]*)>[\s\S]*?<\/header>/g, (match, attrs) => {
            return `<header${attrs}>\r\n</header>`;
        });
    
        return xml.split('\r\n').map((node, index) => {
            let indent = 0;
            if (node.match(/.+<\/\w[^>]*>$/)) {
                indent = 0;
            } else if (node.match(/^<\/\w/) && pad > 0) {
                pad -= 1;
            } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
                indent = 1;
            } else {
                indent = 0;
            }
    
            pad += indent;
    
            return PADDING.repeat(pad - indent) + node;
        }).join('\r\n');
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
                    let formattedContent;
                    
                    formattedContent = this.formatXml( entityContent.Content);
                    formattedContent = formattedContent.replace(/<(\w+)([^>]*)>\s*<\/\1>/g, '<$1$2></$1>');
                    markdownContent.appendMarkdown(`\`\`\`xml\n${formattedContent}\n\`\`\``);
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
