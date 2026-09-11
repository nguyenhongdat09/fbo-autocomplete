/**
 * Phát hiện phiên bản Upload XML:
 * - 'template': Phiên bản mới, có thẻ <template ...>
 * - 'legacy': Phiên bản cũ, khai báo field kèm column="..." trực tiếp trong <fields>
 */

function detectUploadVersion(xml_text) {
    if (!xml_text || typeof xml_text !== 'string') {
        return 'legacy';
    }

    // Match opening tag <template ...> hoặc <template>
    const template_regex = /<template\b[^>]*>/i;
    if (template_regex.test(xml_text)) {
        return 'template';
    }

    return 'legacy';
}

module.exports = {
    detectUploadVersion
};
