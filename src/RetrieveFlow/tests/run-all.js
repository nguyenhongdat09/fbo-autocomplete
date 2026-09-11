const test1 = require('./deriveFormInput.test');
const test2 = require('./FormInputValidator.test');
const test3 = require('./XmlTemplateRenderer.test');
const test4 = require('./SqlTemplateRenderer.test');
const test5 = require('./translateHelper.test');

async function runAll() {
    console.log('=== STARTING RETRIEVE FLOW DESIGNER TESTS ===');

    test1.run();
    test2.run();
    test3.run();
    test4.run();
    await test5.run();

    console.log('=== ALL RETRIEVE FLOW TESTS PASSED SUCCESSFULLY ===');
}

if (require.main === module) {
    runAll().catch(err => {
        console.error('Retrieve Flow tests failed:', err);
        process.exit(1);
    });
}

module.exports = { runAll };
