/* eslint-disable no-console */

const { parentPort, workerData } = require('worker_threads');
const AnalystXML = require(/* webpackIgnore: true */ './AnalystXML');
function postProgress(increment, message) {
    if (!parentPort) return;
    parentPort.postMessage({ type: 'progress', increment, message });
}

async function main() {
    const filePath = workerData && workerData.filePath;
    if (!filePath) {
        throw new Error('Missing workerData.filePath');
    }

    // Import lazily inside worker (worker thread: truyền userDatabaseRoot từ main).
    const analyst = new AnalystXML({
        userDatabaseRoot: workerData && workerData.userDatabaseRoot ? workerData.userDatabaseRoot : null,
    });
    const startedAt = Date.now();
    postProgress(0, 'Đang quét ASPX...');
    const aspxResults = await analyst.anl.run(filePath);

    postProgress(35, `Đã quét ASPX (${aspxResults ? aspxResults.length : 0})`);

    const projectFolderPath = analyst.createProjectFolder(filePath);
    if (!projectFolderPath) {
        throw new Error('Không thể tạo project folder');
    }

    postProgress(55, 'Đang tìm XML liên quan...');
    const xmlResults = await analyst.findXMLFilesForControllers(filePath, aspxResults);

    postProgress(80, `Đang lưu JSON (${xmlResults.length})...`);
    const success = await analyst.saveXmlResultsToJson(projectFolderPath, xmlResults);

    const durationMs = Date.now() - startedAt;

    if (!success) {
        throw new Error('Lưu JSON thất bại');
    }

    if (parentPort) {
        parentPort.postMessage({
            type: 'done',
            ok: true,
            projectFolderPath,
            xmlCount: xmlResults.length,
            durationMs,
        });
    }
}

main().catch((err) => {
    if (parentPort) {
        parentPort.postMessage({
            type: 'done',
            ok: false,
            error: {
                message: err && err.message ? err.message : String(err),
                stack: err && err.stack ? err.stack : undefined,
            },
        });
    }
});
