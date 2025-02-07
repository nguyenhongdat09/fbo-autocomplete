const fs = require('fs');


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
            const vRegex = /<header[^>]*v="([^"]*)"/;  // Trích xuất giá trị v trong thẻ <header>
            const eRegex = /<header[^>]*e="([^"]*)"/;  // Trích xuất giá trị e trong thẻ <header>
            const hiddenMatch = field.match(hiddenRegex);  
            if(hiddenMatch && hiddenMatch[1] == 'true')   return
            const nameMatch = field.match(nameRegex);
            const vMatch = field.match(vRegex);
            const eMatch = field.match(eRegex);
            
            
            if (nameMatch && vMatch && eMatch) {
                const name = nameMatch[1];  // Lấy giá trị của name
                const v = vMatch[1];        // Lấy giá trị của v
                const e = eMatch[1];        // Lấy giá trị của e
                // Đưa vào headersMap
                headersMap[name] = { v, e };
            }
        }
        // Regex để tìm các field trong <view id="Grid">
        const gridFieldRegex = /<field name="(.*?)"\s*\/>/g;

        // Tạo danh sách các field mới
        let newFields = [...xmlContent.matchAll(gridFieldRegex)].map(match => {
            let fieldName = match[1];
            let newFieldName = `h_${fieldName}`;
            if (headersMap.hasOwnProperty(fieldName)) {
                const { v, e } = headersMap[fieldName];
                let header = headersMap[fieldName] || { v: v, e: e };
                return `<field name="${newFieldName}" type= "String">\n    <header v="${header.v}" e="${header.e}" />\n</field>`;
            }
        });
        // Xóa các field cũ trong <view id="Grid">
        return newFields.join('\n');
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