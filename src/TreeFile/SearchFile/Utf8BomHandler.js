// @ts-nocheck

const fs = require("fs");
const path = require("path");

const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);

class Utf8BomHandler {
    /** @type {Set<string>} */
    static _processing = new Set();

    /**
     * Tự động kiểm tra và thêm UTF-8 BOM nếu là file .xml và chưa có BOM
     * @param {string} abs_path Đường dẫn tuyệt đối của file
     * @returns {Promise<boolean>} true nếu đã chuyển sang UTF-8 BOM, false nếu không cần chuyển
     */
    static async ensureBom(abs_path) {
        if (!abs_path || typeof abs_path !== "string") return false;

        // Chỉ xử lý riêng cho file .xml
        const ext = path.extname(abs_path).toLowerCase();
        if (ext !== ".xml") return false;

        const normalized_path = path.normalize(abs_path);
        if (this._processing.has(normalized_path)) return false;

        try {
            const stat = await fs.promises.stat(normalized_path).catch(() => null);
            if (!stat || !stat.isFile() || stat.size === 0) return false;

            // Đọc nội dung file
            const buffer = await fs.promises.readFile(normalized_path);

            // Kiểm tra 3 byte đầu xem đã có BOM (0xEF, 0xBB, 0xBF) chưa
            const has_bom = buffer.length >= 3 &&
                            buffer[0] === 0xEF &&
                            buffer[1] === 0xBB &&
                            buffer[2] === 0xBF;

            if (has_bom) return false;

            this._processing.add(normalized_path);
            try {
                const bom_buffer = Buffer.concat([BOM, buffer]);
                await fs.promises.writeFile(normalized_path, bom_buffer);
                return true;
            } finally {
                this._processing.delete(normalized_path);
            }
        } catch {
            this._processing.delete(normalized_path);
            // Âm thầm bỏ qua nếu file bị lock hoặc quyền truy cập hạn chế
            return false;
        }
    }
}

module.exports = Utf8BomHandler;
