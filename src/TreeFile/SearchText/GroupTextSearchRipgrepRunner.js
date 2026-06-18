// @ts-nocheck

const vscode = require("vscode");
const { spawn } = require("child_process");
const GroupTextSearchAggregator = require("./GroupTextSearchAggregator");

/**
 * Chạy rg qua @vscode/ripgrep — không cần API proposed findTextInFiles.
 */
class GroupTextSearchRipgrepRunner {
    /**
     * @returns {string}
     */
    static getRgPath() {
        return require("@vscode/ripgrep").rgPath;
    }

    /**
     * @param {{
     *   searchFolder: string,
     *   queryText: string,
     *   caseSensitive: boolean,
     *   globs: string[],
     *   model: import('./GroupTextSearchResultModel'),
     *   token?: import('vscode').CancellationToken,
     *   onMatch?: () => void,
     * }} params
     * @returns {Promise<void>}
     */
    static run(params) {
        const p = params || {};
        const searchFolder = String(p.searchFolder || "");
        const queryText = String(p.queryText || "");
        const caseSensitive = Boolean(p.caseSensitive);
        const globs = Array.isArray(p.globs) ? p.globs : [];
        const model = p.model;
        const token = p.token;
        const onMatch = typeof p.onMatch === "function" ? p.onMatch : null;

        if (!searchFolder || !queryText || !model) {
            return Promise.resolve();
        }

        const args = GroupTextSearchRipgrepRunner._buildArgs({
            searchFolder,
            queryText,
            caseSensitive,
            globs,
        });

        return new Promise((resolve, reject) => {
            let child;
            try {
                child = spawn(GroupTextSearchRipgrepRunner.getRgPath(), args, {
                    windowsHide: true,
                });
            } catch (err) {
                reject(err);
                return;
            }

            let cancelled = false;
            let stdoutBuf = "";
            let disposeCancel = null;

            const killChild = () => {
                cancelled = true;
                if (child && !child.killed) {
                    try {
                        child.kill();
                    } catch {
                        // ignore
                    }
                }
            };

            if (token) {
                if (token.isCancellationRequested) {
                    killChild();
                    resolve();
                    return;
                }
                disposeCancel = token.onCancellationRequested(killChild);
            }

            child.stdout.on("data", (chunk) => {
                if (cancelled) return;
                stdoutBuf += chunk.toString();
                const parts = stdoutBuf.split("\n");
                stdoutBuf = parts.pop() || "";
                for (const line of parts) {
                    if (!line.trim()) continue;
                    try {
                        const msg = JSON.parse(line);
                        if (msg.type === "match" && msg.data) {
                            GroupTextSearchRipgrepRunner._applyMatch(model, msg.data, onMatch);
                        }
                    } catch {
                        // ignore malformed json line
                    }
                }
            });

            child.stderr.on("data", () => {
                // rg may write to stderr; ignore unless process fails
            });

            child.on("error", (err) => {
                if (disposeCancel) disposeCancel.dispose();
                if (!cancelled) reject(err);
                else resolve();
            });

            child.on("close", () => {
                if (disposeCancel) disposeCancel.dispose();
                if (stdoutBuf.trim() && !cancelled) {
                    try {
                        const msg = JSON.parse(stdoutBuf);
                        if (msg.type === "match" && msg.data) {
                            GroupTextSearchRipgrepRunner._applyMatch(model, msg.data, onMatch);
                        }
                    } catch {
                        // ignore trailing partial line
                    }
                }
                resolve();
            });
        });
    }

    /**
     * @param {{
     *   searchFolder: string,
     *   queryText: string,
     *   caseSensitive: boolean,
     *   globs: string[],
     * }} opts
     * @returns {string[]}
     */
    static _buildArgs(opts) {
        const args = [];
        if (!opts.caseSensitive) {
            args.push("-i");
        }
        args.push("-F", opts.queryText, "--json", "-n", "--column");
        for (const g of opts.globs) {
            const glob = String(g || "").trim().replace(/^\*\*\//, "");
            if (glob) {
                args.push("-g", glob);
            }
        }
        args.push(opts.searchFolder);
        return args;
    }

    /**
     * @param {import('./GroupTextSearchResultModel')} model
     * @param {any} data
     * @param {(() => void)|null} onMatch
     */
    static _applyMatch(model, data, onMatch) {
        const absPath = data.path && data.path.text;
        if (!absPath) return;

        const lineText = String(data.lines && data.lines.text != null ? data.lines.text : "")
            .replace(/\r?\n$/, "");
        const line0 = Math.max(0, (Number(data.line_number) || 1) - 1);
        const submatches = Array.isArray(data.submatches) ? data.submatches : [];
        if (!submatches.length) return;

        const first = submatches[0];
        const range = new vscode.Range(
            line0,
            Number(first.start) || 0,
            line0,
            Number(first.end) || 0
        );
        const previewMatches = submatches.map((sm) => new vscode.Range(
            0,
            Number(sm.start) || 0,
            0,
            Number(sm.end) || 0
        ));

        GroupTextSearchAggregator.applyToModel(model, {
            uri: vscode.Uri.file(absPath),
            ranges: [range],
            preview: {
                text: lineText,
                matches: previewMatches,
            },
        });
        if (onMatch) {
            onMatch();
        }
    }
}

module.exports = GroupTextSearchRipgrepRunner;
