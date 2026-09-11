/**
 * ScenarioParser — Phân tích hàm onChange$Grid... để trích xuất kịch bản tính toán theo từng trường
 */

class ScenarioParser {
    /**
     * @param {string} scriptText Nội dung Javascript của file Grid XML (hoặc flat XML)
     * @param {Map<string, object>} formulaMap Map các alias từ GaFormulaMapBuilder
     * @param {Record<string, object>} fieldLookup
     * @returns {Array<object>} Danh sách Scenarios
     */
    static parse(scriptText, formulaMap = new Map(), fieldLookup = {}) {
        if (!scriptText || typeof scriptText !== 'string') {
            return this.buildSyntheticScenarios(formulaMap, fieldLookup);
        }

        const scenarios = [];
        const helpers = this.extractHelperReturnArrays(scriptText);

        // 1. Tìm tất cả các hàm onChange$ trong script
        const candidates = this.findAllOnChangeFunctions(scriptText);
        if (candidates.length === 0) {
            return this.buildSyntheticScenarios(formulaMap, fieldLookup);
        }

        // 2. Lọc các hàm có chứa switch (...)
        const switchCandidates = [];
        for (const cand of candidates) {
            const switchMatch = cand.body.match(/switch\s*\(\s*[\w$.]+\s*\)\s*\{/i);
            if (switchMatch) {
                const switchStartIndex = switchMatch.index + switchMatch[0].length - 1;
                const switchBody = this.matchBraces(cand.body, switchStartIndex);
                if (switchBody) {
                    const cases = switchBody.match(/case\s+['"][^'"]+['"]\s*:/gi) || [];
                    switchCandidates.push({
                        name: cand.name,
                        body: cand.body,
                        switchBody,
                        caseCount: cases.length
                    });
                }
            }
        }

        if (switchCandidates.length === 0) {
            return this.buildSyntheticScenarios(formulaMap, fieldLookup);
        }

        // 3. Chọn hàm có nhiều case nhất (hàm onChange chính của Grid)
        switchCandidates.sort((a, b) => b.caseCount - a.caseCount);
        const bestCandidate = switchCandidates[0];
        const switchBody = bestCandidate.switchBody;

        // Tách từng case 'fieldName':
        const caseRegex = /case\s+['"]([^'"]+)['"]\s*:([\s\S]*?)(?=case\s+['"]|default\s*:|switch\s*\(|$)/gi;
        let caseMatch;

        while ((caseMatch = caseRegex.exec(switchBody)) !== null) {
            const triggerField = caseMatch[1];
            const caseCode = caseMatch[2];

            const formulaAliases = [];
            const aggregateAliases = [];
            const masterAliases = [];

            // Thu thập các g.$a.ALIAS
            const aliasMatches = caseCode.matchAll(/g\.\$a\.([A-Za-z0-9_]+)/g);
            for (const am of aliasMatches) {
                const aliasName = am[1];
                const entry = formulaMap.get(aliasName);
                if (entry) {
                    if (entry.kind === 'aggregate' || entry.kind === 'aggregate_filter') {
                        if (!aggregateAliases.includes(aliasName)) aggregateAliases.push(aliasName);
                    } else if (aliasName.startsWith('t_') || (entry.target && entry.target.startsWith('t_'))) {
                        if (!masterAliases.includes(aliasName)) masterAliases.push(aliasName);
                    } else {
                        if (!formulaAliases.includes(aliasName)) formulaAliases.push(aliasName);
                    }
                } else {
                    if (!formulaAliases.includes(aliasName)) formulaAliases.push(aliasName);
                }
            }

            // Expand helpers nếu có gọi row_phi hoặc getRowPhi... hoặc concat
            for (const [helperName, helperList] of Object.entries(helpers)) {
                if (caseCode.includes(helperName)) {
                    for (const hAlias of helperList) {
                        const entry = formulaMap.get(hAlias);
                        if (entry && (entry.kind === 'aggregate' || entry.kind === 'aggregate_filter')) {
                            if (!aggregateAliases.includes(hAlias)) aggregateAliases.push(hAlias);
                        } else {
                            if (!formulaAliases.includes(hAlias)) formulaAliases.push(hAlias);
                        }
                    }
                }
            }

            const extraJs = caseCode.includes('calcGiaDvtn') || caseCode.includes('setItemGridBehavior') || caseCode.includes('request(');
            const extraJsNote = caseCode.includes('calcGiaDvtn') ? 'calcGiaDvtn — tính giá chéo dòng, không mô phỏng MVP' : undefined;

            const label = fieldLookup[triggerField] ? (fieldLookup[triggerField].header_v || fieldLookup[triggerField].header_e || triggerField) : triggerField;

            scenarios.push({
                id: triggerField,
                trigger_field: triggerField,
                title_vi: `Khi sửa ${label}`,
                formula_aliases: formulaAliases,
                aggregate_aliases: aggregateAliases,
                master_aliases: masterAliases,
                extra_js: extraJs,
                extra_js_note: extraJsNote
            });
        }

        if (scenarios.length === 0) {
            return this.buildSyntheticScenarios(formulaMap, fieldLookup);
        }

        return scenarios;
    }

    /**
     * Trích xuất các hàm helper trả về danh sách g.$a (như getRowPhi, getAggregate...)
     */
    static extractHelperReturnArrays(scriptText) {
        const helpers = {};
        const helperFuncRegex = /function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{([\s\S]*?)\}/g;
        let match;

        while ((match = helperFuncRegex.exec(scriptText)) !== null) {
            const funcName = match[1];
            const body = match[2];
            const returnMatch = body.match(/return\s*\[([\s\S]*?)\];/);
            if (returnMatch) {
                const inner = returnMatch[1];
                const list = [];
                const ams = inner.matchAll(/g\.\$a\.([A-Za-z0-9_]+)/g);
                for (const am of ams) {
                    list.push(am[1]);
                }
                if (list.length > 0) {
                    helpers[funcName] = list;
                }
            }
        }

        // Bắt các biến dạng var row_phi = [g.$a.a, g.$a.b]
        const varArrayRegex = /(?:var|let|const)\s+([A-Za-z0-9_$]+)\s*=\s*\[([\s\S]*?)\];/g;
        while ((match = varArrayRegex.exec(scriptText)) !== null) {
            const varName = match[1];
            const inner = match[2];
            const list = [];
            const ams = inner.matchAll(/g\.\$a\.([A-Za-z0-9_]+)/g);
            for (const am of ams) {
                list.push(am[1]);
            }
            if (list.length > 0) {
                helpers[varName] = list;
            }
        }

        return helpers;
    }

    /**
     * Tạo synthetic scenarios tự động khi không có onChange hoặc không parse được
     */
    static buildSyntheticScenarios(formulaMap, fieldLookup) {
        const scenarios = [];
        const allAliases = Array.from(formulaMap.keys());

        const formulaAliases = [];
        const aggregateAliases = [];
        const masterAliases = [];

        for (const alias of allAliases) {
            const entry = formulaMap.get(alias);
            if (entry.kind === 'aggregate' || entry.kind === 'aggregate_filter') {
                aggregateAliases.push(alias);
            } else if (alias.startsWith('t_') || (entry.target && entry.target.startsWith('t_'))) {
                masterAliases.push(alias);
            } else {
                formulaAliases.push(alias);
            }
        }

        const createScenario = (id, triggerField, title) => {
            return {
                id,
                trigger_field: triggerField,
                title_vi: title,
                formula_aliases: [...formulaAliases],
                aggregate_aliases: [...aggregateAliases],
                master_aliases: [...masterAliases],
                extra_js: false
            };
        };

        if (fieldLookup['so_luong'] || formulaMap.has('tien_nt2_sl') || formulaMap.has('tien2_sl')) {
            scenarios.push(createScenario('so_luong', 'so_luong', 'Khi sửa Số lượng'));
        }
        if (fieldLookup['gia_nt'] || formulaMap.has('gia_nt_sl')) {
            scenarios.push(createScenario('gia_nt', 'gia_nt', 'Khi sửa Giá nt'));
        }
        if (fieldLookup['phi_dvtn_yn']) {
            scenarios.push(createScenario('phi_dvtn_yn', 'phi_dvtn_yn', 'Khi sửa Phí DV-TN'));
        }

        if (scenarios.length === 0) {
            scenarios.push(createScenario('default', 'so_luong', 'Kịch bản mặc định'));
        }

        return scenarios;
    }

    /**
     * Tìm tất cả các hàm có dạng function onChange$... trong script
     * @param {string} scriptText
     * @returns {Array<{ name: string, body: string }>}
     */
    static findAllOnChangeFunctions(scriptText) {
        const candidates = [];
        const funcHeaderRegex = /function\s+(onChange\$[\w$]*)\s*\([^)]*\)\s*\{/gi;
        let match;

        while ((match = funcHeaderRegex.exec(scriptText)) !== null) {
            const name = match[1];
            const startIndex = match.index + match[0].length - 1;
            const body = this.matchBraces(scriptText, startIndex);
            if (body) {
                candidates.push({ name, body });
            }
        }

        return candidates;
    }

    /**
     * Khớp cặp dấu ngoặc nhọn `{ ... }`
     */
    static matchBraces(text, startIndex) {
        let depth = 0;
        let start = -1;

        for (let i = startIndex; i < text.length; i++) {
            if (text[i] === '{') {
                if (depth === 0) start = i;
                depth++;
            } else if (text[i] === '}') {
                depth--;
                if (depth === 0 && start !== -1) {
                    return text.substring(start + 1, i);
                }
            }
        }
        return null;
    }
}

module.exports = ScenarioParser;
