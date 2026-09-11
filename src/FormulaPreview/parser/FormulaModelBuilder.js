const path = require('path');
const fs = require('fs');
const XmlEntityExpander = require('../../ReadXMLByJS/XmlFlatPreview/XmlEntityExpander');
const GaDeclarationExtractor = require('../../ReadXMLByJS/FormulaHover/GaDeclarationExtractor');
const { buildFormulaMap } = require('../../ReadXMLByJS/FormulaHover/GaFormulaMapBuilder');
const FormulaAstParser = require('./FormulaAstParser');
const FieldCatalogParser = require('./FieldCatalogParser');
const ScenarioParser = require('./ScenarioParser');
const FormulaLinter = require('./FormulaLinter');
const entityResolver = require('../../ReadXMLByJS/entityResolver');

class FormulaModelBuilder {
    /**
     * Xây dựng FormulaModel hoàn chỉnh từ file Grid XML
     * @param {string} filePath Đường dẫn file Grid XML
     * @param {string} rawXml Nội dung thô của file XML
     * @returns {object} FormulaModel
     */
    static build(filePath, rawXml) {
        const warnings = [];
        const fileName = path.basename(filePath);

        // 1. Flatten entity trong XML
        let flatXml = rawXml;
        try {
            const expandRes = XmlEntityExpander.expandXmlEntities(filePath, rawXml);
            if (expandRes && expandRes.flat_text) {
                flatXml = expandRes.flat_text;
                if (expandRes.warnings) {
                    for (const w of expandRes.warnings) {
                        warnings.push({ code: 'MISSING_ENTITY', message: w.message || w });
                    }
                }
            }
        } catch (e) {
            warnings.push({ code: 'PARSE_SOFT', message: `Lỗi expand XML entities: ${e.message}` });
        }

        // 2. Trích xuất khối g.$a
        let gaBlock = '';
        try {
            gaBlock = GaDeclarationExtractor.extractGaDeclaration(filePath, rawXml);
        } catch (e) {
            warnings.push({ code: 'PARSE_SOFT', message: `Lỗi trích xuất g.$a: ${e.message}` });
        }

        if (!gaBlock) {
            warnings.push({
                code: 'NO_GA_BLOCK',
                message: 'Không tìm thấy khối khai báo g.$a trong script của file Grid XML này.'
            });
        }

        // 3. Trích xuất catalog fields từ Grid XML
        const gridFields = FieldCatalogParser.parse(flatXml, 'grid');

        // 4. Tìm và trích xuất companion Dir (Dir/{prefix}Tran.xml)
        let companionDirPath = null;
        let masterFields = {};
        try {
            companionDirPath = this.resolveCompanionDir(filePath);
            if (companionDirPath && fs.existsSync(companionDirPath)) {
                const companionRaw = entityResolver.readFileContent(companionDirPath);
                const companionExpanded = XmlEntityExpander.expandXmlEntities(companionDirPath, companionRaw);
                masterFields = FieldCatalogParser.parse(companionExpanded.flat_text || companionRaw, 'master');
            } else {
                warnings.push({
                    code: 'NO_COMPANION_DIR',
                    message: 'Không tìm thấy file companion Dir/Tran tương ứng. Nhãn các trường master sẽ dùng tên kỹ thuật.'
                });
            }
        } catch (e) {
            warnings.push({ code: 'NO_COMPANION_DIR', message: `Lỗi đọc companion Dir: ${e.message}` });
        }

        // Merge fields (gridFields ưu tiên, masterFields bổ sung)
        const fields = Object.assign({}, gridFields);
        for (const [k, v] of Object.entries(masterFields)) {
            if (!fields[k]) {
                fields[k] = v;
            }
        }

        // Thêm trường tỷ giá mặc định nếu chưa có
        if (!fields['ty_gia']) {
            fields['ty_gia'] = {
                name: 'ty_gia',
                header_v: 'Tỷ giá',
                header_e: 'Exchange Rate',
                source: 'master',
                type: 'decimal',
                hidden: false,
                read_only: false,
                group: 'master'
            };
        }

        // 5. Phân tích các entry trong g.$a
        const rawMap = buildFormulaMap(gaBlock);
        const entries = [];

        for (const [alias, entry] of rawMap.entries()) {
            const formulaEntry = {
                alias,
                kind: entry.kind,
                raw: entry.rawValue || entry.display,
                group: FieldCatalogParser.classifyGroup(entry.target || entry.master || alias)
            };

            if (entry.kind === 'formula') {
                formulaEntry.target = entry.target;
                formulaEntry.formula = entry.formula;
                const ast = FormulaAstParser.parse(entry.formula);
                formulaEntry.ast = ast;
                formulaEntry.refs = ast ? FormulaAstParser.collectRefs(ast) : [];

                const targetField = fields[entry.target];
                const targetLabel = targetField ? (targetField.header_v || targetField.header_e || entry.target) : entry.target;
                const plainExpr = ast ? FormulaAstParser.toPlainVi(ast, fields) : entry.formula;
                formulaEntry.plain_vi = `${targetLabel} = ${plainExpr}`;

                // Tạo stub field nếu target chưa có trong catalog
                if (entry.target && !fields[entry.target]) {
                    fields[entry.target] = {
                        name: entry.target,
                        header_v: entry.target,
                        header_e: entry.target,
                        source: 'grid',
                        type: 'decimal',
                        hidden: false,
                        read_only: true,
                        group: formulaEntry.group
                    };
                }
            } else if (entry.kind === 'aggregate' || entry.kind === 'aggregate_filter') {
                formulaEntry.master = entry.master;
                formulaEntry.grid_col = entry.grid_col;
                formulaEntry.group = 'master';

                const masterField = fields[entry.master];
                const masterLabel = masterField ? (masterField.header_v || masterField.header_e || entry.master) : entry.master;

                // Phân loại grid_col: field đơn vs biểu thức (FIX-14)
                const isExpr = /[()?+\-*/?:]|==|!=/.test(entry.grid_col) || (entry.grid_col.includes('[') && !/^\[\w+\]$/.test(entry.grid_col));
                let gridAst = null;
                let gridLabel = entry.grid_col;
                let gridRefs = [];

                if (isExpr) {
                    gridAst = FormulaAstParser.parse(entry.grid_col);
                    formulaEntry.grid_col_ast = gridAst;
                    if (gridAst) {
                        gridRefs = FormulaAstParser.collectRefs(gridAst);
                        gridLabel = FormulaAstParser.toPlainVi(gridAst, fields);
                    }
                } else {
                    const gridField = fields[entry.grid_col];
                    gridLabel = gridField ? (gridField.header_v || gridField.header_e || entry.grid_col) : entry.grid_col;
                    gridRefs = entry.grid_col ? [entry.grid_col] : [];
                }

                if (entry.kind === 'aggregate_filter') {
                    formulaEntry.filter = entry.filter;
                    const filterAst = FormulaAstParser.parse(entry.filter);
                    formulaEntry.filter_ast = filterAst;
                    const filterRefs = filterAst ? FormulaAstParser.collectRefs(filterAst) : [];
                    formulaEntry.refs = Array.from(new Set([...gridRefs, ...filterRefs].filter(Boolean)));

                    const filterVi = filterAst ? FormulaAstParser.toPlainVi(filterAst, fields) : entry.filter;
                    formulaEntry.filter_vi = `khi ${filterVi}`;
                    formulaEntry.plain_vi = isExpr
                        ? `Cộng dồn (${gridLabel}) thành ${masterLabel} trên phiếu (khi ${filterVi})`
                        : `Cộng dồn ${gridLabel} trên lưới thành ${masterLabel} trên phiếu (khi ${filterVi})`;
                } else {
                    formulaEntry.refs = gridRefs;
                    formulaEntry.plain_vi = isExpr
                        ? `Cộng dồn (${gridLabel}) thành ${masterLabel} trên phiếu`
                        : `Cộng dồn ${gridLabel} trên lưới thành ${masterLabel} trên phiếu`;
                }

                // Tạo stub master field nếu chưa có
                if (entry.master && !fields[entry.master]) {
                    fields[entry.master] = {
                        name: entry.master,
                        header_v: entry.master,
                        header_e: entry.master,
                        source: 'master',
                        type: 'decimal',
                        hidden: false,
                        read_only: true,
                        group: 'master'
                    };
                }
            } else {
                formulaEntry.plain_vi = entry.display || entry.rawValue;
                formulaEntry.refs = [];
            }

            entries.push(formulaEntry);
        }

        // 6. Phân tích Scenarios (onChange)
        const scenarios = ScenarioParser.parse(flatXml, rawMap, fields);

        // 7. Chọn kịch bản mặc định & Seed values
        let defaultScenarioId = 'so_luong';
        if (scenarios.length > 0) {
            const hasSoLuong = scenarios.find(s => s.id === 'so_luong');
            if (hasSoLuong) {
                defaultScenarioId = 'so_luong';
            } else {
                defaultScenarioId = scenarios[0].id;
            }
        }

        const seedTemplate = {
            so_luong: 10,
            gia_nt: 100000,
            gia: 100000,
            ty_gia: 1,
            tl_ck: 5,
            thue_suat: 10,
            phi_dvtn_yn: false,
            ty_le: 0,
            tienmt_nt: 0
        };

        const seedValues = {};
        for (const [k, v] of Object.entries(seedTemplate)) {
            if (fields[k] || k === 'ty_gia') {
                seedValues[k] = v;
            }
        }

        const defaultDemoChain = this.buildDefaultDemoChain(entries);
        const domainGroupOrder = ['qty_price', 'amount', 'discount', 'tax', 'fee', 'master', 'other'];
        const presentGroups = new Set(entries.map(e => e.group).filter(Boolean));
        const groups = domainGroupOrder.filter(g => presentGroups.has(g));

        // 8. Chạy phân tích tĩnh FormulaLinter để tìm lỗi logic/chu trình/chia cho 0
        const diagnostics = FormulaLinter.lint(entries, fields);

        return {
            version: 1,
            source_path: filePath,
            file_name: fileName,
            generated_at: new Date().toISOString(),
            companion_dir_path: companionDirPath,
            warnings,
            diagnostics,
            fields,
            entries,
            default_demo_chain: defaultDemoChain,
            scenarios,
            groups,
            playground: {
                default_scenario_id: defaultScenarioId,
                values: seedValues
            }
        };
    }

