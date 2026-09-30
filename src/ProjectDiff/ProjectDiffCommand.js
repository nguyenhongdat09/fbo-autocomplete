// @ts-nocheck
// FBO: Diff With Reference Project — so file đang mở với file cùng relative path
// ở project khác (group khác trên FBO File tree) hoặc thư mục chọn tay.

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const AppDataPathHelper = require("../TreeFile/AppDataPathHelper");

function norm(p) {
    return path.normalize(String(p || "")).toLowerCase();
}

/**
 * Tìm project root + relative path của file.
 * Ưu tiên group root trên tree (khớp prefix dài nhất), fallback AppDataPathHelper.
 * @returns {{root:string, rel:string, groupName:string}|null}
 */
function resolveFileLocation(filePath, groupRoots) {
    const key = norm(filePath);
    let best = null;
    for (const g of groupRoots || []) {
        const root = norm(g.root);
        if (key === root || key.startsWith(root + path.sep)) {
            if (!best || root.length > norm(best.root).length) {
                best = { root: g.root, rel: path.relative(g.root, filePath), groupName: g.name };
            }
        }
    }
    if (best) return best;

    const helper = new AppDataPathHelper(filePath);
    const parts = helper.getPathAfterProject();
    if (parts.length >= 2 && parts[0]) {
        return { root: parts[0], rel: parts[1], groupName: helper.getGroupName() };
    }
    return null;
}

/** Tìm file tương ứng trong target root: cùng rel → cùng basename (qua file index). */
async function findCounterpart(targetRoot, rel, filePath, deps) {
    const exact = path.join(targetRoot, rel);
    if (fs.existsSync(exact)) return exact;

    // Fallback: tìm theo basename trong index của group đích
    const base = path.basename(filePath).toLowerCase();
    const svc = deps && deps.getIndexService && deps.getIndexService();
    if (svc && typeof svc.ensureIndex === "function") {
        try {
            const idx = await svc.ensureIndex(targetRoot, false);
            const hits = (idx.filesRel || []).filter(r =>
                path.basename(r).toLowerCase() === base
            );
            if (hits.length === 1) return path.join(targetRoot, hits[0]);
            if (hits.length > 1) {
                const pick = await vscode.window.showQuickPick(
                    hits.map(h => ({ label: h, abs: path.join(targetRoot, h) })),
                    { placeHolder: "Nhiều file cùng tên — chọn file để diff" }
                );
                return pick ? pick.abs : null;
            }
        } catch {
            // bỏ qua, báo không tìm thấy bên dưới
        }
    }
    return null;
}

/** Lấy fsPath từ Uri hoặc tree item (resourceUri). */
function itemPath(x) {
    if (!x) return null;
    if (x.fsPath) return x.fsPath;
    if (x.resourceUri && x.resourceUri.fsPath) return x.resourceUri.fsPath;
    return null;
}

/** Gom danh sách file được chọn (Ctrl+Click) — dedupe, chỉ file thật, bỏ .f. */
function collectFilePaths(uri, uris) {
    const raw = (Array.isArray(uris) && uris.length) ? uris : (uri ? [uri] : []);
    let paths = raw.map(itemPath).filter(Boolean);
    if (!paths.length) {
        const f = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath;
        if (f) paths = [f];
    }
    const seen = new Set();
    const files = [];
    let skippedF = 0;
    for (const p of paths) {
        const k = norm(p);
        if (seen.has(k)) continue;
        seen.add(k);
        try { if (!fs.statSync(p).isFile()) continue; } catch { continue; }
        if (path.extname(p).toLowerCase() === ".f") { skippedF++; continue; } // .f là file sinh — không diff
        files.push(p);
    }
    return { files, skippedF };
}

/**
 * @param {vscode.Uri|any} uri item được click (tree item hoặc Uri)
 * @param {{ getGroupRoots:()=>{name:string,root:string}[], getIndexService?:()=>any, memento?:any }} deps
 * @param {any[]|undefined} uris các item được chọn (multi-select trên tree)
 */
async function runDiffWithReference(uri, deps, uris) {
    const { files, skippedF } = collectFilePaths(uri, uris);
    if (!files.length) {
        vscode.window.showErrorMessage(skippedF
            ? "File .f là file sinh từ .xml — không diff. Chọn file .xml gốc."
            : "Không có file nào đang mở.");
        return;
    }
    const multi = files.length > 1;

    const groups = deps.getGroupRoots();
    const loc0 = resolveFileLocation(files[0], groups);
    if (!loc0) {
        vscode.window.showErrorMessage("Không xác định được project root của file hiện tại.");
        return;
    }

    // Chọn project đích (1 lần cho cả nhóm file)
    const others = groups.filter(g => norm(g.root) !== norm(loc0.root));
    const lastRoot = deps.memento && deps.memento.get("fbo.lastDiffRoot");
    const items = [
        ...others.map(g => ({
            label: g.name,
            description: g.root,
            root: g.root,
            picked: norm(g.root) === norm(lastRoot),
        })),
        { label: "$(folder) Chọn thư mục project...", root: null, browse: true },
    ];
    if (!items.length) {
        vscode.window.showWarningMessage("Không có project/group nào khác trên FBO File tree.");
        return;
    }
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: multi
            ? `Diff ${files.length} file với project nào?`
            : `Diff "${loc0.rel}" với project nào?`,
    });
    if (!picked) return;

    let targetRoot = picked.root;
    if (picked.browse) {
        const dlg = await vscode.window.showOpenDialog({
            canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
            openLabel: "Chọn project root để diff",
        });
        if (!dlg || !dlg[0]) return;
        targetRoot = dlg[0].fsPath;
    }
    if (deps.memento) await deps.memento.update("fbo.lastDiffRoot", targetRoot);

    // Từng file: tìm counterpart rồi mở diff
    const missing = [];
    const pairs = [];
    for (const fp of files) {
        const loc = resolveFileLocation(fp, groups) || { rel: path.basename(fp), groupName: loc0.groupName };
        const counterpart = multi
            ? (fs.existsSync(path.join(targetRoot, loc.rel)) ? path.join(targetRoot, loc.rel) : null)
            : await findCounterpart(targetRoot, loc.rel, fp, deps);
        if (counterpart) pairs.push({ counterpart, fp, loc });
        else missing.push(loc.rel);
    }

    for (const p of pairs) {
        await vscode.commands.executeCommand("vscode.diff",
            vscode.Uri.file(p.counterpart),
            vscode.Uri.file(p.fp),
            `${path.basename(p.fp)} — ${path.basename(targetRoot)} ↔ ${p.loc.groupName}`
        );
    }

    if (missing.length) {
        vscode.window.showWarningMessage(
            `${pairs.length} file đã diff. Không tìm thấy ${missing.length} file trong ${path.basename(targetRoot)}: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`
        );
    } else if (skippedF) {
        vscode.window.showInformationMessage(`Đã bỏ qua ${skippedF} file .f (file sinh).`);
    }
}

module.exports = { runDiffWithReference, resolveFileLocation };
