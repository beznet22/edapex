import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface FsBlobResult {
	url: string;
	pathname: string;
	contentType: string;
}

/**
 * Custom file system blob storage that mimics @vercel/blob API
 */
export async function put(
	filename: string,
	buffer: ArrayBuffer | Buffer,
	opts: {
		access?: 'public';
		token?: string;
		contentType?: string;
	} = {}
): Promise<FsBlobResult> {
	const uploadsDir = join(process.cwd(), `storage/uploads/${opts.token || ""}`);
	const uniqueFilename = `${uuidv4()}-${filename}`;
	const filePath = join(uploadsDir, uniqueFilename);

	// Ensure uploads directory exists
	try {
		await mkdir(uploadsDir, { recursive: true });
	} catch (error) {
		console.error('Failed to create uploads directory:', error);
		throw new Error('Failed to create upload directory');
	}

	// Write file to disk
	try {
		const fileBuffer = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer;
		await writeFile(filePath, fileBuffer);
	} catch (error) {
		console.error('Failed to write file:', error);
		throw new Error('Failed to save file');
	}

	// Return blob-like result matching @vercel/blob API
	const url = `uploads/${uniqueFilename}`;

	return {
		url,
		pathname: uniqueFilename,
		contentType: opts.contentType || 'application/octet-stream'
	};
}

/**
 * Delete a file from the uploads directory (optional additional function)
 */
export async function del(pathname: string): Promise<void> {
	const filePath = join(process.cwd(), 'uploads', pathname);

	try {
		const { unlink } = await import('fs/promises');
		await unlink(filePath);
	} catch (error) {
		console.error('Failed to delete file:', error);
		throw new Error('Failed to delete file');
	}
}

/**
 * Get file info (optional additional function)
 */
export async function head(pathname: string): Promise<{ size: number; uploadedAt: Date }> {
	const filePath = join(process.cwd(), 'uploads', pathname);

	try {
		const { stat } = await import('fs/promises');
		const stats = await stat(filePath);

		return {
			size: stats.size,
			uploadedAt: stats.mtime
		};
	} catch (error) {
		console.error('Failed to get file info:', error);
		throw new Error('Failed to get file info');
	}
}

/**
 * Get file content and metadata
 */
export async function get(pathname: string): Promise<{
	buffer: Buffer;
	contentType: string;
	size: number;
	uploadedAt: Date;
}> {
	const filePath = join(process.cwd(), 'uploads', pathname);

	try {
		const { readFile, stat } = await import('fs/promises');
		const [fileBuffer, fileStats] = await Promise.all([readFile(filePath), stat(filePath)]);

		// Determine content type based on file extension
		const ext = pathname.split('.').pop()?.toLowerCase();
		let contentType = 'application/octet-stream';

		switch (ext) {
			case 'jpg':
			case 'jpeg':
				contentType = 'image/jpeg';
				break;
			case 'png':
				contentType = 'image/png';
				break;
			case 'gif':
				contentType = 'image/gif';
				break;
			case 'webp':
				contentType = 'image/webp';
				break;
			case 'svg':
				contentType = 'image/svg+xml';
				break;
		}

		return {
			buffer: fileBuffer,
			contentType,
			size: fileStats.size,
			uploadedAt: fileStats.mtime
		};
	} catch (error) {
		console.error('Failed to get file:', error);
		throw new Error('Failed to get file');
	}
}
