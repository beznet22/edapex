// Classification probe: does `createSyncAccessHandle` work in a dedicated
// worker at all, independently of our runtime and SQLite build.
self.onmessage = async () => {
  try {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle("edapex-opfs-probe", { create: true });
    const file = await directory.getFileHandle("probe.txt", { create: true });
    const handle = await file.createSyncAccessHandle();
    const written = handle.write(new Uint8Array([104, 105]), { at: 0 });
    handle.flush();
    const buffer = new Uint8Array(2);
    const read = handle.read(buffer, { at: 0 });
    handle.close();
    self.postMessage({ ok: true, written, read, text: String.fromCharCode(...buffer) });
  } catch (error) {
    self.postMessage({ ok: false, name: error instanceof Error ? error.name : "unknown", error: String(error) });
  }
};
