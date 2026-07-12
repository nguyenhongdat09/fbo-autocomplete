const fs = require('fs');
const path = require('path');

// Cache lưu trữ kết quả parse của từng file XML: normalizedFilePath -> { mtime, generalEntities, parameterEntities }
const cache = new Map();

/**
 * Đọc nội dung tệp tin với cơ chế tự động nhận diện Encoding (UTF-8, UTF-16 LE, UTF-16 BE).
 * @param {string} filePath 
 * @returns {string}
 */
function readFileContent(filePath) {
    const buffer = fs.readFileSync(filePath);
    
    // Kiểm tra BOM UTF-16 LE (0xFF 0xFE)
    if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
        return buffer.toString('utf16le');
    }
    
    // Kiểm tra BOM UTF-16 BE (0xFE 0xFF)
    if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
        // Hoán đổi bytes để decode bằng utf16le
        const swapped = Buffer.alloc(buffer.length);
        for (let i = 0; i < buffer.length; i += 2) {
            if (i + 1 < buffer.length) {
                swapped[i] = buffer[i + 1];
                swapped[i + 1] = buffer[i];
            }
        }
        return swapped.toString('utf16le');
    }
    
    // Kiểm tra BOM UTF-8 (0xEF 0xBB 0xBF)
    if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        return buffer.toString('utf8', 3);
    }
    
    // Giải mã mặc định UTF-8
    const content = buffer.toString('utf8');
    // Nếu chứa ký tự Null (0x00) thì khả năng cao đây là UTF-16 LE không BOM
    if (content.includes('\x00')) {
        return buffer.toString('utf16le');
    }
    
    return content;
}

/**
 * Chuẩn hóa các đường dẫn SYSTEM chứa dấu gạch chéo ngược '\' thành '/'
 * @param {string} xmlText 
 * @returns {string}
 */
function preprocessXml(xmlText) {
    return xmlText.replace(/(SYSTEM\s+["'])([^"']+)(["'])/g, (match, prefix, filePath, suffix) => {
        return `${prefix}${filePath.replace(/\\/g, '/')}${suffix}`;
    });
}

/**
 * @param {string} mainXmlPath 
 */
