const fs = require('fs');
const entityResolver = require('../entityResolver');
const XmlSegmentTokenizer = require('./XmlSegmentTokenizer');
const TextBlockMergeModel = require('./TextBlockMergeModel');

/** Khoảng cách giữa các đoạn khi ghép vào CDATA (1 dòng trống) */
const PART_GAP = '';

/** Dòng trống đầu nội dung CDATA (sau `<![CDATA[\n` của wrapper) */
const CDATA_INNER_LEADING = '';

/**
 * Gộp CDATA + entity trong <text> thành nội dung 1 CDATA duy nhất.
 * Thuật toán: bắt đầu từ CDATA rỗng, lần lượt điền từng đoạn (entity đã expand trước, rồi CDATA gốc).
 * @param {string} text_inner
 * @param {string} file_path
 * @param {object} general_entities
 * @param {object} [options]
 * @returns {TextBlockMergeModel}
 */
function mergeTextBlock(text_inner, file_path, general_entities, options = {}) {
    const max_depth = options.max_depth !== undefined ? options.max_depth : 20;
    const base_offset = options.base_offset !== undefined ? options.base_offset : 0;
    const model = new TextBlockMergeModel();

    text_inner = text_inner.replace(/\r\n/g, '\n');
    const sub_segments = XmlSegmentTokenizer.tokenize(text_inner);
    const parts = [];

    function expandEntity(ent_name, depth, expanding_stack, current_file) {
        if (depth > max_depth) {
            model.warnings.push({
                code: 'DEPTH_LIMIT_EXCEEDED',
                message: `Độ sâu đệ quy vượt quá giới hạn tối đa (${max_depth}) khi phân giải thực thể &${ent_name};.`
            });
            return { text: `&${ent_name};`, spans: [], missing: true };
        }

        if (expanding_stack.includes(ent_name)) {
            model.warnings.push({
                code: 'CIRCULAR_ENTITY',
                message: `Phát hiện tham chiếu vòng lặp thực thể: &${ent_name};`
            });
            return { text: `&${ent_name};`, spans: [], missing: true };
        }

        const ent_decl = general_entities[ent_name];
        if (!ent_decl) {
            model.warnings.push({
                code: 'MISSING_ENTITY',
                message: `Không tìm thấy khai báo cho thực thể: &${ent_name};`
            });
            return { text: `&${ent_name};`, spans: [], missing: true };
        }

        let raw_content = '';
        const ent_file = ent_decl.sourceFile || current_file;
        const ent_type = ent_decl.systemUrl ? 'external' : 'internal';

        if (ent_decl.systemUrl) {
            if (fs.existsSync(ent_decl.sourceFile)) {
                try {
                    raw_content = entityResolver.readFileContent(ent_decl.sourceFile).replace(/\r\n/g, '\n');
                } catch (err) {
                    model.warnings.push({
                        code: 'READ_FILE_ERROR',
                        message: `Lỗi khi đọc file liên kết ngoài: ${ent_decl.sourceFile}. Chi tiết: ${err.message}`
                    });
                    raw_content = `/* Lỗi đọc file SYSTEM: ${ent_decl.sourceFile} */`;
                }
            } else {
                model.warnings.push({
                    code: 'FILE_NOT_FOUND',
                    message: `Không tìm thấy file liên kết ngoài: ${ent_decl.sourceFile}`
                });
                raw_content = `/* Không tìm thấy file SYSTEM: ${ent_decl.sourceFile} */`;
            }
        } else {
            raw_content = (ent_decl.value || '').replace(/\r\n/g, '\n');
        }

        const next_stack = [...expanding_stack, ent_name];
        const { text: sub_expanded, spans: sub_spans } = expandText(raw_content, depth + 1, next_stack, ent_file);

        return {
            text: sub_expanded,
            spans: sub_spans,
            source_file: ent_file,
            entity_type: ent_type
        };
    }

    /** Expand entity lồng nhau bên trong 1 chuỗi (trước khi ghép vào CDATA ngoài) */
    function expandText(text, depth, expanding_stack, current_file) {
        const segs = XmlSegmentTokenizer.tokenize(text);
        let result_text = '';
        const result_spans = [];

        for (const seg of segs) {
            if (seg.type === 'ENTITY_REF') {
                const ent_name = seg.entity_name;
                const start_offset = result_text.length;
                const res = expandEntity(ent_name, depth, expanding_stack, current_file);

                result_text += res.text;
                const end_offset = result_text.length;

                result_spans.push({
                    start: start_offset,
                    end: end_offset,
                    entity_name: ent_name,
                    depth: depth,
                    source_file: res.source_file || null,
                    entity_type: res.entity_type || 'internal',
                    original_ref: seg.content,
                    missing: res.missing || false
                });

                for (const sub of res.spans || []) {
                    result_spans.push({
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
            } else if (seg.type === 'CDATA') {
                const inner = seg.content.substring(9, seg.content.length - 3);
                const start_offset = result_text.length;
                const { text: inner_expanded, spans: inner_spans } = expandText(inner, depth, expanding_stack, current_file);

                result_text += inner_expanded;

                for (const sub of inner_spans || []) {
                    result_spans.push({
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
                result_text += seg.content;
            }
        }

        return { text: result_text, spans: result_spans };
    }

    /** Bước 1: thu thập các phần theo thứ tự trong <text> (entity | CDATA gốc | text) */
    for (const seg of sub_segments) {
        if (seg.type === 'CDATA') {
            const inner = seg.content.substring(9, seg.content.length - 3);
            parts.push({ type: 'native', text: inner });
        } else if (seg.type === 'ENTITY_REF') {
            const ent_name = seg.entity_name;
            const res = expandEntity(ent_name, 0, [], file_path);

            if (res.missing) {
                parts.push({
                    type: 'entity',
                    text: `&${ent_name};`,
                    entity_name: ent_name,
                    source_file: null,
                    entity_type: 'internal',
                    missing: true,
                    original_ref: seg.content,
                    inner_spans: [],
                    source_offset: base_offset + seg.start
                });
            } else {
                parts.push({
                    type: 'entity',
                    text: res.text,
                    entity_name: ent_name,
                    source_file: res.source_file,
                    entity_type: res.entity_type,
                    missing: false,
                    original_ref: seg.content,
                    inner_spans: res.spans || [],
                    source_offset: base_offset + seg.start
                });
            }
        } else if (seg.type === 'TEXT') {
            parts.push({ type: 'native', text: seg.content });
        }
    }

    /** Bước 2: điền lần lượt vào CDATA rỗng, cách nhau PART_GAP */
    let merged_text = '';
    const spans = [];

    function offset_spans(span_list, base_offset) {
        for (const s of span_list) {
            spans.push({
                start: base_offset + s.start,
                end: base_offset + s.end,
                entity_name: s.entity_name,
                depth: s.depth,
                source_file: s.source_file,
                entity_type: s.entity_type,
                original_ref: s.original_ref,
                missing: s.missing
            });
        }
    }

    for (let idx = 0; idx < parts.length; idx++) {
        const part = parts[idx];

        if (merged_text.length > 0) {
            merged_text += PART_GAP;
        }

        const start_pos = merged_text.length;
        merged_text += part.text;
        const end_pos = merged_text.length;

        if (part.type === 'entity') {
            spans.push({
                start: start_pos,
                end: end_pos,
                entity_name: part.entity_name,
                depth: 0,
                source_file: part.source_file || null,
                entity_type: part.entity_type || 'internal',
                original_ref: part.original_ref,
                missing: part.missing || false,
                source_offset: part.source_offset
            });

            if (part.inner_spans && part.inner_spans.length > 0) {
                offset_spans(part.inner_spans, start_pos);
            }
        }
    }

    /** Bước 3: thêm dòng trống đầu nội dung CDATA */
    if (merged_text.length > 0) {
        merged_text = CDATA_INNER_LEADING + merged_text;
        for (const s of spans) {
            s.start += CDATA_INNER_LEADING.length;
            s.end += CDATA_INNER_LEADING.length;
        }
    }

    model.merged_text = merged_text;
    model.segments = parts;
    model.spans = spans;

    return model;
}

module.exports = {
    mergeTextBlock,
    PART_GAP,
    CDATA_INNER_LEADING
};