    /**
     * Xây dựng chuỗi công thức demo mặc định (Generic Topo-sorted Path) từ các entries trong g.$a
     * @param {Array<object>} entries
     * @returns {string[]} Danh sách alias chạy theo thứ tự
     */
    static buildDefaultDemoChain(entries) {
        const formulaEntries = entries.filter(e => e.kind === 'formula' && e.target && e.ast);

        // 1. Gom nhóm formula theo target, mỗi target chọn đúng 1 alias đại diện
        const targetMap = new Map();
        for (const fe of formulaEntries) {
            if (!targetMap.has(fe.target)) {
                targetMap.set(fe.target, []);
            }
            targetMap.get(fe.target).push(fe);
        }

        const selectedByTarget = new Map();
        for (const [target, groupEntries] of targetMap.entries()) {
            // Ưu tiên:
            // 1. alias === target (vd [gia_nt]:=...)
            let chosen = groupEntries.find(e => e.alias === target);
            // 2. alias kết thúc bằng '_sl' (nếu không phải nhánh phụ rõ ràng)
            if (!chosen) {
                chosen = groupEntries.find(e => e.alias.endsWith('_sl') && !e.alias.includes('_vat') && !e.alias.includes('_zero'));
            }
            // 3. alias khai báo đầu tiên
            if (!chosen) {
                chosen = groupEntries[0];
            }
            selectedByTarget.set(target, chosen);
        }

        // Tách target của lưới và target của master (bắt đầu bằng t_)
        const gridTargets = [];
        const masterTargets = [];
        for (const target of selectedByTarget.keys()) {
            if (target.startsWith('t_')) {
                masterTargets.push(target);
            } else {
                gridTargets.push(target);
            }
        }

        // Topo-sort theo phụ thuộc refs -> target
        const topoSortFormulas = (targetList) => {
            const targets = new Set(targetList);
            const inDegree = new Map();
            const adj = new Map();

            for (const t of targetList) {
                inDegree.set(t, 0);
                adj.set(t, []);
            }

            for (const t of targetList) {
                const entry = selectedByTarget.get(t);
                const refs = entry ? (entry.refs || []) : [];
                for (const r of refs) {
                    if (targets.has(r) && r !== t) {
                        adj.get(r).push(t);
                        inDegree.set(t, inDegree.get(t) + 1);
                    }
                }
            }

            const queue = [];
            for (const t of targetList) {
                if (inDegree.get(t) === 0) {
                    queue.push(t);
                }
            }

            const result = [];
            const visited = new Set();

            while (queue.length > 0) {
                const curr = queue.shift();
                if (visited.has(curr)) continue;
                visited.add(curr);
                const entry = selectedByTarget.get(curr);
                if (entry) result.push(entry.alias);

                for (const next of adj.get(curr) || []) {
                    inDegree.set(next, inDegree.get(next) - 1);
                    if (inDegree.get(next) === 0 && !visited.has(next)) {
                        queue.push(next);
                    }
                }
            }

            // Xử lý các node còn lại nếu có cycle (bẻ cycle mềm)
            for (const t of targetList) {
                if (!visited.has(t)) {
                    visited.add(t);
                    const entry = selectedByTarget.get(t);
                    if (entry) result.push(entry.alias);
                }
            }

            return result;
        };

        const sortedGridAliases = topoSortFormulas(gridTargets);
        const chosenAliases = [...sortedGridAliases];

        // 2. Mọi Aggregate entries (chuyển số từ lưới lên master)
        const aggEntries = entries.filter(e => e.kind === 'aggregate' || e.kind === 'aggregate_filter');
        for (const ae of aggEntries) {
            if (!chosenAliases.includes(ae.alias)) {
                chosenAliases.push(ae.alias);
            }
        }

        // 3. Master formula entries (target bắt đầu bằng t_, tính sau aggregate)
        const sortedMasterAliases = topoSortFormulas(masterTargets);
        for (const alias of sortedMasterAliases) {
            if (!chosenAliases.includes(alias)) {
                chosenAliases.push(alias);
            }
        }

        // Kiểm tra các master formula còn sót lại nếu có
        const remainingMasterFormulas = entries.filter(e => e.kind === 'formula' && e.target && e.target.startsWith('t_'));
        for (const mf of remainingMasterFormulas) {
            if (!chosenAliases.includes(mf.alias)) {
                chosenAliases.push(mf.alias);
            }
        }

        return chosenAliases;
    }

    /**
     * Tìm đường dẫn companion Dir XML
     * @param {string} gridFilePath
     * @returns {string|null}
     */
    static resolveCompanionDir(gridFilePath) {
        if (!gridFilePath) return null;
        const normalized = path.normalize(gridFilePath);
        const parts = normalized.split(path.sep);

        const gridIdx = parts.findIndex(p => p.toLowerCase() === 'grid');
        if (gridIdx === -1) return null;

        const fileName = parts[parts.length - 1];
        // Thay thế Detail -> Tran (ví dụ DHNDetail.xml -> DHNTran.xml)
        const companionFileName = fileName.replace(/Detail\.xml$/i, 'Tran.xml');

        parts[gridIdx] = 'Dir';
        parts[parts.length - 1] = companionFileName;

        const targetPath = parts.join(path.sep);
        return targetPath;
    }
}

module.exports = FormulaModelBuilder;
