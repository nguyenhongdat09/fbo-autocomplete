const fs = require('fs');
const path = require('path');
const entityResolver = require('../entityResolver');
const XmlSegmentTokenizer = require('./XmlSegmentTokenizer');
const TextBlockMerger = require('./TextBlockMerger');
const XmlFlatPreviewModel = require('./XmlFlatPreviewModel');
const { escape_cdata_content, map_raw_index_to_escaped } = require('./spanOffsetUtils');

const CDATA_BLOCK_OPEN = '<text><![CDATA[\n';
const CDATA_BLOCK_CLOSE = '\n]]></text>';

/**
 * Phân giải các thực thể XML và thực hiện gộp (merge) CDATA bên trong các thẻ <text>...</text>.
 * @param {string} file_path - Đường dẫn file XML gốc
 * @param {string} source_text - Nội dung file nguồn
 * @param {object} options
 * @param {number} [options.max_depth=20]
 * @returns {XmlFlatPreviewModel}
 */
function expandXmlEntities(file_path, source_text, options = {}) {
    const start_time = Date.now();
    const max_depth = options.max_depth !== undefined ? options.max_depth : 20;

    // Bình thường hóa CRLF thành LF để tránh lệch chỉ số spans trong Webview
    source_text = source_text.replace(/\r\n/g, '\n');

    const model = new XmlFlatPreviewModel(file_path);
    const general_entities = entityResolver.getEntitiesForFile(file_path) || {};
    
    let flat_text = "";
    const unique_entities = new Set();
    let entity_count = 0;

    // Hàm phân giải thực thể đơn giản nằm ngoài thẻ <text>
    function expandOutsideText(text, depth = 0, expanding_stack = [], base_offset = 0) {
        if (depth > max_depth) {
            return { text: text, spans: [] };
        }

        const segs = XmlSegmentTokenizer.tokenize(text);
        let result = "";
        const spans = [];

        for (const seg of segs) {
            if (seg.type === 'ENTITY_REF') {
                const ent_name = seg.entity_name;
                const start_offset = result.length;

                if (expanding_stack.includes(ent_name)) {
                    result += seg.content;
                    continue;
                }

                const ent_decl = general_entities[ent_name];
                let raw_content = "";
                let ent_file = file_path;
                let is_missing = false;
                let ent_type = 'internal';

                if (!ent_decl) {
                    is_missing = true;
                    raw_content = seg.content;
                } else {
                    ent_file = ent_decl.sourceFile || file_path;
                    if (ent_decl.systemUrl) {
                        ent_type = 'system';
                        if (fs.existsSync(ent_decl.sourceFile)) {
                            try {
                                raw_content = entityResolver.readFileContent(ent_decl.sourceFile).replace(/\r\n/g, '\n');
                            } catch (err) {
                                raw_content = `<!-- Lỗi đọc file SYSTEM: ${ent_decl.sourceFile} -->`;
                                is_missing = true;
                            }
                        } else {
                            raw_content = `<!-- Không tìm thấy file SYSTEM: ${ent_decl.sourceFile} -->`;
                            is_missing = true;
                        }
                    } else {
                        raw_content = (ent_decl.value || "").replace(/\r\n/g, '\n');
                    }
                }

                let res = { text: raw_content, spans: [] };
                if (!is_missing) {
                    const next_stack = [...expanding_stack, ent_name];
                    res = expandOutsideText(raw_content, depth + 1, next_stack, 0);
                }

                result += res.text;
                const end_offset = result.length;

                const new_span = {
                    start: start_offset,
                    end: end_offset,
                    entity_name: ent_name,
                    depth: depth,
                    source_file: ent_file,
                    entity_type: ent_type,
                    original_ref: seg.content,
                    missing: is_missing
                };
                if (depth === 0) {
                    new_span.source_offset = base_offset + seg.start;
                }
                spans.push(new_span);

                for (const sub of res.spans) {
                    spans.push({
                        start: start_offset + sub.start,
                        end: start_offset + sub.end,
                        entity_name: sub.entity_name,
                        depth: sub.depth,
                        source_file: sub.source_file,
                        entity_type: sub.entity_type,
                        original_ref: sub.original_ref,
                        missing: sub.missing
                    });
                }
            } else {
                result += seg.content;
            }
        }
        return { text: result, spans: spans };
    }

    function appendExpandedOutsideText(text, base_offset = 0) {
        const res = expandOutsideText(text, 0, [], base_offset);
        for (const s of res.spans) {
            model.spans.push({
                start: flat_text.length + s.start,
                end: flat_text.length + s.end,
                entity_name: s.entity_name,
                depth: s.depth,
                source_file: s.source_file,
                entity_type: s.entity_type,
                original_ref: s.original_ref,
                missing: s.missing,
                source_offset: s.source_offset
            });
            if (s.depth === 0) {
                unique_entities.add(s.entity_name);
                entity_count++;
            }
        }
        flat_text += res.text;
    }

    const has_text_tag = source_text.includes('<text>') && source_text.includes('</text>');

    if (!has_text_tag) {
        // Fallback: Phân giải entity toàn file đơn giản khi không có block <text>
        appendExpandedOutsideText(source_text, 0);
        model.warnings.push({
            code: 'NO_TEXT_BLOCK',
            message: 'Không tìm thấy block <text> (trong <command>/<script>) để thực hiện gộp CDATA.'
        });
    } else {
        let i = 0;
        const len = source_text.length;

        while (i < len) {
            const text_start = source_text.indexOf('<text>', i);
            if (text_start === -1) {
                // Xử lý phần còn lại của file
                appendExpandedOutsideText(source_text.substring(i), i);
                break;
            }

            // Xử lý phần XML trước thẻ <text>
            appendExpandedOutsideText(source_text.substring(i, text_start), i);

            // Tìm thẻ đóng </text> tương ứng
            const text_end = source_text.indexOf('</text>', text_start + 6);
            if (text_end === -1) {
                // Thiếu thẻ đóng </text>, xử lý phần còn lại như text thông thường
                appendExpandedOutsideText(source_text.substring(text_start), text_start);
                break;
            }

            const text_inner = source_text.substring(text_start + 6, text_end);

            // Gộp nội dung trong thẻ <text>
            const merged_model = TextBlockMerger.mergeTextBlock(text_inner, file_path, general_entities, { 
                max_depth,
                base_offset: text_start + 6 
            });

            const raw_merged = merged_model.merged_text;
            const escaped_merged = escape_cdata_content(raw_merged);

            flat_text += CDATA_BLOCK_OPEN;
            const merged_content_start = flat_text.length;
            flat_text += escaped_merged;
            flat_text += CDATA_BLOCK_CLOSE;

            for (const span of merged_model.spans) {
                model.spans.push({
                    start: merged_content_start + map_raw_index_to_escaped(raw_merged, escaped_merged, span.start),
                    end: merged_content_start + map_raw_index_to_escaped(raw_merged, escaped_merged, span.end),
                    entity_name: span.entity_name,
                    depth: span.depth,
                    source_file: span.source_file,
                    entity_type: span.entity_type,
                    original_ref: span.original_ref,
                    missing: span.missing,
                    source_offset: span.source_offset
                });
                if (span.depth === 0) {
                    unique_entities.add(span.entity_name);
                    entity_count++;
                }
            }

            // Nối warnings
            if (merged_model.warnings && merged_model.warnings.length > 0) {
                model.warnings.push(...merged_model.warnings);
            }

            i = text_end + 7; // Nhảy qua thẻ </text>
        }
    }

    // Chuyển source_offset thành source_line cho các root spans
    model.spans.forEach(s => {
        if (s.depth === 0) {
            if (s.source_offset !== undefined) {
                s.source_line = getLineFromOffset(source_text, s.source_offset);
            }
            s.root_entity_name = s.entity_name;
            s.root_source_line = s.source_line;
        }
    });

    // Gán thông tin root entity cha (root_entity_name, root_source_line) cho các span lồng nhau (depth > 0)
    model.spans.forEach(s => {
        if (s.depth > 0) {
            const root_span = model.spans.find(r => r.depth === 0 && r.start <= s.start && r.end >= s.end);
            if (root_span) {
                s.root_entity_name = root_span.entity_name;
                s.root_source_line = root_span.source_line;
            } else {
                s.root_entity_name = s.entity_name;
                s.root_source_line = s.source_line;
            }
        }
    });

    model.spans.forEach(s => {
        unique_entities.add(s.entity_name);
    });

    model.flat_text = flat_text;
    model.body_start_offset = 0;
    model.stats = {
        entity_count: model.spans.length,
        unique_entities: Array.from(unique_entities),
        expanded_chars: flat_text.length,
        duration_ms: Date.now() - start_time
    };

    return model;
}

function getLineFromOffset(text, offset) {
    let line = 1;
    for (let idx = 0; idx < offset && idx < text.length; idx++) {
        if (text[idx] === '\n') {
            line++;
        }
    }
    return line;
}

module.exports = {
    expandXmlEntities
};
