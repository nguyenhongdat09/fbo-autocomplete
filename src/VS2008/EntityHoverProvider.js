const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const ReadXMLRunner = require("./ReadXMLRunner");
const entityResolver = require("../ReadXMLByJS/entityResolver");
  
class EntityHoverProvider {

    constructor(extensionDirectory, context) {
        this.extensionPath = context.extensionPath;
        /** @type {string | null} Nội dung entity lần hover gần nhất (để copy) */
        this._lastEntityContent = null;
        /** @type {string | null} Nội dung entity phẳng lần hover gần nhất (để copy flat) */
        this._lastFlatEntityContent = null;
        /** @type {string | null} Tên entity lần hover gần nhất */
        this._lastEntityName = null;
        /** @type {string | null} Đường dẫn file XML lần hover gần nhất (để reload entity) */
        this._lastEntityFilePath = null;
        /** @type {import('./ReloadEntityBySave') | null} */
        this._reloadEntityBySave = null;
        /** @type {string} Chế độ hover hiện tại ('original' hoặc 'flat') */
        this.hoverMode = 'original';
    }

    /**
     * @param {import('./ReloadEntityBySave')} reloadEntityBySave
     */
    setReloadEntityBySave(reloadEntityBySave) {
        this._reloadEntityBySave = reloadEntityBySave || null;
    }

    /**
     * Chuyển đổi trạng thái hover giữa Original và Flat
     */
    toggleHoverMode() {
        this.hoverMode = this.hoverMode === 'original' ? 'flat' : 'original';
        vscode.window.showInformationMessage(`Đã chuyển sang chế độ hiển thị ${this.hoverMode === 'flat' ? 'Flat' : 'Original'}. Hãy hover lại để xem kết quả.`);
    }

    /**
     * Copy nội dung Entity gốc hover lần gần nhất vào clipboard (dùng cho command entityHoverCopyContent).
     */
    async copyContentToClipboard() {
        const text = this._lastEntityContent || "";
        if (!text) {
            vscode.window.showInformationMessage("Không có nội dung Entity để copy.");
            return;
        }
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage("Đã copy Original.");
    }

    /**
     * Copy nội dung Entity phẳng (đã flat hết entity lồng và unescape ký tự đặc biệt) vào clipboard.
     */
    async copyFlatContentToClipboard() {
        const text = this._lastFlatEntityContent || "";
        if (!text) {
            vscode.window.showInformationMessage("Không có nội dung Entity để copy.");
            return;
        }
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage("Đã copy Flat.");
    }

