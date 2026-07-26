const fs = require('fs');
const path = require('path');
const AppDataPathHelper = require('../../TreeFile/AppDataPathHelper');

/**
 * Nguồn hợp lệ = folder tồn tại + map được relative của sample file hiện tại
 * + probe path dưới nguồn vẫn resolve ra đúng project root (kiểu TreeFile / CustomerPro).
 */
function is_valid_project_root(folder_path, sample_file_in_current_project) {
    if (!folder_path || !fs.existsSync(folder_path) || !fs.statSync(folder_path).isDirectory()) {
        return false;
    }
    if (!sample_file_in_current_project) return false;

    const helper = new AppDataPathHelper(sample_file_in_current_project);
    const parts = helper.getPathAfterProject();
    if (!parts || parts.length < 2) return false;

    const mapped = path.join(folder_path, parts[1]);
    if (!(mapped.length > folder_path.length)) return false;

    // Probe: path giả dưới folder nguồn phải getProjectPath() === folder_path
    const probe = path.join(folder_path, 'App_Data', 'Controllers', 'Dir', '_fbo_probe.xml');
    const probe_helper = new AppDataPathHelper(probe);
    const project_path = probe_helper.getProjectPath();
    if (!project_path) return false;

    return path.normalize(project_path).toLowerCase() === path.normalize(folder_path).toLowerCase();
}

/**
 * Cắt bất kỳ thư mục con nào về project root (kiểu TreeFile / CustomerPro).
 * VD: \\srv\CustomerPro\FBO\Cty\R2SP201\App_Data\Controllers\Dir
 *   → \\srv\CustomerPro\FBO\Cty\R2SP201
 * Trả về '' nếu không cắt được (thiếu segment CustomerPro / quá nông).
 */
function normalize_to_project_root(folder_path) {
    if (!folder_path) return '';
    const helper = new AppDataPathHelper(folder_path);
    const project_path = helper.getProjectPath();
    return project_path || '';
}

function get_relative_after_project(absolute_path) {
    const helper = new AppDataPathHelper(absolute_path);
    const parts = helper.getPathAfterProject();
    if (!parts || parts.length < 2) return null;
    return { project_path: parts[0], relative_path: parts[1] };
}

function map_to_source(source_root, relative_path) {
    return path.join(source_root, relative_path);
}

/**
 * Dir/A.xml hoặc Grid/B.xml — lấy đoạn sau Controllers\ nếu có; không thì 2 segment cuối.
 */
function get_xml_short_name(absolute_path) {
    const norm = absolute_path.replace(/\//g, '\\');
    const lower = norm.toLowerCase();
    const marker = '\\controllers\\';
    const idx = lower.lastIndexOf(marker);
    if (idx !== -1) {
        return norm.substring(idx + marker.length).replace(/\\/g, '/');
    }
    const parts = norm.split('\\').filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    }
    return path.basename(absolute_path);
}

/**
 * @param {string[]} source_roots
 * @param {string} relative_path
 * @returns {{ source_index: number, source_file_path: string } | null}
 */
function find_in_sources_by_relative(source_roots, relative_path) {
    for (let i = 0; i < source_roots.length; i++) {
        const root = source_roots[i];
        if (!root) continue;
        const candidate = map_to_source(root, relative_path);
        if (fs.existsSync(candidate)) {
            return { source_index: i, source_file_path: candidate };
        }
    }
    return null;
}

function source_label_from_index(source_index) {
    if (source_index === null || source_index === undefined || source_index < 0) {
        return 'Không tìm thấy';
    }
    return `Nguồn ${source_index + 1}`;
}

module.exports = {
    is_valid_project_root,
    normalize_to_project_root,
    get_relative_after_project,
    map_to_source,
    get_xml_short_name,
    find_in_sources_by_relative,
    source_label_from_index
};
