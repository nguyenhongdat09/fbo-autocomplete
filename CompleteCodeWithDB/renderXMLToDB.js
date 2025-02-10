
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const level = require('level-rocksdb');
const ana = require('./AnalystXMLFile');
class RenderXMLToDB {
    static async render() {
        const activeEditor = vscode.window.activeTextEditor;

        if (!activeEditor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }
        const document = activeEditor.document;
        let basePath = document.uri.authority + document.uri.path;
        const prefixesToLoop = ['Dir', 'Grid', 'Filter'];
        //path theo công ty 
        basePath = `\\\\${basePath.substring(0, basePath.indexOf('App_Data'))}App_Data\\Controllers\\`;
        //Path theo đường dẫn cứng  
        /*
         basePath = document.uri.path
         let endIndex = basePath.indexOf('Controllers/') + 'Controllers/'.length;
         if (endIndex !== -1) {
             let result = basePath.substring(1, endIndex); // Bỏ dấu "/" đầu tiên
             basePath = result;
         } else {
             vscode.window.showErrorMessage('Không tìm thấy "Controllers/" trong đường dẫn.');
         }
         */
        try {
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

                    return { prefix: prefix, filePath: xmlFiles.concat(fFiles) };
                })
            );
            var FolderPaths = results.flat();
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Analyst And Inserting to Database`,
                cancellable: false
            }, async (progress, token) => {
                const keyValuePairs_arr = await Promise.all(
                    FolderPaths.map(async (Folder) => {
                        const folderName = Folder.prefix;
                        const filePaths = Folder.filePath;

                        // Đợi tất cả các file được xử lý và trả về mảng keyValuePairs
                        const keyValuePairsArray = [];
                        for (const filePath of filePaths) {
                            const dirName = path.dirname(filePath).split('\\').pop(); // lấy thư mục trước file
                            const baseName = path.basename(filePath); // lấy tên file
                            progress.report({ message: `${dirName}/${baseName}` });
                            const keyValuePair = await this.parseXMLFile(filePath); // parse từng file 
                            keyValuePairsArray.push(keyValuePair);
                        }
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
            });

        }
        catch (e) {
            console.log(e);
        }
    }
    static async parseXMLFile(filePath) {
        try {
            const name_and_field = await ana.getListField(filePath);
            const keyValuePairs = {};
            name_and_field.forEach(item => {
                var key_t = item.key;
                var value_t = item.value;
                const { key, value } = this.KeyValueCleaner(key_t, value_t, filePath); // Xử lý key và value 
                if (key != '' && !(key.includes(';')))
                    keyValuePairs[key] = value;
            });
            return keyValuePairs;
        }
        catch (error) {
            ///vscode.window.showErrorMessage(`Error parsing XML: ${error} at ${filePath}`);
            return {};
        }
    }

    static KeyValueCleaner(key, value, filePath) {
        if (/ForeignKey|&/.test(value))
            return { key: '', value: '' };
        var replaceNone = ['isPrimaryKey="true"', 'allowNulls="false"', 'clientDefault="Default"'];
        replaceNone.forEach(item => {
            value = value.replace(item, '');
        });

        //Xóa luôn theo cặp <clientScript>...</clientScript>
        value = value.replace(/<clientScript>.*?<\/clientScript>\s*/g, '');
        value = value.replace(/<query>.*?<\/query>\s*/g, '');
        value = value.replace(/\s+(filterSource|categoryIndex|operation)="[^"]*"/g, '');

        //nếu lookup thì tách riêng với autocomplete
        const regex = /style\s*=\s*"([^"]*)"/;
        const style = value.match(regex);
        if (style) {
            if (style[1] === 'Lookup') {
                key = key + 'lk'
            } else if (style[1] === 'AutoComplete') {
                key = key + 'at'
            }
        }
        const externalRegex = /external="([^"]+)"/;

        const external = value.match(externalRegex);

        if (external) {
            if (external[1].toLowerCase() === 'true') {
                key = key + 'ex'
            }
        }
        if (value.includes('allowFilter') || value.includes('allowSort') || value.includes('aggregate')) {
            key = key + '_gridView'
        }
        return { key, value };
    }
    static async saveToRocksDB(nameDb, keyValuePairs) {
        var db_path_name = '/Database/';
        let dbPath = path.join(__dirname, '..', db_path_name, nameDb);
        let dbView;
        if (nameDb === 'Grid') {
            dbPath = path.join(__dirname, '..', db_path_name, 'GridInput');
            dbView = level(path.join(__dirname, '..', db_path_name, 'GridView'));
        }
        const db = level(dbPath);
        var array1 = [], array2 = [];
        try {
            for (const key in keyValuePairs) {
                const value = keyValuePairs[key];
                if (nameDb === 'Grid') {
                    if (key.includes('_gridView')) {
                        var key_gridView = key.replace('_gridView', '')
                        await dbView.put(key_gridView, value);
                        array2.push({
                            "label": key_gridView,
                            "detail": "field GridView",
                            "insertText": key_gridView
                        })
                    } else {
                        await db.put(key, value);
                        array1.push({
                            "label": key,
                            "detail": `field ${nameDb === 'Grid' ? 'GridInput' : nameDb}`,
                            "insertText": key
                        })
                    }
                } else {
                    await db.put(key, value);
                    array1.push({
                        "label": key,
                        "detail": `field ${nameDb === 'Grid' ? 'GridInput' : nameDb}`,
                        "insertText": key
                    })
                }
            }
        } catch (error) {
            console.error('Error saving to LevelRocksDB:', error);
        } finally {
            const gridViewJsonPath = path.join(__dirname, '..', './Database/AutoComplete/GridView.json');
            const gridInputJsonPath = path.join(__dirname, '..', './Database/AutoComplete/GridInput.json');
            const dirJsonPath = path.join(__dirname, '..', './Database/AutoComplete/Dir.json');
            const filterInputJsonPath = path.join(__dirname, '..', './Database/AutoComplete/Filter.json');
            switch (nameDb) {
                case 'Grid':
                    fs.writeFileSync(gridViewJsonPath, JSON.stringify(array2, null, 2), 'utf8');
                    fs.writeFileSync(gridInputJsonPath, JSON.stringify(array1, null, 2), 'utf8');
                    break;
                case 'Dir':
                    fs.writeFileSync(dirJsonPath, JSON.stringify(array1, null, 2), 'utf8');
                    break;
                case 'Filter':
                    fs.writeFileSync(filterInputJsonPath, JSON.stringify(array1, null, 2), 'utf8');
                    break;
                default:
                    break;
            }
            await db.close();
            if (dbView) {
                await dbView.close();
            }
        }
    }

}

module.exports = RenderXMLToDB;
