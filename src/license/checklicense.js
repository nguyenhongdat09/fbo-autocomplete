const CryptoJS = require("crypto-js");
const https = require('https');
const crypto = require('crypto');
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const encrypted = 'U2FsdGVkX18ll/362ncJIN0YRq9ru+8OKr1vUV6dsW+8GfHuXKDXGgv509sY5av/I2T55u4XXGisvnBVTLDBuGwkEM/tOGoWuxk5Tc8jqBsZn25dGWVpnkRzqYSOAt8u';
const bytes = CryptoJS.AES.decrypt(encrypted, 'datnh');
const licenseUrl = bytes.toString(CryptoJS.enc.Utf8);
const { machineIdSync } = require('node-machine-id');
const rawId = machineIdSync(false);

// ✅ CONFIG
const LICENSE_FILE_NAME = 'fbo-license.dat';
const ENCRYPTION_KEY = 'fbo-toolkit-secret-key-2025-v2';
const CACHE_DAYS = 30;
const REQUEST_TIMEOUT = 5000;

/**
 * ✅ Lấy đường dẫn folder Database (giống DatabaseRender)
 */
function getDatabasePath() {
    return path.resolve(__dirname, '..', 'Database');
}
let storagePath;

function initStorage(context) {
    storagePath = context.globalStorageUri.fsPath;
    if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
    }
}

function getLicenseFilePath() {
    return path.join(storagePath, LICENSE_FILE_NAME);
}
/**
 * ✅ Lấy đường dẫn file license
 */
/*
function getLicenseFilePath() {
    const databaseDir = getDatabasePath();
    // Tạo folder Database nếu chưa tồn tại
    if (!fs.existsSync(databaseDir)) {
        fs.mkdirSync(databaseDir, { recursive: true });
    }
    const filePath = path.join(databaseDir, LICENSE_FILE_NAME);
    return filePath;
}
*/
/**
 * Mã hóa data bằng AES-256
 */
function encryptData(data) {
    return CryptoJS.AES.encrypt(data, ENCRYPTION_KEY).toString();
}

/**
 * Giải mã data
 */
function decryptData(encrypted) {
    try {
        const bytes = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY);
        return bytes.toString(CryptoJS.enc.Utf8);
    } catch (e) {
        console.error('Decrypt error:', e);
        return null;
    }
}

/**
 * Đọc license từ file
 * Format sau giải mã: "machineId,timestamp"
 */
function readLicenseFile() {
    const filePath = getLicenseFilePath();

    if (!fs.existsSync(filePath)) {
        console.log('📄 License file not found');
        return null;
    }

    try {
        const encryptedContent = fs.readFileSync(filePath, 'utf8');
        const decrypted = decryptData(encryptedContent);

        if (!decrypted) {
            console.warn('⚠️ Failed to decrypt license file');
            return null;
        }

        const parts = decrypted.split(',');
        if (parts.length !== 2) {
            console.warn('⚠️ Invalid license file format');
            return null;
        }

        const [storedId, timestamp] = parts;
        return {
            machineId: storedId,
            expireTime: parseInt(timestamp, 10)
        };
    } catch (e) {
        console.error('Read license file error:', e);
        return null;
    }
}

/**
 * Ghi license vào file
 */
function writeLicenseFile(machineId, expireTime) {
    const filePath = getLicenseFilePath();

    try {
        const data = `${machineId},${expireTime}`;
        const encrypted = encryptData(data);
        fs.writeFileSync(filePath, encrypted, 'utf8');
        const fileSize = fs.statSync(filePath).size;
        return true;
    } catch (e) {
        console.error('❌ Write license file error:', e);
        return false;
    }
}

/**
 * Tính expireTime = now + 30 ngày
 */
