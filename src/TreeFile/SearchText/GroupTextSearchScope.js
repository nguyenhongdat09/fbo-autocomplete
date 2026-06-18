// @ts-nocheck

const path = require("path");
const GroupFileScanner = require("../searchFile/GroupFileScanner");

class GroupTextSearchScope {
    constructor() {
        this._scanner = new GroupFileScanner();
    }

    /**
     * Thư mục abs để quét nội dung — ưu tiên App_Data/Controllers (cùng SearchFile).
     * @param {string} groupRoot
     * @returns {string}
     */
    resolveSearchFolder(groupRoot) {
        const root = String(groupRoot || "").trim();
        if (!root) return "";
        return this._scanner.getScanStartDir(root);
    }

    /**
     * groupRoot gốc (để hiển thị relPath trong kết quả).
     * @param {string} groupRoot
     * @returns {string}
     */
    resolveGroupRoot(groupRoot) {
        return path.normalize(String(groupRoot || "").trim());
    }
}

module.exports = GroupTextSearchScope;
