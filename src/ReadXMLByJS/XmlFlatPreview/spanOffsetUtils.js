/**
 * Escape ]]> trong nội dung CDATA để không đóng sớm khối XML.
 * @param {string} text
 * @returns {string}
 */
function escape_cdata_content(text) {
    return text.replace(/]]>/g, ']]&gt;');
}

/**
 * Map index trong chuỗi gốc sang index trong chuỗi đã escape (]]> → ]]&gt;).
 * @param {string} raw
 * @param {string} escaped
 * @param {number} raw_index
 * @returns {number}
 */
function map_raw_index_to_escaped(raw, escaped, raw_index) {
    if (raw_index <= 0) {
        return 0;
    }

    let ri = 0;
    let ei = 0;
    const raw_len = raw.length;

    while (ri < raw_index && ri < raw_len) {
        if (raw.startsWith(']]>', ri) && escaped.startsWith(']]&gt;', ei)) {
            ri += 3;
            ei += 6;
            continue;
        }
        ri++;
        ei++;
    }

    return ei;
}

/**
 * @param {string} text
 * @returns {{ text: string, leading: number, trailing_end: number }}
 */
function trim_with_bounds(text) {
    const leading = text.length - text.trimStart().length;
    const trailing_end = text.trimEnd().length;
    return {
        text: text.trim(),
        leading: leading,
        trailing_end: trailing_end
    };
}

module.exports = {
    escape_cdata_content,
    map_raw_index_to_escaped,
    trim_with_bounds
};
