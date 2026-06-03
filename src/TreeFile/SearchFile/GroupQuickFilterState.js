// @ts-nocheck

const GroupQuickFilterKinds = require("./GroupQuickFilterKinds");

class GroupQuickFilterState {
    constructor() {
        /** @type {Map<string, string>} */
        this._groupKindMap = new Map();
    }

    /**
     * @param {string} groupName
     * @returns {string|null}
     */
    getKind(groupName) {
        return this._groupKindMap.get(String(groupName || "")) || null;
    }

    /**
     * @param {string} groupName
     * @param {string} kind
     */
    setKind(groupName, kind) {
        const gn = String(groupName || "");
        if (!gn) return;
        const k = GroupQuickFilterKinds.normalize(kind);
        if (k === GroupQuickFilterKinds.ALL) {
            this._groupKindMap.delete(gn);
            return;
        }
        this._groupKindMap.set(gn, k);
    }
}

module.exports = GroupQuickFilterState;
