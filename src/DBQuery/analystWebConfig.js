const fs = require("fs");

class AnalystWebConfig {
    constructor() {
        this.dbConnections = {
            app: null,
            sys: null
        };
    }

    /**
     * @param {string} filePath
     */
    async loadConfig(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Không tìm thấy file Web.config tại: ${filePath}`);
        }

        const xmlData = fs.readFileSync(filePath, "utf-8");

        // Regex tìm connectionString
        const regex = /<add\s+name="(appConnectionString|syncConnectionString|sysConnectionString)"\s+connectionString="([^"]+)"/g;
        let match;

        while ((match = regex.exec(xmlData)) !== null) {
            const name = match[1]; // "appConnectionString" hoặc "sysConnectionString"
            const connString = match[2]; // Chuỗi connection string
            this.dbConnections[name.includes("app") ? "app" : name.includes("sync") ? "app" : "sys"] = this.parseConnectionString(connString);
        }

        // Đọc sysDatabaseName để ép tên database app và sys
        const sysDbMatch = /<add\s+key="sysDatabaseName"\s+value="([^"]+)"\s*\/>/.exec(xmlData);
        if (sysDbMatch) {
            const sysDbName = sysDbMatch[1]; // VD: AMERICAN_FBISP2422_S
            let baseName = "";
            let appSuffix = "";
            let sysSuffix = "";

            if (sysDbName.endsWith("_S")) {
                baseName = sysDbName.slice(0, -2);
                appSuffix = "_A";
                sysSuffix = "_S";
            } else if (sysDbName.endsWith("_Sys")) {
                baseName = sysDbName.slice(0, -4);
                appSuffix = "_App";
                sysSuffix = "_Sys";
            }

            if (baseName) {
                if (this.dbConnections.app) {
                    this.dbConnections.app.database = baseName + appSuffix;
                }
                if (this.dbConnections.sys) {
                    this.dbConnections.sys.database = baseName + sysSuffix;
                }
            }
        }
    }

    parseConnectionString(connStr) {
        const params = {};
        connStr.split(";").forEach(part => {
            const [key, value] = part.split("=");
            if (key && value) {
                params[key.trim().toLowerCase()] = value.trim();
            }
        });
        return {
            server: params["data source"],
            database: params["initial catalog"],
            app_name: "vscode",
            user: params["uid"],
            password: params["pwd"]
        };
    }

    getDbConnection(type) {
        if (!this.dbConnections[type]) {
            throw new Error(`Không tìm thấy thông tin kết nối cho: ${type}`);
        }
        return this.dbConnections[type];
    }
}

module.exports = AnalystWebConfig;
