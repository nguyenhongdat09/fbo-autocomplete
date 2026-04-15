const { readFieldXmlBatch, levelDbKeyForColumn } = require("./levelDbFieldXml");
const { buildDirFallbackFieldXml } = require("./fieldXmlSqlFallback");

const LEVEL_FOLDER = "Dir";

/**
 * @param {Array<{ name?: string, type?: string, scale?: number|null }>} orderedColumns
 * @param {"normal"|"autocomplete"|"lookup"} [fieldVariant]
 * @returns {Promise<string>}
 */
async function buildHeaderToDirXml(orderedColumns, fieldVariant) {
    const variant =
        fieldVariant === "autocomplete" || fieldVariant === "lookup"
            ? fieldVariant
            : "normal";
    const list = (orderedColumns || []).filter(
        (c) => c && c.name && String(c.name).trim()
    );
    if (!list.length) return "";
    const keys = list.map((c) =>
        levelDbKeyForColumn(String(c.name).trim(), variant)
    );
    const fromDb = await readFieldXmlBatch(LEVEL_FOLDER, keys);
    const parts = [];
    for (let i = 0; i < list.length; i++) {
        if (fromDb[i]) parts.push(fromDb[i]);
        else parts.push(buildDirFallbackFieldXml(list[i]));
    }
    return parts.join("\n");
}

module.exports = {
    buildHeaderToDirXml,
};
