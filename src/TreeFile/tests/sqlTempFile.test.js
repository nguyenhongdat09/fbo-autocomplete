const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { createSqlTempFile, resolveSqlTempFolder, isAntigravityIde } = require("../../Utils/sqlTempFile");

function run() {
    console.log("=== Testing sqlTempFile (Antigravity Support) ===");

    const test_dir = path.join(os.tmpdir(), "fbo_sql_temp_test_" + Date.now());
    const mock_skills_dir = path.join(test_dir, "skills");
    fs.mkdirSync(mock_skills_dir, { recursive: true });

    try {
        // Test case 1: Non-Antigravity mode -> giữ nguyên folder_path
        const normal_folder = path.join(test_dir, "NormalSqlTemp");
        fs.mkdirSync(normal_folder, { recursive: true });
        const resolved_normal = resolveSqlTempFolder(normal_folder, false, mock_skills_dir);
        assert.strictEqual(resolved_normal, normal_folder);

        // Test case 2: Antigravity mode với đường dẫn 'E:\\SQL Temp'
        const fake_setting_path = "E:\\SQL Temp";
        const resolved_antigravity = resolveSqlTempFolder(fake_setting_path, true, mock_skills_dir);
        const expected_antigravity_dir = path.join(mock_skills_dir, "SQL Temp");
        assert.strictEqual(resolved_antigravity, expected_antigravity_dir);
        assert.strictEqual(fs.existsSync(resolved_antigravity), true, "Thư mục SQL Temp phải được tự động tạo");

        // Test case 3: Antigravity mode với đường dẫn có dấu gạch chéo cuối 'E:\\SQL Temp\\'
        const fake_setting_path_slash = "E:\\SQL Temp\\";
        const resolved_slash = resolveSqlTempFolder(fake_setting_path_slash, true, mock_skills_dir);
        assert.strictEqual(resolved_slash, expected_antigravity_dir);

        // Test case 4: Đã có thư mục SQL Temp rồi -> vẫn tiếp tục tạo file .sql vào đó
        const file1 = createSqlTempFile(resolved_antigravity, "TestVoucher", "SELECT 1;");
        assert.strictEqual(fs.existsSync(file1.filePath), true);
        assert.strictEqual(file1.fileName, "testvoucher.sql");
        assert.strictEqual(fs.readFileSync(file1.filePath, "utf8"), "SELECT 1;");

        // Test case 5: Tạo file tiếp theo trùng tên -> đánh số (2)
        const file2 = createSqlTempFile(resolved_antigravity, "TestVoucher", "SELECT 2;");
        assert.strictEqual(file2.fileName, "testvoucher (2).sql");
        assert.strictEqual(fs.existsSync(file2.filePath), true);

        // Test case 6: isAntigravityIde hàm chạy không bị exception
        const is_anti = isAntigravityIde();
        assert.strictEqual(typeof is_anti, "boolean");

        console.log("=== All sqlTempFile tests passed successfully! ===");
    } finally {
        try {
            fs.rmSync(test_dir, { recursive: true, force: true });
        } catch (e) {
            // ignore cleanup error
        }
    }
}

if (require.main === module) {
    run();
}

module.exports = { run };
