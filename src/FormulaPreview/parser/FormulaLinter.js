/**
 * FormulaLinter — Phân tích tĩnh và phát hiện các lỗi logic, chu trình lồng nhau, nguy cơ chia cho 0 trong g.$a
 */

class FormulaLinter {
    /**
     * Chạy toàn bộ các quy tắc lint trên danh sách entries và catalog trường
     * @param {Array<object>} entries Danh sách FormulaEntry
     * @param {Record<string, object>} fields Catalog trường
     * @returns {Array<object>} Danh sách diagnostics / lints
     */
    static lint(entries = [], fields = {}) {
        const diagnostics = [];

        if (!entries || entries.length === 0) return diagnostics;

        // 1. Kiểm tra lỗi cú pháp (Syntax Errors)
        for (const entry of entries) {
            if (entry.kind === 'formula' && !entry.ast) {
                diagnostics.push({
                    id: `lint-syntax-${entry.alias}`,
                    type: 'error',
                    code: 'SYNTAX_PARSE_ERROR',
                    alias: entry.alias,
                    field: entry.target || entry.alias,
                    title: `Lỗi cú pháp công thức tại [${entry.alias}]`,
                    message: `Không thể phân tích cây cú pháp AST cho biểu thức: "${entry.formula || entry.raw}"`,
                    suggestion: 'Kiểm tra lại dấu ngoặc đơn (), ngoặc vuông [], hoặc các toán tử bị thiếu.'
                });
            }
        }

        // 2. Kiểm tra trường tham chiếu chưa khai báo (Undefined Field References)
        const ignoredSystemFields = new Set([
            'ty_gia', 'stt_rec', 'stt_rec0', 'line_nbr', 'status', 'user_id0', 'user_id2',
            'date0', 'time0', 'date2', 'time2', 'ma_ct', 'ngay_ct', 'so_ct', 'ma_dvcs'
        ]);

        for (const entry of entries) {
            const refs = entry.refs || [];
            for (const refName of refs) {
                if (ignoredSystemFields.has(refName)) continue;
                if (!fields[refName]) {
                    diagnostics.push({
                        id: `lint-undef-${entry.alias}-${refName}`,
                        type: 'warning',
                        code: 'UNDEFINED_FIELD_REF',
                        alias: entry.alias,
                        field: refName,
                        title: `Trường [${refName}] chưa khai báo trong XML`,
                        message: `Alias [${entry.alias}] tham chiếu đến trường [${refName}], nhưng trường này không có trong khai báo Grid XML hay companion Dir.`,
                        suggestion: `Kiểm tra lại chính tả tên trường hoặc bổ sung thẻ <field name="${refName}"> trong XML.`
                    });
                }
            }
        }

        // 3. Kiểm tra nguy cơ chia cho 0 (Potential Divide by Zero)
        for (const entry of entries) {
            if (entry.kind === 'formula' && entry.ast) {
                const divIssues = this.findUnguardedDivisions(entry.ast);
                for (const issue of divIssues) {
                    diagnostics.push({
                        id: `lint-div0-${entry.alias}-${issue.field}`,
                        type: 'warning',
                        code: 'POTENTIAL_DIVIDE_BY_ZERO',
                        alias: entry.alias,
                        field: issue.field,
                        title: `Nguy cơ chia cho 0 tại alias [${entry.alias}]`,
                        message: `Phép chia cho [${issue.field}] không có điều kiện kiểm tra [${issue.field}] == 0 trước khi chia.`,
                        suggestion: `Nên bọc: ([${issue.field}] == 0 ? 0 : (${entry.formula || entry.raw}))`
                    });
                }
            }
        }

        // 4. Kiểm tra chu trình phụ thuộc lồng nhau (Circular Dependencies)
        const cycles = this.detectCircularDependencies(entries);
        for (let i = 0; i < cycles.length; i++) {
            const cycle = cycles[i];
            const cyclePathStr = cycle.join(' ➔ ');
            diagnostics.push({
                id: `lint-cycle-${i}`,
                type: 'info',
                code: 'CIRCULAR_DEPENDENCY',
                alias: cycle[0],
                field: cycle[0],
                title: `Chu trình phụ thuộc vòng giữa các cột: ${cyclePathStr}`,
                message: `Các cột ${cycle.map(c => `[${c}]`).join(', ')} phụ thuộc lẫn nhau trong g.$a. FBO runtime cần sự kiện onChange riêng biệt để tránh lặp vô tận.`,
                suggestion: `Đảm bảo các sự kiện onChange gán giá trị hợp lý và không kích hoạt lẫn nhau vòng tròn.`
            });
        }

        return diagnostics;
    }

