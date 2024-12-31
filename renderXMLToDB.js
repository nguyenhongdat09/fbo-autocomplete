
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
var xml2js = require('xml2js');
const level = require('level-rocksdb');

class RenderXMLToDB {
    static async render() {
        const activeEditor = vscode.window.activeTextEditor;
       
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        } 
        const document = activeEditor.document;
        let basePath = document.uri.authority + document.uri.path;
        const prefixesToLoop = ['Dir'];

        basePath = `\\\\${basePath.substring(0, basePath.indexOf('App_Data'))}App_Data\\Controllers\\`; 
        
        try{
            //Đợi đọc xong hết tất cả rồi mới nhảy xuống filePaths = results.flat();
            const results = await Promise.all(
                prefixesToLoop.map(async (prefix) => {
                    const subPath = path.join(basePath, prefix);
                    const files = await fs.promises.readdir(subPath);
                    const allFile = files.map(file => path.join(subPath, file));
                    const xmlFiles = allFile.filter(file => file.endsWith('.xml'));
                    let fFiles = allFile.filter(file => file.endsWith('.f'));
        
                    for (const xmlFile of xmlFiles) {
                        const baseName = path.basename(xmlFile, '.xml');
                        fFiles = fFiles.filter(fFile => path.basename(fFile, '.f') !== baseName);
                    }

                    return {prefix: prefix, filePath: xmlFiles.concat(fFiles)};
                })
            );
            var FolderPaths = results.flat();  
              /*
            var filePath = '\\\\172.168.5.14\\CustomerPro\\FBO\\CUBES\\SP2255\\App_Data\\Controllers\\Dir\\User.f'
            const keyValuePairs = await this.parseXMLFile(filePath);
            console.log(keyValuePairs);
            */
          
            const keyValuePairs_arr = await Promise.all(
                FolderPaths.map(async (Folder) => {
                    const folderName = Folder.prefix;
                    const filePaths = Folder.filePath;
            
                    // Đợi tất cả các file được xử lý và trả về mảng keyValuePairs
                    const keyValuePairsArray = await Promise.all(
                        filePaths.map(async (filePath) => {
                            return await this.parseXMLFile(filePath); // parse từng file
                        })
                    );
            
                    // Gộp tất cả keyValuePairs lại thành một object duy nhất
                    const keyValuePairs = Object.assign({}, ...keyValuePairsArray);
            
                    return { folderName, keyValuePairs };
                })
            );
            
            var kvl_result = keyValuePairs_arr.flat();  
            
            kvl_result.forEach(async (keyValuePairs) => {
                var folderName = keyValuePairs.folderName;
                var value = keyValuePairs.keyValuePairs;
                await this.saveToRocksDB(folderName, value);
                
            });  
        }
        catch(e){
            console.log(e);
        } 
    }   
    static async parseXMLFile(filePath) {
    try {
       
        const data = await fs.promises.readFile(filePath, 'utf8');
        // Regex để lấy tất cả các <field> nằm trong <fields>
        const fieldsRegex = /<fields>([\s\S]*?)<\/fields>/g;
        //Regex ra fields    
        const fieldsMatches = data.match(fieldsRegex);
        if (!fieldsMatches) {
            console.error('No fields found');
            return;
        }
        var xmlFields = fieldsMatches[0];
        //Regex ra từng field
        const fieldRegex = /<field[^>]*name="([^"]+)"[^>]*>[\s\S]*?<\/field>/g;
        const keyValuePairs = {};
        let match;
        var replaceNone = ['isPrimaryKey="true"', 'allowNulls="false"', 'clientDefault="Default"']
            // Lặp qua từng kết quả match
            while ((match = fieldRegex.exec(xmlFields)) !== null) {
                try { 
                    var value = match[0]; // Toàn bộ thẻ <field>
                    replaceNone.forEach(item => {
                        value = value.replace(item, '');
                    });
                    const parser = new xml2js.Parser({ explicitArray: false });
                    //Xóa luôn theo cặp <clientScript>...</clientScript>
                    value = value.replace(/<clientScript>.*?<\/clientScript>\s*/g, '');
                    const fieldJSON = await parser.parseStringPromise(value);
                    var key = match[1].replace('%l', ''); // Giá trị của name bỏ phần %l
                    //nếu lookup thì tách riêng với autocomplete
                    if(fieldJSON.field.items){
                        var style = fieldJSON.field.items.$.style;
                        if(style === 'Lookup'){
                            key = key + 'lookup'
                        }
                    } 
                    keyValuePairs[key] = value; // Thêm vào object
                }
                catch (error) {
                   // console.error(`Error parsing XML: ${error} at ${filePath}`);
                   continue;
                }
            }
            return keyValuePairs;
        }
        catch (error) {
            console.error(`Error parsing XML: ${error} at ${filePath}`);
        }
    }
    static async saveToRocksDB(nameDb, keyValuePairs) {
        const dbPath = path.join(__dirname, nameDb);
        const db = level(dbPath);
        try {
            for (const key in keyValuePairs) {
                const value = keyValuePairs[key];
                await db.put(key, value); 
            } 
        } catch (error) {
            console.error('Error saving to LevelRocksDB:', error);
        } finally {
            db.close();  
        } 
    } 
}

module.exports = RenderXMLToDB;
