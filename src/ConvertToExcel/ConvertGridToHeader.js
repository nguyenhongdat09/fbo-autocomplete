const fs = require('fs');
const ExcelJS = require('exceljs');
const pathModule = require('path');
class ConvertGridToHeader {
    constructor() {
        
    }

    CvtToFieldReport(path) {
        let xmlContent = fs.readFileSync(path, 'utf8');
        // Regex để tìm các field trong <fields> với tên, v và e trong thẻ <header>
        let headersMap = {};
        let match;
        const fieldsRegex = /<field[^>]*>(.*?)<\/field>/gs;

        // Lặp qua tất cả các thẻ <field> trong <fields>
        while ((match = fieldsRegex.exec(xmlContent)) !== null) {
            // Sử dụng regex để trích xuất các thuộc tính name, v và e từ thẻ <field>
            const field = match[0];
            const nameRegex = /name="([^"]*)"/;  // Trích xuất thuộc tính name
            const hiddenRegex = /hidden="([^"]*)"/;  // Trích xuất thuộc tính name
            const typeRegex = /type="([^"]*)"/;  // Trích xuất thuộc tính name
            const dataFormatStringRegex = /dataFormatString="([^"]*)"/;  // Trích xuất thuộc tính name
            const vRegex = /<header[^>]*v="([^"]*)"/;  // Trích xuất giá trị v trong thẻ <header>
            const eRegex = /<header[^>]*e="([^"]*)"/;  // Trích xuất giá trị e trong thẻ <header>
            const hiddenMatch = field.match(hiddenRegex);

            if (!(hiddenMatch && hiddenMatch[1] == 'true')) {
                const nameMatch = field.match(nameRegex);
                const vMatch = field.match(vRegex);
                const eMatch = field.match(eRegex);
                const type = field.match(typeRegex);
                const dtFormat = field.match(dataFormatStringRegex);

                if (nameMatch && vMatch && eMatch) {
                    const name = nameMatch[1];  // Lấy giá trị của name
                    const v = vMatch[1];        // Lấy giá trị của v
                    const e = eMatch[1];        // Lấy giá trị của e

                    var format = '';
                    if (dtFormat) {
                        var datatype = dtFormat[1];
                        if (datatype.includes('Price') || datatype.includes('Amount')) {
                            format = '_(* #,##0_);_(* (#,##0);_(* ""_);_(@_)';
                        }
                        else if (datatype.includes('quantity')) {
                            format = '_(* #,##0.000_);_(* (#,##0.000);_(* ""_);_(@_)';
                        } else if (datatype.includes('foreign')) {
                            format = '_(* #,##0.00_);_(* (#,##0.00);_(* ""_);_(@_)';
                        }
                    }
                    // Đưa vào headersMap
                    if (type) {
                        switch (type[1]) {
                            case 'DateTime':
                                headersMap[name] = { v: v, e: e, format: 'dd/mm/yyyy' };
                                break;
                            default:
                                headersMap[name] = { v: v, e: e, format: format };
                                break;
                        }
                    } else {
                        headersMap[name] = { v: v, e: e, format: format };
                    }
                }
            }
        }
        // Regex để tìm các field trong <view id="Grid">
        const gridFieldRegex = /<field name="(.*?)"\s*\/>/g;

        // Tạo danh sách các field mới
        //Add thêm mặc định tu_ngay, den_ngay, tu_ky, den_ky, nam 
        console.log(path);
        var newFields = [...xmlContent.matchAll(gridFieldRegex)].map(match => {
            let fieldName = match[1];
            let newFieldName = `h_${fieldName}`;
            if (headersMap.hasOwnProperty(fieldName)) {
                const { v, e, format } = headersMap[fieldName];
                let header = headersMap[fieldName] || { v: v, e: e, format: format };
                return `<field name="${newFieldName.replace('%l', '')}" type= "String">\n    <header v="${header.v}" e="${header.e}" />\n</field>`;
            }
        });
        [
            { name: "h_tu_ngay", v: "Từ ngày", e: "From Date" },
            { name: "h_den_ngay", v: "Đến ngày", e: "To Date" },
            { name: "h_tu_ky", v: "Từ kỳ", e: "From Period" },
            { name: "h_den_ky", v: "Đến kỳ", e: "To Period" },
            { name: "h_nam", v: "Năm", e: "Year" }
        ].forEach(f =>
            newFields.push(`<field name="${f.name}" type="String" >\n    <header v="${f.v}" e="${f.e}" />\n</field>`)
        );
        
        let Headers = [...xmlContent.matchAll(gridFieldRegex)]
            .map(match => {
                let fieldName = match[1];
                if (headersMap.hasOwnProperty(fieldName)) {
                    const { v, e, format } = headersMap[fieldName];
                    return [`h_${fieldName}`, `!2.${fieldName}`, format || "@"]; // Nếu không có format, gán mặc định là "@"
                }
                return null;
            })
            .filter(item => item !== null); // Loại bỏ các giá trị null
        return [newFields.join('\n'), Headers];
    }

    exportToExcel(inputPath, outputPath) {
        var cvt = this.CvtToFieldReport(inputPath);
        var headers = cvt[1];
        if (!Array.isArray(headers) || !Array.isArray(headers[0])) {
            console.error('Lỗi: headers phải là một mảng hai chiều');
            return;
        }

        // Đọc file template Excel
        const { resolveBundledDatabaseRoot } = require('../extensionDatabasePaths');
        const templatePath = pathModule.join(resolveBundledDatabaseRoot(), 'mau_chuan.xlsx');

        if (!fs.existsSync(templatePath)) {
            console.error('Lỗi: Không tìm thấy file mau_chuan.xlsx');
            return;
        }

        // Dùng exceljs để đọc file template
        const workbook = new ExcelJS.Workbook();

        workbook.xlsx.readFile(templatePath).then(() => {
            const worksheet = workbook.worksheets[0]; // Lấy sheet đầu tiên

            // Ghi dữ liệu vào dòng 9 (header) và dòng 10 (value)
            for (var i = 0; i < headers.length; i++) {
                if (!Array.isArray(headers[i]) || headers[i].length < 2) {
                    console.error(`Lỗi: headers[${i}] không hợp lệ`);
                    continue;
                }
                var header = headers[i][0].replace('%l', ''); // Loại bỏ ký tự '%l' nếu có
                var value = headers[i][1];
                var format = headers[i][2];
                var col = this.getExcelColumnName(i); // Chuyển đổi số cột sang tên cột trong Excel
                // Ô header (dòng 9)
                let headerCell = worksheet.getCell(`${col}9`);

                headerCell.value = '?' + header;

                headerCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'ffedf5ff' } // RGB(237, 245, 255)
                };

                headerCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                headerCell.font = { name: 'Times New Roman', size: 11, bold: true }; // Làm đậm chữ
                // Ô value (dòng 10)
                let valueCell = worksheet.getCell(`${col}10`);
                valueCell.value = value + '{b:systotal=0}';
                valueCell.style = JSON.parse(JSON.stringify(valueCell.style));
                valueCell.numFmt = format ? `${format}` : 'General';
                valueCell.alignment = { vertical: 'middle', horizontal: format == '@' ? 'left' : format == 'dd/mm/yyyy' ? 'center' : 'right', wrapText: true };
                valueCell.font = { name: 'Times New Roman', size: 11 }; // Làm đậm chữ
                // Tô viền cho cả dòng 9 và 10
                [headerCell, valueCell].forEach(cell => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: '000000' } },   // Viền trên
                        left: { style: 'thin', color: { argb: '000000' } },  // Viền trái
                        bottom: { style: 'thin', color: { argb: '000000' } }, // Viền dưới
                        right: { style: 'thin', color: { argb: '000000' } }  // Viền phải
                    };
                });
            } 
            // Merge các ô từ A6 đến cột cuối cùng của headers
            worksheet.mergeCells('A6', this.getExcelColumnName(headers.length - 1) + '6');
            worksheet.mergeCells('A7', this.getExcelColumnName(headers.length - 1) + '7');

            // Đặt alignment cho các ô merge
            worksheet.getCell('A6').alignment = { horizontal: 'center' };
            worksheet.getCell('A7').alignment = { horizontal: 'center' };
 
            worksheet.columns.forEach(column => {
                if (column.eachCell) {
                    column.width = 16;
                }
            });

            // Lưu file mới mà vẫn giữ nguyên format
            return workbook.xlsx.writeFile(outputPath);
        }).then(() => {
            console.log(`Xuất file Excel thành công: ${outputPath}`);
        }).catch(err => {
            console.error('Lỗi khi ghi file Excel:', err);
        });
    }
    getExcelColumnName(colIndex) {
        let columnName = '';
        while (colIndex >= 0) {
            columnName = String.fromCharCode((colIndex % 26) + 65) + columnName;
            colIndex = Math.floor(colIndex / 26) - 1;
        }
        return columnName;
    }


    addFieldToReport(xml, path) {
        let xmlContent = fs.readFileSync(path, 'utf8');
        let fieldsRegex = /<fields\b[^>]*>([\s\S]*?)<\/fields>|<fields\s*\/>/g;
        let matches = [...xmlContent.matchAll(fieldsRegex)];
        if (matches.length > 0) {
            let lastMatch = matches[matches.length - 1][0]; // Lấy thẻ <fields> cuối cùng tìm được
            // Trích xuất danh sách name từ lastMatch
            let lastFieldNames = [...lastMatch.matchAll(/<field\s+name="([^"]+)"/g)].map(m => m[1]);
            // Trích xuất danh sách name từ xml truyền vào
            let newFields = [...xml.matchAll(/<field\s+name="([^"]+)".*?>[\s\S]*?<\/field>/g)]
            // Loại bỏ các field có name trùng
            let filteredXml = newFields
                .filter(m => !lastFieldNames.includes(m[1]))  // Chỉ giữ lại field chưa tồn tại
                .map(m => m[0])  // Lấy nội dung field
                .join("\n"); 
            if (filteredXml.trim() !== "") {
                xmlContent = xmlContent.replace(lastMatch, lastMatch.replace(/<\/fields>/, filteredXml + "\n</fields>"));
            }
            return xmlContent;
        }
        return '';
    }
}
module.exports = ConvertGridToHeader