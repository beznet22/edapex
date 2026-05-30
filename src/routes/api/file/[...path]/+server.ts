import { json, type RequestHandler } from '@sveltejs/kit';
import { workspaceFiles } from '$lib/server/storage/files';

// Helper to construct the scoped path securely
function getScopedPath(url: URL, params: Record<string, string>) {
  const workspace = url.searchParams.get('workspace');
  if (!workspace) {
    throw new Error('Missing workspace constraint parameter');
  }
  
  // sanitize
  const cleanWorkspace = workspace.replace(/[^a-zA-Z0-9_\-]/g, '');
  const rawPath = params.path || '';
  // remove leading slashes to prevent traversing
  const cleanPath = rawPath.replace(/^\/+/, '').replace(/\.\.\//g, '');
  
  // Ensure we don't end up with trailing slash if cleanPath is empty
  // console.log("getScopedPath:", cleanWorkspace, cleanPath);
  return cleanPath ? `${cleanWorkspace}/${cleanPath}` : cleanWorkspace;
}

export const GET: RequestHandler = async ({ params, url }) => {
  try {
    const scopedPath = getScopedPath(url, params);
    const action = url.searchParams.get('action');

    // List contents
    if (action === 'list') {
      const result = await workspaceFiles.list({ prefix: scopedPath });
      
      // Strip bucket prefix so UI tree renders correctly
      if (result.items) {
         const prefixToStrip = scopedPath.endsWith('/') ? scopedPath : scopedPath + '/';
         result.items = result.items.map(item => ({
            ...item,
            key: item.key.startsWith(prefixToStrip) ? item.key.substring(prefixToStrip.length) : item.key
         })).filter(item => item.key.length > 0);
      }
      
      return json({ success: true, result });
    }

    // Default: Download / View
    const file = await workspaceFiles.download(scopedPath);
    return new Response(file.stream() as unknown as ReadableStream, {
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'Content-Length': file.size.toString(),
        'Cache-Control': 'public, max-age=3600'
      }
    });

  } catch (error: any) {
    return json({ success: false, error: error.message }, { status: 400 });
  }
};

export const POST: RequestHandler = async ({ params, url, request }) => {
  try {
    const scopedPath = getScopedPath(url, params);
    const action = url.searchParams.get('action');

    if (action === 'rename') {
       const toParam = url.searchParams.get('to');
       if (!toParam) throw new Error("Missing 'to' parameter for rename");
       
       const workspace = url.searchParams.get('workspace');
       const cleanWorkspace = workspace ? workspace.replace(/[^a-zA-Z0-9_\-]/g, '') : '';
       const cleanToPath = toParam.replace(/^\/+/, '').replace(/\.\.\//g, '');
       const toPath = cleanToPath ? `${cleanWorkspace}/${cleanToPath}` : cleanWorkspace;

       await workspaceFiles.copy(scopedPath, toPath);
       await workspaceFiles.delete(scopedPath);
       return json({ success: true, path: toPath });
    }
    
    // We expect binary raw body or form data? Let's assume binary arrayBuffer for direct uploads
    // or if form data, we extract 'file'
    const contentType = request.headers.get('content-type') || '';
    let fileData: any;
    
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      fileData = formData.get('file');
      if (!fileData) {
        throw new Error("No file found in multipart form data");
      }
    } else {
      fileData = await request.blob();
    }

    await workspaceFiles.upload(scopedPath, fileData, {
       contentType: fileData?.type || contentType || 'application/octet-stream'
    });

    return json({ success: true, path: scopedPath });
  } catch (error: any) {
    return json({ success: false, error: error.message }, { status: 400 });
  }
};

export const DELETE: RequestHandler = async ({ params, url }) => {
  try {
    const scopedPath = getScopedPath(url, params);
    await workspaceFiles.delete(scopedPath);
    return json({ success: true });
  } catch (error: any) {
    return json({ success: false, error: error.message }, { status: 400 });
  }
};
