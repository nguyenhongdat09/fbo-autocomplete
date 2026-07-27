const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const FboEntParser = require('./FboEntParser');
const EntityLevelStore = require('./EntityLevelStore');
const EntityWatcherEngine = require('./EntityWatcherEngine');

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
    const overriddenEntities = [];

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
    
    function recordFileMtime(filePath) {
        const norm = path.normalize(filePath).toLowerCase();
        fileMtimes[norm] = getFileMtime(filePath);
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

    // Khởi tạo và sử dụng FboEntParser
    const parser = new FboEntParser(
        readAndRecordFile,
        resolvePath,
        recordFileMtime
    );
    
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
            
            // FboEntParser.parseContent updates the objects directly if we pass them as seeds
            const result = parser.parseContent(dtdBlock, mainXmlPath, dtdLineOffset, parameterEntities, generalEntities, overriddenEntities);
            
            // FboEntParser trả về các object mới (hoặc update seed), ta gán lại
            for (const key in result.generalEntities) {
                generalEntities[key] = result.generalEntities[key];
            }
            for (const key in result.paramEntities) {
                parameterEntities[key] = result.paramEntities[key];
            }
            overriddenEntities.length = 0;
            overriddenEntities.push(...result.overriddenEntities);
        }
    }
    
    return { generalEntities, parameterEntities, fileMtimes, overriddenEntities };
}

const MAX_CACHE_SIZE = 50;

/**
 * Lấy danh sách thực thể hoạt động của file XML (có bộ nhớ đệm Cache LRU tự động làm mới và giới hạn dung lượng RAM).
 * @param {string} filePath 
 * @returns {Record<string, any> | null}
 */
function getEntitiesForFile(filePath, targetEntity = null) {
    const t0 = Date.now();
    const b = path.basename(filePath);
    console.log(`[FBO_PERF_DEBUG] [getEntitiesForFile START] ${b}`);

    // Chìa khóa Cache luôn dùng ĐƯỜNG DẪN TUYỆT ĐỐI chuẩn hóa -> 100% độc lập giữa các dự án/file cùng tên
    const normalized = path.normalize(filePath).toLowerCase();
    
    const cached = cache.get(normalized);
    if (cached) {
        const now = Date.now();
        // debounce 1 giây tránh spam statSync liên tục qua mạng SMB khi di chuột (hover) liên tục
        if (!cached.lastChecked || now - cached.lastChecked > 1000) {
            let isValid = true;
            if (cached.fileMtimes) {
                let filesToCheck = [];
                if (targetEntity && cached.generalEntities && cached.generalEntities[targetEntity]) {
                    const ent = cached.generalEntities[targetEntity];
                    const set = new Set();
                    set.add(normalized);
                    for (const p of Object.keys(cached.fileMtimes)) {
                        if (p.endsWith('.ent')) set.add(p);
                    }
                    if (ent.declaredInFile) set.add(path.normalize(ent.declaredInFile).toLowerCase());
                    if (ent.sourceFile) set.add(path.normalize(ent.sourceFile).toLowerCase());
                    filesToCheck = Array.from(set);
                } else {
                    const set = new Set();
                    set.add(normalized);
                    for (const p of Object.keys(cached.fileMtimes)) {
                        if (p.endsWith('.ent')) set.add(p);
                    }
                    filesToCheck = Array.from(set);
                }

                for (const depPath of filesToCheck) {
                    try {
                        const currentMtime = fs.statSync(depPath).mtimeMs;
                        if (cached.fileMtimes[depPath] !== undefined && currentMtime !== cached.fileMtimes[depPath]) {
                            isValid = false;
                            globalFileContentCache.delete(depPath.toLowerCase());
                            break;
                        }
                    } catch (err) {
                        isValid = false;
                        globalFileContentCache.delete(depPath.toLowerCase());
                        break;
                    }
                }
            }
            if (!isValid) {
                console.log(`[FBO_PERF_DEBUG] [getEntitiesForFile] Cache INVALIDATED by targeted file change for ${b}`);
                cache.delete(normalized);
                globalFileContentCache.delete(normalized);
            } else {
                cached.lastChecked = now;
                cache.delete(normalized);
                cache.set(normalized, cached);
                return cached.generalEntities;
            }
        } else {
            cache.delete(normalized);
            cache.set(normalized, cached);
            return cached.generalEntities;
        }
    }
    
    const tResolve = Date.now();
    const { generalEntities, parameterEntities, fileMtimes, overriddenEntities } = resolveFboXmlEntities(filePath);
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
        overriddenEntities,
        lastChecked: Date.now()
    });

    // Ghi ngầm vào LevelDB (Fire-and-forget background push, không chặn hàm sync)
    try {
        const projectId = EntityWatcherEngine.extractProjectId(filePath);
        const fileId = EntityWatcherEngine.extractFileId(filePath);
        if (projectId && fileId) {
            const dependencies = Object.keys(fileMtimes).filter(dep => dep !== normalized);
            const mtime = fileMtimes[normalized] || Date.now();
            EntityLevelStore.upsertEntities(projectId, fileId, filePath, mtime, "", generalEntities, dependencies).catch(() => {});
        }
    } catch (err) {}

    console.log(`[FBO_PERF_DEBUG] [getEntitiesForFile END FRESH] ${b} took ${Date.now() - t0}ms`);
    return generalEntities;
}

/**
 * Nạp sẵn cache từ LevelDB lên RAM khi mở file (async priming)
 */
function primeCache(filePath, entities) {
    if (!filePath || !entities) return;
    const normalized = path.normalize(filePath).toLowerCase();
    if (!cache.has(normalized)) {
        cache.set(normalized, {
            generalEntities: entities,
            parameterEntities: {},
            fileMtimes: {},
            lastChecked: Date.now()
        });
        console.log(`[EntityResolver] Primed cache from LevelDB for: ${path.basename(filePath)}`);
    }
}

function invalidateCache(filePath) {
    if (filePath) {
        const normalized = path.normalize(filePath).toLowerCase();
        cache.delete(normalized);
        globalFileContentCache.delete(normalized);
    } else {
        cache.clear();
        globalFileContentCache.clear();
    }
}

module.exports = {
    getEntitiesForFile,
    invalidateCache,
    primeCache,
    readFileContent,
    resolveFboXmlEntities
};
