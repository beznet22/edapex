/**
 * FilesSDKFilesystem — workspace adapter wrapping the files-sdk `Files` class
 *
 * Maps the 12-method `MastraFilesystem` interface onto the 5 high-level
 * operations exposed by `files-sdk` (`upload`, `download`, `delete`, `copy`,
 * `list`) plus the 7 lower-level operations implemented directly with
 * `fs.promises` against the adapter's `root`.
 *
 * Path containment is enforced by `MastraFilesystem`'s `contained: true`
 * default. Workspace-relative paths are translated to either:
 *   - files-sdk keys (for the 5 high-level methods), or
 *   - absolute disk paths under `root` (for fs.promises methods).
 */
import nodeFs from "node:fs/promises";
import nodePath from "node:path";
import { MastraFilesystem } from "@mastra/core/workspace";
import type {
  FileContent,
  FileEntry,
  FileStat,
  ListOptions,
  ReadOptions,
  RemoveOptions,
  WriteOptions,
} from "@mastra/core/workspace";
import { Files } from "files-sdk";

type Status = "pending" | "ready" | "error" | "initializing" | "destroying" | "destroyed";

export interface FilesSDKFilesystemOptions {
  id?: string;
  root: string;
  files: Files;
}

export class FilesSDKFilesystem extends MastraFilesystem {
  readonly id: string;
  readonly name = "FilesSDKFilesystem";
  readonly provider = "files-sdk";
  declare status: Status;
  declare error?: string;

  private readonly _root: string;
  private readonly _files: Files;

  constructor(options: FilesSDKFilesystemOptions) {
    super({ name: "FilesSDKFilesystem" });
    this.id = options.id ?? `files-sdk-${Math.random().toString(36).slice(2, 8)}`;
    this._root = nodePath.resolve(options.root);
    this._files = options.files;
    this.status = "pending";
  }

  private toKey(workspacePath: string): string {
    return workspacePath.replace(/^\/+/, "");
  }

  private toAbsolute(workspacePath: string): string {
    const key = this.toKey(workspacePath);
    const abs = key === "" ? this._root : nodePath.resolve(this._root, key);
    if (abs !== this._root && !abs.startsWith(this._root + nodePath.sep)) {
      throw new Error(`Path escapes workspace root: ${workspacePath}`);
    }
    return abs;
  }

  async init(): Promise<void> {
    await nodeFs.mkdir(this._root, { recursive: true });
    this.status = "ready";
  }

  async destroy(): Promise<void> {
    this.status = "destroyed";
  }

  async readFile(inputPath: string, options?: ReadOptions): Promise<string | Buffer> {
    const file = await this._files.download(this.toKey(inputPath), { as: "stream" });
    const stream = file.stream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream as unknown as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);
    if (options?.encoding) {
      return buf.toString(options.encoding);
    }
    return buf;
  }

  async writeFile(
    inputPath: string,
    content: FileContent,
    options?: WriteOptions,
  ): Promise<void> {
    const key = this.toKey(inputPath);
    if (options?.recursive) {
      await nodeFs.mkdir(nodePath.dirname(this.toAbsolute(inputPath)), { recursive: true });
    }
    const buf = Buffer.isBuffer(content)
      ? content
      : typeof content === "string"
        ? Buffer.from(content, "utf-8")
        : Buffer.from(content);
    await this._files.upload(key, buf, { contentType: options?.mimeType });
  }

  async appendFile(inputPath: string, content: FileContent): Promise<void> {
    const abs = this.toAbsolute(inputPath);
    await nodeFs.mkdir(nodePath.dirname(abs), { recursive: true });
    const buf = Buffer.isBuffer(content)
      ? content
      : typeof content === "string"
        ? Buffer.from(content, "utf-8")
        : Buffer.from(content);
    await nodeFs.appendFile(abs, buf);
  }

  async deleteFile(inputPath: string, _options?: RemoveOptions): Promise<void> {
    await this._files.delete(this.toKey(inputPath));
  }

  async copyFile(src: string, dest: string, _options?: { overwrite?: boolean }): Promise<void> {
    await this._files.copy(this.toKey(src), this.toKey(dest));
  }

  async moveFile(src: string, dest: string, _options?: { overwrite?: boolean }): Promise<void> {
    await this._files.copy(this.toKey(src), this.toKey(dest));
    await this._files.delete(this.toKey(src));
  }

  async mkdir(inputPath: string, options?: { recursive?: boolean }): Promise<void> {
    await nodeFs.mkdir(this.toAbsolute(inputPath), { recursive: options?.recursive ?? false });
  }

  async rmdir(inputPath: string, options?: RemoveOptions): Promise<void> {
    const abs = this.toAbsolute(inputPath);
    if (options?.recursive) {
      await nodeFs.rm(abs, { recursive: true, force: true });
    } else {
      await nodeFs.rmdir(abs);
    }
  }

  async readdir(inputPath: string, options?: ListOptions): Promise<FileEntry[]> {
    const startAbs = this.toAbsolute(inputPath);
    if (options?.recursive) {
      const out: FileEntry[] = [];
      const walk = async (abs: string): Promise<void> => {
        const entries = await nodeFs.readdir(abs, { withFileTypes: true });
        for (const ent of entries) {
          const childAbs = nodePath.join(abs, ent.name);
          const stat = await nodeFs.stat(childAbs);
          out.push({
            name: childAbs.slice(this._root.length + 1),
            type: ent.isDirectory() ? "directory" : "file",
            size: ent.isDirectory() ? undefined : stat.size,
            isSymlink: ent.isSymbolicLink(),
          });
          if (ent.isDirectory()) await walk(childAbs);
        }
      };
      await walk(startAbs);
      return out;
    }
    const entries = await nodeFs.readdir(startAbs, { withFileTypes: true });
    const out: FileEntry[] = [];
    for (const ent of entries) {
      const childAbs = nodePath.join(startAbs, ent.name);
      const stat = await nodeFs.stat(childAbs);
      out.push({
        name: ent.name,
        type: ent.isDirectory() ? "directory" : "file",
        size: stat.size,
        isSymlink: ent.isSymbolicLink(),
      });
    }
    return out;
  }

  async exists(inputPath: string): Promise<boolean> {
    try {
      await nodeFs.access(this.toAbsolute(inputPath));
      return true;
    } catch {
      return false;
    }
  }

  async stat(inputPath: string): Promise<FileStat> {
    const abs = this.toAbsolute(inputPath);
    const s = await nodeFs.stat(abs);
    return {
      name: nodePath.basename(abs),
      path: abs,
      type: s.isDirectory() ? "directory" : "file",
      size: s.size,
      createdAt: s.birthtime,
      modifiedAt: s.mtime,
    };
  }
}
