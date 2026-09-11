const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// Cache lưu Options.xml: filePath -> { mtime, docVersion, vars: Map<varName, { name, type, value, description, line }> }
const optionsCache = new Map();

// Từ điển ngữ nghĩa chuẩn FBO (Chỉ chứa metadata mô tả ý nghĩa, KHÔNG code cứng giá trị value/preview)
const FBO_STANDARD_METADATA = {
    upperCaseFormat: {
        category: 'Ký tự (Text)',
        meaning: 'Tự động chuyển thành chữ IN HOA'
    },
    lowercaseFormat: {
        category: 'Ký tự (Text)',
        meaning: 'Tự động chuyển thành chữ thường'
    },
    datetimeFormat: {
        category: 'Ngày tháng (Date/Time)',
        meaning: 'Định dạng ngày tháng chuẩn'
    },
    quantityInputFormat: {
        category: 'Số lượng (Quantity)',
        meaning: 'Định dạng số lượng khi nhập liệu'
    },
    quantityViewFormat: {
        category: 'Số lượng (Quantity)',
        meaning: 'Định dạng số lượng khi hiển thị/xem'
    },
    baseCurrencyAmountInputFormat: {
        category: 'Tiền hạch toán (Base Currency)',
        meaning: 'Định dạng số tiền hạch toán (VND) khi nhập liệu'
    },
    baseCurrencyAmountViewFormat: {
        category: 'Tiền hạch toán (Base Currency)',
        meaning: 'Định dạng số tiền hạch toán khi xem'
    },
    baseCurrencyPriceInputFormat: {
        category: 'Đơn giá hạch toán',
        meaning: 'Định dạng đơn giá hạch toán khi nhập liệu'
    },
    baseCurrencyPriceViewFormat: {
        category: 'Đơn giá hạch toán',
        meaning: 'Định dạng đơn giá hạch toán khi xem'
    },
    foreignCurrencyAmountInputFormat: {
        category: 'Tiền nguyên tệ (Foreign Currency)',
        meaning: 'Định dạng số tiền ngoại tệ khi nhập liệu'
    },
    foreignCurrencyAmountViewFormat: {
        category: 'Tiền nguyên tệ (Foreign Currency)',
        meaning: 'Định dạng số tiền ngoại tệ khi xem'
    },
    foreignCurrencyPriceInputFormat: {
        category: 'Đơn giá nguyên tệ',
        meaning: 'Định dạng đơn giá ngoại tệ khi nhập liệu'
    },
    foreignCurrencyPriceViewFormat: {
        category: 'Đơn giá nguyên tệ',
        meaning: 'Định dạng đơn giá ngoại tệ khi xem'
    },
    generalCurrencyAmountInputFormat: {
        category: 'Tiền tệ tổng quát',
        meaning: 'Định dạng số tiền chung khi nhập liệu'
    },
    generalCurrencyAmountViewFormat: {
        category: 'Tiền tệ tổng quát',
        meaning: 'Định dạng số tiền chung khi xem'
    },
    generalCurrencyPriceInputFormat: {
        category: 'Đơn giá chung',
        meaning: 'Định dạng đơn giá chung khi nhập liệu'
    },
    generalCurrencyPriceViewFormat: {
        category: 'Đơn giá chung',
        meaning: 'Định dạng đơn giá chung khi xem'
    },
    exchangeRateInputFormat: {
        category: 'Tỷ giá (Exchange Rate)',
        meaning: 'Định dạng tỷ giá ngoại tệ khi nhập liệu'
    },
    exchangeRateViewFormat: {
        category: 'Tỷ giá (Exchange Rate)',
        meaning: 'Định dạng tỷ giá ngoại tệ khi xem'
    },
    markInputFormat: {
        category: 'Điểm số / Chấm điểm',
        meaning: 'Định dạng điểm số khi nhập liệu'
    },
    markViewFormat: {
        category: 'Điểm số / Chấm điểm',
        meaning: 'Định dạng điểm số khi xem'
    },
    analysisInputFormat: {
        category: 'Chỉ số phân tích',
        meaning: 'Định dạng số liệu phân tích khi nhập liệu'
    },
    analysisViewFormat: {
        category: 'Chỉ số phân tích',
        meaning: 'Định dạng số liệu phân tích khi xem'
    },
    coefficientInputFormat: {
        category: 'Hệ số (Coefficient)',
        meaning: 'Định dạng hệ số khi nhập liệu'
    },
    coefficientViewFormat: {
        category: 'Hệ số (Coefficient)',
        meaning: 'Định dạng hệ số khi xem'
    },
    CapacityNumberInputFormat: {
        category: 'Dung tích / Công suất',
        meaning: 'Định dạng công suất/dung tích khi nhập liệu'
    },
    CapacityNumberViewFormat: {
        category: 'Dung tích / Công suất',
        meaning: 'Định dạng công suất/dung tích khi xem'
    },
    HourInputFormat: {
        category: 'Thời gian (Giờ)',
        meaning: 'Định dạng số giờ khi nhập liệu'
    },
    HourViewFormat: {
        category: 'Thời gian (Giờ)',
        meaning: 'Định dạng số giờ khi xem'
    },
    '100': { category: 'Độ dài trường', meaning: 'Độ dài tối đa số chứng từ' },
    '101': { category: 'Độ dài trường', meaning: 'Độ dài tối đa mã tài khoản' },
    '102': { category: 'Độ dài trường', meaning: 'Độ dài tối đa mã khách hàng' },
    '103': { category: 'Độ dài trường', meaning: 'Độ dài tối đa mã vật tư/hàng hóa' },
    '104': { category: 'Độ dài trường', meaning: 'Độ dài tối đa mã kho hàng' },
    '105': { category: 'Độ dài trường', meaning: 'Độ dài tối đa nhóm khách hàng' },
    '106': { category: 'Độ dài trường', meaning: 'Độ dài tối đa tên khách hàng' },
    '107': { category: 'Độ dài trường', meaning: 'Độ dài tối đa địa chỉ' },
    '108': { category: 'Độ dài trường', meaning: 'Độ dài tối đa mã số thuế' },
    '109': { category: 'Độ dài trường', meaning: 'Độ dài tối đa số lệnh sản xuất (MO)' },
    '110': { category: 'Độ dài trường', meaning: 'Độ dài tối đa số hóa đơn/chứng từ' },
    '111': { category: 'Độ dài trường', meaning: 'Độ dài tối đa số chứng từ kèm vùng/chi nhánh' }
};

