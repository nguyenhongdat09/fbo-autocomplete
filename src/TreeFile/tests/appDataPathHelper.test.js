const assert = require("assert");
const AppDataPathHelper = require("../AppDataPathHelper");

function run() {
    console.log("=== Testing AppDataPathHelper ===");

    // Test case 1: Mapped drive z:\FBO\TTCIZ\SP22621
    const mapped_helper = new AppDataPathHelper("z:\\FBO\\TTCIZ\\SP22621\\App_Data\\Controllers\\Dir\\AITran.xml");
    assert.strictEqual(mapped_helper.getBaseProjectPath(), "z:\\FBO\\TTCIZ\\SP22621");
    assert.strictEqual(mapped_helper.getGroupName(), "TTCIZ - SP22621");
    const mapped_parts = mapped_helper.getPathAfterProject();
    assert.strictEqual(mapped_parts[0], "z:\\FBO\\TTCIZ\\SP22621");
    assert.strictEqual(mapped_parts[1], "App_Data\\Controllers\\Dir\\AITran.xml");

    // Test case 2: UNC path \\172.168.5.14\CustomerPro\FBO\TTCIZ\SP22621
    const unc_helper = new AppDataPathHelper("\\\\172.168.5.14\\CustomerPro\\FBO\\TTCIZ\\SP22621\\App_Data\\Controllers\\Dir\\AITran.xml");
    assert.strictEqual(unc_helper.getBaseProjectPath(), "\\\\172.168.5.14\\CustomerPro\\FBO\\TTCIZ\\SP22621");
    assert.strictEqual(unc_helper.getGroupName(), "TTCIZ - SP22621");
    const unc_parts = unc_helper.getPathAfterProject();
    assert.strictEqual(unc_parts[0], "\\\\172.168.5.14\\CustomerPro\\FBO\\TTCIZ\\SP22621");
    assert.strictEqual(unc_parts[1], "App_Data\\Controllers\\Dir\\AITran.xml");

    // Test case 3: Mapped drive direct root z:\TTCIZ\SP22621
    const direct_helper = new AppDataPathHelper("z:\\TTCIZ\\SP22621\\App_Data\\Controllers\\Dir\\AITran.xml");
    assert.strictEqual(direct_helper.getBaseProjectPath(), "z:\\TTCIZ\\SP22621");
    assert.strictEqual(direct_helper.getGroupName(), "TTCIZ - SP22621");

    // Test case 4: UNC path FDN
    const fdn_helper = new AppDataPathHelper("\\\\172.168.5.14\\CustomerPro\\FDN\\CONGTY\\SP22\\App_Data\\Controllers\\Dir\\AITran.xml");
    assert.strictEqual(fdn_helper.getGroupName(), "CONGTY - SP22");

    // Test case 5: Cursor plan file in C:\Users\Windows 10\.cursor\plans\
    const plan_helper = new AppDataPathHelper("C:\\Users\\Windows 10\\.cursor\\plans\\some-feature.plan.md");
    assert.strictEqual(plan_helper.getBaseProjectPath(), "");
    assert.strictEqual(plan_helper.getGroupName(), "Other");

    // Test case 6: Direct plan.md file
    const plan_md_helper = new AppDataPathHelper("e:\\workspace\\.cursor\\plans\\plan.md");
    assert.strictEqual(plan_md_helper.getBaseProjectPath(), "");
    assert.strictEqual(plan_md_helper.getGroupName(), "Other");

    // Test case 7: Antigravity/Gemini implementation_plan.md
    const gemini_helper = new AppDataPathHelper("c:\\Users\\Windows 10\\.gemini\\antigravity-ide\\brain\\2ffc8dbc-714f-4c86-82b5-ad4f3ea4c59a\\implementation_plan.md");
    assert.strictEqual(gemini_helper.getBaseProjectPath(), "");
    assert.strictEqual(gemini_helper.getGroupName(), "Other");

    console.log("=== All AppDataPathHelper tests passed! ===");
}

module.exports = { run };

if (require.main === module) {
    run();
}
