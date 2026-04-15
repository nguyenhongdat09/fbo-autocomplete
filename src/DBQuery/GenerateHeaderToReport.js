/**
 * GenerateHeaderToReport — sinh thẻ <field> Grid/XML từ metadata cột result set (webview Query Results).
 * ES5 class (constructor + prototype) để chạy inline trong webview.
 */
(function (root) {
    "use strict";

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
     * Chuẩn hóa tên kiểu tedious (IntN, VarChar, DecimalN → int, varchar, decimal).
     * @param {string} typeStr
     * @returns {string}
     */
    function normalizeSqlBaseType(typeStr) {
        if (typeStr == null || typeStr === "") return "";
        var raw = String(typeStr).trim();
        var noN = raw.replace(/N$/i, "");
        return noN.toLowerCase();
    }

    /**
     * @param {{ name?: string, type?: string, scale?: number|null }} col
     * @constructor
     * @param {Array<{ name?: string, type?: string, scale?: number|null }>} columns
     * @param {{ defaultWidth?: number }} [options]
     */
    function GridReportHeaderGenerator(columns, options) {
        this.columns = Array.isArray(columns) ? columns.slice() : [];
        var opts = options || {};
        this.defaultWidth =
            typeof opts.defaultWidth === "number" && opts.defaultWidth > 0 ? opts.defaultWidth : 100;
    }

    /**
     * @param {{ name?: string, type?: string, scale?: number|null }} col
     * @returns {"string"|"int32"|"boolean"|"datetime"|"decimal_foreign"|"decimal_base"}
     */
    GridReportHeaderGenerator.prototype.classifyColumn = function (col) {
        var name = col && col.name != null ? String(col.name) : "";
        var base = normalizeSqlBaseType(col && col.type != null ? col.type : "");

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
        /* char / varchar / nvarchar / binary / unknown / rỗng → không gán type (chuỗi XML giống yêu cầu) */
        return "string";
    };

    /**
     * @param {{ name?: string, type?: string, scale?: number|null }} col
     * @returns {string}
     */
    GridReportHeaderGenerator.prototype.buildFieldXml = function (col) {
        var rawName = col && col.name != null ? String(col.name).trim() : "";
        if (!rawName) {
            return "";
        }
        var fname = escapeXmlAttr(rawName);
        var w = this.defaultWidth;
        var kind = this.classifyColumn(col);
        var open;

        switch (kind) {
            case "int32":
                open =
                    '<field name="' +
                    fname +
                    '" width="' +
                    w +
                    '" type="Int32" allowFilter="true" allowSorting="true" >';
                break;
            case "boolean":
                open =
                    '<field name="' +
                    fname +
                    '" width="' +
                    w +
                    '" type="Boolean" allowFilter="true" allowSorting="true" >';
                break;
            case "datetime":
                open =
                    '<field name="' +
                    fname +
                    '" width="' +
                    w +
                    '" type="DateTime" dataFormatString="@datetimeFormat" allowFilter="true" allowSorting="true" >';
                break;
            case "decimal_foreign":
                open =
                    '<field name="' +
                    fname +
                    '" width="' +
                    w +
                    '" type="Decimal" dataFormatString="@foreignCurrencyAmountViewFormat" allowFilter="true" allowSorting="true" >';
                break;
            case "decimal_base":
                open =
                    '<field name="' +
                    fname +
                    '" width="' +
                    w +
                    '" type="Decimal" dataFormatString="@baseCurrencyAmountViewFormat" allowFilter="true" allowSorting="true" >';
                break;
            case "string":
            default:
                open =
                    '<field name="' +
                    fname +
                    '" width="' +
                    w +
                    '" allowFilter="true" allowSorting="true" >';
                break;
        }

        return open + "\n      <header v=\"\" e=\"\"></header>\n    </field>";
    };

    /**
     * @returns {string}
     */
    GridReportHeaderGenerator.prototype.buildAllFieldsXml = function () {
        var self = this;
        var parts = [];
        this.columns.forEach(function (col) {
            var block = self.buildFieldXml(col);
            if (block) {
                parts.push(block);
            }
        });
        return parts.join("\n");
    };

    root.FboGridReportHeaderGenerator = GridReportHeaderGenerator;
})(typeof window !== "undefined" ? window : this);