/**
 * Tìm file Options.xml từ đường dẫn tài liệu hiện tại
 * @param {string} docPath
 * @returns {string|null}
 */
function findOptionsXmlPath(docPath) {
    if (!docPath) return null;

    try {
        const normalized = docPath.replace(/\\/g, '/');
        // Cách 1: Bắt theo cấu trúc chuẩn FastBusiness App_Data/Controllers/Options/Options.xml
        const match = normalized.match(/^(.*?\/App_Data\/Controllers)\//i);
        if (match) {
            const candidate = path.join(match[1], 'Options', 'Options.xml');
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }

        // Cách 2: Duyệt ngược lên các thư mục cha
        let currentDir = path.dirname(docPath);
        for (let i = 0; i < 6; i++) {
            const candidate1 = path.join(currentDir, 'Options', 'Options.xml');
            if (fs.existsSync(candidate1)) return candidate1;

            const candidate2 = path.join(currentDir, 'App_Data', 'Controllers', 'Options', 'Options.xml');
            if (fs.existsSync(candidate2)) return candidate2;

            const parent = path.dirname(currentDir);
            if (!parent || parent === currentDir) break;
            currentDir = parent;
        }
    } catch (e) {
        // Bỏ qua lỗi access file
    }

    return null;
}

/**
 * Đọc nội dung Options.xml (Ưu tiên đọc trực tiếp từ editor nếu đang mở để có dữ liệu thời gian thực)
 * @param {string} optionsPath 
 * @returns {{ content: string, versionKey: number|string }|null}
 */
function readOptionsContent(optionsPath) {
    try {
        // Kiểm tra xem file Options.xml có đang mở trong VS Code không
        const openDoc = vscode.workspace.textDocuments.find(doc => {
            return path.normalize(doc.uri.fsPath).toLowerCase() === path.normalize(optionsPath).toLowerCase();
        });

        if (openDoc) {
            return {
                content: openDoc.getText(),
                versionKey: `doc_${openDoc.version}`
            };
        }

        // Nếu không mở trong editor thì đọc từ ổ đĩa
        if (fs.existsSync(optionsPath)) {
            const stats = fs.statSync(optionsPath);
            const content = fs.readFileSync(optionsPath, 'utf-8');
            return {
                content: content,
                versionKey: stats.mtimeMs
            };
        }
    } catch (e) {
        console.error('Error reading options content:', e);
    }
    return null;
}

/**
 * Đọc và parse file Options.xml động 100% từ file thật
 * @param {string} optionsPath
 * @returns {Map<string, { name: string, type: string, value: string, description: string, line: number }>}
 */
function getOptionsMap(optionsPath) {
    if (!optionsPath) {
        return new Map();
    }

    try {
        const readResult = readOptionsContent(optionsPath);
        if (!readResult) {
            return new Map();
        }

        const cached = optionsCache.get(optionsPath);
        if (cached && cached.versionKey === readResult.versionKey) {
            return cached.vars;
        }

        const lines = readResult.content.split(/\r?\n/);
        const vars = new Map();

        const varRegex = /<var\b([^>]*)\/?>/i;
        const attrRegex = /(\w+)\s*=\s*(["'])(.*?)\2/g;

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            const match = varRegex.exec(line);
            if (match) {
                const attrs = {};
                let attrMatch;
                while ((attrMatch = attrRegex.exec(match[1])) !== null) {
                    attrs[attrMatch[1].toLowerCase()] = attrMatch[3];
                }

                const varName = attrs['name'];
                if (varName) {
                    vars.set(varName, {
                        name: varName,
                        type: attrs['type'] || 'String',
                        value: attrs['value'] || '',
                        description: attrs['description'] || '',
                        line: lineIndex
                    });
                }
            }
        }

        optionsCache.set(optionsPath, { versionKey: readResult.versionKey, vars });
        return vars;
    } catch (e) {
        console.error('Error parsing Options.xml:', e);
        return new Map();
    }
}

/**
 * Sinh chuỗi preview mẫu hoàn toàn ĐỘNG theo đúng cấu hình pattern trong Options.xml
 * @param {string} formatName 
 * @param {string} pattern 
 * @returns {string}
 */
function generatePreview(formatName, pattern) {
    if (!pattern) return '';

    const lowerName = formatName.toLowerCase();

    // 1. Nếu là định dạng Ngày Tháng: Thay thế token theo thời gian thực
    if (lowerName.includes('date') || lowerName.includes('time') || /^[dmyhs/.: -]+$/i.test(pattern)) {
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const MM = String(now.getMonth() + 1).padStart(2, '0');
        const yyyy = String(now.getFullYear());
        const yy = yyyy.substring(2);
        const HH = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');

        return pattern
            .replace(/yyyy/g, yyyy)
            .replace(/yy/g, yy)
            .replace(/MM/g, MM)
            .replace(/dd/g, dd)
            .replace(/HH/g, HH)
            .replace(/mm/g, mm)
            .replace(/ss/g, ss);
    }

    // 2. Nếu là format ký tự hoa/thường
    if (pattern === 'X' || pattern === '>') {
        return 'ABC-123 (Chữ in hoa)';
    }
    if (pattern === 'x') {
        return 'abc-123 (Chữ thường)';
    }

    // 3. Phân tích pattern số động: Phân cách hàng nghìn, phân cách thập phân và số chữ số sau dấu phẩy
    let decimalPlaces = 0;
    let decimalSep = '.';
    let thousandSep = ' ';

    if (pattern.includes(',')) {
        const lastComma = pattern.lastIndexOf(',');
        const lastDot = pattern.lastIndexOf('.');
        if (lastComma > lastDot) {
            // Dạng châu Âu/Việt Nam: 1.234,56 (dấu phẩy là thập phân)
            decimalSep = ',';
            thousandSep = pattern.includes('.') ? '.' : ' ';
            const afterComma = pattern.substring(lastComma + 1);
            decimalPlaces = (afterComma.match(/0|#/g) || []).length;
        } else {
            // Dạng chuẩn US: 1,234.56 (dấu chấm là thập phân)
            decimalSep = '.';
            thousandSep = ',';
            const afterDot = pattern.substring(lastDot + 1);
            decimalPlaces = (afterDot.match(/0|#/g) || []).length;
        }
    } else if (pattern.includes('.')) {
        decimalSep = '.';
        thousandSep = ' ';
        const lastDot = pattern.lastIndexOf('.');
        const afterDot = pattern.substring(lastDot + 1);
        decimalPlaces = (afterDot.match(/0|#/g) || []).length;
    } else {
        // Không có phần thập phân: kiểm tra ký tự phân cách nghìn trong pattern
        decimalPlaces = 0;
        if (pattern.includes(' ')) thousandSep = ' ';
        else if (pattern.includes(',')) thousandSep = ',';
        else if (pattern.includes('.')) thousandSep = '.';
    }

    // Chọn số mẫu giả lập phù hợp với ngữ cảnh
    let sampleNumber = 1234.56789;
    if (lowerName.includes('price') || lowerName.includes('gia')) {
        sampleNumber = 125.5000;
    } else if (lowerName.includes('amount') || lowerName.includes('tien')) {
        sampleNumber = 1250000;
    } else if (lowerName.includes('rate') || lowerName.includes('ty_gia')) {
        sampleNumber = 25450;
    } else if (lowerName.includes('hour') || lowerName.includes('gio')) {
        sampleNumber = 8.5;
    } else if (lowerName.includes('mark') || lowerName.includes('diem')) {
        sampleNumber = 9.5;
    }

    // Format số chính xác theo decimalPlaces và ký tự phân cách
    const parts = sampleNumber.toFixed(decimalPlaces).split('.');
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandSep);
    return parts.length > 1 && decimalPlaces > 0 ? `${intPart}${decimalSep}${parts[1]}` : intPart;
}

class DataFormatHoverProvider {
    /**
     * @param {vscode.TextDocument} document
     * @param {vscode.Position} position
     * @param {vscode.CancellationToken} token
     */
    provideHover(document, position, token) {
        if (document.languageId !== 'xml') {
            return null;
        }

        const line = document.lineAt(position.line);
        const lineText = line.text;

        let targetVarName = null;
        let hoverRange = null;

        // 1. Kiểm tra xem con trỏ có nằm trên dataFormatString="@..." hoặc formatString="@..."
        const attrRe = /\b(?:dataFormatString|formatString)\s*=\s*(["'])@([a-zA-Z0-9_]+)\1/gi;
        let attrMatch;
        while ((attrMatch = attrRe.exec(lineText)) !== null) {
            const startChar = attrMatch.index;
            const endChar = attrMatch.index + attrMatch[0].length;
            if (position.character >= startChar && position.character <= endChar) {
                targetVarName = attrMatch[2];
                hoverRange = new vscode.Range(position.line, startChar, position.line, endChar);
                break;
            }
        }

        // 2. Nếu không nằm trên thuộc tính, kiểm tra xem có hover trực tiếp trên @varName
        if (!targetVarName) {
            const formatRe = /@([a-zA-Z0-9_]+)/g;
            let match;
            while ((match = formatRe.exec(lineText)) !== null) {
                const startChar = match.index;
                const endChar = match.index + match[0].length;
                if (position.character >= startChar && position.character <= endChar) {
                    targetVarName = match[1];
                    hoverRange = new vscode.Range(position.line, startChar, position.line, endChar);
                    break;
                }
            }
        }

        if (!targetVarName) {
            return null;
        }

        const fsPath = document.uri.fsPath;
        const optionsPath = findOptionsXmlPath(fsPath);
        const optionsMap = optionsPath ? getOptionsMap(optionsPath) : new Map();

        const optVar = optionsMap.get(targetVarName);
        const meta = FBO_STANDARD_METADATA[targetVarName];

        // Nếu không có trong Options.xml và cũng không có trong danh mục biến chuẩn FBO thì bỏ qua
        if (!optVar && !meta) {
            return null;
        }

        // GIÁ TRỊ FORMAT ĐƯỢC LẤY 100% ĐỘNG TỪ OPTIONS.XML THỰC TẾ
        const formatValue = optVar ? optVar.value : '';
        const formatType = optVar ? optVar.type : 'String';
        const category = (meta && meta.category) ? meta.category : 'Tùy chỉnh Options';
        const meaning = (optVar && optVar.description) 
            ? optVar.description 
            : ((meta && meta.meaning) ? meta.meaning : `Định dạng biến @${targetVarName}`);

        // Preview được tính toán ĐỘNG hoàn toàn theo formatValue hiện tại của Options.xml
        const preview = generatePreview(targetVarName, formatValue);

        const md = new vscode.MarkdownString(undefined, true);
        md.supportThemeIcons = true;
        md.supportHtml = true;
        md.isTrusted = true;

        // Card hiển thị chuẩn Studio tinh tế & sang trọng
        md.appendMarkdown(`### 📐 \`@${targetVarName}\`\n`);
        md.appendMarkdown(`*${meaning}*\n\n`);
        md.appendMarkdown(`---\n\n`);

        if (formatValue) {
            md.appendMarkdown(`- **Cấu hình (Pattern):** \`${formatValue}\`\n`);
        } else {
            md.appendMarkdown(`- **Cấu hình (Pattern):** *(Chưa cấu hình giá trị)*\n`);
        }

        if (preview) {
            md.appendMarkdown(`- **Mẫu hiển thị (Preview):** \`${preview}\`\n`);
        }
        md.appendMarkdown(`- **Phân loại:** ${category} &nbsp;|&nbsp; **Kiểu:** \`${formatType}\`\n\n`);

        // Nút mở file Options.xml và trỏ đúng dòng
        if (optionsPath) {
            const lineNum = optVar ? optVar.line : 0;
            const args = encodeURIComponent(JSON.stringify({
                filePath: optionsPath,
                line: lineNum,
                character: 0
            }));
            md.appendMarkdown(`---\n\n`);
            md.appendMarkdown(`[$(go-to-file) Mở Options.xml](command:fbo-autocomplete.goToOptionVar?${args}) &nbsp;&nbsp; *(Dòng ${lineNum + 1})*`);
        }

        return new vscode.Hover(md, hoverRange);
    }
}

module.exports = {
    DataFormatHoverProvider,
    findOptionsXmlPath,
    getOptionsMap,
    generatePreview,
    FBO_STANDARD_METADATA
};
