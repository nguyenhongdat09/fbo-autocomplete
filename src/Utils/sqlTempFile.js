const fs = require('fs');
const path = require('path');

const UTF8_BOM = '\ufeff';

/**
 * Tạo file tạm với cơ chế tự động tăng số thứ tự nếu trùng tên:
 * name.ext -> name (2).ext -> name (3).ext
 *
 * @param {string} folder_path - Đường dẫn thư mục chứa file tạm
 * @param {string} base_name_raw - Tên cơ sở (sẽ được chuẩn hóa)
 * @param {string} [extension='.sql'] - Đuôi file (có hoặc không có dấu chấm đầu)
 * @param {string} [initial_content=''] - Nội dung ban đầu ghi vào file
 * @returns {{ filePath: string, fileName: string }}
 */
function createTempFile(folder_path, base_name_raw, extension = '.sql', initial_content = '') {
    if (!folder_path) {
        throw new Error("Chưa chỉ định đường dẫn thư mục tạm.");
    }
    if (!fs.existsSync(folder_path)) {
        throw new Error(`Thư mục '${folder_path}' không tồn tại.`);
    }

    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    let base_name = base_name_raw || "temp";
    // Nếu base_name_raw có đuôi extension thì bỏ đi trước khi chuẩn hóa
    if (base_name.toLowerCase().endsWith(ext)) {
        base_name = base_name.slice(0, -ext.length);
    }
    base_name = base_name.toLowerCase().replace(/[\s-]+/g, '_');
    base_name = base_name.replace(/^_+|_+$/g, '');
    if (!base_name) {
        base_name = "temp";
    }

    let file_name = `${base_name}${ext}`;
    let file_path = path.join(folder_path, file_name);
    let counter = 2;

    while (fs.existsSync(file_path)) {
        file_name = `${base_name} (${counter})${ext}`;
        file_path = path.join(folder_path, file_name);
        counter++;
    }

    fs.writeFileSync(file_path, UTF8_BOM + initial_content, 'utf8');

    return {
        filePath: file_path,
        fileName: file_name
    };
}

/**
 * Tạo file .sql tạm — wrapper của createTempFile với extension '.sql'
 *
 * @param {string} folder_path - Đường dẫn thư mục chứa file tạm
 * @param {string} base_name_raw - Tên cơ sở (sẽ được chuẩn hóa)
 * @param {string} [initial_content=''] - Nội dung ban đầu ghi vào file
 * @returns {{ filePath: string, fileName: string }}
 */
function createSqlTempFile(folder_path, base_name_raw, initial_content = '') {
    return createTempFile(folder_path, base_name_raw, '.sql', initial_content);
}

/**
 * Kiểm tra xem môi trường IDE hiện tại có phải là Antigravity hay không
 * @returns {boolean}
 */
function isAntigravityIde() {
    let vscode_env = null;
    try {
        const vscode = require('vscode');
        vscode_env = vscode.env;
    } catch {
        vscode_env = null;
    }
    const app_name = (vscode_env && vscode_env.appName) || '';
    if (/antigravity/i.test(app_name)) return true;
    if (process.env.ANTIGRAVITY_TRAJECTORY_ID) return true;
    if (process.env.VSCODE_CODE_CACHE_PATH && /antigravity/i.test(process.env.VSCODE_CODE_CACHE_PATH)) return true;
    return false;
}

/**
 * Xác định thư mục đích để lưu file .sql tạm.
 * Nếu IDE là Antigravity:
 *   Lấy tên thư mục từ folder_path (ví dụ: 'E:\\SQL Temp' -> 'SQL Temp')
 *   Tạo thư mục trong .gemini/config/skills/<folder_name> nếu chưa có
 *   Trả về đường dẫn thư mục đó để tạo tiếp các file .sql
 * Nếu không phải Antigravity:
 *   Trả về nguyên folder_path
 *
 * @param {string} folder_path - Đường dẫn thư mục được cấu hình trong Settings
 * @param {boolean} [is_antigravity] - Tùy chọn cờ xác định Antigravity (nếu không truyền sẽ tự detect)
 * @param {string} [custom_skills_root] - Tùy chọn thư mục skills root (phục vụ test)
 * @returns {string} - Đường dẫn thư mục đích
 */
function resolveSqlTempFolder(folder_path, is_antigravity = undefined, custom_skills_root = null) {
    if (!folder_path) {
        return '';
    }

    const check_antigravity = typeof is_antigravity === 'boolean' ? is_antigravity : isAntigravityIde();
    if (!check_antigravity) {
        return folder_path;
    }

    const trimmed_path = String(folder_path).trim().replace(/[/\\]+$/, '');
    const folder_name = path.basename(trimmed_path) || 'SQL Temp';
    const os = require('os');
    const user_home = process.env.USERPROFILE || os.homedir();
    const skills_root = custom_skills_root || path.join(user_home, '.gemini', 'config', 'skills');
    const target_dir = path.join(skills_root, folder_name);

    if (!fs.existsSync(target_dir)) {
        fs.mkdirSync(target_dir, { recursive: true });
    }

    return target_dir;
}

module.exports = {
    createTempFile,
    createSqlTempFile,
    isAntigravityIde,
    resolveSqlTempFolder
};

