import { join } from "path";
import { Files } from "files-sdk";
import { fs as filesFs } from "files-sdk/fs";
import type { ResultInput } from "$lib/schema/result-input";
import { EXTRACTED_DIR } from "$lib/constants";
import type { AssessmentStatus } from "$lib/types/chat-types";
import { FilesSDKFilesystem } from "$lib/server/mastra/storage/workspaces/files-sdk-filesystem";
import type { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { ResultsRepository, StudentRepository } from "$lib/server/repository";

export interface ExtractedAssessment {
    data?: ResultInput;
    extractedAt: Date;
    verified: boolean;
    status: AssessmentStatus;
    error?: string;
    originalName?: string;
    fileId?: string;
    storagePath?: string;
}

async function readUtf8(fs: FilesSDKFilesystem, path: string): Promise<string> {
    const content = await fs.readFile(path, { encoding: "utf-8" });
    return typeof content === "string" ? content : content.toString("utf-8");
}

export class StudentFileStorage {
    public basePath = EXTRACTED_DIR;
    private readonly _fs: FilesSDKFilesystem;

    constructor(basePath?: string) {
        if (basePath) this.basePath = basePath;
        const files = new Files({ adapter: filesFs({ root: this.basePath }) });
        this._fs = new FilesSDKFilesystem({
            id: "student-files",
            root: this.basePath,
            files
        });
    }

    public formatName(name: string): string {
        return name.trim().replaceAll(" ", "_");
    }

    public getFolderPath(className: string, sectionName: string): string {
        return `${className}(${sectionName})`.toLowerCase().replaceAll(" ", "_");
    }

    async loadByStudent(provider: ScopedRepositoryProvider, classId: number, sectionId: number, studentId: number, examId: number): Promise<ExtractedAssessment | null> {
        const studentRepo = provider.getRepo(StudentRepository);
        const resultRepo = provider.getRepo(ResultsRepository);

        const student = await studentRepo.getStudentById(studentId);
        if (!student) return null;

        const classSection = await resultRepo.getClassSectionById(classId, sectionId);
        if (!classSection) return null;

        const folder = this.getFolderPath(classSection.className || "Unknown", classSection.sectionName || "Unknown");
        const studentFolder = this.formatName(student.fullName || "Unknown");
        return this.load(join(folder, studentFolder));
    }

    async findLatestByStudent(provider: ScopedRepositoryProvider, classId: number, sectionId: number, studentId: number): Promise<ExtractedAssessment | null> {
        const studentRepo = provider.getRepo(StudentRepository);
        const resultRepo = provider.getRepo(ResultsRepository);

        const student = await studentRepo.getStudentById(studentId);
        if (!student) return null;

        const classSection = await resultRepo.getClassSectionById(classId, sectionId);
        if (!classSection) return null;

        const folder = this.getFolderPath(classSection.className || "Unknown", classSection.sectionName || "Unknown");
        const studentFolder = this.formatName(student.fullName || "Unknown");
        return this.load(join(folder, studentFolder));
    }

    async save(data: ExtractedAssessment, imageBuffer?: Buffer): Promise<string> {
        const { className, sectionName, fullName } = data.data?.studentData || { fullName: "Unknown" };

        const folder = this.getFolderPath(className || "Unknown", sectionName || "Unknown");
        const studentFolder = this.formatName(fullName);

        if (!data.status) data.status = "extracted";

        const storagePath = join(folder, studentFolder);
        data.storagePath = storagePath;

        await this._fs.writeFile(join(storagePath, "data.json"), JSON.stringify(data, null, 2), { recursive: true });

        if (imageBuffer) {
            const imageFilename = `${this.formatName(fullName)}.jpg`;
            await this._fs.writeFile(join(storagePath, imageFilename), imageBuffer, { recursive: true });
        }

        return storagePath;
    }

    async savePending(params: {
        file: Blob;
        className: string;
        sectionName: string;
        fileName: string;
        fullName?: string;
        status?: AssessmentStatus;
        error?: string;
    }): Promise<string> {
        const folder = this.getFolderPath(params.className, params.sectionName);
        const nameToUse = params.fullName || `Unknown_Student_${Date.now()}`;
        const folderName = this.formatName(nameToUse);
        const storagePath = join(folder, folderName);

        const assessment: ExtractedAssessment = {
            extractedAt: new Date(),
            verified: false,
            status: params.status || "uploaded",
            error: params.error,
            originalName: params.fileName,
            storagePath,
            data: {
                studentData: {
                    fullName: params.fullName || "Unknown Student",
                    className: params.className,
                    sectionName: params.sectionName
                }
            } as any
        };

        await this._fs.writeFile(join(storagePath, "data.json"), JSON.stringify(assessment, null, 2), { recursive: true });

        const imageBuffer = Buffer.from(await params.file.arrayBuffer());
        const imageFilename = `${folderName}.jpg`;
        await this._fs.writeFile(join(storagePath, imageFilename), imageBuffer, { recursive: true });

        return storagePath;
    }

    async load(folderPath: string): Promise<ExtractedAssessment | null> {
        try {
            const data = await readUtf8(this._fs, join(folderPath, "data.json"));
            const parsed = JSON.parse(data);
            if (parsed.extractedAt) {
                parsed.extractedAt = new Date(parsed.extractedAt);
            }
            if (!parsed.status || (parsed.status as string) === "pending" || (parsed.status as string) === "done") {
                parsed.status = "extracted";
            }
            return parsed as ExtractedAssessment;
        } catch (err) {
            if ((err as { code?: string }).code === "ENOENT" || (err instanceof Error && err.message.includes("ENOENT"))) {
                return null;
            }
            throw err;
        }
    }

    async getImage(folderPath: string): Promise<Buffer | null> {
        const parts = folderPath.split("/");
        const studentName = parts[parts.length - 1];
        const imageFilename = `${studentName}.jpg`;

        try {
            const content = await this._fs.readFile(join(folderPath, imageFilename));
            return typeof content === "string" ? Buffer.from(content) : Buffer.from(content);
        } catch {
            try {
                const fallback = await this._fs.readFile(join(folderPath, "image.jpg"));
                return typeof fallback === "string" ? Buffer.from(fallback) : Buffer.from(fallback);
            } catch {
                return null;
            }
        }
    }

    async listByClass(className: string, sectionName: string): Promise<string[]> {
        const folder = this.getFolderPath(className, sectionName);
        try {
            const entries = await this._fs.readdir(folder);
            return entries
                .filter((e) => e.type === "directory")
                .map((e) => join(folder, e.name));
        } catch (err) {
            if ((err as { code?: string }).code === "ENOENT" || (err instanceof Error && err.message.includes("ENOENT"))) {
                return [];
            }
            throw err;
        }
    }

    async findFilePath(filename: string): Promise<string | null> {
        const folders = await this._fs.readdir(this.basePath);
        for (const folder of folders) {
            if (folder.type !== "directory") continue;
            const subfolders = await this._fs.readdir(join(this.basePath, folder.name));
            for (const sub of subfolders) {
                if (sub.type !== "directory") continue;
                const files = await this._fs.readdir(join(this.basePath, folder.name, sub.name));
                if (files.some((f) => f.name === filename)) {
                    return join(this.basePath, folder.name, sub.name, filename);
                }
            }
        }
        return null;
    }

    decode(encoded: string): { id1: number; id2: number } {
        try {
            const decoded = Buffer.from(encoded, "base64url").toString();
            const [id1, id2] = decoded.split(":");
            return { id1: Number(id1), id2: Number(id2) };
        } catch {
            return { id1: 0, id2: 0 };
        }
    }

    async saveRawText(folderPath: string, filename: string, text: string): Promise<void> {
        await this._fs.writeFile(join(folderPath, filename), text, { recursive: true, mimeType: "text/plain" });
    }

    async loadRawText(folderPath: string, filename: string): Promise<string | null> {
        try {
            return await readUtf8(this._fs, join(folderPath, filename));
        } catch (err) {
            if ((err as { code?: string }).code === "ENOENT" || (err instanceof Error && err.message.includes("ENOENT"))) {
                return null;
            }
            throw err;
        }
    }

    async deleteRawText(folderPath: string, filename: string): Promise<void> {
        try {
            await this._fs.deleteFile(join(folderPath, filename));
        } catch (err) {
            if ((err as { code?: string }).code !== "ENOENT" && !(err instanceof Error && err.message.includes("ENOENT"))) {
                throw err;
            }
        }
    }

    encodeFolder(classId: number, sectionId: number): string {
        return Buffer.from(`${classId}:${sectionId}`).toString("base64url");
    }
}

export const studentFileStorage = new StudentFileStorage();
