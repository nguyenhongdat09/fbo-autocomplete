// Test thuần node cho findTitleCaseFix — chạy: node scratch/test_dirtitlecase.js
const { findTitleCaseFix } = require('../src/DirTitleCase/registerDirTitleCase');

let pass = 0, fail = 0;
function check(name, cond) {
    if (cond) { pass++; console.log(`  PASS ${name}`); }
    else { fail++; console.log(`  FAIL ${name}`); }
}
function applyFix(text, fix) {
    return text.slice(0, fix.offset) + fix.newChar + text.slice(fix.offset + 1);
}

// 1. Title đã đúng → null
check('lowercase ok -> null',
    findTitleCaseFix('<dir><title v="hóa đơn" e="Invoice"></title></dir>') === null);

// 2. Hoa đầu → fix 'H' -> 'h'
{
    const s = '<dir><title v="Hóa đơn" e="Invoice"></title></dir>';
    const fix = findTitleCaseFix(s);
    check('uppercase -> fix', fix !== null && fix.oldChar === 'H' && fix.newChar === 'h');
    check('apply -> lowercase', fix && applyFix(s, fix) === '<dir><title v="hóa đơn" e="Invoice"></title></dir>');
}

// 3. Unicode Đ -> đ
{
    const s = '<dir><title v="Điều chỉnh" e="Adj"></title></dir>';
    const fix = findTitleCaseFix(s);
    check('unicode Đ -> đ', fix && fix.newChar === 'đ' && applyFix(s, fix).includes('v="điều chỉnh"'));
}

// 4. Attr order đảo (e trước v)
{
    const s = '<title e="Invoice" v="Hóa đơn"></title>';
    const fix = findTitleCaseFix(s);
    check('attr order e trước v', fix && applyFix(s, fix).includes('v="hóa đơn"'));
}

// 5. Viết tắt toàn hoa -> vẫn hạ ký tự đầu (theo quyết định user)
{
    const s = '<title v="BCTC" e="x"></title>';
    const fix = findTitleCaseFix(s);
    check('BCTC -> bCTC', fix && applyFix(s, fix).includes('v="bCTC"'));
}

// 6. Không có <title> -> null
check('no title -> null', findTitleCaseFix('<dir table="m81"></dir>') === null);

// 7. v rỗng -> null
check('v empty -> null', findTitleCaseFix('<title v="" e="x"></title>') === null);

// 8. v là entity &X; -> null (ký tự đầu không phải chữ cái)
check('v entity -> null', findTitleCaseFix('<title v="&Title;" e="x"></title>') === null);

// 9. Chỉ sửa title ĐẦU TIÊN khi có nhiều title
{
    const s = '<title v="Hóa đơn"></title><title v="Toolbar.X"></title>';
    const fix = findTitleCaseFix(s);
    const out = applyFix(s, fix);
    check('first title fixed, second kept',
        out === '<title v="hóa đơn"></title><title v="Toolbar.X"></title>');
}

// 10. Title ở sâu trong file (giống SVTran: DOCTYPE dài phía trước)
{
    const s = '<?xml version="1.0"?>\n<!DOCTYPE dir []>\n<dir table="m81$000000">\n  <title v="Hóa đơn" e="Invoice"></title>';
    const fix = findTitleCaseFix(s);
    check('title deep in doc', fix && applyFix(s, fix).includes('v="hóa đơn"'));
}

// 11. Idempotent: chạy lại sau fix -> null
{
    const s = '<title v="Hóa đơn"></title>';
    const once = applyFix(s, findTitleCaseFix(s));
    check('idempotent', findTitleCaseFix(once) === null);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
