/**
 * FieldCatalogParser — Phân tích thẻ <fields> trong XML để trích xuất metadata cột
 */

class FieldCatalogParser {
    /**
     * @param {string} xmlText
     * @param {'grid' | 'master'} source
     * @returns {Record<string, object>} Record<fieldName, FieldInfo>
     */
    static parse(xmlText, source = 'grid') {
        const fields = {};
        if (!xmlText || typeof xmlText !== 'string') return fields;

        // Tìm khối <fields>...</fields>
        const fieldsBlockMatch = xmlText.match(/<fields[^>]*>([\s\S]*?)<\/fields>/i);
        const searchContent = fieldsBlockMatch ? fieldsBlockMatch[1] : xmlText;

        // Bắt từng thẻ <field ...>...</field> hoặc self-closing <field .../>
        const fieldTagRegex = /<field\b([^>]*?)(?:\/>|>([\s\S]*?)<\/field>)/gi;
        let match;

        while ((match = fieldTagRegex.exec(searchContent)) !== null) {
            const attrsStr = match[1] || '';
            const innerBody = match[2] || '';

            const name = this.extractAttr(attrsStr, 'name');
            if (!name) continue;

            const typeAttr = (this.extractAttr(attrsStr, 'type') || '').toLowerCase();
            const hiddenAttr = (this.extractAttr(attrsStr, 'hidden') || '').toLowerCase();
            const readOnlyAttr = (this.extractAttr(attrsStr, 'readOnly') || this.extractAttr(attrsStr, 'disabled') || '').toLowerCase();

            // Lấy header_v và header_e từ thẻ <header v="..." e="..." />
            let header_v = '';
            let header_e = '';
            const headerMatch = innerBody.match(/<header\b([^>]*?)(?:\/>|>([\s\S]*?)<\/header>)/i);
            if (headerMatch) {
                const headerAttrs = headerMatch[1] || '';
                header_v = this.extractAttr(headerAttrs, 'v') || '';
                header_e = this.extractAttr(headerAttrs, 'e') || '';
            }

            // Kiểm tra kiểu Boolean
            const isCheckbox = innerBody.includes('style="CheckBox"') || innerBody.includes("style='CheckBox'") || attrsStr.includes('CheckBox');
            const isBoolean = typeAttr === 'boolean' || isCheckbox || name.endsWith('_yn');

            let fieldType = 'unknown';
            if (isBoolean) {
                fieldType = 'boolean';
            } else if (typeAttr.includes('decimal') || typeAttr.includes('int') || typeAttr.includes('numeric') || this.isNumericFieldName(name)) {
                fieldType = 'decimal';
            } else if (typeAttr.includes('string') || typeAttr.includes('varchar') || typeAttr.includes('char')) {
                fieldType = 'string';
            } else {
                fieldType = 'decimal'; // Mặc định trong grid FBO
            }

            const group = this.classifyGroup(name);

            fields[name] = {
                name,
                header_v: header_v || '',
                header_e: header_e || '',
                source,
                type: fieldType,
                hidden: hiddenAttr === 'true' || hiddenAttr === '1',
                read_only: readOnlyAttr === 'true' || readOnlyAttr === '1',
                group
            };
        }

        return fields;
    }

    /**
     * Trích xuất giá trị thuộc tính từ chuỗi attributes
     */
    static extractAttr(attrsStr, attrName) {
        const regex = new RegExp(`${attrName}\\s*=\\s*["']([^"']*)["']`, 'i');
        const match = attrsStr.match(regex);
        return match ? match[1] : null;
    }

    /**
     * Phân loại trường vào Group trực quan
     */
    static classifyGroup(name) {
        const n = name.toLowerCase();
        if (['so_luong', 'gia_nt', 'gia', 'he_so', 'sl_nhap', 'sl_xuat'].includes(n) || n.startsWith('sl_') || n.startsWith('gia_')) {
            return 'qty_price';
        }
        if (['tien_nt2', 'tien2', 'tien_nt', 'tien', 'tien_hang_nt', 'tien_hang'].includes(n) || (n.startsWith('tien_') && !n.includes('thue') && !n.includes('ck') && !n.includes('phi') && !n.includes('mt'))) {
            return 'amount';
        }
        if (['tl_ck', 'ck_nt', 'ck', 'tien_ck_nt', 'tien_ck', 'ty_le_ck'].includes(n) || n.includes('ck')) {
            return 'discount';
        }
        if (['thue_suat', 'thue_nt', 'thue', 'ma_thue', 'tk_thue', 't_thue_nt', 't_thue'].includes(n) || (n.includes('thue') && !n.includes('dvtn'))) {
            return 'tax';
        }
        if (n.includes('phi') || n.includes('dvtn') || n.includes('bvmt') || n.includes('tienmt') || n.includes('mthang') || n === 's5') {
            return 'fee';
        }
        if (n.startsWith('t_') || n === 'ty_gia' || n === '$ty_gia') {
            return 'master';
        }
        return 'other';
    }

    /**
     * Kiểm tra nhanh tên trường có xu hướng là số
     */
    static isNumericFieldName(name) {
        const n = name.toLowerCase();
        return n.startsWith('so_luong') || n.startsWith('gia') || n.startsWith('tien') || n.startsWith('ck') ||
               n.startsWith('thue') || n.startsWith('tl_') || n.startsWith('ty_') || n.startsWith('t_') ||
               n.includes('sl') || n.includes('tien') || n.includes('amount') || n.includes('rate');
    }
}

module.exports = FieldCatalogParser;
