const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const entityResolver = require("../ReadXMLByJS/entityResolver");

// Cache entity theo file: entity chỉ phụ thuộc khối DOCTYPE + file .ent/include,
// sửa body XML không làm entity đổi → tránh resolve + đọc lại file mỗi lần save.
// Lưu luôn CONTENT đã resolve (Map name -> content) để vòng expand không đụng I/O.
/** @type {Map<string, {doctype: string, entityContents: Map<string, string>, depMtimes: Array<[string, number]>}>} */
const entitySessionCache = new Map();
const MAX_ENTITY_CACHE = 50;

/**
 * Validate song song mtime các file .ent/include phụ thuộc (1 round-trip thay vì statSync tuần tự).
 * File đã thiếu từ trước (mtime=0) mà vẫn thiếu thì coi như không đổi.
 * @param {Array<[string, number]>} depMtimes
 * @returns {Promise<boolean>}
 */
async function depsUnchanged(depMtimes) {
    if (!depMtimes || depMtimes.length === 0) return true;
    const results = await Promise.all(depMtimes.map(async ([p, mtime]) => {
        try {
            const st = await fs.promises.stat(p);
            return st.mtimeMs === mtime;
        } catch (err) {
            return mtime === 0;
        }
    }));
    return results.every(Boolean);
}

/**
 * Lấy Map<entityName, content> đã resolve cho file — cache theo DOCTYPE text để save file nhanh.
 * Chỉ resolve + đọc file lại khi DOCTYPE đổi hoặc 1 file .ent/include phụ thuộc bị sửa.
 * @param {string} filePath
 * @param {string} doctype khối <!DOCTYPE ... [...]> trích từ content đang mở (không tốn I/O)
 * @returns {Promise<Map<string, string>>}
 */
async function getEntityContentsForDoc(filePath, doctype) {
    const normalized = path.normalize(filePath).toLowerCase();
    const cached = entitySessionCache.get(normalized);
    if (cached && cached.doctype === doctype && await depsUnchanged(cached.depMtimes)) {
        entitySessionCache.delete(normalized); // LRU touch
        entitySessionCache.set(normalized, cached);
        return cached.entityContents;
    }

    const generalEntities = entityResolver.getEntitiesForFile(filePath) || {};
    const fileMtimes = entityResolver.getEntityDepMtimes(filePath) || {};

    // Dep = mọi file resolver đã đọc (trừ file chính) + mọi sourceFile/declaredInFile của entity
    // (entity SYSTEM như ListField.txt/ListCategory.xml có thể không nằm trong fileMtimes)
    const depPaths = new Set(Object.keys(fileMtimes).filter(p => p !== normalized));
    for (const key of Object.keys(generalEntities)) {
        const d = generalEntities[key] || {};
        if (d.declaredInFile) depPaths.add(path.normalize(String(d.declaredInFile)).toLowerCase());
        if (d.sourceFile) depPaths.add(path.normalize(String(d.sourceFile)).toLowerCase());
    }
    /** @type {Array<[string, number]>} */
    const depMtimes = [...depPaths].map(p => {
        let m = fileMtimes[p];
        if (m === undefined) {
            try { m = fs.statSync(p).mtimeMs; } catch (err) { m = 0; }
        }
        return [p, m];
    });

    // Resolve content 1 lần ngay lúc cache-miss — đọc SYSTEM entity file ở đây,
    // các lần save sau chỉ tra Map (vòng expand zero I/O)
    /** @type {Map<string, string>} */
    const entityContents = new Map();
    for (const name of Object.keys(generalEntities)) {
        const d = generalEntities[name] || {};
        let content = '';
        if (d.systemUrl) {
            try { content = entityResolver.readFileContent(String(d.sourceFile || '')); } catch (err) { content = ''; }
        } else {
            content = d.value || '';
        }
        entityContents.set(name, content);
    }

    entitySessionCache.set(normalized, { doctype, entityContents, depMtimes });
    if (entitySessionCache.size > MAX_ENTITY_CACHE) {
        const oldestKey = entitySessionCache.keys().next().value;
        if (oldestKey) entitySessionCache.delete(oldestKey);
    }
    return entityContents;
}

/**
 * Tìm các &entity; trong content và resolve nội dung tương ứng
 * @param {string} content
 * @param {Map<string, string> | Record<string, any>} [resolved] Map<name,content> đã resolve sẵn,
 *        hoặc generalEntities object (sẽ resolve content), hoặc bỏ trống = resolve từ active editor
 */
function replaceEntity(content, resolved) {
    const regex = /&[^;\s]+;/g;
    var entities = content.match(regex) || [];
    const uniqueEntities = [...new Set(entities)];

    var parsedEntities = uniqueEntities.map((entity) => {
        return { entity, entity_variable: entity.replace(/&|;/g, '') }
    });
    parsedEntities = parsedEntities.filter((item) =>
        !/^&(?:gt|lt|amp|quot|apos|#\d+);$/.test(item.entity)
    );
    if (parsedEntities.length === 0) return [];

    // Fast path: Map<name, content> đã resolve sẵn — tra thuần, không I/O
    if (resolved instanceof Map) {
        return parsedEntities.map((item) => ({
            entity: item.entity,
            content: resolved.get(item.entity_variable) || ''
        }));
    }

    var entityMapping = readEntity(parsedEntities.map((item) => item.entity_variable), resolved);
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

/**
 * @param {string[]} entities
 * @param {Record<string, any>} [generalEntities] map entity đã resolve sẵn; không truyền thì resolve từ active editor
 */
function readEntity(entities, generalEntities) {
    try {
        let ents = generalEntities;
        if (!ents) {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) return [];
            ents = entityResolver.getEntitiesForFile(activeEditor.document.uri.fsPath) || undefined;
        }
        if (!ents) {
            return [];
        }

        const result = [];
        // DEDUPLICATE entities to avoid N * M redundant disk reads on the main thread
        const uniqueEntities = [...new Set(entities)];

        for (const name of uniqueEntities) {
            const entityDecl = ents[name];
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

module.exports = { replaceEntity, readEntity, getEntityContentsForDoc };
