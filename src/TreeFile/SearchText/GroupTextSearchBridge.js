// @ts-nocheck

const vscode = require("vscode");

/**
 * Nối Facade ↔ TextSearchResultTreeView (publish kết quả).
 */
class GroupTextSearchBridge {
    /**
     * @param {{
     *   publishSearchResult: (result: any, options?: { reveal?: boolean }) => void,
     * }} deps
     */
    constructor(deps) {
        this.publishSearchResult = typeof deps.publishSearchResult === "function"
            ? deps.publishSearchResult
            : null;
    }

    /**
     * @param {any} result
     * @param {{ reveal?: boolean }} [options]
     */
    publish(result, options) {
        if (!this.publishSearchResult) return;
        try {
            this.publishSearchResult(result, options);
        } catch {
            // swallow callback errors
        }
    }

    /**
     * Publish + thông báo khi không có match.
     * @param {any} result
     * @param {{ reveal?: boolean }} [options]
     */
    publishWithEmptyNotice(result, options) {
        const total = Number(result && result.totalMatches) || 0;
        const query = String(result && result.query || "");
        if (total === 0 && query) {
            void vscode.window.showInformationMessage(`No matches for "${query}".`);
        }
        this.publish(result, options);
    }

    dispose() {
        this.publishSearchResult = null;
    }
}

module.exports = GroupTextSearchBridge;
