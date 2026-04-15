// Đường dẫn Database user: globalStorage/Database — giữ qua mỗi lần cài VSIX.
// Bundle (XSD, credentials mẫu, template) vẫn trong extensionPath.

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const EXTENSION_ID = "Nguyen-Hong-Dat.fbo-autocomplete";
const INIT_MARKER = ".fbo_db_initialized";

/** @type {string|null} */
let _userDatabaseRoot = null;

/**
 * Thư mục Database đi kèm extension (read-only, cập nhật theo version).
 */
function resolveBundledDatabaseRoot() {
    try {
        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        if (ext) {
            const base = ext.extensionPath;
            const srcDb = path.join(base, "src", "Database");
            if (fs.existsSync(srcDb)) {
                return srcDb;
            }
            const rootDb = path.join(base, "Database");
            if (fs.existsSync(rootDb)) {
                return rootDb;
            }
        }
    } catch {
        // ignore
    }
    return path.join(__dirname, "Database");
}

function isEffectivelyEmptyUserDir(dir) {
    if (!fs.existsSync(dir)) {
        return true;
    }
    const names = fs.readdirSync(dir).filter((n) => n !== INIT_MARKER);
    return names.length === 0;
}

/**
 * Copy merge: chỉ ghi file nếu đích chưa tồn tại (không ghi đè dữ liệu user).
 * @param {string} src
 * @param {string} dest
 */
function copyMergeMissingOnly(src, dest) {
    if (!fs.existsSync(src)) {
        return;
    }
    const st = fs.statSync(src);
    if (st.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const name of fs.readdirSync(src)) {
            copyMergeMissingOnly(path.join(src, name), path.join(dest, name));
        }
    } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        if (!fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
        }
    }
}

/**
 * Khởi tạo globalStorage/Database, seed lần đầu từ bundle nếu thư mục trống.
 * Gọi một lần đầu trong activate (trước checkLicense và các provider).
 * @param {import("vscode").ExtensionContext} context
 * @returns {string} đường dẫn tuyệt đối tới Database user
 */
function ensureUserDatabaseRoot(context) {
    if (!context || !context.globalStorageUri) {
        throw new Error("ensureUserDatabaseRoot: cần ExtensionContext.globalStorageUri");
    }
    _userDatabaseRoot = path.join(context.globalStorageUri.fsPath, "Database");
    fs.mkdirSync(_userDatabaseRoot, { recursive: true });

    const marker = path.join(_userDatabaseRoot, INIT_MARKER);
    const bundled = resolveBundledDatabaseRoot();

    if (!fs.existsSync(marker)) {
        if (fs.existsSync(bundled) && isEffectivelyEmptyUserDir(_userDatabaseRoot)) {
            copyMergeMissingOnly(bundled, _userDatabaseRoot);
        }
        try {
            fs.writeFileSync(marker, new Date().toISOString(), "utf8");
        } catch {
            // ignore
        }
    }

    return _userDatabaseRoot;
}

/**
 * @returns {string}
 */
function getUserDatabaseRoot() {
    if (!_userDatabaseRoot) {
        throw new Error("getUserDatabaseRoot: gọi ensureUserDatabaseRoot(context) trong activate trước.");
    }
    return _userDatabaseRoot;
}

module.exports = {
    ensureUserDatabaseRoot,
    getUserDatabaseRoot,
    resolveBundledDatabaseRoot,
    EXTENSION_ID,
};
