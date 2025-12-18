import { parentPort } from "worker_threads";

parentPort?.on("message", async (msg) => {
    const { jobId, payload } = msg;
    try {
        parentPort?.postMessage({ jobId, status: "done" });
    } catch (err) {
        parentPort?.postMessage({ jobId, status: "error", error: String(err) });
    }
});
