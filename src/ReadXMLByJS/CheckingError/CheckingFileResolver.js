const fs = require('fs');
const path = require('path');
const AnalystASPX = require('../../TreeFile/BrowserHandle/AnalystASPX');
const AnalystXML = require('../../TreeFile/BrowserHandle/AnalystXML');

/**
 * Phân tích danh sách file do user chọn:
 * - Giữ nguyên .xml
 * - Resolve .aspx thành các .xml liên quan
 * - Bỏ qua các file khác
 * 
 * @param {string[]} file_paths - Danh sách các file path ban đầu
 * @returns {Promise<{ xml_files: string[], skipped_files: string[] }>}
 */
async function resolve_checking_files(file_paths) {
    const xml_files = [];
    const skipped_files = [];
    const aspx_files = [];

    // Phân loại
    for (const file_path of file_paths) {
        const ext = path.extname(file_path).toLowerCase();
        if (ext === '.xml') {
            xml_files.push(file_path);
        } else if (ext === '.aspx') {
            aspx_files.push(file_path);
        } else {
            skipped_files.push(file_path);
        }
    }

    // Resolve ASPX sang XML
    if (aspx_files.length > 0) {
        const analyst_aspx = new AnalystASPX();
        const analyst_xml = new AnalystXML();

        for (const aspx_path of aspx_files) {
            let resolved_for_this = [];
            try {
                // 1. Cố gắng lấy từ JSON Cache trước để nhanh
                const all_cached = await analyst_xml.getAllXmlResultsFromJson(aspx_path);
                if (all_cached) {
                    const aspx_name = path.basename(aspx_path).toLowerCase();
                    const matches = all_cached.filter(x => x.aspxName && x.aspxName.toLowerCase() === aspx_name);
                    resolved_for_this = matches.map(m => m.xmlPath);
                }

                // 2. Nếu cache chưa có, resolve on-the-fly
                if (resolved_for_this.length === 0 && fs.existsSync(aspx_path)) {
                    const result = await analyst_aspx.processingASPXFile(aspx_path);
                    if (result) {
                        const xml_objs = await analyst_xml.findXMLFilesForControllers(aspx_path, [result]);
                        if (xml_objs && xml_objs.length > 0) {
                            resolved_for_this = xml_objs.map(o => o.xmlPath);
                        }
                    }
                }

                if (resolved_for_this.length > 0) {
                    xml_files.push(...resolved_for_this);
                } else {
                    // Nếu không resolve được file XML nào
                    skipped_files.push(aspx_path);
                }
            } catch (e) {
                console.error(`Error resolving ASPX ${aspx_path}:`, e);
                skipped_files.push(aspx_path);
            }
        }
    }

    // Dedupe và chuẩn hóa
    const unique_xml_files = [];
    const seen = new Set();
    for (let xml of xml_files) {
        if (!xml) continue;

        // Bổ sung xử lý: nếu .xml không tồn tại, thử tìm .f
        if (!fs.existsSync(xml)) {
            const ext = path.extname(xml).toLowerCase();
            if (ext === '.xml') {
                const fPath = xml.substring(0, xml.length - 4) + '.f';
                if (fs.existsSync(fPath)) {
                    xml = fPath;
                }
            }
        }

        const norm = path.normalize(xml).toLowerCase();
        if (!seen.has(norm)) {
            seen.add(norm);
            // Giữ lại path dạng gốc nhưng đã normalize để chạy tool
            unique_xml_files.push(path.normalize(xml));
        }
    }

    return {
        xml_files: unique_xml_files,
        skipped_files
    };
}

module.exports = {
    resolve_checking_files
};
