const fs = require("fs");
const path = require("path");
const level = require("level-rocksdb");
const { getUserDatabaseRoot } = require("../extensionDatabasePaths");

/**
 * Key trong DB: bình thường = tên field; AutoComplete = field+"at"; Lookup = field+"lk"
 * (giống renderXMLToDB.lookupAutocompletField).
 * @param {string} columnName Tên cột SQL (vd ma_kh)
 * @param {"normal"|"autocomplete"|"lookup"} variant
 * @returns {string}
 */
function levelDbKeyForColumn(columnName, variant) {
    const base = String(columnName || "").trim();
    if (!base) return "";
    if (variant === "autocomplete") return base + "at";
    if (variant === "lookup") return base + "lk";
    return base;
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function toStr(v) {
    if (Buffer.isBuffer(v)) return v.toString("utf8");
    return v == null ? "" : String(v);
}

/**
 * Đọc một key trong Level DB + ghép bản ghi reference+"ex" (giống CompleteProvider.getValueFromDatabase).
 * @param {import("level-rocksdb")} db
 * @param {string} key
 * @returns {Promise<string|null>}
 */
async function readOneFieldXmlWithRefs(db, key) {
    try {
        let text = await db.get(key);
        text = toStr(text);
        const match = text.match(/reference="([^"]+)"/);
        if (match) {
            const reference = match[1] + "ex";
            try {
                const refText = await db.get(reference);
                if (refText) text += "\n" + toStr(refText);
            } catch {
                /* thiếu key ex — bỏ qua */
            }
        }
        return text.trim();
    } catch {
        return null;
    }
}

/**
 * @param {string} folderName Ví dụ "Dir", "GridInput"
 * @param {string[]} keys
 * @returns {Promise<(string|null)[]>}
 */
async function readFieldXmlBatch(folderName, keys) {
    let root;
    try {
        root = getUserDatabaseRoot();
    } catch {
        return keys.map(() => null);
    }
    const dbPath = path.join(root, folderName);
    if (!fs.existsSync(dbPath)) {
        return keys.map(() => null);
    }
    let db;
    try {
        db = level(dbPath, { createIfMissing: false });
    } catch {
        return keys.map(() => null);
    }
    try {
        const out = [];
        for (let i = 0; i < keys.length; i++) {
            out.push(await readOneFieldXmlWithRefs(db, keys[i]));
        }
        return out;
    } finally {
        try {
            db.close();
        } catch {
            /* ignore */
        }
    }
}

module.exports = {
    levelDbKeyForColumn,
    readFieldXmlBatch,
    readOneFieldXmlWithRefs,
};
