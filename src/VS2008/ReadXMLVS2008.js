const path = require('path');
const exec = require("child_process").exec;
const vscode = require("vscode");

class ReadXMLVS2008 {
    /**
     * Gọi từ onDidOpenTextDocument + quét textDocuments lúc activate.
     * Tránh readXml 2 lần liên tiếp cho cùng path (cold start: quét + event).
     * @param {import('vscode').TextDocument} document
     * @param {import('vscode').ExtensionContext} context
     */
    static readXmlIfOpenFboDocument(document, context) {
        if (!document || document.languageId !== 'xml' || document.uri.scheme !== 'file') {
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

    static async readXml(filePath, context) {
        const exePath = path.join(context.extensionPath, 'src', "ReadXML", "ReadXML.exe");
        // Gọi file .exe với đường dẫn file XML
        /*
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Reload Entity`,
            cancellable: false
        }, async (progress, token) => {
            exec(`"${exePath}" "${filePath}"`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error: ${error.message}`);
                    return;
                }
                if (stderr) {
                    console.error(`Stderr: ${stderr}`);
                    return;
                } 
            }); 
        });
        */
        exec(`"${exePath}" "${filePath}"`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`Stderr: ${stderr}`);
                return;
            }
        });
    }
}

/** @type {Map<string, number>} */
ReadXMLVS2008._openXmlLastReadAt = new Map();
/** Khoảng cách tối thiểu giữa hai lần readXml cho cùng một đường dẫn (ms). */
ReadXMLVS2008.OPEN_XML_DEBOUNCE_MS = 750;

module.exports = ReadXMLVS2008;