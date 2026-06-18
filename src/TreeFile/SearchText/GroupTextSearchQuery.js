// @ts-nocheck

/**
 * Chuẩn hóa text user nhập → vscode.TextSearchQuery (fixed string, tương đương rg -F).
 */
class GroupTextSearchQuery {
    /**
     * @param {string} queryText
     * @param {boolean} caseSensitive
     * @returns {import('vscode').TextSearchQuery|null}
     */
    static build(queryText, caseSensitive) {
        const pattern = String(queryText || "").trim();
        if (!pattern) return null;
        return {
            pattern,
            isRegExp: false,
            isCaseSensitive: Boolean(caseSensitive),
            isWordMatch: false,
        };
    }
}

module.exports = GroupTextSearchQuery;
