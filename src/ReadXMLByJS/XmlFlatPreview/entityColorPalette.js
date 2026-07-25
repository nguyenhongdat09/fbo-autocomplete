/**
 * Tạo màu sắc deterministic dạng HSL từ tên entity.
 * Sử dụng HSL để đảm bảo màu sắc sáng và phân biệt tốt.
 * @param {string} entity_name
 * @returns {string}
 */
function getEntityColor(entity_name) {
    let hash = 0;
    for (let i = 0; i < entity_name.length; i++) {
        hash = entity_name.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Lấy hue trong khoảng 0-360
    const hue = Math.abs(hash) % 360;
    // Trả về đối tượng chứa các thông số màu để phía Webview CSS linh hoạt sử dụng
    return {
        hue,
        hsla_light: `hsla(${hue}, 75%, 40%, 0.15)`,
        hsla_dark: `hsla(${hue}, 75%, 70%, 0.2)`
    };
}

module.exports = {
    getEntityColor
};
