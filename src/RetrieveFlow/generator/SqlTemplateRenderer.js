const fs = require('fs');
const path = require('path');
const { deriveFormInput } = require('./deriveFormInput');

/**
 * Xử lý template SQL với các cấu trúc điều khiển đơn giản:
 * - {{#if condition}}...{{else}}...{{/if}}
 * - {{#each list}}...{{/each}} và {{../parentKey}}
 * - {{key}}
 * 
 * @param {string} template_str
 * @param {object} data
 * @returns {string}
 */
function renderSqlTemplate(template_str, data) {
    if (!template_str) return '';
    let result = template_str;

    // 1. {{#if condition}} ... {{else}} ... {{/if}} (xử lý lặp từ trong ra ngoài để hỗ trợ if lồng nhau)
    const ifRegex = /\{\{#if\s+([a-zA-Z0-9_]+)\}\}((?:(?!\{\{#if)[\s\S])*?)(?:\{\{else\}\}((?:(?!\{\{#if)[\s\S])*?))?\{\{\/if\}\}/g;
    while (ifRegex.test(result)) {
        result = result.replace(ifRegex, (match, condition_key, if_block, else_block = '') => {
            const cond = Boolean(data[condition_key]);
            return cond ? if_block : else_block;
        });
    }

    // 2. {{#each list}} ... {{/each}}
    result = result.replace(/\{\{#each\s+([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, list_key, item_block) => {
        const list = data[list_key];
        if (!Array.isArray(list) || list.length === 0) return '';
        return list.map(item => {
            let rendered_item = item_block;
            // Thay thế ../parentKey
            rendered_item = rendered_item.replace(/\{\{\.\.\/([a-zA-Z0-9_]+)\}\}/g, (m, parent_key) => {
                return (parent_key in data && data[parent_key] !== undefined) ? String(data[parent_key]) : '';
            });
            // Thay thế trường trong item hoặc fallback data ngoài
            rendered_item = rendered_item.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (m, item_key) => {
                if (item_key in item && item[item_key] !== undefined && item[item_key] !== null) {
                    return String(item[item_key]);
                }
                if (item_key in data && data[item_key] !== undefined && data[item_key] !== null) {
                    return String(data[item_key]);
                }
                return '';
            });
            return rendered_item;
        }).join('');
    });

    // 3. Thay thế các placeholder {{key}} còn lại
    result = result.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => {
        if (key in data && data[key] !== undefined && data[key] !== null) {
            return String(data[key]);
        }
        return '';
    });

    return result;
}

class SqlTemplateRenderer {
    /**
     * @param {string} extension_path - Đường dẫn gốc của extension
     */
    constructor(extension_path) {
        this.extension_path = extension_path || path.resolve(__dirname, '../../..');
        this.template_file = path.join(this.extension_path, 'src', 'Database', 'RetrieveFlowTemplates', 'BeforeAfterUpdate.sql.tpl');
    }

    /**
     * Render file SQL cho FormInput
     * @param {object} form_input - FormInput JSON
     * @returns {string} Nội dung .sql hoàn chỉnh
     */
    render(form_input) {
        if (!fs.existsSync(this.template_file)) {
            throw new Error(`File template SQL không tồn tại: ${this.template_file}`);
        }

        const derived = deriveFormInput(form_input);
        derived.partitioned = (derived.src_table_mode === 'partitioned');

        const template_content = fs.readFileSync(this.template_file, 'utf8');
        return renderSqlTemplate(template_content, derived);
    }
}

module.exports = {
    renderSqlTemplate,
    SqlTemplateRenderer
};
