// @ts-nocheck

const vscode = require("vscode");
const GroupTextSearchKinds = require("./GroupTextSearchKinds");
const GroupTextSearchOptions = require("./GroupTextSearchOptions");

class GroupTextSearchInputFlow {
    /**
     * @param {GroupTextSearchOptions} [options]
     */
    constructor(options) {
        this.options = options || new GroupTextSearchOptions();
    }

    /**
     * Bước 1: nhập text tìm kiếm.
     * @param {string} groupName
     * @returns {Promise<string|undefined>} undefined = user cancel
     */
    async promptQuery(groupName) {
        const title = groupName
            ? `Search text in group: ${groupName}`
            : "Search text in group";
        return vscode.window.showInputBox({
            title,
            placeHolder: "Text to find (fixed string, e.g. something)",
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!String(value || "").trim()) {
                    return "Please enter search text.";
                }
                return undefined;
            },
        });
    }

    /**
     * Bước 2: chọn extension globs (multi-select; *.js, *.f hiện nhưng không chọn sẵn).
     * @param {string[]} [defaultExtensions]
     * @returns {Promise<string[]|undefined>} undefined = user cancel
     */
    async promptExtensions(defaultExtensions) {
        const defaults = GroupTextSearchKinds.normalizeExtensions(
            defaultExtensions || this.options.getExtensions()
        );
        if (!defaults.length) {
            vscode.window.showWarningMessage("No file extensions configured for text search.");
            return undefined;
        }

        /** @type {import('vscode').QuickPickItem[]} */
        const items = defaults.map((glob) => ({
            label: glob,
            picked: GroupTextSearchKinds.isExtensionPickedByDefault(glob),
        }));

        const picked = await vscode.window.showQuickPick(items, {
            title: "File types to search",
            placeHolder: "Select extensions (Enter to confirm)",
            canPickMany: true,
            ignoreFocusOut: true,
        });

        if (picked === undefined) {
            return undefined;
        }
        if (!picked.length) {
            vscode.window.showWarningMessage("Select at least one file extension.");
            return undefined;
        }
        return picked.map((item) => String(item.label || "").trim()).filter(Boolean);
    }
}

module.exports = GroupTextSearchInputFlow;
