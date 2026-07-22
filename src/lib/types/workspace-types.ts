export type ArtifactKind = "document" | "pdf" | "image" | "unsupported";
export type ArtifactStatus = "processing" | "streaming" | "success" | "error";
export type ArtifactSource = "uploaded" | "generated";
export type ArtifactCategory =
	| "image"
	| "document"
	| "spreadsheet"
	| "presentation"
	| "pdf"
	| "other";

export interface Artifact {
	id: string;
	title: string;
	kind: ArtifactKind;
	content?: string;
	url?: string;
	saveUrl?: string;
	size?: number;
	status?: ArtifactStatus;
	marksheetStatus?: string;
	manifestStatus?: string;
	manifestError?: string;
	source?: ArtifactSource;
	category?: ArtifactCategory;
	modifiedAt?: number;
	examTypeId?: number;
	studentId?: number;
	admissionNo?: number;
	contentHash?: string;
	documentId?: string;
	mimeType?: string;
	validationErrors?: string[];
	validationErrorCount?: number;
	validationWarnings?: string[];
	validationWarningCount?: number;
}