function getExpireTime() {
    return Date.now() + (CACHE_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Check license từ server
 */
function checkLicenseFromServer() {
    return new Promise((resolve) => {

        const request = https.get(licenseUrl, (res) => {
            let data = '';

            res.on('data', chunk => data += chunk);

            res.on('end', () => {

                try {
                    const json = JSON.parse(data);

                    if (!json.active || !Array.isArray(json.allowedIds)) {
                        return resolve({ valid: false, machineId: null });
                    }
                    // Tìm machineId hợp lệ
                    let validMachineId = null;
                    const valid = json.allowedIds.some(([_, rawKey]) => {
                    const hashed = crypto.createHash('sha256').update(rawKey).digest('hex');
                    console.log('rawId:', rawId);
                    console.log('hashed:', hashed);
                        if (hashed === rawId) {
                            validMachineId = rawKey;
                            return true;
                        }
                        return false;
                    });

                    if (!valid) {
                        vscode.window.showErrorMessage('❌ Invalid FBO license key');
                    }

                    return resolve({ valid, machineId: validMachineId });

                } catch (e) {
                    console.error('License parse error:', e);
                    return resolve({ valid: false, machineId: null });
                }
            });
        });

        // Timeout handler
        request.setTimeout(REQUEST_TIMEOUT, () => {
            console.warn(`⚠️ License API timeout after ${REQUEST_TIMEOUT}ms`);
            request.destroy();
            return resolve({ valid: false, machineId: null, timeout: true });
        });

        // Error handler
        request.on('error', (e) => {
            console.error('License API error:', e.message);
            return resolve({ valid: false, machineId: null, error: true });
        });
    });
}

/**
 * ✅ Main check license function
 */
async function checkLicense() {
    console.log(rawId);
    // ✅ BƯỚC 1: Đọc file license
    const licenseData = readLicenseFile();

    if (licenseData) {
        const now = Date.now();
        const timeLeft = licenseData.expireTime - now;

        // ✅ BƯỚC 2: Kiểm tra expireTime
        if (now < licenseData.expireTime) {
            // ✅ BƯỚC 3: Verify machineId
            const hashed = crypto.createHash('sha256')
                .update(licenseData.machineId)
                .digest('hex');

            if (hashed === rawId) {
                const daysLeft = Math.ceil(timeLeft / (24 * 60 * 60 * 1000));
                return true;
            } else {
                console.warn('⚠️ MachineId mismatch in license file');
            }
        } else {
            console.log('⏰ License file expired, checking server...');
        }
    } else {
        console.log('📄 No license file found, checking server...');
    }

    // ✅ BƯỚC 4: File không hợp lệ/hết hạn → Check server
    const result = await checkLicenseFromServer();

    if (result.timeout || result.error) {
        // Grace period 7 ngày khi server lỗi
        if (licenseData) {
            const gracePeriod = 7 * 24 * 60 * 60 * 1000;
            if (Date.now() < licenseData.expireTime + gracePeriod) {
                console.log('📦 Using expired license (grace period) due to server error');
                vscode.window.showWarningMessage(
                    'Cannot verify license. Using grace period.',
                    'OK'
                );
                return true;
            }
        }

        vscode.window.showErrorMessage('License verification failed. Please check internet connection.');
        return false;
    }

    if (result.valid && result.machineId) {
        // ✅ BƯỚC 5: Ghi license mới vào file
        const expireTime = getExpireTime();
        writeLicenseFile(result.machineId, expireTime);

        console.log(`✅ License verified and cached for ${CACHE_DAYS} days`);
        return true;
    }

    return false;
}

/**
 * Force refresh license (xóa file cũ và check lại)
 */
async function refreshLicense() {
    const filePath = getLicenseFilePath();
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            console.log('🗑️ Old license file deleted');
        } catch (e) {
            console.error('❌ Cannot delete license file:', e);
            return false;
        }
    }

    return await checkLicense();
}

/**
 * Clear license cache
 */
function clearLicenseCache() {
    const filePath = getLicenseFilePath();
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            return true;
        } catch (e) {
            console.error('❌ Cannot clear cache:', e);
            return false;
        }
    }
    console.log('📄 No license file to clear');
    return false;
}

exports.checkLicense = checkLicense;
exports.refreshLicense = refreshLicense;
exports.clearLicenseCache = clearLicenseCache;
exports.initStorage = initStorage;