/**
 * GenerateProcessing — logic tạo chuỗi phục vụ paste Excel / Pivot (webview Query Results).
 * ES5 constructor + prototype để chạy inline trong webview.
 */
(function (root) {
    "use strict";

    /**
     * @param {string[]} fieldNames danh sách tên cột theo thứ tự (vd từ result set).
     * @param {{ pivotPrefix?: string }} [options] prefix hàng 2; mặc định "!2."
     * @constructor
     */
    function PivotExcelHeaderGenerator(fieldNames, options) {
        this.fieldNames = Array.isArray(fieldNames) ? fieldNames.slice() : [];
        var opts = options || {};
        this.pivotPrefix = typeof opts.pivotPrefix === "string" ? opts.pivotPrefix : "!2.";
    }

    /**
     * @returns {string[]}
     */
    PivotExcelHeaderGenerator.prototype.getSanitizedFieldNames = function () {
        return this.fieldNames.filter(function (n) {
            return n != null && String(n).trim() !== "";
        });
    };

    /** Một dòng TSV: ma_kh	ten_kh	... */
    PivotExcelHeaderGenerator.prototype.buildFirstHeaderLine = function () {
        return this.getSanitizedFieldNames().join("\t");
    };

    /** Một dòng TSV: !2.ma_kh	!2.ten_kh	... */
    PivotExcelHeaderGenerator.prototype.buildSecondPivotLine = function () {
        var prefix = this.pivotPrefix;
        return this
            .getSanitizedFieldNames()
            .map(function (name) {
                return prefix + name;
            })
            .join("\t");
    };

    /**
     * Hai hàng TSV (xuống dòng giữa hai hàng) — paste vào Excel được 2 dòng header pivot.
     * @returns {string}
     */
    PivotExcelHeaderGenerator.prototype.buildTwoRowTsv = function () {
        var line1 = this.buildFirstHeaderLine();
        var line2 = this.buildSecondPivotLine();
        if (!line1 && !line2) {
            return "";
        }
        return line1 + "\n" + line2;
    };

    root.FboPivotExcelHeaderGenerator = PivotExcelHeaderGenerator;
})(typeof window !== "undefined" ? window : this);
