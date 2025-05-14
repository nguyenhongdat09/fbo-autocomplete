const path = require('path');
const exec = require("child_process").exec;
const vscode = require("vscode");

class ReadXMLVS2008 {
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

module.exports = ReadXMLVS2008;