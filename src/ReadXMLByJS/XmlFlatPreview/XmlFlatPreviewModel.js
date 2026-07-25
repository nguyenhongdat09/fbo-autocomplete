class XmlFlatPreviewModel {
    /**
     * @param {string} source_file
     */
    constructor(source_file) {
        this.source_file = source_file;
        this.flat_text = "";
        /** 
         * @type {Array<{
         *   start: number, 
         *   end: number, 
         *   entity_name: string, 
         *   depth: number, 
         *   source_file: string | null, 
         *   entity_type: 'internal' | 'external', 
         *   original_ref: string
         * }>} 
         */
        this.spans = [];
        /** @type {Array<{code: string, message: string, offset?: number}>} */
        this.warnings = [];
        this.stats = {
            entity_count: 0,
            unique_entities: [],
            expanded_chars: 0,
            duration_ms: 0
        };
        this.doctype_preserved = null;
        this.body_start_offset = 0;
    }
}

module.exports = XmlFlatPreviewModel;
