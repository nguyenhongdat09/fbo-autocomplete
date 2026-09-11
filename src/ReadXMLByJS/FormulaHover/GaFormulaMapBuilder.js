/**
 * @typedef {Object} FormulaEntry
 * @property {string} alias
 * @property {'formula' | 'aggregate' | 'unknown'} kind
 * @property {string} rawValue
 * @property {string} display
 * @property {string} [target]
 * @property {string} [formula]
 */

/**
 * Giải mã các ký tự XML entity thành ký tự gốc
 * @param {string} str 
 * @returns {string}
 */
function unescapeXmlEntities(str) {
    if (!str) return str;
    return str
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(Number(dec)))
        .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&amp;/g, '&');
}

/**
 * Phân tích khối g.$a đã flat thành Map
 * @param {string} gaBlockFlat 
 * @returns {Map<string, FormulaEntry>}
 */
function buildFormulaMap(gaBlockFlat) {
    const map = new Map();
    if (!gaBlockFlat) return map;

    gaBlockFlat = unescapeXmlEntities(gaBlockFlat);

    // Loại bỏ các marker CDATA còn sót lại do entity xen giữa (ví dụ: ]]> &Entity; <![CDATA[)
    gaBlockFlat = gaBlockFlat.replace(/\]\]>/g, '').replace(/<!\[CDATA\[/g, '');

    // Loại bỏ "g.$a = {" và "}"
    let body = gaBlockFlat.replace(/^g\.\$a\s*=\s*\{/, '');
    body = body.replace(/};?\s*$/, '');

    const entries = splitByTopLevelComma(body);

    for (let entryStr of entries) {
        entryStr = entryStr.trim();
        if (!entryStr) continue;

        if (entryStr.startsWith('//')) continue;

        const colonIndex = entryStr.indexOf(':');
        if (colonIndex === -1) continue;

        let alias = entryStr.substring(0, colonIndex).trim();
        let value = entryStr.substring(colonIndex + 1).trim();

        // Bỏ quote và marker CDATA quanh alias nếu có
        alias = alias.replace(/^\]\]>/, '').replace(/^<!\[CDATA\[/, '').replace(/^['"]|['"]$/g, '').trim();
        
        let entry = {
            alias,
            kind: 'unknown',
            rawValue: value,
            display: value
        };

        const stringMatch = value.match(/^['"]([\s\S]+?)['"]$/);
        if (stringMatch) {
            let innerString = stringMatch[1];
            // Format: '[target]:=formula'
            const calcMatch = innerString.match(/^\[(\w+)\]:=([\s\S]*)$/);
            if (calcMatch) {
                entry.kind = 'formula';
                entry.target = calcMatch[1];
                entry.formula = calcMatch[2];
                entry.display = innerString; // Hiển thị chuỗi công thức rõ ràng, bỏ quote ngoài
            } else {
                entry.display = innerString;
            }
        } else if (value.startsWith('[') && value.endsWith(']')) {
            const innerArrayStr = value.substring(1, value.length - 1).trim();
            const elements = splitByTopLevelComma(innerArrayStr).map(el => el.trim());

            if (elements.length === 2) {
                entry.kind = 'aggregate';
                entry.master = cleanIdentifierOrBracket(elements[0]);
                entry.grid_col = cleanIdentifierOrBracket(elements[1]);
                entry.display = value.replace(/\s+/g, ' ');
            } else if (elements.length === 3) {
                entry.kind = 'aggregate_filter';
                entry.master = cleanIdentifierOrBracket(elements[0]);
                entry.grid_col = cleanIdentifierOrBracket(elements[1]);
                entry.filter = elements[2].replace(/^['"]|['"]$/g, '');
                entry.display = value.replace(/\s+/g, ' ');
            } else {
                entry.kind = 'aggregate';
                entry.display = value.replace(/\s+/g, ' ');
            }
        }

        map.set(alias, entry);
    }

    return map;
}

/**
 * Loại bỏ dấu ngoặc vuông và dấu nháy quanh tên trường (chỉ khi là identifier đơn)
 * @param {string} str 
 * @returns {string}
 */
function cleanIdentifierOrBracket(str) {
    if (!str) return '';
    let s = str.trim().replace(/^['"]|['"]$/g, '').trim();
    // Chỉ [name] hoặc [$name] thuần — không phải biểu thức
    const m = s.match(/^\[\$?([A-Za-z_][\w]*)\]$/);
    if (m) return m[1];
    return s;
}

/**
 * Split chuỗi bằng dấu phẩy, nhưng bỏ qua phẩy trong string và [], ()
 * @param {string} text 
 * @returns {string[]}
 */
function splitByTopLevelComma(text) {
    const result = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let bracketDepth = 0;
    let parenDepth = 0;
    let curlyDepth = 0; // Để phòng hờ nested objects

    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        let prevChar = i > 0 ? text[i-1] : '';

        if ((char === '"' || char === "'") && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
            }
        }

        if (!inString) {
            if (char === '[') bracketDepth++;
            else if (char === ']') bracketDepth--;
            else if (char === '(') parenDepth++;
            else if (char === ')') parenDepth--;
            else if (char === '{') curlyDepth++;
            else if (char === '}') curlyDepth--;
            else if (char === ',' && bracketDepth === 0 && parenDepth === 0 && curlyDepth === 0) {
                result.push(current);
                current = '';
                continue;
            }
        }

        current += char;
    }

    if (current.trim()) {
        result.push(current);
    }
    return result;
}

module.exports = {
    buildFormulaMap
};
