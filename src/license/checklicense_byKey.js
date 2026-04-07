const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { machineIdSync } = require('node-machine-id');

// ✅ CONFIG
const KEY_FILE_NAME = 'extensionKey.dat';

/** @type {import('vscode').ExtensionContext | null} */
let _lastLicenseContext = null;

// Lấy Machine ID (hash SHA256)
const machineId = machineIdSync(true); // true = return original ID (not hashed)
const machineIdHash = crypto.createHash('sha256').update(machineId).digest('hex').substring(0, 8); // Lấy 8 ký tự đầu

/**
 * Đường dẫn extensionKey.dat trong globalStorage (sống qua update VSIX).
 * @param {import('vscode').ExtensionContext} [context]
 */
function getKeyFilePath(context) {
    const ctx = context || _lastLicenseContext;
    if (!ctx || !ctx.globalStorageUri) {
        throw new Error('checklicense_byKey: ExtensionContext.globalStorageUri is required');
    }
    const dir = ctx.globalStorageUri.fsPath;
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, KEY_FILE_NAME);
}

function tryReadKeyFromFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
        const k = fs.readFileSync(filePath, 'utf8').trim();
        return k || null;
    } catch {
        return null;
    }
}

function isKeyValidForThisMachine(key) {
    return !!(key && key.length >= 8 && key.substring(0, 8) === machineIdHash);
}

/**
 * Tạo chuỗi 16 ký tự ngẫu nhiên (A-Z, a-z, 0-9)
 * Kết hợp với Machine ID để đảm bảo key unique per machine
 */
function generateRandomKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomPart = '';
    for (let i = 0; i < 8; i++) { // 8 ký tự random
        randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Kết hợp: 8 ký tự machine ID hash + 8 ký tự random = 16 ký tự
    return machineIdHash + randomPart;
}

/**
 * ⭐ HÀM GIẢI MÃ - Copy hàm này ra Chrome DevTools để giải mã key cho người dùng
 * 
 * ⚠️ QUAN TRỌNG: License key được bind với Machine ID
 * - 8 ký tự đầu của extensionKey = Machine ID hash
 * - Khi verify, extension sẽ check 8 ký tự đầu có khớp với machine hiện tại không
 * - Nếu copy file sang máy khác → Machine ID khác → License invalid
 * 
 * ========== COPY TỪ ĐÂY VÀO CHROME DEVTOOLS (F12) ==========

function generateLicenseKey(extensionKey) {
    const secret = 'FBO-SECRET-2025';
    const input = extensionKey + secret;
    
    // Simple hash function (tương tự djb2)
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) + hash) + input.charCodeAt(i);
        hash = hash & 0xFFFFFFFF; // Convert to 32bit integer
    }
    
    // Tạo chuỗi hex từ nhiều rounds
    let result = '';
    for (let round = 0; round < 6; round++) {
        hash = ((hash << 5) + hash) + round + input.charCodeAt(round % input.length);
        hash = hash & 0xFFFFFFFF;
        result += Math.abs(hash).toString(16).toUpperCase().padStart(4, '0');
    }
    
    // Lấy 24 ký tự
    const hashPart = result.substring(0, 24);
    
    // Checksum
    const checksum = extensionKey.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0) % 100;
    
    return 'FBO-' + hashPart + '-' + checksum.toString().padStart(2, '0');
}

// Sử dụng:
generateLicenseKey('f3c0c32cfzIm4NXk')

 * ========== HẾT PHẦN COPY ==========
 */
function generateLicenseKey(extensionKey) {
    const secret = 'FBO-SECRET-2025';
    const input = extensionKey + secret;
    
    // Simple hash function (tương tự djb2)
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) + hash) + input.charCodeAt(i);
        hash = hash & 0xFFFFFFFF; // Convert to 32bit integer
    }
    
    // Tạo chuỗi hex từ nhiều rounds
    let result = '';
    for (let round = 0; round < 6; round++) {
        hash = ((hash << 5) + hash) + round + input.charCodeAt(round % input.length);
        hash = hash & 0xFFFFFFFF;
        result += Math.abs(hash).toString(16).toUpperCase().padStart(4, '0');
    }
    
    // Lấy 24 ký tự
    const hashPart = result.substring(0, 24);
    
    // Checksum
    const checksum = extensionKey.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0) % 100;
    
    return 'FBO-' + hashPart + '-' + checksum.toString().padStart(2, '0');
}

/**
 * Đọc hoặc tạo extensionKey (globalStorage; migrate từ settings hoặc Database cũ trong extension)
 * @param {import('vscode').ExtensionContext} context
 */
