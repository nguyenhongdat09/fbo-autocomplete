/**
 * Parse danh sách field trong file Upload XML legacy.
 * Cần lấy các thuộc tính: name, column, allowNulls, type, maxLength.
 */

function parseUploadFields(xml_text) {
    const fields = [];
    const warnings = [];

    if (!xml_text || typeof xml_text !== 'string') {
        return { fields, warnings };
    }

    const field_tag_regex = /<field\b([^>]*)(?:\/?>|>([\s\S]*?)<\/field>)/gi;
    let match;

    while ((match = field_tag_regex.exec(xml_text)) !== null) {
        const attr_str = match[1] || '';

        const name_match = attr_str.match(/\bname\s*=\s*"([^"]*)"/i);
        const column_match = attr_str.match(/\bcolumn\s*=\s*"([^"]*)"/i);
        const allow_nulls_match = attr_str.match(/\ballowNulls\s*=\s*"([^"]*)"/i);
        const type_match = attr_str.match(/\btype\s*=\s*"([^"]*)"/i);
        const max_length_match = attr_str.match(/\bmaxLength\s*=\s*"([^"]*)"/i);

        const field_name = name_match ? name_match[1].trim() : '';
        const column_val = column_match ? column_match[1].trim().toUpperCase() : '';

        if (!field_name) {
            continue;
        }

        if (!column_val) {
            warnings.push(`Trường '${field_name}' không có thuộc tính 'column', đã bỏ qua.`);
            continue;
        }

        const allow_nulls_val = allow_nulls_match ? allow_nulls_match[1].trim().toLowerCase() : '';
        const is_required = allow_nulls_val === 'false';

        fields.push({
            name: field_name,
            column: column_val,
            required: is_required,
            type: type_match ? type_match[1].trim() : null,
            max_length: max_length_match ? max_length_match[1].trim() : null
        });
    }

    return { fields, warnings };
}

module.exports = {
    parseUploadFields
};
