const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Bắt đầu khôi phục trạng thái cho fbo-autocomplete...');

try {
    console.log('\n1. Khôi phục package.json, package-lock.json, .vscodeignore từ git...');
    execSync('git restore package.json package-lock.json .vscodeignore', { stdio: 'inherit' });
    console.log('✓ Khôi phục thành công các file cấu hình.');
} catch (e) {
    console.log('⚠ Lỗi khi khôi phục từ git (có thể các file không bị thay đổi).');
}

const nmPath = path.resolve(__dirname, 'node_modules');
const nmStash = path.resolve(__dirname, 'node_modules.__fbo_packaging__');

console.log('\n2. Kiểm tra node_modules bị cất tạm...');
if (fs.existsSync(nmStash)) {
    try {
        if (fs.existsSync(nmPath)) {
            fs.rmSync(nmPath, { recursive: true, force: true });
        }
        fs.renameSync(nmStash, nmPath);
        console.log('✓ Đã khôi phục node_modules.__fbo_packaging__ thành node_modules.');
    } catch (e) {
        console.error('❌ Lỗi khi khôi phục node_modules:', e.message);
    }
} else {
    console.log('✓ Không tìm thấy thư mục tạm node_modules.__fbo_packaging__, bỏ qua.');
}

// Cleanup temporary package json and lock
const cleanupFiles = [
    'package.json.__fbo_writing__',
    'package-lock.json.__fbo_packaging__',
    '.vscodeignore.__fbo_packaging__'
];

console.log('\n3. Dọn dẹp các file tạm còn sót lại (nếu có)...');
cleanupFiles.forEach(file => {
    const fPath = path.resolve(__dirname, file);
    if (fs.existsSync(fPath)) {
        try {
            fs.unlinkSync(fPath);
            console.log(`✓ Đã xóa file rác: ${file}`);
        } catch (e) {
            console.error(`❌ Không thể xóa ${file}:`, e.message);
        }
    }
});

console.log('\n✅ Đã fix xong. Bây giờ bạn có thể chạy lại lệnh đóng gói:');
console.log('   node build-package.js');