    /**
     * Giải mã các ký tự XML entity thành ký tự gốc
     * @param {string} str 
     * @returns {string}
     */
    unescapeXmlEntities(str) {
        if (!str) return str;
        return str
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(Number(dec)))
            .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/&amp;/g, '&');
    }

    /**
     * Đệ quy thay thế các &EntityName; bằng nội dung thực thể tương ứng (có cache để chống lỗi vòng lặp/vượt quá stack/tính toán quá lâu)
     * @param {string} text 
     * @param {string} filePath 
     * @param {string[]} expandingStack 
     * @param {number} depth 
     * @param {Map<string, string>} memo 
     * @param {Object} generalEntities
     * @returns {string}
     */
    flattenEntityContent(text, filePath, expandingStack = [], depth = 0, memo = new Map(), generalEntities = null) {
        if (!text || depth > 20) return text || "";

        if (!generalEntities) {
            generalEntities = entityResolver.getEntitiesForFile(filePath) || {};
        }
        const entityPattern = /&([\w.-]+);/g;

        return text.replace(entityPattern, (match, entName) => {
            if (expandingStack.includes(entName)) {
                return match;
            }

            if (memo.has(entName)) {
                return memo.get(entName);
            }

            const entDecl = generalEntities[entName];
            if (!entDecl) {
                return match;
            }

            let rawContent = "";
            let sourceFile = entDecl.sourceFile || filePath;

            if (entDecl.systemUrl) {
                if (fs.existsSync(entDecl.sourceFile)) {
                    try {
                        rawContent = entityResolver.readFileContent(entDecl.sourceFile);
                    } catch (err) {
                        return match;
                    }
                } else {
                    return match;
                }
            } else {
                rawContent = entDecl.value || "";
            }

            const flat = this.flattenEntityContent(rawContent, sourceFile, [...expandingStack, entName], depth + 1, memo, generalEntities);
            memo.set(entName, flat);
            return flat;
        });
    }

    /**
     * Reload entity file XML đang hover (command entityHoverReload).
     */
    async reloadEntityForLastHover() {
        const filePath = this._lastEntityFilePath;
        if (!filePath) {
            vscode.window.showInformationMessage("Không có file XML để reload entity.");
            return;
        }
        if (!this._reloadEntityBySave) {
            vscode.window.showErrorMessage("Reload entity chưa được khởi tạo.");
            return;
        }
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Reload Entity",
                cancellable: false,
            }, () => this._reloadEntityBySave.reloadFile(filePath));
            this.invalidateFileCache(filePath);
            vscode.window.showInformationMessage("Đã reload entity.");
        } catch (err) {
            const message = err && err.message ? err.message : String(err);
            vscode.window.showErrorMessage("Reload entity thất bại: " + message);
        }
    }

     formatXml(xml) {
        const PADDING = ' '.repeat(2); // Đặt indent size
        const reg = /(>)(<)(\/*)/g;
        let pad = 0;
    
        // Thêm xuống dòng giữa các thẻ XML
        xml = xml.replace(reg, '$1\r\n$2$3');
        // Xử lý riêng các thẻ <title> và <header> để giữ format mong muốn
        // Bỏ qua thẻ self-closing (<header ... />) — regex cũ khớp tới </header> kế tiếp và làm hỏng cấu trúc
        xml = xml.replace(/<title(?![^>]*\/>)([^>]*)>[\s\S]*?<\/title>/g, (match, attrs) => {
            return `<title${attrs}>\r\n</title>`;
        });
    
        xml = xml.replace(/<header(?![^>]*\/>)([^>]*)>[\s\S]*?<\/header>/g, (match, attrs) => {
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
    
    
    appendHoverActionLinks(markdownContent) {
        const toggleText = this.hoverMode === 'original' ? 'Show Flat' : 'Show Original';
        markdownContent.appendMarkdown(`[Copy Original](command:fbo-autocomplete.entityHoverCopyContent) | [Copy Flat](command:fbo-autocomplete.entityHoverCopyFlatContent) | [${toggleText}](command:fbo-autocomplete.toggleHoverMode)\n\n`);
    }

    async provideHover(document, position) {
        const entityInfo = ReadXMLRunner.resolveEntityAtPosition(document, position);
        if (!entityInfo) {
            return null;
        }

        const entity = entityInfo.entityName;
        const filePath = document.uri.fsPath;

        this._lastEntityFilePath = filePath;
        this._lastEntityName = entity;

        const generalEntities = entityResolver.getEntitiesForFile(filePath);
        const entityDecl = generalEntities ? generalEntities[entity] : null;

        if (entityDecl) {
            let rawContent = "";
            if (entityDecl.systemUrl) {
                // Thực thể ngoài (External Entity): nạp từ tệp tin liên kết
                if (fs.existsSync(entityDecl.sourceFile)) {
                    try {
                        rawContent = entityResolver.readFileContent(entityDecl.sourceFile);
                    } catch (err) {
                        console.error("[FBO EntityHoverProvider] Read external file failed:", err);
                        rawContent = `<!-- Lỗi khi đọc file liên kết ngoài: ${entityDecl.sourceFile} -->`;
                    }
                } else {
                    rawContent = `<!-- Không tìm thấy file liên kết ngoài: ${entityDecl.sourceFile} -->`;
                }
            } else {
                // Thực thể nội bộ (Internal Entity)
                rawContent = entityDecl.value || "";
            }

            const markdownContent = new vscode.MarkdownString();
            markdownContent.appendMarkdown(`### 🎯 Entity Content: \`&${entity};\` 🎯 \n\n`);
            this.appendHoverActionLinks(markdownContent);

            // 1. Luôn tính toán Original
            let formattedContent = this.formatXml(rawContent);
            formattedContent = formattedContent.replace(/<(\w+)([^>]*)>\s*<\/\1>/g, '<$1$2></$1>');
            this._lastEntityContent = formattedContent;

            // 2. Luôn tính toán Flat (tính năng đệ quy đã được tối ưu cache nên rất nhẹ)
            let flatContent = this.flattenEntityContent(rawContent, filePath, [entity]);
            let formattedFlatContent = this.formatXml(flatContent);
            formattedFlatContent = formattedFlatContent.replace(/<(\w+)([^>]*)>\s*<\/\1>/g, '<$1$2></$1>');
            this._lastFlatEntityContent = formattedFlatContent;

            // 3. Chỉ render markdown hiển thị tùy theo trạng thái hoverMode
            if (this.hoverMode === 'original') {
                markdownContent.appendMarkdown(`#### 📝 Original:\n\`\`\`xml\n${formattedContent}\n\`\`\``);
            } else {
                markdownContent.appendMarkdown(`#### ⚡ Flat:\n\`\`\`xml\n${formattedFlatContent}\n\`\`\``);
            }

            markdownContent.isTrusted = true; // Cho phép markdown có nội dung nhúng
            return new vscode.Hover(markdownContent);
        }

        this._lastEntityContent = null;
        this._lastFlatEntityContent = null;
        const markdownContent = new vscode.MarkdownString();
        markdownContent.appendMarkdown(`### Entity not found: \`${entity}\`\n\n`);
        markdownContent.appendMarkdown("Entity không được tìm thấy trong DTD của file XML này.\n\n");
        markdownContent.isTrusted = true;
        return new vscode.Hover(markdownContent);
    }
 

    findContent (entity, filePath) {
        if (entity.startsWith('&') && entity.endsWith(';')) {
            entity = entity.slice(1, -1); // Bỏ '&' và ';'
        }
        const generalEntities = entityResolver.getEntitiesForFile(filePath);
        const entityDecl = generalEntities ? generalEntities[entity] : null;
        if (!entityDecl) {
            return "";
        }
        if (entityDecl.systemUrl) {
            if (fs.existsSync(entityDecl.sourceFile)) {
                try {
                    return entityResolver.readFileContent(entityDecl.sourceFile);
                } catch (err) {
                    return "";
                }
            }
        } else {
            return entityDecl.value || "";
        }
        return "";
    }

    clearEntityCache() {
        // Tự động clear thông qua việc không dùng cache cũ
    }

    invalidateFileCache(filePath) {
        if (!filePath) return;
        entityResolver.invalidateCache(filePath);
    }

    dispose() {
        this._lastEntityContent = null;
        this._lastFlatEntityContent = null;
        this._lastEntityName = null;
        this._lastEntityFilePath = null;
        this._reloadEntityBySave = null;
    }

}

module.exports = EntityHoverProvider;
