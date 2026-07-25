const assert = require('assert');
const path = require('path');
const TextBlockMerger = require('../TextBlockMerger');

function run() {
    console.log('Running TextBlockMerger tests...');

    const entities = {
        'SubEntity': { value: 'line FROM ENTITY', sourceFile: 'fake_file.xml' },
        'ExternalInitVoucherNumber': {
            value: 'declare @voucherBook varchar(32)',
            sourceFile: 'fake_file.xml'
        }
    };

    // Test 1: CDATA + entity xen kẽ
    const text_inner = `
    <![CDATA[
line A
]]>
    &SubEntity;
    <![CDATA[
line B
]]>
    `;

    const model = TextBlockMerger.mergeTextBlock(text_inner, 'fake_file.xml', entities);

    const expected_text = '\n    \nline A\n\n    line FROM ENTITY\n    \nline B\n\n    ';
    assert.strictEqual(model.merged_text, expected_text);

    assert.strictEqual(model.spans.length, 1);
    assert.strictEqual(model.spans[0].entity_name, 'SubEntity');
    assert.strictEqual(model.spans[0].start, 18);
    assert.strictEqual(model.spans[0].end, 34);
    assert.strictEqual(model.spans[0].depth, 0);

    // Test 2: Entity rỗng (bỏ qua)
    const text_inner_empty = `
    <![CDATA[line A]]>
    &EmptyEntity;
    <![CDATA[line B]]>
    `;
    const entities_empty = {
        'EmptyEntity': { value: '  ', sourceFile: 'fake_file.xml' }
    };
    const model_empty = TextBlockMerger.mergeTextBlock(text_inner_empty, 'fake_file.xml', entities_empty);
    assert.strictEqual(model_empty.merged_text, '\n    line A\n      \n    line B\n    ');
    assert.strictEqual(model_empty.spans.length, 1);

    // Test 3: Entity lồng nhau
    const text_nested = `&ParentEntity;`;
    const entities_nested = {
        'ParentEntity': { value: 'Parent &ChildEntity; Content', sourceFile: 'fake_file.xml' },
        'ChildEntity': { value: 'ChildValue', sourceFile: 'fake_file.xml' }
    };
    const model_nested = TextBlockMerger.mergeTextBlock(text_nested, 'fake_file.xml', entities_nested);
    assert.strictEqual(model_nested.merged_text, 'Parent ChildValue Content');
    assert.strictEqual(model_nested.spans.length, 2);
    const parent_span = model_nested.spans.find(s => s.entity_name === 'ParentEntity');
    const child_span = model_nested.spans.find(s => s.entity_name === 'ChildEntity');
    assert.ok(parent_span);
    assert.ok(child_span);
    assert.strictEqual(parent_span.depth, 0);
    assert.strictEqual(child_span.depth, 1);
    assert.strictEqual(child_span.start, 7);
    assert.strictEqual(child_span.end, 17);

    // Test 4: Entity liền CDATA (InitExternalFields pattern)
    const text_entity_cdata = '&ExternalInitVoucherNumber;<![CDATA[\nreturn\n]]>';
    const model_ec = TextBlockMerger.mergeTextBlock(text_entity_cdata, 'fake_file.xml', entities);
    assert.strictEqual(
        model_ec.merged_text,
        'declare @voucherBook varchar(32)\nreturn\n'
    );
    assert.strictEqual(model_ec.spans.length, 1);
    assert.strictEqual(model_ec.spans[0].entity_name, 'ExternalInitVoucherNumber');
    const entity_slice = model_ec.merged_text.substring(
        model_ec.spans[0].start,
        model_ec.spans[0].end
    );
    assert.strictEqual(entity_slice, 'declare @voucherBook varchar(32)');

    console.log('  ✓ TextBlockMerger tests passed!');
}

module.exports = { run };
