const fs = require('fs');
const path = require('path');

// Cache lưu trữ kết quả parse của từng file XML: normalizedFilePath -> { mtime, generalEntities, parameterEntities }
const cache = new Map();

// Cache LRU lưu trữ nội dung thô của file để tránh đọc ổ cứng nhiều lần (Tối đa 50 file)
const globalFileContentCache = new Map();
const MAX_FILE_CACHE_SIZE = 50;

/**
 * Build mảng vị trí đầu mỗi dòng để tra cứu nhanh số dòng bằng binary search.
 * @param {string} content
 * @returns {number[]}
 */
function buildLineIndex(content) {
    const indices = [0];
    for (let i = 0; i < content.length; i++) {
        if (content[i] === '\n') indices.push(i + 1);
    }
    return indices;
}

/**
 * Tra cứu số dòng (1-indexed) từ vị trí ký tự bằng binary search O(log N).
 * @param {number[]} lineIndex 
 * @param {number} charIndex 
 * @returns {number}
 */
function getLineNumber(lineIndex, charIndex) {
    let lo = 0, hi = lineIndex.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineIndex[mid] <= charIndex) lo = mid;
        else hi = mid - 1;
    }
    return lo + 1;
}

/**
 * Đọc nội dung tệp tin với cơ chế tự động nhận diện Encoding (UTF-8, UTF-16 LE, UTF-16 BE).
 * Có trang bị Global Cache LRU để tăng tốc độ hàng chục lần mà không phình RAM.
 * @param {string} filePath 
 * @returns {string}
 */
function readFileContent(filePath) {
    const norm = path.normalize(filePath).toLowerCase();
    
    // 1. Kiểm tra Realtime với debounce 2 giây
    let mtime = 0;
    const cached = globalFileContentCache.get(norm);
    const now = Date.now();

    if (cached && cached.lastChecked && now - cached.lastChecked < 2000) {
        // Nếu vừa kiểm tra trong 2s qua, không gọi statSync mạng (SMB)
        mtime = cached.mtime;
    } else {
        try {
            mtime = fs.statSync(filePath).mtimeMs;
        } catch (err) {}
    }

    if (cached && cached.mtime === mtime) {
        cached.lastChecked = now;
        // Đẩy lên làm file mới dùng gần đây nhất (LRU)
        globalFileContentCache.delete(norm);
        globalFileContentCache.set(norm, cached);
        return cached.content;
    }

    const buffer = fs.readFileSync(filePath);
    let content = '';
    
    // Kiểm tra BOM UTF-16 LE (0xFF 0xFE)
    if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
        content = buffer.toString('utf16le');
    }
    // Kiểm tra BOM UTF-16 BE (0xFE 0xFF)
    else if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
        // Hoán đổi bytes để decode bằng utf16le
        const swapped = Buffer.alloc(buffer.length);
        for (let i = 0; i < buffer.length; i += 2) {
            if (i + 1 < buffer.length) {
                swapped[i] = buffer[i + 1];
                swapped[i + 1] = buffer[i];
            }
        }
        content = swapped.toString('utf16le');
    }
    // Kiểm tra BOM UTF-8 (0xEF 0xBB 0xBF)
    else if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        content = buffer.toString('utf8', 3);
    }
    else {
        // Giải mã mặc định UTF-8
        content = buffer.toString('utf8');
        // Nếu chứa ký tự Null (0x00) thì khả năng cao đây là UTF-16 LE không BOM
        if (content.includes('\x00')) {
            content = buffer.toString('utf16le');
        }
    }

    // 3. Lưu vào Cache & Xóa file cũ nhất nếu vượt quá MAX_FILE_CACHE_SIZE
    globalFileContentCache.set(norm, { content, mtime, lastChecked: Date.now() });
    if (globalFileContentCache.size > MAX_FILE_CACHE_SIZE) {
        const oldestKey = globalFileContentCache.keys().next().value;
        globalFileContentCache.delete(oldestKey);
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
            return path.resolve(path.dirname(currentFilePath), cleanUrl);
        }
    }
    
    // Phân tích đệ quy nội dung của DTD
    function parseDtdContent(content, currentFilePath, lineOffset = 0) {
        // Build line index 1 lần O(N) để tra cứu số dòng bằng binary search O(log N)
        const lineIndex = buildLineIndex(content);
        // Regex sticky cho parameter entity reference %name;
        const paramRefRegex = /%([\w.]+);/y;
        
        let i = 0;
        while (i < content.length) {
            const ch = content[i];
            
            // 0. Skip comment XML <!-- ... -->
            if (ch === '<' && content[i + 1] === '!' && content[i + 2] === '-' && content[i + 3] === '-') {
                const endComment = content.indexOf('-->', i + 4);
                i = (endComment !== -1) ? endComment + 3 : i + 4;
                continue;
            }
            
            // 1. Nhận dạng khai báo thực thể <!ENTITY ...>
            if (ch === '<' && content.startsWith('<!ENTITY', i)) {
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
                const lineNumber = getLineNumber(lineIndex, i) + lineOffset;
                processEntityDecl(decl, currentFilePath, lineNumber);
                i = end + 1;
                continue;
            }
            
            // 2. Nhận dạng khối điều kiện DTD <![ ... [ ... ]]>
            if (ch === '<' && content.startsWith('<![', i)) {
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
                const parentLinesBefore = getLineNumber(lineIndex, i) - 1;
                const innerLineOffset = lineOffset + parentLinesBefore + prefixLines;

                processConditionalSection(condSection, currentFilePath, innerLineOffset);
                i = end + 3;
                continue;
            }
            
            // 3. Thay thế tham chiếu thực thể tham số %Name; nằm ngoài khai báo
            if (ch === '%') {
                paramRefRegex.lastIndex = i;
                const match = paramRefRegex.exec(content);
                if (match) {
                    const name = match[1];
                    if (parameterEntities[name]) {
                        const ent = parameterEntities[name];
                        // Phân tích nội dung entity riêng biệt (cả external lẫn internal)
                        // thay vì chèn/xóa string content → tránh O(K²)
                        parseDtdContent(ent.value,
                            ent.systemUrl ? ent.sourceFile : currentFilePath,
                            ent.systemUrl ? 0 : lineOffset);
                        i += match[0].length;
                        continue;
                    }
                }
            }
            
            i++;
        }
    }
    
    function processEntityDecl(decl, currentFilePath, lineNumber) {
        
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
        // FBO: <!DOCTYPE dir SYSTEM "FBO.dtd" [ ... ]> hoặc <!DOCTYPE dir [ ... ]>
        const doctypeMatch = xmlContent.match(/<!DOCTYPE\s+\w+[\s\S]*?\[([\s\S]*?)\]\s*>/i);
        if (doctypeMatch) {
            const dtdBlock = doctypeMatch[1];
            const prefixMatch = xmlContent.match(/<!DOCTYPE\s+\w+[\s\S]*?\[/i);
            const prefix = prefixMatch ? prefixMatch[0] : '';
            const parentLinesBefore = xmlContent.substring(0, doctypeMatch.index).split('\n').length - 1;
            const prefixLines = prefix.split('\n').length - 1;
            const dtdLineOffset = parentLinesBefore + prefixLines;
            parseDtdContent(dtdBlock, mainXmlPath, dtdLineOffset);
        }
    }
    
    return { generalEntities, parameterEntities, fileMtimes };
}

