const test1 = require('./FormulaAstParser.test');
const test2 = require('./GaFormulaMapAggregate.test');
const test3 = require('./ScenarioParser.test');
const test4 = require('./FormulaModelBuilder.test');
const test5 = require('./FormulaLinter.test');

async function runAll() {
    console.log('=== STARTING FORMULA PREVIEW TESTS ===');

    test1.run();
    test2.run();
    test3.run();
    test4.run();
    test5.run();

    console.log('=== ALL FORMULA PREVIEW TESTS PASSED SUCCESSFULLY ===');
}

runAll().catch(err => {
    console.error('Formula Preview tests failed:', err);
    process.exit(1);
});
