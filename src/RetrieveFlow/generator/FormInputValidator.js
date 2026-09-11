/**
 * Module kiểm tra và xác thực dữ liệu FormInput
 */

function validateFormInput(form) {
    const errors = [];
    const warnings = [];

    if (!form || typeof form !== 'object') {
        return { valid: false, errors: ['Dữ liệu form không hợp lệ.'], warnings: [] };
    }

    // Bắt buộc chung
    if (!form.identity || !form.identity.trim()) {
        errors.push('Identity (Định danh Controller) không được để trống.');
    }
    if (!form.dest_tran || !form.dest_tran.trim()) {
        errors.push('Chứng từ đích (dest_tran) không được để trống.');
    }
    if (!form.src_ma_ct || !form.src_ma_ct.trim()) {
        errors.push('Mã chứng từ nguồn (src_ma_ct) không được để trống.');
    }
    if (!form.src_taken_col || !form.src_taken_col.trim()) {
        errors.push('Tên cột số lượng đã lấy (src_taken_col) không được để trống.');
    }
    if (form.finding_status_list !== undefined && !String(form.finding_status_list).trim()) {
        errors.push('Trạng thái lọc nguồn (finding_status_list) không được để trống.');
    }

    // Kiểm tra theo mode
    const mode = form.src_table_mode || 'partitioned';
    if (mode === 'partitioned') {
        if (!form.src_ext || !form.src_ext.trim()) {
            errors.push('Ext bảng nguồn (src_ext) không được để trống khi ở chế độ bảng tách kỳ ($).');
        }
        if (form.dest_d_table && !form.dest_d_table.endsWith('$')) {
            errors.push(`Bảng chi tiết đích (dest_d_table = '${form.dest_d_table}') phải kết thúc bằng ký tự '$'.`);
        }
        if (form.dest_m_table && !form.dest_m_table.endsWith('$')) {
            errors.push(`Bảng tổng hợp đích (dest_m_table = '${form.dest_m_table}') phải kết thúc bằng ký tự '$'.`);
        }
    } else {
        if (!form.src_master_table || !form.src_master_table.trim()) {
            errors.push('Bảng master nguồn (src_master_table) không được để trống khi ở chế độ bảng đơn.');
        }
        if (!form.src_detail_table || !form.src_detail_table.trim()) {
            errors.push('Bảng detail nguồn (src_detail_table) không được để trống khi ở chế độ bảng đơn.');
        }
        if (form.src_master_table && form.src_master_table.includes('$')) {
            warnings.push(`Bảng master nguồn '${form.src_master_table}' chứa ký tự '$' trong chế độ bảng đơn.`);
        }
        if (form.src_detail_table && form.src_detail_table.includes('$')) {
            warnings.push(`Bảng detail nguồn '${form.src_detail_table}' chứa ký tự '$' trong chế độ bảng đơn.`);
        }
    }

    // Kiểm tra trường vết
    if (!Array.isArray(form.trace_fields) || form.trace_fields.length === 0) {
        warnings.push('Chưa cấu hình trường vết (trace_fields).');
    } else if (!form.trace_fields[0] || !form.trace_fields[0].name) {
        warnings.push('Trường vết đầu tiên (khóa stt_rec nguồn) chưa có tên trường.');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

module.exports = {
    validateFormInput
};
