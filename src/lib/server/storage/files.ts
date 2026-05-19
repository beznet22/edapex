import { Files } from 'files-sdk';
import { fs } from 'files-sdk/fs';
import path from 'path';

export const workspaceFiles = new Files({
  adapter: fs({ root: path.join(process.cwd(), '.workspaces') })
});
