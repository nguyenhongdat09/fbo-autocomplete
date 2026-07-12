const vscode = require("vscode");
const entityResolver = require("../ReadXMLByJS/entityResolver");

class ReadXMLVS2008 {
    /**
     * Goi tu onDidOpenTextDocument + quet textDocuments luc activate.
     * @param {import('vscode').TextDocument} document
     * @param {import('vscode').ExtensionContext} context
     */
    static readXmlIfOpenFboDocument(document, context) {
        if (!document || document.languageId !== "xml" || document.uri.scheme !== "file") {
            return;
        }

        const filePath = document.uri.fsPath;
        const now = Date.now();
        const map = ReadXMLVS2008._openXmlLastReadAt;
        const last = map.get(filePath);
        const debounceMs = ReadXMLVS2008.OPEN_XML_DEBOUNCE_MS;
        if (last !== undefined && now - last < debounceMs) {
            return;
        }

        map.set(filePath, now);
        if (map.size > 200) {
            const cutoff = now - 60000;
            for (const [p, t] of map) {
                if (t < cutoff) {
                    map.delete(p);
                }
            }
        }

        ReadXMLVS2008.readXml(filePath, context);
    }

    /**
     * Mode 0: doc content khi mo file XML (dung cache exe neu co).
     * @param {string} filePath
     * @param {import('vscode').ExtensionContext} context
     */
    static readXml(filePath, context) {
        try {
            entityResolver.getEntitiesForFile(filePath);
        } catch (error) {
            console.error("[FBO ReadXMLVS2008] Pure JS parse failed:", error && error.message ? error.message : error);
        }
    }
}

/** @type {Map<string, number>} */
ReadXMLVS2008._openXmlLastReadAt = new Map();
ReadXMLVS2008.OPEN_XML_DEBOUNCE_MS = 750;

module.exports = ReadXMLVS2008;
