const assert = require('assert');
const path = require('path');
const fs = require('fs');
const XmlEntityExpander = require('../XmlEntityExpander');
const entityResolver = require('../../entityResolver');

const fixtures_dir = path.join(__dirname, 'fixtures');

function run() {
    console.log('Running XmlEntityExpander tests...');

    // Test 1: Simple internal entity outside text (fallback mode)
    const file1 = path.join(fixtures_dir, 'simple-entities.xml');
    const text1 = entityResolver.readFileContent(file1);
    const model1 = XmlEntityExpander.expandXmlEntities(file1, text1);
    assert.strictEqual(model1.flat_text.includes('<t>hello</t>'), true);
    assert.strictEqual(model1.spans.length, 1);

    // Test 2: Nested entity outside text (fallback mode)
    const file2 = path.join(fixtures_dir, 'nested-entities.xml');
    const text2 = entityResolver.readFileContent(file2);
    const model2 = XmlEntityExpander.expandXmlEntities(file2, text2);
    assert.strictEqual(model2.flat_text.includes('<t>A-B-Z</t>'), true);
    assert.strictEqual(model2.spans.length, 2);
    const spanA = model2.spans.find(s => s.depth === 0);
    const spanB = model2.spans.find(s => s.depth === 1);
    assert.strictEqual(spanB.root_entity_name, spanA.entity_name);
    assert.strictEqual(spanB.root_source_line, spanA.source_line);
    assert.strictEqual(model2.stats.unique_entities.includes('b'), true);

    // Test 3: Command text merge (Mode 1)
    const file3 = path.join(fixtures_dir, 'command-text-merge.xml');
    const text3 = entityResolver.readFileContent(file3);
    const model3 = XmlEntityExpander.expandXmlEntities(file3, text3);
    
    // Kiểm tra xem thẻ <text> đã được gộp thành 1 CDATA chưa
    assert.strictEqual(model3.flat_text.includes('<text><![CDATA['), true);
    assert.strictEqual(model3.spans.length, 1);
    const span = model3.spans[0];
    assert.strictEqual(span.entity_name, 'SubEntity');
    
    // Kiểm tra xem tọa độ span có trỏ đúng vào đoạn "line FROM ENTITY" trong flat_text không
    const slice = model3.flat_text.substring(span.start, span.end);
    assert.strictEqual(slice, 'line FROM ENTITY');

    // Test 4: Missing entity inside text block
    const file4 = path.join(fixtures_dir, 'missing-entity.xml');
    const text4 = `
    <command>
      <text>&NotExist;</text>
    </command>
    `;
    const model4 = XmlEntityExpander.expandXmlEntities(file4, text4);
    assert.strictEqual(model4.warnings.length > 0, true);
    assert.strictEqual(model4.warnings[0].code, 'MISSING_ENTITY');
    assert.strictEqual(model4.spans.length, 1);
    assert.strictEqual(model4.spans[0].missing, true);

    // Test 5: Entity chứa ]]> — span global phải khớp slice trong flat_text
    const file5 = path.join(fixtures_dir, 'command-text-cdata-escape.xml');
    const text5 = entityResolver.readFileContent(file5);
    const model5 = XmlEntityExpander.expandXmlEntities(file5, text5);
    const span5 = model5.spans.find(function(s) { return s.depth === 0 && s.entity_name === 'EntCdata'; });
    assert.ok(span5, 'Phải có span EntCdata depth 0');
    const slice5 = model5.flat_text.substring(span5.start, span5.end);
    assert.strictEqual(slice5, 'bad ]]&gt;\nmore\n');

    // Test 6: Entity có leading whitespace — span depth 0 phải khớp nội dung nguyên gốc (không còn trim)
    const TextBlockMerger = require('../TextBlockMerger');
    const merged6 = TextBlockMerger.mergeTextBlock('&Parent;', 'fake.xml', {
        Parent: { value: '  declare @x  ', sourceFile: 'fake.xml' }
    });
    assert.strictEqual(merged6.merged_text, '  declare @x  ');
    assert.strictEqual(merged6.spans[0].start, 0);
    assert.strictEqual(merged6.spans[0].end, 14);

    console.log('  ✓ XmlEntityExpander tests passed!');
}

module.exports = { run };
