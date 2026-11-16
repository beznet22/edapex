import type {
	ArtifactCategory,
	ArtifactKind,
	ArtifactSource,
} from "$lib/types/workspace-types";

const PREVIEWABLE_TEXT = new Set([
	"md",
	"markdown",
	"txt",
	"json",
	"csv",
	"xml",
	"yaml",
	"yml",
	"tsv",
	"log",
]);
const PREVIEWABLE_IMAGE = new Set([
	"png",
	"jpg",
	"jpeg",
	"svg",
	"webp",
	"gif",
	"bmp",
	"avif",
]);
const PREVIEWABLE_PDF = new Set(["pdf"]);

const IMAGE_EXT = new Set([
	"png",
	"jpg",
	"jpeg",
	"svg",
	"webp",
	"gif",
	"bmp",
	"avif",
	"ico",
	"tiff",
	"tif",
]);
const DOCUMENT_EXT = new Set([
	"md",
	"markdown",
	"txt",
	"doc",
	"docx",
	"rtf",
	"odt",
	"pages",
	"log",
]);
const SPREADSHEET_EXT = new Set([
	"xls",
	"xlsx",
	"csv",
	"tsv",
	"ods",
	"numbers",
]);
const PRESENTATION_EXT = new Set(["ppt", "pptx", "odp", "key"]);

export function deriveKind(name: string): ArtifactKind {
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	if (PREVIEWABLE_PDF.has(ext)) return "pdf";
	if (PREVIEWABLE_IMAGE.has(ext)) return "image";
	if (PREVIEWABLE_TEXT.has(ext)) return "document";
	return "unsupported";
}

export function isTextPreviewable(name: string): boolean {
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	return PREVIEWABLE_TEXT.has(ext);
}

export function deriveCategory(name: string): ArtifactCategory {
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	if (IMAGE_EXT.has(ext)) return "image";
	if (PREVIEWABLE_PDF.has(ext)) return "pdf";
	if (SPREADSHEET_EXT.has(ext)) return "spreadsheet";
	if (PRESENTATION_EXT.has(ext)) return "presentation";
	if (DOCUMENT_EXT.has(ext)) return "document";
	return "other";
}

export function deriveSource(nameOrKey: string): ArtifactSource {
	return /(^|\/)extracted\//.test(nameOrKey) ? "uploaded" : "generated";
}
