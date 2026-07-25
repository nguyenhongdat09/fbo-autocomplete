const path = require('path');

async function runAllTests() {
    console.log('=== STARTING XML FLAT PREVIEW TESTS ===');
    
    // Import các test suites
    const tokenizer_tests = require('../src/ReadXMLByJS/XmlFlatPreview/tests/XmlSegmentTokenizer.test');
    const merger_tests = require('../src/ReadXMLByJS/XmlFlatPreview/tests/TextBlockMerger.test');
    const expander_tests = require('../src/ReadXMLByJS/XmlFlatPreview/tests/XmlEntityExpander.test');
    
    // Chạy các test
    tokenizer_tests.run();
    merger_tests.run();
    expander_tests.run();
    
    console.log('=== ALL TESTS PASSED SUCCESSFULLY ===');
}

runAllTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
