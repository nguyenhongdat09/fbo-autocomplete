// @ts-nocheck

const vscode = require("vscode");
const GroupTextSearchQuery = require("./GroupTextSearchQuery");
const GroupTextSearchResultModel = require("./GroupTextSearchResultModel");
const GroupTextSearchRipgrepRunner = require("./GroupTextSearchRipgrepRunner");

class GroupTextSearchService {
    constructor() {
        /** @type {import('vscode').CancellationTokenSource|null} */
        this._cancelSource = null;
    }

    /** Hủy job search đang chạy (trước khi start job mới). */
    cancelActive() {
        if (this._cancelSource) {
            this._cancelSource.cancel();
            this._cancelSource.dispose();
            this._cancelSource = null;
        }
    }

    /**
     * Search kèm notification progress + cancel.
     * @param {{
     *   searchFolder: string,
     *   groupRoot: string,
     *   groupLabel: string,
     *   queryText: string,
     *   globs: string[],
     *   caseSensitive: boolean,
     * }} params
     * @returns {Promise<ReturnType<GroupTextSearchResultModel['finalize']>>}
     */
    async searchWithProgress(params) {
        const p = params || {};
        const groupLabel = String(p.groupLabel || "");

        this.cancelActive();
        this._cancelSource = new vscode.CancellationTokenSource();
        const searchToken = this._cancelSource.token;

        try {
            return await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: groupLabel ? `Search text in group: ${groupLabel}` : "Search text in group",
                    cancellable: true,
                },
                async (progress, userToken) => {
                    const onUserCancel = userToken.onCancellationRequested(() => {
                        this.cancelActive();
                    });
                    const startedAt = Date.now();
                    let matchCount = 0;
                    let timer = null;

                    const formatProgressMessage = () => {
                        const secs = Math.floor((Date.now() - startedAt) / 1000);
                        if (matchCount > 0) {
                            return `Searching... ${secs}s (${matchCount} match${matchCount === 1 ? "" : "es"})`;
                        }
                        return `Searching... ${secs}s`;
                    };

                    const reportProgress = () => {
                        progress.report({ message: formatProgressMessage() });
                    };

                    try {
                        reportProgress();
                        timer = setInterval(reportProgress, 1000);
                        return await this.search({
                            ...p,
                            token: searchToken,
                            onMatch: () => {
                                matchCount += 1;
                                reportProgress();
                            },
                        });
                    } finally {
                        if (timer) {
                            clearInterval(timer);
                        }
                        onUserCancel.dispose();
                    }
                }
            );
        } finally {
            if (this._cancelSource) {
                this._cancelSource.dispose();
                this._cancelSource = null;
            }
        }
    }

    /**
     * @param {{
     *   searchFolder: string,
     *   groupRoot: string,
     *   groupLabel: string,
     *   queryText: string,
     *   globs: string[],
     *   caseSensitive: boolean,
     *   token?: import('vscode').CancellationToken,
     *   onMatch?: () => void,
     * }} params
     * @returns {Promise<ReturnType<GroupTextSearchResultModel['finalize']>>}
     */
    async search(params) {
        const p = params || {};
        const searchFolder = String(p.searchFolder || "");
        const groupRoot = String(p.groupRoot || "");
        const groupLabel = String(p.groupLabel || "");
        const queryText = String(p.queryText || "");
        const globs = Array.isArray(p.globs) ? p.globs : [];
        const caseSensitive = Boolean(p.caseSensitive);
        const token = p.token;
        const onMatch = typeof p.onMatch === "function" ? p.onMatch : null;

        const model = GroupTextSearchResultModel.createEmpty({
            groupRoot,
            groupLabel,
            query: queryText,
        });

        const query = GroupTextSearchQuery.build(queryText, caseSensitive);
        if (!query || !searchFolder) {
            return model.finalize();
        }

        const rgGlobs = GroupTextSearchService._normalizeGlobsForRg(globs);
        if (!rgGlobs.length) {
            return model.finalize();
        }

        if (token && token.isCancellationRequested) {
            return model.finalize();
        }

        try {
            await GroupTextSearchRipgrepRunner.run({
                searchFolder,
                queryText: query.pattern,
                caseSensitive: Boolean(query.isCaseSensitive),
                globs: rgGlobs,
                model,
                token,
                onMatch,
            });
        } catch (err) {
            if (token && token.isCancellationRequested) {
                return model.finalize();
            }
            throw err;
        }

        return model.finalize();
    }

    dispose() {
        this.cancelActive();
    }

    /**
     * Glob cho rg: dạng *.xml (bỏ prefix recursive nếu có).
     * @param {string[]} globs
     * @returns {string[]}
     */
    static _normalizeGlobsForRg(globs) {
        return (globs || [])
            .map((g) => String(g || "").trim().replace(/^\*\*\//, ""))
            .filter(Boolean);
    }
}

module.exports = GroupTextSearchService;
