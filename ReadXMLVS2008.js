const { exec } = require("child_process"); 
const path = require("path"); // Import thư viện path để xử lý đường dẫn
const vscode = require("vscode"); 

class ReadXMLVS2008 {
    static readXml(filePath) {
        const exePath = path.join(__dirname, "ReadXML", "ReadXML.exe");
        console.log(`"${exePath}" "${filePath}"`)
        // Gọi file .exe với đường dẫn file XML
        exec(`"${exePath}" "${filePath}"`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`Stderr: ${stderr}`);
                return;
            }
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Reload Entity`,
                cancellable: false
            }, async (progress, token) => {
                console.log(`Done`);
            });
        });
    }
}

module.exports = ReadXMLVS2008;
