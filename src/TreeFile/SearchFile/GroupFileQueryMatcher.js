// @ts-nocheck

class GroupFileQueryMatcher {
    /**
     * @param {string} rawQuery
     */
    constructor(rawQuery) {
        this.rawQuery = String(rawQuery || "").trim().toLowerCase();
        this.compiledTerms = this._compileTerms(this.rawQuery);
    }

    /**
     * @param {string} relPath
     * @returns {boolean}
     */
    matches(relPath) {
        if (!this.compiledTerms.length) return true;
        const target = String(relPath || "").toLowerCase();
        // OR semantics: at least one comma-separated group must match
        return this.compiledTerms.some((andGroup) => {
            // AND semantics: all space-separated terms within the group must match
            return andGroup.every((term) => {
                if (term.type === "regex") {
                    return term.regex.test(target);
                }
                return target.includes(term.value);
            });
        });
    }

    /**
     * @param {string} raw
     */
    _compileTerms(raw) {
        if (!raw) return [];
        // Split by comma for OR groups
        const orGroups = raw.split(',').map((x) => x.trim()).filter(Boolean);
        return orGroups.map((group) => {
            // Split by space for AND terms within the group
            const andTerms = group.split(/\s+/).map((x) => x.trim()).filter(Boolean);
            return andTerms.map((t) => this._compileOneTerm(t));
        });
    }

    /**
     * Supports:
     * - * and % => any number of chars
     * - ? and _ => exactly one char
     * @param {string} term
     */
    _compileOneTerm(term) {
        if (!/[*%?_]/.test(term)) {
            return { type: "plain", value: term };
        }
        const escaped = term.replace(/[.+^${}()|[\]\\]/g, "\\$&");
        const regexPattern = escaped
            .replace(/\\\*/g, ".*")
            .replace(/%/g, ".*")
            .replace(/\\\?/g, ".")
            .replace(/_/g, ".");
        return { type: "regex", regex: new RegExp(regexPattern, "i") };
    }
}

module.exports = GroupFileQueryMatcher;
