// @ts-nocheck

const path = require("path");
const GroupQuickFilterKinds = require("./GroupQuickFilterKinds");

/**
 * Thư mục LevelDB cache index file theo workspace — tránh xung đột LOCK khi mở nhiều Cursor.
 * @param {import("vscode").ExtensionContext} context
 * @returns {string}
 */
function resolveGroupFileSearchStorageRoot(context) {
    if (context && context.storageUri && context.storageUri.fsPath) {
        return path.join(context.storageUri.fsPath, GroupQuickFilterKinds.STORAGE_DIR_NAME);
    }
    return path.join(__dirname, "..", "..", "Database", GroupQuickFilterKinds.STORAGE_DIR_NAME);
}

module.exports = {
    resolveGroupFileSearchStorageRoot,
};
