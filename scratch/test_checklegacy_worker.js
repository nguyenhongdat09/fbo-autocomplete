// @ts-nocheck
// Smoke test: chạy CheckLegacyWorker trong worker_threads thật với mini-dir.xml
const fs = require("fs");
const path = require("path");
const { Worker } = require("worker_threads");

const filePath = path.resolve("src/PreviewForm/tests/fixtures/mini-dir.xml");
const content = fs.readFileSync(filePath, "utf8");
const doctypeMatch = content.match(/<!DOCTYPE\s+\w+[\s\S]*?\[[\s\S]*?\]\s*>/i);
const doctype = doctypeMatch ? doctypeMatch[0] : "";

const w = new Worker(path.resolve("src/CheckLegacy/CheckLegacyWorker.js"));

const t0 = Date.now();
w.on("message", (msg) => {
    console.log(`== response (${Date.now() - t0}ms, worker ${msg.elapsed}ms) ==`);
    console.log(`diags: ${msg.diags.length}`);
    for (const d of msg.diags.slice(0, 10)) {
        console.log(`  line ${d.sl + 1}: [sev ${d.severity}] ${d.message}`);
    }
    if (msg.errors && msg.errors.length) console.log("errors:", msg.errors);
    if (msg.error) { console.error("WORKER ERROR:", msg.error); process.exit(1); }
    w.terminate().then(() => { console.log("WORKER TEST PASSED"); process.exit(0); });
});
w.on("error", (e) => { console.error("worker error:", e); process.exit(1); });
w.postMessage({ type: "check", id: 1, filePath, content, isGrid: false, doctype });
