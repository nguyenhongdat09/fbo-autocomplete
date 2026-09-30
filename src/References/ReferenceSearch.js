// @ts-nocheck
// Tìm references bằng ripgrep (-F -w) trên tất cả group roots + các document đang mở (dirty).
// Trả [{ file, line0, col0, endCol, lineText }] — đủ để dựng Location[] hoặc WorkspaceEdit.

const vscode = require("vscode");
const path = require("path");
const { spawn } = require("child_process");
const GroupTextSearchRipgrepRunner = require("../TreeFile/SearchText/GroupTextSearchRipgrepRunner");

const MAX_MATCHES_PER_ROOT = 2000;

function norm(p) {
    return path.normalize(String(p || "")).toLowerCase();
}

/**
 * Spawn rg 1 root. Trả matches thô.
 * @param {string} root
 * @param {string} text literal
 * @param {{globs:string[], wordMatch:boolean, caseSensitive:boolean, token?:any}} opts
 */
function rgSearch(root, text, opts) {
    const args = [];
    if (!opts.caseSensitive) args.push("-i");
    args.push("-F", text);
    if (opts.wordMatch) args.push("-w");
    args.push("--json", "-n", "--column", "--max-count", "500");
    for (const g of opts.globs || []) {
        const glob = String(g || "").trim().replace(/^\*\*\//, "");
        if (glob) args.push("-g", glob);
    }
    args.push(root);

    return new Promise((resolve) => {
        let child;
        try {
            child = spawn(GroupTextSearchRipgrepRunner.getRgPath(), args, { windowsHide: true });
        } catch {
            resolve([]);
            return;
        }
        const matches = [];
        let buf = "";
        let killed = false;
        const kill = () => {
            killed = true;
            try { child.kill(); } catch { /* ignore */ }
        };
        const token = opts && opts.token;
        const disp = token && token.onCancellationRequested ? token.onCancellationRequested(kill) : null;

        child.stdout.on("data", (chunk) => {
            if (killed) return;
            buf += chunk.toString();
            const parts = buf.split("\n");
            buf = parts.pop() || "";
            for (const line of parts) {
                if (!line.trim()) continue;
                try {
                    const msg = JSON.parse(line);
                    if (msg.type !== "match" || !msg.data) continue;
                    const absPath = msg.data.path && msg.data.path.text;
                    if (!absPath) continue;
                    const lineText = String(msg.data.lines && msg.data.lines.text || "").replace(/\r?\n$/, "");
                    const line0 = Math.max(0, (Number(msg.data.line_number) || 1) - 1);
                    for (const sm of msg.data.submatches || []) {
                        matches.push({
                            file: absPath,
                            line0,
                            col0: Number(sm.start) || 0,
                            endCol: Number(sm.end) || 0,
                            lineText,
                        });
                        if (matches.length >= MAX_MATCHES_PER_ROOT) { kill(); break; }
                    }
                } catch { /* dòng json lỗi — bỏ qua */ }
                if (killed) break;
            }
        });
        child.stderr.on("data", () => { /* ignore */ });
        child.on("error", () => { if (disp) disp.dispose(); resolve(matches); });
        child.on("close", () => {
            if (disp) disp.dispose();
            if (buf.trim() && !killed) {
                try {
                    const msg = JSON.parse(buf);
                    if (msg.type === "match" && msg.data && msg.data.path) {
                        const line0 = Math.max(0, (Number(msg.data.line_number) || 1) - 1);
                        for (const sm of msg.data.submatches || []) {
                            matches.push({
                                file: msg.data.path.text,
                                line0,
                                col0: Number(sm.start) || 0,
                                endCol: Number(sm.end) || 0,
                                lineText: String(msg.data.lines && msg.data.lines.text || "").replace(/\r?\n$/, ""),
                            });
                        }
                    }
                } catch { /* ignore */ }
            }
            resolve(matches);
        });
    });
}

/**
 * Scan document đang mở (có thể dirty — rg đọc disk sẽ miss nội dung chưa save).
 */
function scanOpenDocuments(roots, text, wordMatch, caseSensitive) {
    const out = [];
    const rootNorms = (roots || []).map(norm);
    const needle = String(text);
    for (const doc of vscode.workspace.textDocuments) {
        if (!doc.uri || doc.uri.scheme !== "file") continue;
        const fp = doc.uri.fsPath;
        if (!rootNorms.some(r => norm(fp).startsWith(r))) continue;
        const content = doc.getText();
        const haystack = caseSensitive ? content : content.toLowerCase();
        const needleCmp = caseSensitive ? needle : needle.toLowerCase();
        const lineStarts = [0];
        for (let i = 0; i < content.length; i++) {
            if (content.charCodeAt(i) === 10) lineStarts.push(i + 1);
        }
        const lineOf = (off) => {
            let lo = 0, hi = lineStarts.length - 1;
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                if (lineStarts[mid] <= off) lo = mid; else hi = mid - 1;
            }
            return lo;
        };
        let idx = 0;
        while ((idx = haystack.indexOf(needleCmp, idx)) !== -1) {
            if (wordMatch) {
                const before = idx > 0 ? haystack[idx - 1] : " ";
                const after = idx + needle.length < haystack.length ? haystack[idx + needle.length] : " ";
                if (/[\w$#]/.test(before) || /[\w$#]/.test(after)) { idx += needle.length; continue; }
            }
            const line0 = lineOf(idx);
            const lineStart = lineStarts[line0];
            const lineEnd = content.indexOf("\n", idx);
            out.push({
                file: fp,
                line0,
                col0: idx - lineStart,
                endCol: idx - lineStart + needle.length,
                lineText: content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd),
            });
            idx += needle.length;
            if (out.length > MAX_MATCHES_PER_ROOT) break;
        }
    }
    return out;
}

/**
 * @param {string[]} roots
 * @param {string} text
 * @param {{globs?:string[], wordMatch?:boolean, caseSensitive?:boolean, token?:any}} [opts]
 * @returns {Promise<Array<{file:string,line0:number,col0:number,endCol:number,lineText:string}>>}
 */
async function findMatches(roots, text, opts) {
    const o = Object.assign({ globs: [], wordMatch: true, caseSensitive: false }, opts);
    if (!text || !roots || !roots.length) return [];

    const perRoot = await Promise.all(roots.map(r => rgSearch(r, text, o)));
    const matches = perRoot.flat().concat(scanOpenDocuments(roots, text, o.wordMatch, o.caseSensitive));

    const seen = new Set();
    return matches.filter(m => {
        const k = `${norm(m.file)}:${m.line0}:${m.col0}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

/** Match có phải chỗ khai báo (name="X" trong <field>/<item>) không — dùng cho includeDeclaration. */
function isDeclarationMatch(m, text) {
    const lt = m.lineText || "";
    const re = new RegExp(`<(?:field|item)\\b[^>]*name\\s*=\\s*["']${escapeRe(text)}["']`, "i");
    return re.test(lt);
}

function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { findMatches, isDeclarationMatch, escapeRe, scanOpenDocuments };
