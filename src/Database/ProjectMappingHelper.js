const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

class ProjectMappingHelper {
    constructor() {
        this.cache = new Map();
        this.dbPath = path.join(__dirname, 'projectMapping.json');
        this.watcher = null;
        this.isLoaded = false;
    }

    _load() {
        if (!fs.existsSync(this.dbPath)) {
            fs.writeFileSync(this.dbPath, JSON.stringify({}, null, 4), 'utf8');
        }
        try {
            const data = fs.readFileSync(this.dbPath, 'utf8');
            const obj = JSON.parse(data);
            this.cache.clear();
            for (const key of Object.keys(obj)) {
                this.cache.set(path.normalize(key).toLowerCase(), obj[key]);
            }
        } catch (err) {
            console.error("Error loading projectMapping.json:", err);
        }
        
        if (!this.watcher) {
            this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(path.dirname(this.dbPath), path.basename(this.dbPath)));
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
        const parts = basePath.split(/[/\\]/);
        const shortKey = parts.length > 1 ? parts.slice(-2).join(path.sep) : basePath;
        
        try {
            let obj = {};
            if (fs.existsSync(this.dbPath)) {
                const data = fs.readFileSync(this.dbPath, 'utf8');
                if (data.trim()) obj = JSON.parse(data);
            }
            if (subFolder) {
                obj[shortKey] = subFolder;
                this.cache.set(path.normalize(shortKey).toLowerCase(), subFolder);
            } else {
                delete obj[shortKey];
                this.cache.delete(path.normalize(shortKey).toLowerCase());
            }
            fs.writeFileSync(this.dbPath, JSON.stringify(obj, null, 4), 'utf8');
        } catch (err) {
            vscode.window.showErrorMessage("Không thể lưu cấu hình Project Root: " + err.message);
        }
    }
}

module.exports = new ProjectMappingHelper();
