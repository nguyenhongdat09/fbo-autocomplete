const path = require("path");
const fs = require("fs");
const cp = require("child_process");

/**
 * Goi ReadXML.exe theo mode:
 *   0 = content -> JsonEntity\{base64(filePath)}.json
 *   1 = path    -> JsonEntityPath\{base64(filePath|entity)}.json
 *   0 1         = ca hai, load XML 1 lan
 */
class ReadXMLRunner {
    static getExePath(extensionPath) {
        return path.join(extensionPath, "src", "ReadXML", "ReadXML.exe");
    }

    static stripBom(text) {
        if (!text) {
            return "";
        }
        return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    }

    static normalizePathKey(filePath) {
        if (!filePath) {
            return "";
        }
        let normalized = path.normalize(filePath);
        if (process.platform === "win32") {
            normalized = normalized.replace(/\//g, "\\");
        }
        return normalized;
    }

    static pathsEqual(a, b) {
        if (!a || !b) {
            return false;
        }
        const left = ReadXMLRunner.normalizePathKey(a);
        const right = ReadXMLRunner.normalizePathKey(b);
        if (process.platform === "win32") {
            return left.toLowerCase() === right.toLowerCase();
        }
        return left === right;
    }

    static getJsonEntityFolder(extensionPath) {
        return path.join(extensionPath, "src", "ReadXML", "JsonEntity");
    }

    static getJsonEntityPathFolder(extensionPath) {
        return path.join(extensionPath, "src", "ReadXML", "JsonEntityPath");
    }

    static encodeKey(key) {
        return Buffer.from(key, "utf8").toString("base64");
    }

    static resolveJsonEntityPath(filePath, extensionPath) {
        const folder = ReadXMLRunner.getJsonEntityFolder(extensionPath);
        const key = ReadXMLRunner.normalizePathKey(filePath);
        return path.join(folder, `${ReadXMLRunner.encodeKey(key)}.json`);
    }

    static resolveJsonEntityPathForEntity(filePath, entityName, extensionPath) {
        const folder = ReadXMLRunner.getJsonEntityPathFolder(extensionPath);
        const key = `${ReadXMLRunner.normalizePathKey(filePath)}|${entityName}`;
        return path.join(folder, `${ReadXMLRunner.encodeKey(key)}.json`);
    }

    static findJsonEntityPathByDecodedPath(filePath, extensionPath) {
        const normalized = ReadXMLRunner.normalizePathKey(filePath);
        const directPath = ReadXMLRunner.resolveJsonEntityPath(normalized, extensionPath);
        if (fs.existsSync(directPath)) {
            return directPath;
        }

        const folder = ReadXMLRunner.getJsonEntityFolder(extensionPath);
        if (!fs.existsSync(folder)) {
            return null;
        }

        const files = fs.readdirSync(folder);
        for (const file of files) {
            if (!file.endsWith(".json")) {
                continue;
            }
            try {
                const decodedPath = Buffer.from(path.basename(file, ".json"), "base64").toString("utf8");
                if (ReadXMLRunner.pathsEqual(decodedPath, normalized)) {
                    return path.join(folder, file);
                }
            } catch (err) {
                // ignore invalid base64 filename
            }
        }

        return null;
    }

    static findJsonEntityPathFileForEntity(filePath, entityName, extensionPath) {
        const normalized = ReadXMLRunner.normalizePathKey(filePath);
        const directPath = ReadXMLRunner.resolveJsonEntityPathForEntity(normalized, entityName, extensionPath);
        if (fs.existsSync(directPath)) {
            return directPath;
        }

        const folder = ReadXMLRunner.getJsonEntityPathFolder(extensionPath);
        if (!fs.existsSync(folder)) {
            return null;
        }

        const suffix = `|${entityName}`;
        const files = fs.readdirSync(folder);
        for (const file of files) {
            if (!file.endsWith(".json")) {
                continue;
            }
            try {
                const decodedKey = Buffer.from(path.basename(file, ".json"), "base64").toString("utf8");
                if (!decodedKey.endsWith(suffix)) {
                    continue;
                }
                const decodedPath = decodedKey.slice(0, decodedKey.length - suffix.length);
                if (ReadXMLRunner.pathsEqual(decodedPath, normalized)) {
                    return path.join(folder, file);
                }
            } catch (err) {
                // ignore
            }
        }

        return null;
    }

    static exec(exePath, args) {
        return new Promise((resolve, reject) => {
            cp.execFile(exePath, args, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve({ stdout: stdout || "", stderr: stderr || "" });
            });
        });
    }

    static buildArgs(modes, filePath, entityNames, forceReload) {
        const args = modes.slice();
        args.push(filePath);
        if (entityNames && entityNames.length > 0) {
            args.push(...entityNames);
        }
        if (forceReload) {
            args.push("--force");
        }
        return args;
    }

    /**
     * Mode 0: doc content toan bo entity.
     * @param {string} extensionPath
     * @param {string} filePath
     * @param {boolean} [forceReload=false]
     */
    static runContent(extensionPath, filePath, forceReload = false) {
        const exePath = ReadXMLRunner.getExePath(extensionPath);
        if (!fs.existsSync(exePath)) {
            return Promise.reject(new Error("ReadXML.exe not found: " + exePath));
        }
        const args = ReadXMLRunner.buildArgs(["0"], ReadXMLRunner.normalizePathKey(filePath), [], forceReload);
        return ReadXMLRunner.exec(exePath, args);
    }