    /**
     * Tìm các phép chia không có điều kiện bảo vệ mẫu số
     * @param {object} ast
     * @param {Set<string>} guardedFields
     * @returns {Array<{field: string}>}
     */
    static findUnguardedDivisions(ast, guardedFields = new Set()) {
        const issues = [];

        function traverse(node, currentGuards) {
            if (!node) return;

            if (node.type === 'binary') {
                if (node.op === '/') {
                    // Mẫu số là node.right
                    const denomRefs = FormulaLinter.collectFieldNames(node.right);
                    for (const f of denomRefs) {
                        if (!currentGuards.has(f)) {
                            issues.push({ field: f });
                        }
                    }
                }
                traverse(node.left, currentGuards);
                traverse(node.right, currentGuards);
            } else if (node.type === 'ternary') {
                // Phân tích điều kiện cond
                const newGuardsThen = new Set(currentGuards);
                const newGuardsElse = new Set(currentGuards);

                // Ví dụ: [x] != 0 -> then được bảo vệ x != 0
                if (node.cond && node.cond.type === 'cmp') {
                    const cmp = node.cond;
                    if (cmp.left && cmp.left.type === 'field' && cmp.right && cmp.right.type === 'number') {
                        const fieldName = cmp.left.name;
                        const val = cmp.right.value;
                        if (val === 0) {
                            if (cmp.op === '!=' || cmp.op === '>') {
                                newGuardsThen.add(fieldName);
                            } else if (cmp.op === '==') {
                                newGuardsElse.add(fieldName);
                            }
                        }
                    }
                }

                traverse(node.cond, currentGuards);
                traverse(node.then, newGuardsThen);
                traverse(node.else, newGuardsElse);
            } else if (node.type === 'unary') {
                traverse(node.arg, currentGuards);
            } else if (node.type === 'call') {
                (node.args || []).forEach(a => traverse(a, currentGuards));
            }
        }

        traverse(ast, guardedFields);
        return issues;
    }

    /**
     * Thu thập tên các trường trong 1 node AST con
     * @param {object} node
     * @returns {string[]}
     */
    static collectFieldNames(node) {
        const names = new Set();
        function walk(n) {
            if (!n) return;
            if (n.type === 'field') names.add(n.name);
            else if (n.type === 'binary' || n.type === 'cmp') {
                walk(n.left);
                walk(n.right);
            } else if (n.type === 'unary') {
                walk(n.arg);
            } else if (n.type === 'ternary') {
                walk(n.cond);
                walk(n.then);
                walk(n.else);
            } else if (n.type === 'call') {
                (n.args || []).forEach(walk);
            }
        }
        walk(node);
        return Array.from(names);
    }

    /**
     * Phát hiện chu trình phụ thuộc giữa các target của công thức
     * @param {Array<object>} entries
     * @returns {Array<string[]>} Danh sách các chu trình (VD: [['gia_nt', 'tien_nt', 'gia_nt']])
     */
    static detectCircularDependencies(entries) {
        const formulaEntries = entries.filter(e => e.kind === 'formula' && e.target);
        const adj = new Map(); // target -> Set of targets it depends on

        for (const e of formulaEntries) {
            if (!adj.has(e.target)) adj.set(e.target, new Set());
            for (const r of e.refs || []) {
                if (r !== e.target) {
                    adj.get(e.target).add(r);
                }
            }
        }

        const targets = Array.from(adj.keys());
        const allCycles = [];
        const visitedCyclesKey = new Set();

        const visited = new Set();
        const stack = [];
        const inStack = new Set();

        function dfs(u) {
            visited.add(u);
            stack.push(u);
            inStack.add(u);

            const neighbors = adj.get(u) || new Set();
            for (const v of neighbors) {
                if (!adj.has(v)) continue; // v không phải target công thức nào

                if (!visited.has(v)) {
                    dfs(v);
                } else if (inStack.has(v)) {
                    // Tìm thấy chu trình từ v đến u
                    const cycleStartIndex = stack.indexOf(v);
                    if (cycleStartIndex !== -1) {
                        const cycle = stack.slice(cycleStartIndex);
                        cycle.push(v); // Đóng chu trình: [v, ..., u, v]

                        // Chuẩn hóa key để tránh trùng chu trình xoay vòng
                        const normKey = [...cycle.slice(0, -1)].sort().join('-');
                        if (!visitedCyclesKey.has(normKey)) {
                            visitedCyclesKey.add(normKey);
                            allCycles.push(cycle);
                        }
                    }
                }
            }

            stack.pop();
            inStack.delete(u);
        }

        for (const t of targets) {
            if (!visited.has(t)) {
                dfs(t);
            }
        }

        return allCycles;
    }
}

module.exports = FormulaLinter;
