const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

class ProjectMappingHelper {
    constructor() {
        this.cache = new Map();
        this.dbPath = null;
        this.watcher = null;
        this.isLoaded = false;
    }

    _getDbPath() {
        if (this.dbPath) return this.dbPath;
        try {
            const { getUserDatabaseRoot } = require('../extensionDatabasePaths');
            const userRoot = getUserDatabaseRoot();
            this.dbPath = path.join(userRoot, 'projectMapping.json');
        } catch {
            this.dbPath = path.join(__dirname, 'projectMapping.json');
        }
        return this.dbPath;
    }

    _load() {
        const filePath = this._getDbPath();
        if (!fs.existsSync(filePath)) {
            // Kiểm tra và migrate từ thư mục legacy nếu có
            const legacyPath = path.join(__dirname, 'projectMapping.json');
            if (legacyPath !== filePath && fs.existsSync(legacyPath)) {
                try {
                    fs.copyFileSync(legacyPath, filePath);
                } catch {
                    fs.writeFileSync(filePath, JSON.stringify({}, null, 4), 'utf8');
                }
            } else {
                fs.writeFileSync(filePath, JSON.stringify({}, null, 4), 'utf8');
            }
        }
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            const obj = JSON.parse(data);
            this.cache.clear();
            for (const key of Object.keys(obj)) {
                this.cache.set(path.normalize(key).toLowerCase(), obj[key]);
            }
        } catch (err) {
            console.error("Error loading projectMapping.json:", err);
        }
        
        if (!this.watcher) {
            this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(path.dirname(filePath), path.basename(filePath)));
            this.watcher.onDidChange(() => {
                this.isLoaded = false; // Force reload
            });
            this.watcher.onDidCreate(() => {
                this.isLoaded = false;
            });
            this.watcher.onDidDelete(() => {
                this.isLoaded = false;
            });
        }
        this.isLoaded = true;
    }

    getActualRoot(basePath) {
        if (!basePath) return basePath;
        if (!this.isLoaded) {
            this._load();
        }
        const normalizedBase = path.normalize(basePath).toLowerCase();
        
        for (const [mappedKey, subFolder] of this.cache.entries()) {
            if (normalizedBase.endsWith(mappedKey)) {
                return path.join(basePath, subFolder);
            }
        }
        return basePath;
    }

    setMapping(basePath, subFolder) {
        if (!this.isLoaded) {
            this._load();
        }
        const filePath = this._getDbPath();
        const parts = basePath.split(/[/\\]/);
        const shortKey = parts.length > 1 ? parts.slice(-2).join(path.sep) : basePath;
        
        try {
            let obj = {};
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                if (data.trim()) obj = JSON.parse(data);
            }
            if (subFolder) {
                obj[shortKey] = subFolder;
                this.cache.set(path.normalize(shortKey).toLowerCase(), subFolder);
            } else {
                delete obj[shortKey];
                this.cache.delete(path.normalize(shortKey).toLowerCase());
            }
            fs.writeFileSync(filePath, JSON.stringify(obj, null, 4), 'utf8');
        } catch (err) {
            vscode.window.showErrorMessage("Không thể lưu cấu hình Project Root: " + err.message);
        }
    }

    dispose() {
        if (this.watcher) {
            this.watcher.dispose();
            this.watcher = null;
        }
    }
}

module.exports = new ProjectMappingHelper();