    /**
     * Mode 1: doc path 1 entity (F12).
     */
    static runPath(extensionPath, filePath, entityName, forceReload = false) {
        const exePath = ReadXMLRunner.getExePath(extensionPath);
        if (!fs.existsSync(exePath)) {
            return Promise.reject(new Error("ReadXML.exe not found: " + exePath));
        }
        const args = ReadXMLRunner.buildArgs(["1"], ReadXMLRunner.normalizePathKey(filePath), [entityName], forceReload);
        return ReadXMLRunner.exec(exePath, args);
    }

    /**
     * Mode 0 + 1 cung luc.
     */
    static runContentAndPath(extensionPath, filePath, entityNames, forceReload = false) {
        const exePath = ReadXMLRunner.getExePath(extensionPath);
        if (!fs.existsSync(exePath)) {
            return Promise.reject(new Error("ReadXML.exe not found: " + exePath));
        }
        const args = ReadXMLRunner.buildArgs(["0", "1"], ReadXMLRunner.normalizePathKey(filePath), entityNames || [], forceReload);
        return ReadXMLRunner.exec(exePath, args);
    }

    static parseJsonText(text) {
        const cleaned = ReadXMLRunner.stripBom(text);
        return JSON.parse(cleaned);
    }

    static isCorruptContentCache(parsed) {
        if (!Array.isArray(parsed) || parsed.length === 0) {
            return true;
        }
        if (parsed.length === 1 && parsed[0] && parsed[0].SourceFile) {
            return true;
        }
        return false;
    }

    static readContentJson(filePath, extensionPath) {
        const jsonPath = ReadXMLRunner.findJsonEntityPathByDecodedPath(filePath, extensionPath);
        if (!jsonPath || !fs.existsSync(jsonPath)) {
            return null;
        }

        try {
            const raw = fs.readFileSync(jsonPath, "utf8");
            const parsed = ReadXMLRunner.parseJsonText(raw);
            if (ReadXMLRunner.isCorruptContentCache(parsed)) {
                return null;
            }
            return parsed.filter((item) => item && item.Name && !item.SourceFile);
        } catch (err) {
            console.error("[FBO ReadXMLRunner] readContentJson failed:", err);
            return null;
        }
    }

    static readPathJson(filePath, entityName, extensionPath) {
        const jsonPath = ReadXMLRunner.findJsonEntityPathFileForEntity(filePath, entityName, extensionPath);
        if (!jsonPath || !fs.existsSync(jsonPath)) {
            return null;
        }

        try {
            const parsed = ReadXMLRunner.parseJsonText(fs.readFileSync(jsonPath, "utf8"));
            if (!parsed || typeof parsed !== "object") {
                return null;
            }
            if (!ReadXMLRunner.isPathCacheFresh(jsonPath, parsed)) {
                return null;
            }
            return parsed;
        } catch (err) {
            console.error("[FBO ReadXMLRunner] readPathJson failed:", err);
            return null;
        }
    }

    static isPathCacheFresh(jsonPath, pathInfo) {
        if (!pathInfo || !pathInfo.SourceFile || !pathInfo.Name) {
            return false;
        }
        if (!fs.existsSync(pathInfo.SourceFile)) {
            return false;
        }

        const liveSignature = ReadXMLRunner.buildConditionalSignature(pathInfo.SourceFile);
        const cachedSignature = pathInfo.ConditionalSignature || "";

        // Entity trong file .f / file tĩnh không có conditional → signature rỗng là hợp lệ
        if (!cachedSignature) {
            return !liveSignature;
        }

        return liveSignature === cachedSignature;
    }

    static buildConditionalSignature(entFilePath) {
        let lines;
        try {
            lines = fs.readFileSync(entFilePath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
        } catch (err) {
            return "";
        }

        const entDir = path.dirname(entFilePath);
        const paramPattern = /<!ENTITY\s+%\s*([\w.]+)\s+SYSTEM\s+"([^"]+)"/i;
        const values = {};

        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(paramPattern);
            if (!match) {
                continue;
            }

            const paramName = match[1];
            const txtPath = path.normalize(path.join(entDir, match[2].replace(/\//g, path.sep)));
            let text = "";
            try {
                text = fs.readFileSync(txtPath, "utf8").replace(/^\uFEFF/, "").trim();
            } catch (err) {
                text = "";
            }

            values[paramName] = text.toUpperCase().indexOf("INCLUDE") === 0 ? "INCLUDE" : "IGNORE";
        }

        const keys = Object.keys(values).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "accent" }));
        return keys.map((key) => `${key}=${values[key]};`).join("");
    }

    /**
     * Tim entity &Name; tai vi tri con tro (ke ca khi dung giua ten).
     * @returns {{ entityName: string, line: number, start: number, end: number } | null}
     */
    static resolveEntityAtPosition(document, position) {
        const line = document.lineAt(position.line);
        const text = line.text;
        const regex = /&[\w.]+;/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (position.character >= start && position.character <= end) {
                return {
                    entityName: match[0].slice(1, -1),
                    line: position.line,
                    start: start,
                    end: end,
                };
            }
        }

        const wordRange = document.getWordRangeAtPosition(position, /&[\w.]+;/);
        if (!wordRange) {
            return null;
        }

        const entityRef = document.getText(wordRange);
        return {
            entityName: entityRef.slice(1, -1),
            line: wordRange.start.line,
            start: wordRange.start.character,
            end: wordRange.end.character,
        };
    }
}

module.exports = ReadXMLRunner;
