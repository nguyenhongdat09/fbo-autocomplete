/**
 * Quét các field trong các file XML Dir / Grid đã được flatten để xây dựng catalog header (tiêu đề tiếng Việt).
 */

function buildHeaderCatalog(sources) {
    const catalog = {};
    const warnings = [];

    if (!Array.isArray(sources)) {
        return { catalog, warnings };
    }

    const field_tag_regex = /<field\b([^>]*)\/>|<field\b([^>]*)>([\s\S]*?)<\/field>/gi;

    for (const source of sources) {
        const flat_text = (source && source.flatText) ? source.flatText : '';
        if (!flat_text) {
            continue;
        }

        let match;
        field_tag_regex.lastIndex = 0;

        while ((match = field_tag_regex.exec(flat_text)) !== null) {
            const attr_str = match[1] !== undefined ? match[1] : (match[2] || '');
            const body_str = match[3] || '';

            const name_match = attr_str.match(/\bname\s*=\s*"([^"]*)"/i);
            const hidden_match = attr_str.match(/\bhidden\s*=\s*"([^"]*)"/i);

            const field_name = name_match ? name_match[1].trim() : '';
            if (!field_name) {
                continue;
            }

            const is_hidden = hidden_match ? hidden_match[1].trim().toLowerCase() === 'true' : false;
            if (is_hidden) {
                continue;
            }

            // Tìm header v="..." trong body hoặc trong chính tag (nếu có)
            const full_tag_content = attr_str + ' ' + body_str;
            const header_v_match = full_tag_content.match(/<header\b[^>]*\bv\s*=\s*"([^"]*)"/i);
            const header_v = header_v_match ? header_v_match[1].trim() : '';

            if (header_v && !catalog.hasOwnProperty(field_name)) {
                catalog[field_name] = header_v;
            }
        }
    }

    return { catalog, warnings };
}

/**
 * Gộp danh sách field từ Upload XML với catalog header để tạo cấu trúc ô ghi Excel.
 */
function mergeUploadWithHeaders(upload_fields, catalog) {
    if (!Array.isArray(upload_fields)) {
        return [];
    }

    const header_dict = catalog || {};

    return upload_fields.map(field => {
        const display_header = (header_dict[field.name] && String(header_dict[field.name]).trim())
            ? String(header_dict[field.name]).trim()
            : field.name;

        return {
            name: field.name,
            column: field.column,
            header: display_header,
            required: !!field.required
        };
    });
}

module.exports = {
    buildHeaderCatalog,
    mergeUploadWithHeaders
};
