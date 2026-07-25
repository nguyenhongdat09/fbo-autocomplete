const assert = require('assert');
const XmlSegmentTokenizer = require('../XmlSegmentTokenizer');

function run() {
    console.log('Running XmlSegmentTokenizer tests...');

    // Test 1: Simple text and entity ref
    const tokens1 = XmlSegmentTokenizer.tokenize('<t>&x;</t>');
    assert.strictEqual(tokens1.length, 3);
    assert.strictEqual(tokens1[0].type, 'TEXT');
    assert.strictEqual(tokens1[0].content, '<t>');
    assert.strictEqual(tokens1[1].type, 'ENTITY_REF');
    assert.strictEqual(tokens1[1].entity_name, 'x');
    assert.strictEqual(tokens1[2].type, 'TEXT');
    assert.strictEqual(tokens1[2].content, '</t>');

    // Test 2: DOCTYPE block preservation
    const tokens2 = XmlSegmentTokenizer.tokenize('<!DOCTYPE t [<!ENTITY x "1">]><t>&x;</t>');
    assert.strictEqual(tokens2.length, 4);
    assert.strictEqual(tokens2[0].type, 'DOCTYPE');
    assert.strictEqual(tokens2[0].content, '<!DOCTYPE t [<!ENTITY x "1">]>');

    // Test 3: Predefined entities (should be treated as TEXT, not ENTITY_REF)
    const tokens3 = XmlSegmentTokenizer.tokenize('a &amp; b &lt; c');
    assert.strictEqual(tokens3.length, 1);
    assert.strictEqual(tokens3[0].type, 'TEXT');
    assert.strictEqual(tokens3[0].content, 'a &amp; b &lt; c');

    // Test 4: CDATA block
    const tokens4 = XmlSegmentTokenizer.tokenize('<![CDATA[ some &entity; inside ]]>');
    assert.strictEqual(tokens4.length, 1);
    assert.strictEqual(tokens4[0].type, 'CDATA');
    assert.strictEqual(tokens4[0].content, '<![CDATA[ some &entity; inside ]]>');

    // Test 5: Comment
    const tokens5 = XmlSegmentTokenizer.tokenize('<!-- comment with &entity; -->');
    assert.strictEqual(tokens5.length, 1);
    assert.strictEqual(tokens5[0].type, 'COMMENT');

    console.log('  ✓ XmlSegmentTokenizer tests passed!');
}

module.exports = { run };
