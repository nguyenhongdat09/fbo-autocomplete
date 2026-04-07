// @ts-nocheck — kế thừa TreeFileProvider; chỉ override quy tắc nested vs phẳng theo ngưỡng file/group.

const vscode = require("vscode");
const TreeFileProvider = require("./TreeFileProvider");

class TreeFileProviderDynamic extends TreeFileProvider {
    _getDynamicThreshold() {
        const raw = vscode.workspace.getConfiguration("fbo-autocomplete").get("fileTreeDynamicMinFiles", 5);
        const n = parseInt(raw, 10);
        return Math.max(1, Number.isFinite(n) ? n : 5);
    }

    /**
     * @param {string} _groupName
     * @param {number} fileCountInGroup
     */
    _shouldNestGroup(_groupName, fileCountInGroup) {
        return fileCountInGroup >= this._getDynamicThreshold();
    }
}

module.exports = TreeFileProviderDynamic;
