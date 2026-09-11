const path = require('path');

async function run_all_tests() {
    console.log('========================================');
    console.log('Running all ConvertExcelFromUpload tests');
    console.log('========================================\n');

    const tests = [
        './UploadVersionDetector.test.js',
        './UploadFieldsParser.test.js',
        './SearchPrefixDeriver.test.js',
        './DirGridHeaderCatalog.test.js',
        './UploadExcelExporter.test.js'
    ];

    let passed_count = 0;
    let failed_count = 0;

    for (const test_file of tests) {
        try {
            const test_mod = require(test_file);
            if (typeof test_mod.run_test === 'function') {
                await test_mod.run_test();
            }
            passed_count++;
        } catch (err) {
            console.error(`✗ FAILED: ${test_file}`);
            console.error(err);
            failed_count++;
        }
        console.log('');
    }

    console.log('========================================');
    console.log(`Summary: ${passed_count} passed, ${failed_count} failed`);
    console.log('========================================');

    if (failed_count > 0) {
        process.exit(1);
    }
}

if (require.main === module) {
    run_all_tests().catch(err => {
        console.error('Fatal runner error:', err);
        process.exit(1);
    });
}

module.exports = { run_all_tests };
