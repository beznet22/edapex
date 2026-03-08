import { promises as fs } from "fs";
import { join } from "path";
import type { ResultInput } from "$lib/schema/result-input";
import { EXTRACTED_DIR } from "$lib/constants";
import type { AssessmentStatus } from "$lib/types/chat-types";

export interface ExtractedAssessment {
    data?: ResultInput;
    extractedAt: Date;
    verified: boolean;
    status: AssessmentStatus;
    error?: string;
    originalName?: string;
}

export class StudentFileStorage {
    public basePath = EXTRACTED_DIR;

    constructor(basePath?: string) {
        if (basePath) this.basePath = basePath;
    }

    public formatName(name: string): string {
        return name.trim().replaceAll(" ", "_");
    }

    public getFolderPath(className: string, sectionName: string): string {
        return `${className}(${sectionName})`.toLowerCase().replaceAll(" ", "_");
    }

    async loadByStudent(classId: number, sectionId: number, studentId: number, examId: number): Promise<ExtractedAssessment | null> {
        // Since we now store by name, we need to find the student first to get their name
        // This is a bit backwards but keeps the human-readable FS structure
        const { studentRepo, resultRepo } = await import("$lib/server/repository");

        const student = await studentRepo.getStudentById(studentId);
        if (!student) return null;

        const classSection = await resultRepo.getClassSectionById(classId, sectionId);
        if (!classSection) return null;

        const folder = this.getFolderPath(classSection.className || "Unknown", classSection.sectionName || "Unknown");
        const studentFolder = this.formatName(student.fullName || "Unknown");
        return this.load(join(folder, studentFolder));
    }

    async findLatestByStudent(classId: number, sectionId: number, studentId: number): Promise<ExtractedAssessment | null> {
        // Similar to loadByStudent but for latest
        const { studentRepo, resultRepo } = await import("$lib/server/repository");

        const student = await studentRepo.getStudentById(studentId);
        if (!student) return null;

        const classSection = await resultRepo.getClassSectionById(classId, sectionId);
        if (!classSection) return null;

        const folder = this.getFolderPath(classSection.className || "Unknown", classSection.sectionName || "Unknown");
        const studentFolder = this.formatName(student.fullName || "Unknown");
        return this.load(join(folder, studentFolder));
    }

    async save(data: ExtractedAssessment, imageBuffer?: Buffer): Promise<string> {
        // Use class/section/name from the ResultInput data
        const { className, sectionName, fullName } = data.data?.studentData || { fullName: "Unknown" };

        const folder = this.getFolderPath(className || "Unknown", sectionName || "Unknown");
        const studentFolder = this.formatName(fullName);
        const dir = join(this.basePath, folder, studentFolder);

        await fs.mkdir(dir, { recursive: true });

        // Ensure status is extracted if not otherwise specified for saved files
        if (!data.status) data.status = "extracted";

        // Save the JSON data
        await fs.writeFile(join(dir, "data.json"), JSON.stringify(data, null, 2));

        // Save the image if provided
        if (imageBuffer) {
            const imageFilename = `${this.formatName(fullName)}.jpg`;
            await fs.writeFile(join(dir, imageFilename), imageBuffer);
        }

        return join(folder, studentFolder);
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

        // Strictly use fullName or Unknown_Student as a fallback
        // We use Unknown_Student_${Date.now()} to avoid collisions if multiple unknown students are uploaded
        const nameToUse = params.fullName || `Unknown_Student_${Date.now()}`;
        const folderName = this.formatName(nameToUse);
        const dir = join(this.basePath, folder, folderName);

        await fs.mkdir(dir, { recursive: true });

        const assessment: ExtractedAssessment = {
            extractedAt: new Date(),
            verified: false,
            status: params.status || "uploaded",
            error: params.error,
            originalName: params.fileName,
            data: {
                studentData: {
                    fullName: params.fullName || "Unknown Student",
                    className: params.className,
                    sectionName: params.sectionName
                }
            } as any
        };

        await fs.writeFile(join(dir, "data.json"), JSON.stringify(assessment, null, 2));

        const imageBuffer = Buffer.from(await params.file.arrayBuffer());
        // Use formatted folderName.jpg
        const imageFilename = `${folderName}.jpg`;
        await fs.writeFile(join(dir, imageFilename), imageBuffer);

        return join(folder, folderName);
    }

    async load(folderPath: string): Promise<ExtractedAssessment | null> {
        const fullPath = join(this.basePath, folderPath, "data.json");
        try {
            const data = await fs.readFile(fullPath, "utf-8");
            const parsed = JSON.parse(data);
            if (parsed.extractedAt) {
                parsed.extractedAt = new Date(parsed.extractedAt);
            }
            if (!parsed.status || (parsed.status as string) === "pending" || (parsed.status as string) === "done") {
                parsed.status = "extracted";
            }
            return parsed as ExtractedAssessment;
        } catch (error) {
            if ((error as any).code === "ENOENT") {
                return null;
            }
            throw error;
        }
    }

    async getImage(folderPath: string): Promise<Buffer | null> {
        // Since folderPath is usually className(sectionName)/student_name
        // the filename should be student_name.jpg
        const parts = folderPath.split("/");
        const studentName = parts[parts.length - 1];
        const imageFilename = `${studentName}.jpg`;
        const fullPath = join(this.basePath, folderPath, imageFilename);

        try {
            return await fs.readFile(fullPath);
        } catch (error) {
            // Fallback to legacy 'image.jpg' if needed
            try {
                return await fs.readFile(join(this.basePath, folderPath, "image.jpg"));
            } catch (innerError) {
                if ((error as any).code === "ENOENT") {
                    return null;
                }
                throw error;
            }
        }
    }

    async listByClass(className: string, sectionName: string): Promise<string[]> {
        const folder = this.getFolderPath(className, sectionName);
        const dir = join(this.basePath, folder);
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            return entries
                .filter(e => e.isDirectory())
                .map(e => join(folder, e.name));
        } catch (error) {
            if ((error as any).code === "ENOENT") {
                return [];
            }
            throw error;
        }
    }

    async findFilePath(filename: string): Promise<string | null> {
        const folders = await fs.readdir(this.basePath, { withFileTypes: true });
        for (const folder of folders) {
            if (!folder.isDirectory()) continue;

            const folderPath = join(this.basePath, folder.name);
            const subfolders = await fs.readdir(folderPath, { withFileTypes: true });

            for (const sub of subfolders) {
                if (!sub.isDirectory()) continue;

                const studentPath = join(folderPath, sub.name);
                const files = await fs.readdir(studentPath);

                if (files.includes(filename)) {
                    return join(this.basePath, folder.name, sub.name, filename);
                }
            }
        }
        return null;
    }

    // Legacy support or helper
    decode(encoded: string): { id1: number; id2: number } {
        // This was previously used for base64(studentId:examId)
        // We might not need this anymore if we use the new path structure,
        // but keeping it for compatibility if other parts of the system still use it.
        try {
            const decoded = Buffer.from(encoded, "base64url").toString();
            const [id1, id2] = decoded.split(":");
            return { id1: Number(id1), id2: Number(id2) };
        } catch (e) {
            return { id1: 0, id2: 0 };
        }
    }

    encodeFolder(classId: number, sectionId: number): string {
        return Buffer.from(`${classId}:${sectionId}`).toString("base64url");
    }
}

export const studentFileStorage = new StudentFileStorage();
