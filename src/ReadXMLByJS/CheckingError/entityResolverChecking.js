const fs = require('fs');
const path = require('path');
const { resolveFboXmlEntities, readFileContent, getEntitiesForFile } = require('../entityResolver');
const {
    get_relative_after_project,
    get_xml_short_name,
    find_in_sources_by_relative,
    source_label_from_index,
    map_to_source
} = require('./SourcePathHelper');

const BUILTIN_GENERAL_ENTITIES = new Set(['amp', 'lt', 'gt', 'quot', 'apos']);

function ensure_xml_bucket(per_xml, xml_path, xml_short) {
    if (!per_xml.has(xml_path)) {
        per_xml.set(xml_path, { xml_short, missing_count: 0, undeclared_count: 0 });
    }
    return per_xml.get(xml_path);
}

function get_transitively_used_entities(main_file_path, generalEntities) {
    const used_entities = new Set();
    const to_process = [];

    let main_content = '';
    try {
        main_content = readFileContent(main_file_path);
    } catch (e) {}

    if (main_content) {
        const doctype_match = main_content.match(/<!DOCTYPE\s+[\s\S]*?\[([\s\S]*?)\]\s*>/i);
        if (doctype_match) {
            main_content = main_content.substring(doctype_match.index + doctype_match[0].length);
        }
        main_content = main_content.replace(/<!--[\s\S]*?-->/g, '');
        
        const entity_ref_re = /&([A-Za-z_][\w.-]*);/g;
        let match;
        while ((match = entity_ref_re.exec(main_content)) !== null) {
            const name = match[1];
            if (!BUILTIN_GENERAL_ENTITIES.has(name) && !used_entities.has(name)) {
                used_entities.add(name);
                to_process.push(name);
            }
        }
    }

    const processed = new Set();
    while (to_process.length > 0) {
        const current_entity = to_process.shift();
        if (processed.has(current_entity)) continue;
        processed.add(current_entity);

        const ent = generalEntities ? generalEntities[current_entity] : null;
        if (!ent) continue;

        let content = '';
        if (ent.systemUrl && ent.sourceFile) {
            try {
                if (fs.existsSync(ent.sourceFile)) {
                    content = readFileContent(ent.sourceFile);
                }
            } catch (e) {}
        } else if (ent.value) {
            content = ent.value;
        }

        if (content) {
            content = content.replace(/<!--[\s\S]*?-->/g, '');
            const entity_ref_re = /&([A-Za-z_][\w.-]*);/g;
            let match;
            while ((match = entity_ref_re.exec(content)) !== null) {
                const name = match[1];
                if (!BUILTIN_GENERAL_ENTITIES.has(name) && !used_entities.has(name)) {
                    used_entities.add(name);
                    to_process.push(name);
                }
            }
        }
    }

    return used_entities;
}

function scan_undeclared(file_path, xml_short, generalEntities, parameterEntities, roots, errors, table2_entities, seen_undeclared, bucket) {
    const used_entities = get_transitively_used_entities(file_path, generalEntities);

    const undeclared_names = new Set();
    
    for (const entity_name of used_entities) {
        if (generalEntities && generalEntities[entity_name]) continue;
        undeclared_names.add(entity_name);
    }

    for (const entity_name of undeclared_names) {
        const dedupe_key = `${path.normalize(file_path).toLowerCase()}|${entity_name}`;
        if (seen_undeclared.has(dedupe_key)) continue;
        seen_undeclared.add(dedupe_key);

        let status = 'missing';
        let source_index = null;
        let decl_file = null;
        let decl_line = null;
        let decl_is_system = false;
        let decl_system_file = null;

        const rel_info = get_relative_after_project(file_path);
        if (rel_info && roots.length) {
            for (let i = 0; i < roots.length; i++) {
                const root = roots[i];
                if (!root) continue;
                const source_xml = map_to_source(root, rel_info.relative_path);
                if (!fs.existsSync(source_xml)) continue;

                let entities_on_source = null;
                try {
                    entities_on_source = getEntitiesForFile(source_xml);
                } catch (e) {
                    continue;
                }
                const ent = entities_on_source ? entities_on_source[entity_name] : null;
                if (!ent) continue;

                status = 'ok';
                source_index = i;
                decl_is_system = !!(ent.systemUrl && ent.sourceFile);
                decl_system_file = decl_is_system ? ent.sourceFile : null;

                if (ent.declaredInFile && ent.line > 0) {
                    decl_file = ent.declaredInFile;
                    decl_line = ent.line;
                } else if (decl_is_system && ent.sourceFile && fs.existsSync(ent.sourceFile)) {
                    decl_file = ent.sourceFile;
                    decl_line = 1;
                } else {
                    decl_file = source_xml;
                    decl_line = ent.line > 0 ? ent.line : 1;
                }
                break;
            }
        }

        table2_entities.push({
            xml_short,
            xml_path: file_path,
            entity_name,
            status,
            source_index,
            source_label: status === 'ok' ? source_label_from_index(source_index) : 'Không tìm thấy',
            decl_file,
            decl_line,
            decl_is_system,
            decl_system_file
        });
        bucket.undeclared_count++;
        errors.push({
            type: 'undeclared_entity',
            message: `Entity chưa khai báo: &${entity_name};`,
            xml_short,
            xml_path: file_path,
            entity_name
        });
    }
}

