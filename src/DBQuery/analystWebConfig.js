const fs = require("fs");
const path = require("path");

class AnalystWebConfig {
    constructor() {
        this.dbConnections = {
            app: null,
            sys: null
        };
    }

    loadConfig(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Không tìm thấy file Web.config tại: ${filePath}`);
        }

        const xmlData = fs.readFileSync(filePath, "utf-8");

        // Regex tìm connectionString
        const regex = /<add\s+name="(appConnectionString|sysConnectionString)"\s+connectionString="([^"]+)"/g;
        let match;

        while ((match = regex.exec(xmlData)) !== null) {
            const name = match[1]; // "appConnectionString" hoặc "sysConnectionString"
            const connString = match[2]; // Chuỗi connection string
            // Parse connection string
            
            this.dbConnections[name.includes("app") ? "app" : "sys"] = this.parseConnectionString(connString);
        }
        if (this.dbConnections.sys && this.dbConnections.app) {
            const sysDb = this.dbConnections.sys.database;
            let appDb = sysDb.replace(/_(S|Sys)$/, "_A").replace(/_Sys$/, "_App");
            this.dbConnections.app.database = appDb;
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
