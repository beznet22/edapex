/**
 * Workspace file storage — files-sdk adapter
 *
 * Provides a shared `Files` instance backed by the local `.workspaces/`
 * directory via the files-sdk `fs` adapter. The `FilesSDKFilesystem` class
 * (in `mastra/workspaces/files-sdk-filesystem.ts`) wraps this `Files`
 * instance with the `MastraFilesystem` interface so it can be plugged
 * into a Mastra `Workspace` directly.
 */
import { Files } from 'files-sdk';
import { fs } from 'files-sdk/fs';
import path from 'path';

export const workspaceFiles = new Files({
  adapter: fs({ root: path.join(process.cwd(), '.workspaces') })
});

export { FilesSDKFilesystem } from './workspaces/files-sdk-filesystem';
