// @ts-nocheck

/**
 * Map vscode.TextSearchResult → entry cho GroupTextSearchResultModel / TreeItemLabel.
 */
class GroupTextSearchAggregator {
    /**
     * @param {import('vscode').TextSearchResult} result
     * @returns {{
     *   line: number,
     *   preview: string,
     *   highlights: [number, number][],
     *   range: import('vscode').Range|undefined
     * }|null}
     */
    static toMatchEntry(result) {
        if (!result) return null;
        const previewText = String(result.preview && result.preview.text != null ? result.preview.text : "");
        const range = Array.isArray(result.ranges) && result.ranges.length ? result.ranges[0] : undefined;
        const line = range ? range.start.line + 1 : 1;
        return {
            line,
            preview: previewText.trimEnd(),
            highlights: GroupTextSearchAggregator._previewHighlights(result.preview),
            range,
        };
    }

    /**
     * @param {import('vscode').TextSearchMatch|undefined} preview
     * @returns {[number, number][]}
     */
    static _previewHighlights(preview) {
        if (!preview || !Array.isArray(preview.matches)) return [];
        /** @type {[number, number][]} */
        const out = [];
        for (const r of preview.matches) {
            if (!r || !r.start || !r.end) continue;
            const start = Number(r.start.character) || 0;
            const len = Math.max(0, (Number(r.end.character) || 0) - start);
            if (len > 0) {
                out.push([start, len]);
            }
        }
        return out;
    }

    /**
     * @param {import('./GroupTextSearchResultModel')} model
     * @param {import('vscode').TextSearchResult} result
     */
    static applyToModel(model, result) {
        if (!model || !result || !result.uri) return;
        const entry = GroupTextSearchAggregator.toMatchEntry(result);
        if (!entry || !entry.range) return;
        model.addMatch(result.uri.fsPath, entry);
    }
}

module.exports = GroupTextSearchAggregator;
