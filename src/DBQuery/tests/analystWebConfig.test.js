const assert = require("assert");
const AnalystWebConfig = require("../analystWebConfig");

function run() {
    console.log("analystWebConfig: stripDbSuffix + candidates");

    assert.strictEqual(AnalystWebConfig.stripDbSuffix("SP2261_A"), "SP2261");
    assert.strictEqual(AnalystWebConfig.stripDbSuffix("SP2261_App"), "SP2261");
    assert.strictEqual(AnalystWebConfig.stripDbSuffix("SP2261_S"), "SP2261");
    assert.strictEqual(AnalystWebConfig.stripDbSuffix("SP2261_Sys"), "SP2261");

    assert.deepStrictEqual(
        AnalystWebConfig.buildAppCandidates("SP2261_Sys"),
        ["SP2261_A", "SP2261_App"]
    );
    assert.deepStrictEqual(
        AnalystWebConfig.buildSysCandidates("SP2261_App"),
        ["SP2261_S", "SP2261_Sys"]
    );

    console.log("analystWebConfig: pickWorkingDatabase prefers first live candidate");
}

async function runAsync() {
    const fake_conn = { server: "x", user: "u", password: "p", database: "SP2261_Sys" };

    const pick_a = await AnalystWebConfig.pickWorkingDatabase(
        fake_conn,
        ["SP2261_A", "SP2261_App"],
        async (info) => info.database === "SP2261_A"
    );
    assert.strictEqual(pick_a, "SP2261_A");

    const pick_app = await AnalystWebConfig.pickWorkingDatabase(
        fake_conn,
        ["SP2261_A", "SP2261_App"],
        async (info) => info.database === "SP2261_App"
    );
    assert.strictEqual(pick_app, "SP2261_App");

    const pick_s = await AnalystWebConfig.pickWorkingDatabase(
        fake_conn,
        ["SP2261_S", "SP2261_Sys"],
        async (info) => info.database === "SP2261_S"
    );
    assert.strictEqual(pick_s, "SP2261_S");

    const pick_sys = await AnalystWebConfig.pickWorkingDatabase(
        fake_conn,
        ["SP2261_S", "SP2261_Sys"],
        async (info) => info.database === "SP2261_Sys"
    );
    assert.strictEqual(pick_sys, "SP2261_Sys");

    // Cả hai fail → giữ candidate đầu
    const pick_fallback = await AnalystWebConfig.pickWorkingDatabase(
        fake_conn,
        ["SP2261_A", "SP2261_App"],
        async () => false
    );
    assert.strictEqual(pick_fallback, "SP2261_A");

    // Không retry vô hạn: mỗi tên DB chỉ probe đúng 1 lần (tối đa 2 lần gọi)
    const probe_calls = [];
    await AnalystWebConfig.pickWorkingDatabase(
        fake_conn,
        ["SP2261_A", "SP2261_App"],
        async (info) => {
            probe_calls.push(info.database);
            return false;
        }
    );
    assert.deepStrictEqual(probe_calls, ["SP2261_A", "SP2261_App"]);

    const analyst = new AnalystWebConfig();
    analyst.dbConnections = {
        sys: { server: "srv", user: "u", password: "p", database: "Foo_Sys" },
        app: { server: "srv", user: "u", password: "p", database: "Foo_Sys" }
    };
    await analyst.resolveDbSuffixes(async (info) => info.database === "Foo_App" || info.database === "Foo_Sys");
    assert.strictEqual(analyst.dbConnections.app.database, "Foo_App");
    assert.strictEqual(analyst.dbConnections.sys.database, "Foo_Sys");

    console.log("analystWebConfig: async pick/resolve OK");
}

module.exports = { run, runAsync };

if (require.main === module) {
    run();
    runAsync()
        .then(() => {
            console.log("ALL analystWebConfig tests passed");
        })
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}