function resolveFboXmlEntities(mainXmlPath) {
    const mainXmlDir = path.dirname(mainXmlPath);
    
    const generalEntities = {};
    const parameterEntities = {};
    const fileMtimes = {};

    function getFileMtime(filePath) {
        try {
            return fs.statSync(filePath).mtimeMs;
        } catch (err) {
            return 0;
        }
    }

    function readAndRecordFile(filePath) {
        const norm = path.normalize(filePath).toLowerCase();
        fileMtimes[norm] = getFileMtime(filePath);
        return readFileContent(filePath);
    }
    
    // Phân giải đường dẫn tương đối dựa trên thư mục chứa tệp XML chính
    function resolvePath(currentFilePath, targetUrl) {
        let cleanUrl = targetUrl.replace(/\\/g, '/');
        if (cleanUrl.startsWith('file:///')) {
            cleanUrl = cleanUrl.substring(8);
        } else if (cleanUrl.startsWith('file:/')) {
            cleanUrl = cleanUrl.substring(6);
        }
        
        const isAbsolute = path.isAbsolute(cleanUrl) || (cleanUrl.length > 1 && cleanUrl[1] === ':');
        if (isAbsolute) {
            return path.resolve(cleanUrl);
        } else {
            return path.resolve(mainXmlDir, cleanUrl);
        }
    }
    
    // Phân tích đệ quy nội dung của DTD
    function parseDtdContent(content, currentFilePath, lineOffset = 0) {
        // Xóa comment XML
        content = content.replace(/<!--[\s\S]*?-->/g, '');
        
        let i = 0;
        while (i < content.length) {
            // 1. Nhận dạng khai báo thực thể <!ENTITY ...>
            if (content.startsWith('<!ENTITY', i)) {
                let end = i + 8;
                let inQuote = false;
                let quoteChar = '';
                
                while (end < content.length) {
                    const char = content[end];
                    if ((char === '"' || char === "'") && content[end - 1] !== '\\') {
                        if (!inQuote) {
                            inQuote = true;
                            quoteChar = char;
                        } else if (char === quoteChar) {
                            inQuote = false;
                        }
                    }
                    if (char === '>' && !inQuote) {
                        break;
                    }
                    end++;
                }
                
                const decl = content.substring(i, end + 1);
                processEntityDecl(decl, currentFilePath, i, content, lineOffset);
                i = end + 1;
                continue;
            }
            
            // 2. Nhận dạng khối điều kiện DTD <![ ... [ ... ]]>
            if (content.startsWith('<![', i)) {
                let depth = 1;
                let end = i + 3;
                while (end < content.length - 2) {
                    if (content.startsWith('<![', end)) {
                        depth++;
                        end += 3;
                    } else if (content.startsWith(']]>', end)) {
                        depth--;
                        if (depth === 0) {
                            break;
                        }
                        end += 3;
                    } else {
                        end++;
                    }
                }
                
                const condSection = content.substring(i, end + 3);
                const matchCond = condSection.match(/^<!\[\s*([^\[]+)\[/);
                const prefixLines = matchCond ? matchCond[0].split('\n').length - 1 : 0;
                const parentLinesBefore = content.substring(0, i).split('\n').length - 1;
                const innerLineOffset = lineOffset + parentLinesBefore + prefixLines;

                processConditionalSection(condSection, currentFilePath, innerLineOffset);
                i = end + 3;
                continue;
            }
            
            // 3. Thay thế tham chiếu thực thể tham số %Name; nằm ngoài khai báo
            if (content[i] === '%') {
                const match = content.substring(i).match(/^%([\w.]+);/);
                if (match) {
                    const name = match[1];
                    if (parameterEntities[name]) {
                        const ent = parameterEntities[name];
                        if (ent.systemUrl) {
                            // Thực thể ngoài (SYSTEM): Phân tích đệ quy nội dung tệp tin của nó (mở đầu file mới -> offset = 0)
                            parseDtdContent(ent.value, ent.sourceFile, 0);
                            content = content.substring(0, i) + content.substring(i + match[0].length);
                        } else {
                            // Thực thể nội bộ: Thay thế trực tiếp nội dung chuỗi vào DTD
                            content = content.substring(0, i) + ent.value + content.substring(i + match[0].length);
                        }
                        // Tiếp tục phân tích từ vị trí hiện tại (vì có nội dung mới chèn vào hoặc bị xóa đi)
                        continue;
                    }
                }
            }
            
            i++;
        }
    }
    
    function processEntityDecl(decl, currentFilePath, charIndex, fullContent, lineOffset = 0) {
        const linesBefore = fullContent.substring(0, charIndex).split('\n');
        const lineNumber = linesBefore.length + lineOffset;
        
        // Khai báo thực thể tham số liên kết ngoài: <!ENTITY % Name SYSTEM "Path">
        let paramMatch = decl.match(/^<!ENTITY\s+%\s+([\w.]+)\s+SYSTEM\s+(["'])([^"'\r\n]+)\2\s*>/i);
        if (paramMatch) {
            const name = paramMatch[1];
            const systemUrl = paramMatch[3];
            const targetPath = resolvePath(currentFilePath, systemUrl);
            let value = '';
            if (fs.existsSync(targetPath)) {
                value = readAndRecordFile(targetPath);
            }
            parameterEntities[name] = { value, systemUrl, sourceFile: targetPath, line: lineNumber, text: decl };
            return;
        }
        
        // Khai báo thực thể tham số nội bộ: <!ENTITY % Name "Value">
        paramMatch = decl.match(/^<!ENTITY\s+%\s+([\w.]+)\s+(["'])([\s\S]*?)\2\s*>/i);
        if (paramMatch) {
            const name = paramMatch[1];
            const value = paramMatch[3];
            parameterEntities[name] = { value, systemUrl: null, sourceFile: currentFilePath, line: lineNumber, text: decl };
            return;
        }
        
        // Khai báo thực thể thông thường liên kết ngoài: <!ENTITY Name SYSTEM "Path">
        let genMatch = decl.match(/^<!ENTITY\s+([\w.]+)\s+SYSTEM\s+(["'])([^"'\r\n]+)\2\s*>/i);
        if (genMatch) {
            const name = genMatch[1];
            const systemUrl = genMatch[3];
            const targetPath = resolvePath(currentFilePath, systemUrl);
            
            // XML General Entity: Khai báo đầu tiên được ưu tiên giữ lại (First declaration wins)
            if (!generalEntities[name]) {
                const normPath = path.normalize(targetPath).toLowerCase();
                fileMtimes[normPath] = getFileMtime(targetPath);
                generalEntities[name] = {
                    name,
                    value: null,
                    systemUrl,
                    sourceFile: targetPath,
                    declaredInFile: currentFilePath,
                    line: lineNumber,
                    text: decl
                };
            }
            return;
        }
        
        // Khai báo thực thể thông thường nội bộ: <!ENTITY Name "Value">
        genMatch = decl.match(/^<!ENTITY\s+([\w.]+)\s+(["'])([\s\S]*?)\2\s*>/i);
        if (genMatch) {
            const name = genMatch[1];
            const value = genMatch[3];
            if (!generalEntities[name]) {
                generalEntities[name] = {
                    name,
                    value: value,
                    systemUrl: null,
                    sourceFile: currentFilePath,
                    declaredInFile: currentFilePath,
                    line: lineNumber,
                    text: decl
                };
            }
            return;
        }
    }
    
    function processConditionalSection(condSection, currentFilePath, innerLineOffset) {
        const match = condSection.match(/^<!\[\s*([^\[]+)\[([\s\S]*)\]\]>$/);
        if (!match) return;
        
        let condition = match[1].trim();
        const content = match[2];
        
        // Phân giải thực thể tham số nếu điều kiện dạng %ParamName;
        if (condition.startsWith('%') && condition.endsWith(';')) {
            const name = condition.substring(1, condition.length - 1);
            if (parameterEntities[name]) {
                condition = parameterEntities[name].value.trim();
            }
        }
        
        condition = condition.replace(/["']/g, '').trim().toUpperCase();
        
        if (condition === 'INCLUDE') {
            parseDtdContent(content, currentFilePath, innerLineOffset);
        }
    }
    
    // Bắt đầu parse từ khối internal DTD của file XML chính
    if (fs.existsSync(mainXmlPath)) {
        const xmlContent = readAndRecordFile(mainXmlPath);
        const doctypeMatch = xmlContent.match(/<!DOCTYPE\s+\w+\s+\[([\s\S]*?)\]\s*>/i);
        if (doctypeMatch) {
            const dtdBlock = doctypeMatch[1];
            const prefixMatch = xmlContent.match(/<!DOCTYPE\s+\w+\s+\[/i);
            const prefix = prefixMatch ? prefixMatch[0] : '';
            const parentLinesBefore = xmlContent.substring(0, doctypeMatch.index).split('\n').length - 1;
            const prefixLines = prefix.split('\n').length - 1;
            const dtdLineOffset = parentLinesBefore + prefixLines;
            parseDtdContent(dtdBlock, mainXmlPath, dtdLineOffset);
        }
    }
    
    return { generalEntities, parameterEntities, fileMtimes };
}

/**
 * Lấy danh sách thực thể hoạt động của file XML (có bộ nhớ đệm Cache tự động làm mới).
 * @param {string} filePath 
 * @returns {Record<string, any> | null}
 */
function getEntitiesForFile(filePath) {
    const normalized = path.normalize(filePath).toLowerCase();
    
    const cached = cache.get(normalized);
    if (cached) {
        // Kiểm tra xem có bất kỳ file phụ thuộc nào đã thay đổi thời gian sửa đổi (mtimeMs) hay không
        let isStale = false;
        for (const [depPath, cachedMtime] of Object.entries(cached.fileMtimes)) {
            try {
                const currentMtime = fs.statSync(depPath).mtimeMs;
                if (currentMtime !== cachedMtime) {
                    isStale = true;
                    break;
                }
            } catch (err) {
                isStale = true;
                break;
            }
        }
        if (!isStale) {
            return cached.generalEntities;
        }
    }
    
    const { generalEntities, parameterEntities, fileMtimes } = resolveFboXmlEntities(filePath);
    
    cache.set(normalized, {
        generalEntities,
        parameterEntities,
        fileMtimes
    });
    
    return generalEntities;
}

function invalidateCache(filePath) {
    cache.clear();
}

module.exports = {
    getEntitiesForFile,
    invalidateCache,
    readFileContent,
    resolveFboXmlEntities
};
