const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const entityResolver = require('../entityResolver');

// Cache lưu trữ document.uri.fsPath -> { version, categories: Map<string, CategoryInfo> }
const categoryCache = new Map();

/**
 * Tính số dòng (0-indexed) từ vị trí ký tự trong text
 * @param {string} text 
 * @param {number} charIndex 
 * @returns {number}
 */
function getLineFromIndex(text, charIndex) {
    let line = 0;
    for (let i = 0; i < charIndex; i++) {
        if (text[i] === '\n') line++;
    }
    return line;
}

class CategoryHoverProvider {
    /**
     * @param {vscode.TextDocument} document
     * @param {vscode.Position} position
     * @param {vscode.CancellationToken} token
     */
    provideHover(document, position, token) {
        if (document.languageId !== 'xml') {
            return null;
        }

        const line = document.lineAt(position.line);
        const lineText = line.text;

        // 1. Tìm xem con trỏ có đang nằm trên categoryIndex="..." hay không
        const catIndexRe = /\bcategoryIndex\s*=\s*(["'])(.*?)\1/gi;
        let match;
        let targetIndex = null;
        let hoverRange = null;

        while ((match = catIndexRe.exec(lineText)) !== null) {
            const startChar = match.index;
            const endChar = match.index + match[0].length;

            if (position.character >= startChar && position.character <= endChar) {
                targetIndex = match[2];
                hoverRange = new vscode.Range(position.line, startChar, position.line, endChar);
                break;
            }
        }

        // 2. Nếu không phải categoryIndex, kiểm tra xem có đang hover trên thẻ <category index="...">
        if (!targetIndex) {
            const catTagRe = /<category\b[^>]*?\bindex\s*=\s*(["'])(.*?)\1/gi;
            while ((match = catTagRe.exec(lineText)) !== null) {
                const startChar = match.index;
                const endChar = match.index + match[0].length;

                if (position.character >= startChar && position.character <= endChar) {
                    targetIndex = match[2];
                    hoverRange = new vscode.Range(position.line, startChar, position.line, endChar);
                    break;
                }
            }
        }

        if (!targetIndex) {
            return null;
        }

        const fsPath = document.uri.fsPath;
        const categoriesMap = this.getCategoriesMap(document);

        const md = new vscode.MarkdownString(undefined, true);
        md.supportThemeIcons = true;
        md.supportHtml = true;
        md.isTrusted = true;

        // 3. Xử lý trường hợp categoryIndex === "-1" (Footer)
        if (targetIndex === '-1') {
            const catInfo = categoriesMap.get('-1');
            if (catInfo) {
                const args = encodeURIComponent(JSON.stringify({
                    filePath: catInfo.sourceFile || fsPath,
                    line: catInfo.line,
                    character: 0
                }));
                md.appendMarkdown(`**📑 Tab: Footer** *(Chân trang)* &nbsp;&nbsp; [$(arrow-down) Đến \`<category>\`](command:fbo-autocomplete.goToCategory?${args})`);
            } else {
                md.appendMarkdown(`**📑 Tab: Footer** *(Chân trang cố định)*`);
            }
            return new vscode.Hover(md, hoverRange);
        }

        // 4. Xử lý các index khác (1, 2, 3...)
        const catInfo = categoriesMap.get(targetIndex);

        if (catInfo) {
            const titleV = catInfo.headerV;
            const titleE = catInfo.headerE;
            let tabTitle = '';
            if (titleV && titleE) {
                tabTitle = `**${titleV}** *(${titleE})*`;
            } else if (titleV) {
                tabTitle = `**${titleV}**`;
            } else if (titleE) {
                tabTitle = `*${titleE}*`;
            } else {
                tabTitle = `*(Chưa đặt tên)*`;
            }

            const entityBadge = catInfo.sourceEntity ? ` \`${catInfo.sourceEntity}\`` : '';
            const args = encodeURIComponent(JSON.stringify({
                filePath: catInfo.sourceFile || fsPath,
                line: catInfo.line,
                character: 0
            }));

            md.appendMarkdown(`**📑 Tab ${catInfo.index}:** ${tabTitle}${entityBadge} &nbsp;&nbsp; [$(arrow-down) Đến \`<category>\`](command:fbo-autocomplete.goToCategory?${args})`);
        } else {
            md.appendMarkdown(`**📑 Tab ${targetIndex}:** *(Không tìm thấy khai báo trong \`<categories>\`)*`);
        }

        return new vscode.Hover(md, hoverRange);
    }

    /**
     * Phân tích và lấy danh sách categories của document (có cache)
     * @param {vscode.TextDocument} document
     * @returns {Map<string, CategoryInfo>}
     */
    getCategoriesMap(document) {
        const fsPath = document.uri.fsPath;
        const cached = categoryCache.get(fsPath);

        if (cached && cached.version === document.version) {
            return cached.categories;
        }

        const rawXml = document.getText();
        const categories = new Map();

        // 1. Tìm khối <categories>...</categories> trong document
        const categoriesBlockMatch = rawXml.match(/<categories\b[^>]*>([\s\S]*?)<\/categories>/i);
        const categoriesContent = categoriesBlockMatch ? categoriesBlockMatch[1] : '';

        // 2. Phân tích các thẻ <category> trực tiếp trong file
        this.parseCategoriesFromXml(rawXml, categories, null, fsPath);

        // 3. Phân tích các Entity được gọi trong <categories>...</categories>
        if (categoriesContent) {
            const entityCallRe = /&([a-zA-Z0-9_.-]+);/g;
            let entMatch;
            const generalEntities = entityResolver.getEntitiesForFile(fsPath) || {};

            while ((entMatch = entityCallRe.exec(categoriesContent)) !== null) {
                const entName = entMatch[1];
                this.resolveAndParseEntityCategories(entName, fsPath, generalEntities, categories, new Set());
            }
        }

        // Cập nhật cache
        categoryCache.set(fsPath, {
            version: document.version,
            categories
        });

        return categories;
    }

    /**
     * Đệ quy giải quyết entity để tìm <category>
     * @param {string} entName
     * @param {string} currentFilePath
     * @param {Object} generalEntities
     * @param {Map<string, CategoryInfo>} categories
     * @param {Set<string>} visited
     */
    resolveAndParseEntityCategories(entName, currentFilePath, generalEntities, categories, visited) {
        if (visited.has(entName)) return;
        visited.add(entName);

        const entDecl = generalEntities[entName];
        if (!entDecl) return;

        let rawContent = '';
        let sourceFile = entDecl.sourceFile || currentFilePath;

        if (entDecl.systemUrl && entDecl.sourceFile && fs.existsSync(entDecl.sourceFile)) {
            try {
                rawContent = entityResolver.readFileContent(entDecl.sourceFile);
            } catch (e) {
                rawContent = '';
            }
        } else {
            rawContent = entDecl.value || '';
        }

        if (!rawContent) return;

        // Phân tích các thẻ <category> trong nội dung entity này
        this.parseCategoriesFromXml(rawContent, categories, `&${entName};`, sourceFile);

        // Nếu nội dung entity lại gọi các entity con khác
        const childEntRe = /&([a-zA-Z0-9_.-]+);/g;
        let childMatch;
        while ((childMatch = childEntRe.exec(rawContent)) !== null) {
            const childName = childMatch[1];
            this.resolveAndParseEntityCategories(childName, sourceFile, generalEntities, categories, visited);
        }
    }

    /**
     * Trích xuất các thẻ <category> từ chuỗi XML
     * @param {string} xmlText
     * @param {Map<string, CategoryInfo>} categories
     * @param {string | null} sourceEntity
     * @param {string | null} sourceFile
     */
    parseCategoriesFromXml(xmlText, categories, sourceEntity, sourceFile) {
        if (!xmlText) return;

        // Bắt cả thẻ đóng <category>...</category> và tự đóng <category .../>
        const catRe = /<category\b([^>]*?)(?:>([\s\S]*?)<\/category>|\/>)/gi;
        let match;

        while ((match = catRe.exec(xmlText)) !== null) {
            const attrs = match[1];
            const body = match[2] || '';

            const indexMatch = attrs.match(/\bindex\s*=\s*(["'])(.*?)\1/i);
            if (!indexMatch) continue;

            const index = indexMatch[2];
            // Không ghi đè nếu đã có (ưu tiên khai báo trực tiếp trước)
            if (categories.has(index) && sourceEntity) continue;

            let headerV = '';
            let headerE = '';

            const headerMatch = body.match(/<header\b([^>]*?)(?:\/?>|>)/i);
            if (headerMatch) {
                const hAttrs = headerMatch[1];
                const vMatch = hAttrs.match(/\bv\s*=\s*(["'])(.*?)\1/i);
                const eMatch = hAttrs.match(/\be\s*=\s*(["'])(.*?)\1/i);
                if (vMatch) headerV = vMatch[2];
                if (eMatch) headerE = eMatch[2];
            }

            const line = getLineFromIndex(xmlText, match.index);

            categories.set(index, {
                index,
                headerV,
                headerE,
                sourceEntity: sourceEntity || undefined,
                sourceFile: sourceFile || undefined,
                line
            });
        }
    }
}

module.exports = CategoryHoverProvider;
