const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
  
class EntityHoverProvider {
    constructor(extensionDirectory, context) {
        this.jsonEntityFolder = path.join(context.extensionPath, 'src', "ReadXML" , "JsonEntity");
        /** @type {string | null} Nội dung entity lần hover gần nhất (để copy) */
        this._lastEntityContent = null;
        /** @type {string | null} Đường dẫn file XML lần hover gần nhất (để reload entity) */
        this._lastEntityFilePath = null;
        /** @type {import('./ReloadEntityBySave') | null} */
        this._reloadEntityBySave = null;
        /** @type {Map<string, { mtimeMs: number, data: Array<{Name:string, Content:string}> }>} */
        this._entityCacheByJsonPath = new Map();
        /** @type {Map<string, string>} */
        this._jsonPathBySourceFile = new Map();
    }

    getLastEntityContent() {
        return this._lastEntityContent || "";
    }

    /**
     * @param {import('./ReloadEntityBySave')} reloadEntityBySave
     */
    setReloadEntityBySave(reloadEntityBySave) {
        this._reloadEntityBySave = reloadEntityBySave || null;
    }

    /**
     * Copy nội dung Entity hover lần gần nhất vào clipboard (dùng cho command entityHoverCopyContent).
     */
    async copyContentToClipboard() {
        const text = this._lastEntityContent || "";
        if (!text) {
            vscode.window.showInformationMessage("Không có nội dung Entity để copy.");
            return;
        }
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage("Đã copy.");
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
    
    
    appendHoverActionLinks(markdownContent, includeCopy) {
        if (includeCopy) {
            markdownContent.appendMarkdown(
                "[Copy to clipboard](command:fbo-autocomplete.entityHoverCopyContent) | " +
                "[Reload Entity](command:fbo-autocomplete.entityHoverReload)\n\n"
            );
        } else {
            markdownContent.appendMarkdown(
                "[Reload Entity](command:fbo-autocomplete.entityHoverReload)\n\n"
            );
        }
    }

    provideHover(document, position) {
        const range = document.getWordRangeAtPosition(position, /&[\w.]+;/);
        if (!range) {
            return null;
        }
        const entity = document.getText(range).slice(1, -1); // Bỏ '&' và ';'
        const filePath = document.uri.fsPath;
        this._lastEntityFilePath = filePath;
        // Kiểm tra thư mục JsonEntity
        if (!fs.existsSync(this.jsonEntityFolder)) {
            console.log(this.jsonEntityFolder);
            const markdownContent = new vscode.MarkdownString();
            markdownContent.appendMarkdown("Error: JsonEntity folder not found.\n\n");
            this.appendHoverActionLinks(markdownContent, false);
            markdownContent.isTrusted = true;
            return new vscode.Hover(markdownContent);
        }
        const fileContent = this.loadEntitiesForFile(filePath);
        const entityContent = fileContent ? fileContent.find((item) => item.Name === entity) : null;
        if (entityContent) {
            // Markdown để hiển thị nội dung nổi bật
            const markdownContent = new vscode.MarkdownString();
            markdownContent.appendMarkdown(`### 🎯 Entity Content 🎯 \n\n`);
            this.appendHoverActionLinks(markdownContent, true);
            let formattedContent;

            formattedContent = this.formatXml(entityContent.Content);
            formattedContent = formattedContent.replace(/<(\w+)([^>]*)>\s*<\/\1>/g, '<$1$2></$1>');
            this._lastEntityContent = formattedContent;

            markdownContent.appendMarkdown(`\`\`\`xml\n${formattedContent}\n\`\`\``);
            markdownContent.isTrusted = true; // Cho phép markdown có nội dung nhúng
            return new vscode.Hover(markdownContent);
        }
        this._lastEntityContent = null;
        const markdownContent = new vscode.MarkdownString();
        markdownContent.appendMarkdown(`### Entity not found: \`${entity}\`\n\n`);
        markdownContent.appendMarkdown("Entity chưa có trong cache. Bấm **Reload Entity** để đọc lại từ file XML.\n\n");
        this.appendHoverActionLinks(markdownContent, false);
        markdownContent.isTrusted = true;
        return new vscode.Hover(markdownContent);
    }
 

    findContent (entity, filePath) {
        // Kiểm tra thư mục JsonEntity
        if (!fs.existsSync(this.jsonEntityFolder)) {
            return "";
        }
        entity = entity.slice(1, -1); // Bỏ '&' và ';'
        const fileContent = this.loadEntitiesForFile(filePath);
        if (!fileContent) {
            return "";
        }
        const entityContent = fileContent.find((item) => item.Name === entity);
        if (entityContent && entityContent.Content) {
            return entityContent.Content;
        }
        return "";
    }

    resolveJsonPathForFile(filePath) {
        const encoded = Buffer.from(filePath, "utf8").toString("base64");
        const directPath = path.join(this.jsonEntityFolder, `${encoded}.json`);
        if (fs.existsSync(directPath)) {
            return directPath;
        }
        // Fallback cho dữ liệu cũ/khác chuẩn encode path.
        const files = fs.readdirSync(this.jsonEntityFolder);
        for (const file of files) {
            const decodedPath = Buffer.from(path.basename(file, ".json"), "base64").toString("utf8");
            if (decodedPath === filePath) {
                return path.join(this.jsonEntityFolder, file);
            }
        }
        return null;
    }

    loadEntitiesForFile(filePath) {
        const jsonPath = this.resolveJsonPathForFile(filePath);
        if (!jsonPath) {
            return null;
        }
        this._jsonPathBySourceFile.set(filePath, jsonPath);
        let stat;
        try {
            stat = fs.statSync(jsonPath);
        } catch (err) {
            this._entityCacheByJsonPath.delete(jsonPath);
            return null;
        }
        const cached = this._entityCacheByJsonPath.get(jsonPath);
        if (cached && cached.mtimeMs === stat.mtimeMs) {
            return cached.data;
        }
        try {
            const raw = fs.readFileSync(jsonPath, "utf8");
            const parsed = JSON.parse(raw);
            const normalized = Array.isArray(parsed) ? parsed : [];
            this._entityCacheByJsonPath.set(jsonPath, {
                mtimeMs: stat.mtimeMs,
                data: normalized,
            });
            return normalized;
        } catch (err) {
            console.error("[FBO EntityHoverProvider] Load entity json failed:", err);
            this._entityCacheByJsonPath.delete(jsonPath);
            return null;
        }
    }

    clearEntityCache() {
        this._entityCacheByJsonPath.clear();
        this._jsonPathBySourceFile.clear();
    }

    invalidateFileCache(filePath) {
        if (!filePath) return;
        const mappedPath = this._jsonPathBySourceFile.get(filePath);
        if (mappedPath) {
            this._entityCacheByJsonPath.delete(mappedPath);
            this._jsonPathBySourceFile.delete(filePath);
        }
        const directPath = path.join(this.jsonEntityFolder, `${Buffer.from(filePath, "utf8").toString("base64")}.json`);
        this._entityCacheByJsonPath.delete(directPath);
    }

    dispose() {
        this.clearEntityCache();
        this._lastEntityContent = null;
        this._lastEntityFilePath = null;
        this._reloadEntityBySave = null;
    }

}

module.exports = EntityHoverProvider;
