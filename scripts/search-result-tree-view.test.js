const assert = require("node:assert/strict");
const Module = require("node:module");

const original_load = Module._load;
const calls = [];
let open_handler = null;

const vscode_stub = {
    EventEmitter: class {
        constructor() {
            this.event = () => { };
        }

        fire() { }
    },
    window: {
        createTreeView() {
            return { dispose() { } };
        },
    },
    commands: {
        registerCommand(_command, handler) {
            open_handler = handler;
            return { dispose() { } };
        },
        async executeCommand(command) {
            calls.push(command);
        },
    },
};

Module._load = function (request, parent, is_main) {
    if (request === "vscode") {
        return vscode_stub;
    }
    return original_load.call(this, request, parent, is_main);
};

async function run() {
    const SearchResultTreeView = require("../src/TreeFile/SearchFile/SearchResultTreeView");
    const view = new SearchResultTreeView();
    view.setBeforeOpenFile(() => {
        calls.push("tree");
    });
    view.run({ subscriptions: [] });

    assert.equal(typeof open_handler, "function");
    await open_handler({ fsPath: "C:\\CustomerPro\\A\\App\\x.xml" });
    assert.deepEqual(calls, ["tree", "vscode.open"]);
}

run()
    .then(() => console.log("search-result-tree-view test passed"))
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => {
        Module._load = original_load;
    });
