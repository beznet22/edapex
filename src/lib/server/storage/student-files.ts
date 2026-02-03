import { promises as fs } from "fs";

interface ExtractedAssessment {
    studentId: number;
    examId: number;
    classId: number;
    sectionId: number;
    scores: Record<string, number[]>;
    extractedAt: Date;
    verified: boolean;
}

export class StudentFileStorage {
    private basePath = "storage/students";

    constructor(basePath?: string) {
        if (basePath) this.basePath = basePath;
    }

    encodeFolder(classId: number, sectionId: number): string {
        return Buffer.from(`${classId}:${sectionId}`).toString("base64url");
    }

    encodeFile(studentId: number, examId: number): string {
        return Buffer.from(`${studentId}:${examId}`).toString("base64url");
    }

    decode(encoded: string): { id1: number; id2: number } {
        const decoded = Buffer.from(encoded, "base64url").toString();
        const [id1, id2] = decoded.split(":");
        return { id1: Number(id1), id2: Number(id2) };
    }

    async save(data: ExtractedAssessment): Promise<string> {
        const folder = this.encodeFolder(data.classId, data.sectionId);
        const filename = this.encodeFile(data.studentId, data.examId);
        const dir = `${this.basePath}/${folder}`;

        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(`${dir}/${filename}.json`, JSON.stringify(data, null, 2));

        return `${folder}/${filename}`;
    }

    async loadByStudent(
        classId: number,
        sectionId: number,
        studentId: number,
        examId: number
    ): Promise<ExtractedAssessment | null> {
        const folder = this.encodeFolder(classId, sectionId);
        const filename = this.encodeFile(studentId, examId);
        return this.load(`${folder}/${filename}`);
    }

    async load(path: string): Promise<ExtractedAssessment | null> {
        const fullPath = `${this.basePath}/${path}`;
        try {
            const data = await fs.readFile(fullPath.endsWith(".json") ? fullPath : `${fullPath}.json`, "utf-8");
            const parsed = JSON.parse(data);
            // Ensure extractedAt is a Date object
            if (parsed.extractedAt) {
                parsed.extractedAt = new Date(parsed.extractedAt);
            }
            return parsed as ExtractedAssessment;
        } catch (error) {
            if ((error as any).code === "ENOENT") {
                return null; // File not found
            }
            throw error;
        }
    }

    async listByClass(classId: number, sectionId: number): Promise<string[]> {
        const folder = this.encodeFolder(classId, sectionId);
        const dir = `${this.basePath}/${folder}`;
        try {
            const files = await fs.readdir(dir);
            return files.filter(f => f.endsWith(".json"));
        } catch (error) {
            if ((error as any).code === "ENOENT") {
                return []; // Directory not found
            }
            throw error;
        }
    }

    async findLatestByStudent(
        classId: number,
        sectionId: number,
        studentId: number
    ): Promise<ExtractedAssessment | null> {
        const folder = this.encodeFolder(classId, sectionId);
        const dir = `${this.basePath}/${folder}`;
        try {
            const files = await fs.readdir(dir);
            // filter files that match studentId regardless of examId
            // Filename is base64(studentId:examId)
            const matchedFiles = [];
            for (const file of files) {
                if (!file.endsWith(".json")) continue;
                const encoded = file.replace(".json", "");
                try {
                    const { id1 } = this.decode(encoded);
                    if (id1 === studentId) {
                        matchedFiles.push(file);
                    }
                } catch (e) {
                    continue;
                }
            }

            if (matchedFiles.length === 0) return null;

            // Sort by modification time to get latest
            const validFilesWithStat = await Promise.all(
                matchedFiles.map(async (f) => {
                    const stat = await fs.stat(`${dir}/${f}`);
                    return { file: f, mtime: stat.mtime };
                })
            );

            validFilesWithStat.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
            return this.load(`${folder}/${validFilesWithStat[0].file}`);

        } catch (error) {
            if ((error as any).code === "ENOENT") {
                return null;
            }
            throw error;
        }
    }
}

export const studentFileStorage = new StudentFileStorage();
