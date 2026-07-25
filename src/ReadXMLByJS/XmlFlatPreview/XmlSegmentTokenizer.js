const XML_DECL = 'XML_DECL';
const DOCTYPE = 'DOCTYPE';
const COMMENT = 'COMMENT';
const PROCESSING_INSTRUCTION = 'PROCESSING_INSTRUCTION';
const CDATA = 'CDATA';
const ENTITY_REF = 'ENTITY_REF';
const TEXT = 'TEXT';

/**
 * Phân tích XML thành các segment tuần tự
 * @param {string} xml_text
 * @returns {Array<{type: string, content: string, start: number, end: number, entity_name?: string}>}
 */
function tokenize(xml_text) {
    const segments = [];
    let i = 0;
    const len = xml_text.length;

    while (i < len) {
        // 1. XML Declaration / PI
        if (xml_text.startsWith('<?', i)) {
            const start = i;
            let end = xml_text.indexOf('?>', i + 2);
            if (end === -1) {
                end = len;
            } else {
                end += 2;
            }
            const content = xml_text.substring(start, end);
            const type = content.startsWith('<?xml') ? 'XML_DECL' : 'PROCESSING_INSTRUCTION';
            segments.push({ type, content, start, end });
            i = end;
            continue;
        }

        // 2. COMMENT
        if (xml_text.startsWith('<!--', i)) {
            const start = i;
            let end = xml_text.indexOf('-->', i + 4);
            if (end === -1) {
                end = len;
            } else {
                end += 3;
            }
            const content = xml_text.substring(start, end);
            segments.push({ type: 'COMMENT', content, start, end });
            i = end;
            continue;
        }

        // 3. CDATA
        if (xml_text.startsWith('<![CDATA[', i)) {
            const start = i;
            let end = xml_text.indexOf(']]>', i + 9);
            if (end === -1) {
                end = len;
            } else {
                end += 3;
            }
            const content = xml_text.substring(start, end);
            segments.push({ type: 'CDATA', content, start, end });
            i = end;
            continue;
        }

        // 4. DOCTYPE
        if (xml_text.startsWith('<!DOCTYPE', i)) {
            const start = i;
            let index = i + 9;
            let in_brackets = false;
            let in_quote = false;
            let quote_char = '';
            while (index < len) {
                const char = xml_text[index];
                if (in_quote) {
                    if (char === quote_char && xml_text[index - 1] !== '\\') {
                        in_quote = false;
                    }
                } else {
                    if (char === '"' || char === "'") {
                        in_quote = true;
                        quote_char = char;
                    } else if (char === '[') {
                        in_brackets = true;
                    } else if (char === ']' && in_brackets) {
                        in_brackets = false;
                    } else if (char === '>' && !in_brackets) {
                        break;
                    }
                }
                index++;
            }
            const end = Math.min(index + 1, len);
            const content = xml_text.substring(start, end);
            segments.push({ type: 'DOCTYPE', content, start, end });
            i = end;
            continue;
        }

        // 5. ENTITY REFERENCE
        if (xml_text[i] === '&') {
            const match = xml_text.substring(i).match(/^&([\w.]+);/);
            if (match) {
                const entity_name = match[1];
                // Không expand: predefined entities và numeric entities
                const is_predefined = ['amp', 'lt', 'gt', 'quot', 'apos'].includes(entity_name);
                const is_numeric = entity_name.startsWith('#');
                if (!is_predefined && !is_numeric) {
                    const start = i;
                    const end = i + match[0].length;
                    const content = match[0];
                    segments.push({ type: 'ENTITY_REF', content, start, end, entity_name });
                    i = end;
                    continue;
                }
            }
        }

        // 6. TEXT (hoặc tag XML, được xử lý như text thường vì tag không cần phân loại riêng)
        const start = i;
        let next_special = len;
        
        for (let j = i; j < len; j++) {
            if (xml_text.startsWith('<?', j) ||
                xml_text.startsWith('<!--', j) ||
                xml_text.startsWith('<![CDATA[', j) ||
                xml_text.startsWith('<!DOCTYPE', j) ||
                (xml_text[j] === '&' && xml_text.substring(j).match(/^&([\w.]+);/))) {
                
                // Kiểm tra xem entity ref có cần gom vào TEXT (predefined/numeric) hay không
                if (xml_text[j] === '&') {
                    const match = xml_text.substring(j).match(/^&([\w.]+);/);
                    if (match) {
                        const entity_name = match[1];
                        const is_predefined = ['amp', 'lt', 'gt', 'quot', 'apos'].includes(entity_name);
                        const is_numeric = entity_name.startsWith('#');
                        if (is_predefined || is_numeric) {
                            continue;
                        }
                    }
                }
                
                next_special = j;
                break;
            }
        }
        
        if (next_special === start) {
            next_special = start + 1;
        }
        
        const content = xml_text.substring(start, next_special);
        segments.push({ type: 'TEXT', content, start, end: next_special });
        i = next_special;
    }

    return segments;
}

module.exports = {
    tokenize,
    SegmentTypes: {
        XML_DECL,
        DOCTYPE,
        COMMENT,
        PROCESSING_INSTRUCTION,
        CDATA,
        ENTITY_REF,
        TEXT
    }
};