const MAX_CACHE_SIZE = 50;

/**
 * Lấy danh sách thực thể hoạt động của file XML (có bộ nhớ đệm Cache LRU tự động làm mới và giới hạn dung lượng RAM).
 * @param {string} filePath 
 * @returns {Record<string, any> | null}
 */
function getEntitiesForFile(filePath) {
    const t0 = Date.now();
    const b = path.basename(filePath);
    console.log(`[FBO_PERF_DEBUG] [getEntitiesForFile START] ${b}`);

    // Chìa khóa Cache luôn dùng ĐƯỜNG DẪN TUYỆT ĐỐI chuẩn hóa -> 100% độc lập giữa các dự án/file cùng tên
    const normalized = path.normalize(filePath).toLowerCase();
    
    const cached = cache.get(normalized);
    if (cached) {
        const now = Date.now();
        // Giảm tải mạng (SMB): Nếu vừa kiểm tra stat trong vòng 2 giây thì coi như chưa stale
        if (cached.lastChecked && now - cached.lastChecked < 2000) {
            console.log(`[FBO_PERF_DEBUG] [getEntitiesForFile END CACHED FAST] ${b} took ${Date.now() - t0}ms`);
            return cached.generalEntities;
        }

        let isStale = false;
        const tCheck = Date.now();
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
        console.log(`[FBO_PERF_DEBUG] [getEntitiesForFile] Check stale time: ${Date.now() - tCheck}ms. Is stale: ${isStale}`);

        if (!isStale) {
            cached.lastChecked = Date.now();
            // Cập nhật vị trí truy cập gần nhất cho LRU (xóa và set lại để đôn lên cuối Map)
            cache.delete(normalized);
            cache.set(normalized, cached);
            console.log(`[FBO_PERF_DEBUG] [getEntitiesForFile END CACHED] ${b} took ${Date.now() - t0}ms`);
            return cached.generalEntities;
        }
    }
    
    const tResolve = Date.now();
    const { generalEntities, parameterEntities, fileMtimes } = resolveFboXmlEntities(filePath);
    console.log(`[FBO_PERF_DEBUG] [getEntitiesForFile] resolveFboXmlEntities took: ${Date.now() - tResolve}ms`);
    
    // Giới hạn dung lượng bộ nhớ RAM (LRU Eviction)
    if (cache.size >= MAX_CACHE_SIZE) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) {
            cache.delete(oldestKey);
        }
    }
    
    cache.set(normalized, {
        generalEntities,
        parameterEntities,
        fileMtimes,
        lastChecked: Date.now()
    });

    console.log(`[FBO_PERF_DEBUG] [getEntitiesForFile END FRESH] ${b} took ${Date.now() - t0}ms`);
    return generalEntities;
}

function invalidateCache(filePath) {
    if (filePath) {
        const normalized = path.normalize(filePath).toLowerCase();
        cache.delete(normalized);
    } else {
        cache.clear();
    }
}

module.exports = {
    getEntitiesForFile,
    invalidateCache,
    readFileContent,
    resolveFboXmlEntities
};
