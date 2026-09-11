const path = require('path');

/**
 * Suy luận prefix hoặc từ khóa tìm kiếm file Dir/Grid từ tên file Upload.
 */
function deriveSearchPrefix(file_base_name) {
    if (!file_base_name || typeof file_base_name !== 'string') {
        return { mode: 'exact', prefix: '', keyword: '*.xml' };
    }

    const clean_base = file_base_name.replace(/\.xml$/i, '').trim();
    const lower_base = clean_base.toLowerCase();

    if (lower_base.endsWith('tran') || lower_base.endsWith('detail') || lower_base.endsWith('master')) {
        const prefix = clean_base.length >= 2 ? clean_base.substring(0, 2) : clean_base;
        return {
            mode: 'prefix',
            prefix: prefix,
            keyword: `${prefix}*.xml`
        };
    }

    return {
        mode: 'exact',
        prefix: clean_base,
        keyword: `${clean_base}.xml`
    };
}

/**
 * Lọc danh sách relative path chỉ giữ lại các file trong Controllers/Dir hoặc Controllers/Grid.
 */
function filterDirGridPaths(files_rel) {
    if (!Array.isArray(files_rel)) {
        return [];
    }

    return files_rel.filter(rel => {
        if (!rel || typeof rel !== 'string') {
            return false;
        }
        const norm = rel.replace(/\\/g, '/').toLowerCase();
        return norm.includes('/controllers/dir/') || norm.includes('/controllers/grid/');
    });
}

/**
 * Lọc chính xác theo tên file (không tính đuôi .xml) cho mode exact.
 */
function filterExactBaseName(files_rel, base_name) {
    if (!Array.isArray(files_rel) || !base_name) {
        return [];
    }

    const target_lower = String(base_name).toLowerCase();
    return files_rel.filter(rel => {
        const file_name = path.basename(rel, path.extname(rel)).toLowerCase();
        return file_name === target_lower;
    });
}

/**
 * Kiểm tra xem đường dẫn file có nằm trong thư mục Templates/Upload hay không.
 */
function isUploadFolderPath(fs_path) {
    if (!fs_path || typeof fs_path !== 'string') {
        return false;
    }
    const norm = fs_path.replace(/\\/g, '/').toLowerCase();
    return norm.includes('/templates/upload/') || /\/templates\/upload\/[^/]+\.xml$/i.test(norm);
}

module.exports = {
    deriveSearchPrefix,
    filterDirGridPaths,
    filterExactBaseName,
    isUploadFolderPath
};
