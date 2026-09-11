const fs = require('fs');
const path = require('path');
const { deriveFormInput } = require('./deriveFormInput');

/**
 * Thay thế placeholder {{key}} bằng giá trị tương ứng trong data
 * @param {string} template_str
 * @param {object} data
 * @returns {string}
 */
function renderString(template_str, data) {
    if (!template_str) return '';
    return template_str.replace(/\{\{([^{}]+)\}\}/g, (match, key) => {
        const trimmed = key.trim();
        if (trimmed in data && data[trimmed] !== undefined && data[trimmed] !== null) {
            return String(data[trimmed]);
        }
        return '';
    });
}

/**
 * Đọc toàn bộ template XML trong thư mục tương ứng (partitioned hoặc single)
 * @param {string} template_dir
 * @returns {{ Filter: string, MultiForm: string, MultiGrid: string, Lookup: string }}
 */
function loadXmlTemplates(template_dir) {
    return {
        Filter: fs.readFileSync(path.join(template_dir, 'Filter.xml.tpl'), 'utf8'),
        MultiForm: fs.readFileSync(path.join(template_dir, 'MultiForm.xml.tpl'), 'utf8'),
        MultiGrid: fs.readFileSync(path.join(template_dir, 'MultiGrid.xml.tpl'), 'utf8'),
        Lookup: fs.readFileSync(path.join(template_dir, 'Lookup.xml.tpl'), 'utf8')
    };
}

class XmlTemplateRenderer {
    /**
     * @param {string} extension_path - Đường dẫn gốc của extension
     */
    constructor(extension_path) {
        this.extension_path = extension_path || path.resolve(__dirname, '../../..');
        this.templates_root = path.join(this.extension_path, 'src', 'Database', 'RetrieveFlowTemplates');
    }

    /**
     * Render toàn bộ 4 file XML cho FormInput
     * @param {object} form_input - FormInput JSON
     * @returns {{ Filter: string, MultiForm: string, MultiGrid: string, Lookup: string }}
     */
    render(form_input) {
        const derived = deriveFormInput(form_input);
        const mode = derived.src_table_mode === 'single' ? 'single' : 'partitioned';
        const target_dir = path.join(this.templates_root, mode);

        if (!fs.existsSync(target_dir)) {
            throw new Error(`Thư mục template không tồn tại: ${target_dir}`);
        }

        const templates = loadXmlTemplates(target_dir);

        return {
            Filter: renderString(templates.Filter, derived),
            MultiForm: renderString(templates.MultiForm, derived),
            MultiGrid: renderString(templates.MultiGrid, derived),
            Lookup: renderString(templates.Lookup, derived)
        };
    }
}

module.exports = {
    renderString,
    XmlTemplateRenderer
};
