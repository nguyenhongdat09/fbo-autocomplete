const AnalystXML = require('./TreeFile/BrowserHandle/AnalystXML');
const AnalystASPX = require('./TreeFile/BrowserHandle/AnalystASPX');
const path = require('path');

async function test() {
    const anxml = new AnalystXML();
    const anaspx = new AnalystASPX();
    const aspx_path = '\\\\172.168.5.14\\CustomerPro\\FBI\\AMERICAN\\FBISP2422\\App_Data\\Controllers\\Main\\AITran.aspx';
    
    let resolved_xmls = [];
    
    // First try JSON cache
    const all = await anxml.getAllXmlResultsFromJson(aspx_path);
    if (all) {
        const aspxName = path.basename(aspx_path);
        const matches = all.filter(x => x.aspxName.toLowerCase() === aspxName.toLowerCase());
        resolved_xmls = matches.map(m => m.xmlPath);
    }
    
    if (resolved_xmls.length === 0) {
        // Fallback: parse ASPX on the fly
        console.log("No JSON mapping found. Parsing on the fly...");
        const result = await anaspx.processingASPXFile(aspx_path);
        if (result) {
            const xml_objs = await anxml.findXMLFilesForControllers(aspx_path, [result]);
            resolved_xmls = xml_objs.map(o => o.xmlPath);
        }
    }
    
    console.log("Resolved XMLs:", resolved_xmls);
}
test();
