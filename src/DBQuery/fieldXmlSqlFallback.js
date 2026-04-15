/**
 * Fallback sinh <field> từ metadata SQL (port logic GenerateHeaderToReport.js), hai biến thể attribute.
 */

/**
 * @param {string} s
 * @returns {string}
 */
function escapeXmlAttr(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/\r/g, " ")
        .replace(/\n/g, " ");
}

/**
 * @param {string} typeStr
 * @returns {string}
 */
function normalizeSqlBaseType(typeStr) {
    if (typeStr == null || typeStr === "") return "";
    const raw = String(typeStr).trim();
    const noN = raw.replace(/N$/i, "");
    return noN.toLowerCase();
}

/**
 * @param {{ name?: string, type?: string, scale?: number|null }} col
 * @returns {"string"|"int32"|"boolean"|"datetime"|"decimal_foreign"|"decimal_base"}
 */
function classifyColumn(col) {
    const name = col && col.name != null ? String(col.name) : "";
    const base = normalizeSqlBaseType(col && col.type != null ? col.type : "");

    if (base === "bit" || base === "tinyint") {
        return "boolean";
    }
    if (base === "int" || base === "smallint" || base === "bigint") {
        return "int32";
    }
    if (
        base === "smalldatetime" ||
        base === "datetime" ||
        base === "datetime2" ||
        base === "date" ||
        base === "time" ||
        base === "datetimeoffset"
    ) {
        return "datetime";
    }
    if (
        base === "decimal" ||
        base === "numeric" ||
        base === "money" ||
        base === "smallmoney" ||
        base === "float" ||
        base === "real"
    ) {
        if (/_nt$/i.test(name)) {
            return "decimal_foreign";
        }
        return "decimal_base";
    }
    return "string";
}

/**
 * Header To Dir: không có width, allowFilter, allowSorting.
 * @param {{ name?: string, type?: string, scale?: number|null }} col
 * @returns {string}
 */
function buildDirFallbackFieldXml(col) {
    const rawName = col && col.name != null ? String(col.name).trim() : "";
    if (!rawName) return "";
    const fname = escapeXmlAttr(rawName);
    const kind = classifyColumn(col);
    let open;

    switch (kind) {
        case "int32":
            open = '<field name="' + fname + '" type="Int32" >';
            break;
        case "boolean":
            open = '<field name="' + fname + '" type="Boolean" >';
            break;
        case "datetime":
            open =
                '<field name="' +
                fname +
                '" type="DateTime" dataFormatString="@datetimeFormat" >';
            break;
        case "decimal_foreign":
            open =
                '<field name="' +
                fname +
                '" type="Decimal" dataFormatString="@foreignCurrencyAmountViewFormat" >';
            break;
        case "decimal_base":
            open =
                '<field name="' +
                fname +
                '" type="Decimal" dataFormatString="@baseCurrencyAmountViewFormat" >';
            break;
        case "string":
        default:
            open = '<field name="' + fname + '" >';
            break;
    }

    return open + "\n      <header v=\"\" e=\"\"></header>\n    </field>";
}

/**
 * Header To Grid Input: giống Grid Report nhưng bỏ width; giữ allowFilter, allowSorting.
 * @param {{ name?: string, type?: string, scale?: number|null }} col
 * @returns {string}
 */
function buildGridInputFallbackFieldXml(col) {
    const rawName = col && col.name != null ? String(col.name).trim() : "";
    if (!rawName) return "";
    const fname = escapeXmlAttr(rawName);
    const kind = classifyColumn(col);
    let open;

    switch (kind) {
        case "int32":
            open =
                '<field name="' +
                fname +
                '" type="Int32" allowFilter="true" allowSorting="true" >';
            break;
        case "boolean":
            open =
                '<field name="' +
                fname +
                '" type="Boolean" allowFilter="true" allowSorting="true" >';
            break;
        case "datetime":
            open =
                '<field name="' +
                fname +
                '" type="DateTime" dataFormatString="@datetimeFormat" allowFilter="true" allowSorting="true" >';
            break;
        case "decimal_foreign":
            open =
                '<field name="' +
                fname +
                '" type="Decimal" dataFormatString="@foreignCurrencyAmountViewFormat" allowFilter="true" allowSorting="true" >';
            break;
        case "decimal_base":
            open =
                '<field name="' +
                fname +
                '" type="Decimal" dataFormatString="@baseCurrencyAmountViewFormat" allowFilter="true" allowSorting="true" >';
            break;
        case "string":
        default:
            open =
                '<field name="' + fname + '" allowFilter="true" allowSorting="true" >';
            break;
    }

    return open + "\n      <header v=\"\" e=\"\"></header>\n    </field>";
}

module.exports = {
    buildDirFallbackFieldXml,
    buildGridInputFallbackFieldXml,
    classifyColumn,
};
