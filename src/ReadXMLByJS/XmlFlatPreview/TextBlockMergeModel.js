/**
 * Model đại diện cho kết quả gộp khối văn bản bên trong thẻ <text>
 */
class TextBlockMergeModel {
    constructor() {
        this.merged_text = "";
        
        // Danh sách các segment thô sau khi gộp
        this.segments = [];
        
        // Danh sách các spans đại diện cho các vùng thực thể trong merged_text
        this.spans = [];
        
        // Các cảnh báo trong quá trình phân giải thực thể
        this.warnings = [];
    }
}

module.exports = TextBlockMergeModel;
