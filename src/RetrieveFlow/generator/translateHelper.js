/**
 * Helper tự động dịch các tiêu đề tiếng Việt sang tiếng Anh khi Generate (hoặc Preview)
 * Tận dụng class TranslatedText có sẵn trong src/Translate/Translate.js
 */

const TranslatedText = require('../../Translate/Translate');

/**
 * Tự động dịch và điền các trường *_e từ *_v nếu *_e còn trống
 * @param {object} form - FormInput JSON
 * @returns {Promise<object>} form đã được cập nhật bản dịch tiếng Anh
 */
async function autoTranslateFormTitles(form) {
    if (!form || typeof form !== 'object') return form;
    const translator = new TranslatedText();

    const toTranslate = [];
    const mapping = [];

    function addText(text, meta) {
        const trimmed = (text || '').trim();
        if (trimmed) {
            toTranslate.push(trimmed);
            mapping.push(meta);
        }
    }

    // 1. Tiêu đề cột đã lấy
    if (!form.src_taken_header_e && form.src_taken_header_v) {
        addText(form.src_taken_header_v, { target: 'src_taken_header_e' });
    }

    // 2. Tiêu đề các trường vết (nếu có header_v)
    if (Array.isArray(form.trace_fields)) {
        form.trace_fields.forEach((f, idx) => {
            if (!f.header_e && f.header_v) {
                addText(f.header_v, { target: 'trace_field', index: idx });
            }
        });
    }

    // 3. Tiêu đề Form / Grid / Filter
    if (form.titles) {
        const titleKeys = ['filter', 'multiform', 'multigrid', 'filter_date', 'filter_so'];
        titleKeys.forEach(k => {
            const vKey = `${k}_v`;
            const eKey = `${k}_e`;
            if (!form.titles[eKey] && form.titles[vKey]) {
                addText(form.titles[vKey], { target: 'title', key: eKey });
            }
        });
    }

    // 4. Thông báo không có dữ liệu
    if (!form.filter_none_message_e && form.filter_none_message_v) {
        addText(form.filter_none_message_v, { target: 'filter_none_message_e' });
    }

    if (toTranslate.length === 0) {
        return form;
    }

    try {
        let results = [];
        if (toTranslate.length === 1) {
            const single = await translator.trans_to_en(toTranslate[0]);
            results = [single];
        } else {
            const batch = await translator.trans_to_vi_batch(toTranslate);
            if (Array.isArray(batch)) {
                results = batch.map(t => translator.capitalizeWords(t));
            } else if (typeof batch === 'string') {
                results = [translator.capitalizeWords(batch)];
            }
        }

        mapping.forEach((meta, idx) => {
            const translated = results[idx] || '';
            if (meta.target === 'src_taken_header_e') {
                form.src_taken_header_e = translated;
            } else if (meta.target === 'trace_field' && form.trace_fields[meta.index]) {
                form.trace_fields[meta.index].header_e = translated;
            } else if (meta.target === 'title' && form.titles) {
                form.titles[meta.key] = translated;
            } else if (meta.target === 'filter_none_message_e') {
                form.filter_none_message_e = translated;
            }
        });
    } catch (err) {
        console.warn('[RetrieveFlow] Tự động dịch tiêu đề không thành công (offline/timeout):', err.message);
        // Fallback: để trống e="" cho user chạy ApplyTranslateFBO sau
    }

    return form;
}

module.exports = {
    autoTranslateFormTitles
};