function getOrCreateExtensionKey(context) {
    _lastLicenseContext = context;
    const filePath = getKeyFilePath(context);

    const existing = tryReadKeyFromFile(filePath);
    if (existing) {
        return existing;
    }

    const config = vscode.workspace.getConfiguration('fbo-autocomplete');
    const fromSettings = String(config.get('extensionKey', '') || '').trim();
    if (fromSettings && isKeyValidForThisMachine(fromSettings)) {
        try {
            fs.writeFileSync(filePath, fromSettings, 'utf8');
        } catch {
            // ignore
        }
        return fromSettings;
    }

    const legacyPath = path.join(context.extensionPath, 'Database', KEY_FILE_NAME);
    const fromLegacy = tryReadKeyFromFile(legacyPath);
    if (fromLegacy && isKeyValidForThisMachine(fromLegacy)) {
        try {
            fs.writeFileSync(filePath, fromLegacy, 'utf8');
        } catch {
            // ignore
        }
        return fromLegacy;
    }

    const newKey = generateRandomKey();
    try {
        fs.writeFileSync(filePath, newKey, 'utf8');
    } catch {
        // ignore
    }

    return newKey;
}

/**
 * Cập nhật settings với extensionKey
 */
function updateExtensionKeyInSettings(extensionKey) {
    const config = vscode.workspace.getConfiguration('fbo-autocomplete');
    const currentKey = config.get('extensionKey', '');
    
    // Chỉ cập nhật nếu khác
    if (currentKey !== extensionKey) {
        config.update('extensionKey', extensionKey, vscode.ConfigurationTarget.Global);
    }
}

/**
 * ✅ Main check license function
 * @param {import('vscode').ExtensionContext} context
 */
async function checkLicense(context) {
    if (!context || !context.globalStorageUri) {
        vscode.window.showErrorMessage('❌ Internal error: extension context missing for license.');
        return false;
    }

    // Bước 1: Lấy hoặc tạo extension key
    const extensionKey = getOrCreateExtensionKey(context);
    
    // Bước 2: ⚠️ VERIFY MACHINE ID - Kiểm tra 8 ký tự đầu có khớp với machine hiện tại không
    const keyMachineIdPart = extensionKey.substring(0, 8);
    if (keyMachineIdPart !== machineIdHash) {
        // Xóa file key cũ và tạo mới cho máy này
        const filePath = getKeyFilePath(context);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        // Tạo key mới cho máy này
        const newKey = generateRandomKey();
        fs.writeFileSync(filePath, newKey, 'utf8');
        
        // Cập nhật settings
        updateExtensionKeyInSettings(newKey);
        
        vscode.window.showErrorMessage(
            `❌ License key invalid! The key was generated on a different machine.\n\nNew Extension Key: ${newKey}\n\nPlease contact admin to get a new license key.`,
            'Copy Extension Key'
        ).then(selection => {
            if (selection === 'Copy Extension Key') {
                vscode.env.clipboard.writeText(newKey);
                vscode.window.showInformationMessage('📋 New Extension Key copied to clipboard!');
            }
        });
        
        return false;
    }
    
    // Bước 3: Cập nhật vào settings để user thấy
    updateExtensionKeyInSettings(extensionKey);
    
    // Bước 4: Lấy license key từ settings (user nhập)
    const config = vscode.workspace.getConfiguration('fbo-autocomplete');
    const userLicenseKey = config.get('licenseKey', '');
    
    // Bước 5: Tạo license key đúng từ extension key
    const correctLicenseKey = generateLicenseKey(extensionKey);
    
    // Bước 6: So sánh
    if (userLicenseKey === correctLicenseKey) {
        return true;
    }
    
    // License không hợp lệ
    vscode.window.showErrorMessage(
        `❌ Invalid license key!\n\nYour Extension Key: ${extensionKey}\n\nPlease contact admin to get the correct license key.`,
        'Copy Extension Key'
    ).then(selection => {
        if (selection === 'Copy Extension Key') {
            vscode.env.clipboard.writeText(extensionKey);
            vscode.window.showInformationMessage('📋 Extension Key copied to clipboard!');
        }
    });
    
    return false;
}

/**
 * Force refresh - xóa key cũ và tạo mới (dùng cho debug)
 * @param {import('vscode').ExtensionContext} [context]
 */
async function refreshLicense(context) {
    const ctx = context || _lastLicenseContext;
    if (!ctx || !ctx.globalStorageUri) {
        return false;
    }
    const filePath = getKeyFilePath(ctx);
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch {
            return false;
        }
    }
    return await checkLicense(ctx);
}

/**
 * Clear license cache
 * @param {import('vscode').ExtensionContext} [context]
 */
function clearLicenseCache(context) {
    const ctx = context || _lastLicenseContext;
    if (!ctx || !ctx.globalStorageUri) {
        return false;
    }
    const filePath = getKeyFilePath(ctx);
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            return true;
        } catch {
            return false;
        }
    }
    return false;
}

// Export để dùng trong extension
exports.checkLicense = checkLicense;
exports.refreshLicense = refreshLicense;
exports.clearLicenseCache = clearLicenseCache;
exports.generateLicenseKey = generateLicenseKey; // Export để test
