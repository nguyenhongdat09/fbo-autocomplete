const fs = require('fs');
const entityResolver = require('../entityResolver');

/**
 * Lấy ra khối lượng khai báo g.$a sau khi đã flat các entities
 * @param {string} filePath 
 * @param {string} rawXml 
 * @returns {string|null} Khối g.$a = { ... } sau khi flat, null nếu không tìm thấy
 */
function extractGaDeclaration(filePath, rawXml) {
    const generalEntities = entityResolver.getEntitiesForFile(filePath) || {};

    // Hàm đệ quy thay thế các &EntityName;
    function flatText(text, depth = 0, expandingStack = []) {
        if (depth > 20) return text;
        const entityPattern = /&([\w.]+);/g;
        let result = text.replace(entityPattern, (match, entName) => {
            if (expandingStack.includes(entName)) return match;
            
            const entDecl = generalEntities[entName];
            if (!entDecl) return match; // missing entity

            let rawContent = "";
            if (entDecl.systemUrl) {
                if (fs.existsSync(entDecl.sourceFile)) {
                    try {
                        rawContent = entityResolver.readFileContent(entDecl.sourceFile);
                    } catch (e) {
                        return match;
                    }
                } else {
                    return match;
                }
            } else {
                rawContent = entDecl.value || "";
            }

            return flatText(rawContent, depth + 1, [...expandingStack, entName]);
        });
        return result;
    }

    // CASE 1: Tìm g.$a = { trong raw XML
    let extractedRaw = extractGaBlock(rawXml);
    if (extractedRaw) {
        return flatText(extractedRaw);
    }

    // CASE 2: Không tìm thấy trực tiếp, tìm trong các thẻ <text> (vì có thể nó nằm trong Entity)
    const textBlocks = extractTextBlocks(rawXml);
    if (textBlocks.length > 0) {
        const mergedText = textBlocks.join('\n');
        const flattenedText = flatText(mergedText);
        let extractedFromFlat = extractGaBlock(flattenedText);
        if (extractedFromFlat) {
            return flatText(extractedFromFlat); // flat lại lần nữa phòng hờ entity nested bên trong
        }
    }

    return null;
}

/**
 * Tìm và trích xuất nguyên khối khai báo g.$a = { ... } bằng brace-matching
 * @param {string} text 
 * @returns {string|null}
 */
function extractGaBlock(text) {
    const startRegex = /g\.\$a\s*=\s*\{/g;
    const match = startRegex.exec(text);
    if (!match) return null;

    let startIndex = match.index;
    let openBraceIndex = text.indexOf('{', startIndex);
    if (openBraceIndex === -1) return null;

    let braceCount = 0;
    let inString = false;
    let stringChar = '';
    
    for (let i = openBraceIndex; i < text.length; i++) {
        let char = text[i];
        let prevChar = i > 0 ? text[i-1] : '';

        if ((char === '"' || char === "'") && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
            }
        }

        if (!inString) {
            if (char === '{') {
                braceCount++;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                    return text.substring(startIndex, i + 1);
                }
            }
        }
    }
    return null;
}

/**
 * Trích xuất toàn bộ nội dung của các thẻ <text> nằm bên trong <script>
 * @param {string} xml 
 * @returns {string[]}
 */
function extractTextBlocks(xml) {
    const blocks = [];
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let scriptMatch;
    while ((scriptMatch = scriptRegex.exec(xml)) !== null) {
        const scriptInner = scriptMatch[1];
        const textRegex = /<text\b[^>]*>([\s\S]*?)<\/text>/gi;
        let textMatch;
        while ((textMatch = textRegex.exec(scriptInner)) !== null) {
            let innerText = textMatch[1];
            // Remove CDATA
            innerText = innerText.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
            blocks.push(innerText);
        }
    }
    return blocks;
}

module.exports = {
    extractGaDeclaration
};