function check_one_file(file_path, roots, errors, table1_missing, table2_entities, seen_missing, seen_undeclared, per_xml) {
    const xml_short = get_xml_short_name(file_path);
    const bucket = ensure_xml_bucket(per_xml, file_path, xml_short);

    if (!fs.existsSync(file_path)) {
        // File chọn không tồn tại: đưa vào table1 để summary/total phản ánh đúng
        const key = path.normalize(file_path).toLowerCase();
        if (!seen_missing.has(key)) {
            seen_missing.add(key);
            table1_missing.push({
                xml_short,
                xml_path: file_path,
                missing_path: file_path,
                relative_path: '',
                system_url: '',
                entity_name: '',
                is_parameter: false,
                source_index: null,
                source_label: 'Không tìm thấy',
                source_file_path: null
            });
        }
        errors.push({
            type: 'missing_file',
            message: `File chọn không tồn tại: ${file_path}`,
            xml_short,
            xml_path: file_path,
            missing_path: file_path
        });
        bucket.missing_count++;
        return;
    }

    const { generalEntities, parameterEntities } = resolveFboXmlEntities(file_path);

    const collect_missing = (entities_map, is_parameter) => {
        for (const entity_name of Object.keys(entities_map || {})) {
            const ent = entities_map[entity_name];
            if (!ent || !ent.systemUrl) continue;
            const missing_path = ent.sourceFile;
            if (!missing_path || fs.existsSync(missing_path)) continue;

            // Table 3 / bucket: luôn đếm theo từng XML đang check
            bucket.missing_count++;

            const key = path.normalize(missing_path).toLowerCase();
            // Table 1: dedupe theo missing path (tránh lặp cùng 1 file thiếu)
            if (seen_missing.has(key)) {
                errors.push({
                    type: 'missing_file',
                    message: `Thiếu file SYSTEM: ${missing_path}`,
                    xml_short,
                    xml_path: file_path,
                    entity_name,
                    missing_path,
                    system_url: ent.systemUrl,
                    is_parameter
                });
                continue;
            }
            seen_missing.add(key);

            const rel_info = get_relative_after_project(missing_path);
            const relative_path = rel_info ? rel_info.relative_path : null;
            let source_index = null;
            let source_file_path = null;
            if (relative_path) {
                const found = find_in_sources_by_relative(roots, relative_path);
                if (found) {
                    source_index = found.source_index;
                    source_file_path = found.source_file_path;
                }
            }

            const row = {
                xml_short,
                xml_path: file_path,
                missing_path,
                relative_path: relative_path || '',
                system_url: ent.systemUrl,
                entity_name,
                is_parameter,
                source_index,
                source_label: source_label_from_index(source_index),
                source_file_path
            };
            table1_missing.push(row);
            errors.push({
                type: 'missing_file',
                message: `Thiếu file SYSTEM: ${missing_path}`,
                xml_short,
                xml_path: file_path,
                entity_name,
                missing_path,
                system_url: ent.systemUrl,
                is_parameter
            });
        }
    };

    collect_missing(generalEntities, false);
    collect_missing(parameterEntities, true);

    scan_undeclared(file_path, xml_short, generalEntities, parameterEntities, roots, errors, table2_entities, seen_undeclared, bucket);
}

function checkEntityErrors(file_paths, source_roots) {
    // Giữ nguyên slot nguồn (kể cả '') để source_index khớp label Nguồn 1/2/3...
    const roots = Array.isArray(source_roots) ? source_roots.slice() : [];
    const list = Array.isArray(file_paths) ? file_paths.filter(Boolean) : [];
    const errors = [];
    const table1_missing = [];
    const table2_entities = [];
    const seen_missing = new Set();
    const seen_undeclared = new Set();
    const per_xml = new Map();

    for (const file_path of list) {
        check_one_file(file_path, roots, errors, table1_missing, table2_entities, seen_missing, seen_undeclared, per_xml);
    }

    const table3_xml_errors = [];
    for (const [xml_path, info] of per_xml.entries()) {
        if (info.missing_count > 0 || info.undeclared_count > 0) {
            table3_xml_errors.push({
                xml_short: info.xml_short,
                xml_path,
                missing_count: info.missing_count,
                undeclared_count: info.undeclared_count
            });
        }
    }

    const missing_count = table1_missing.length;
    const undeclared_count = table2_entities.length;
    const all_missing_have_source = missing_count === 0
        ? true
        : table1_missing.every(r => r.source_index !== null);

    return {
        checked_files: list,
        errors,
        table1_missing,
        table2_entities,
        table3_xml_errors,
        summary: {
            total: missing_count + undeclared_count,
            missing_count,
            undeclared_count,
            all_missing_have_source
        }
    };
}

module.exports = { checkEntityErrors };
