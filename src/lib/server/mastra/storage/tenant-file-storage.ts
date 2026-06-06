/**
 * TenantFileStorage — per-tenant replacement for the legacy `StudentFileStorage`
 *
 * The legacy class wrote all student assessments into a global
 * `EXTRACTED_DIR/[className]([sectionName])/[studentName]/` tree. That layout
 * broke tenant isolation, leaked class names into the URL, and forced every
 * read path to scan the whole directory.
 *
 * The new layout uses the active `tenantWorkspace` (rooted at
 * `.workspaces/<schoolId>/<classId>_<sectionId>_AY<academicId>/`) and the
 * `extracted/` root inside it. Each student gets a flat directory:
 *
 *   `<workspaceRoot>/extracted/<studentName>/data.json`
 *   `<workspaceRoot>/extracted/<studentName>/<studentName>.jpg`
 *
 * Tenant isolation is now structural: a teacher's `classId`/`sectionId` is
 * baked into the workspace root, so two different classes can never share
 * filesystem state.
 *
 * The class is constructed per-request via `createTenantFileStorage(tenant)`.
 * The filesystem is resolved lazily on first use to avoid pulling the
 * workspace runtime into the module-load graph (which would create a circular
 * import through `mastra/index.ts`).
 */
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import type { WorkspaceFilesystem } from "@mastra/core/workspace";
import { tenantWorkspace, verifyTeacherAssignment } from "$lib/server/mastra/storage/workspaces";
import { buildWorkspaceRequestContext } from "$lib/server/helpers/chat-helper";
import type { ExtractedAssessment } from "./extracted-assessment";
import { ResultsRepository, StudentRepository } from "$lib/server/repository";
import type { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import type { AssessmentStatus } from "$lib/types/chat-types";

const EXTRACTED_ROOT = "extracted";

export class TenantFileStorage {
  private readonly tenant: TenantContext;
  private _fs: WorkspaceFilesystem | null = null;
  private _fsPromise: Promise<WorkspaceFilesystem> | null = null;

  constructor(tenant: TenantContext) {
    this.tenant = tenant;
  }

  private async fs(): Promise<WorkspaceFilesystem> {
    if (this._fs) return this._fs;
    if (this._fsPromise) return this._fsPromise;
    this._fsPromise = this.resolveFs();
    this._fs = await this._fsPromise;
    return this._fs;
  }

  private async resolveFs(): Promise<WorkspaceFilesystem> {
    await verifyTeacherAssignment(this.tenant);
    const rc = buildWorkspaceRequestContext(this.tenant);
    const fs = await tenantWorkspace.resolveFilesystem({ requestContext: rc as never });
    if (!fs) throw new Error("Tenant workspace filesystem unavailable");
    return fs;
  }

  public formatName(name: string): string {
    return name.trim().replaceAll(" ", "_");
  }

  public getStudentFolderPath(studentFolder: string): string {
    return `${EXTRACTED_ROOT}/${studentFolder}`;
  }

  public getDataJsonPath(studentFolder: string): string {
    return `${EXTRACTED_ROOT}/${studentFolder}/data.json`;
  }

  public getImagePath(studentFolder: string, imageName: string): string {
    return `${EXTRACTED_ROOT}/${studentFolder}/${imageName}`;
  }

  async listStudentFolders(): Promise<string[]> {
    const fs = await this.fs();
    try {
      const entries = await fs.readdir(EXTRACTED_ROOT);
      return entries
        .filter((e) => e.type === "directory")
        .map((e) => e.name);
    } catch {
      return [];
    }
  }

  async save(data: ExtractedAssessment, imageBuffer?: Buffer): Promise<string> {
    const fullName = data.data?.studentData?.fullName || "Unknown";
    const studentFolder = this.formatName(fullName);
    if (!data.status) data.status = "extracted";
    const storagePath = this.getStudentFolderPath(studentFolder);
    data.storagePath = storagePath;

    const fs = await this.fs();
    await fs.writeFile(this.getDataJsonPath(studentFolder), JSON.stringify(data, null, 2), { recursive: true });

    if (imageBuffer) {
      const imageFilename = `${studentFolder}.jpg`;
      await fs.writeFile(this.getImagePath(studentFolder, imageFilename), imageBuffer, { recursive: true });
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
    const nameToUse = params.fullName || `Unknown_Student_${Date.now()}`;
    const studentFolder = this.formatName(nameToUse);
    const storagePath = this.getStudentFolderPath(studentFolder);

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
          sectionName: params.sectionName,
        },
      } as any,
    };

    const fs = await this.fs();
    await fs.writeFile(this.getDataJsonPath(studentFolder), JSON.stringify(assessment, null, 2), { recursive: true });

    const imageBuffer = Buffer.from(await params.file.arrayBuffer());
    const imageFilename = `${studentFolder}.jpg`;
    await fs.writeFile(this.getImagePath(studentFolder, imageFilename), imageBuffer, { recursive: true });

    return storagePath;
  }

  async load(studentFolder: string): Promise<ExtractedAssessment | null> {
    try {
      const fs = await this.fs();
      const content = await fs.readFile(this.getDataJsonPath(studentFolder), { encoding: "utf-8" });
      const text = typeof content === "string" ? content : content.toString("utf-8");
      const parsed = JSON.parse(text);
      if (parsed.extractedAt) {
        parsed.extractedAt = new Date(parsed.extractedAt);
      }
      if (!parsed.status || (parsed.status as string) === "pending" || (parsed.status as string) === "done") {
        parsed.status = "extracted";
      }
      return parsed as ExtractedAssessment;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("ENOENT") || (err as { code?: string }).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async getImage(studentFolder: string): Promise<Buffer | null> {
    const fs = await this.fs();
    for (const filename of [`${studentFolder}.jpg`, `image.jpg`]) {
      try {
        const content = await fs.readFile(this.getImagePath(studentFolder, filename));
        return typeof content === "string" ? Buffer.from(content) : Buffer.from(content);
      } catch {
        continue;
      }
    }
    return null;
  }

  async saveRawText(studentFolder: string, filename: string, text: string): Promise<void> {
    const fs = await this.fs();
    await fs.writeFile(this.getImagePath(studentFolder, filename), text, {
      recursive: true,
      mimeType: "text/plain",
    });
  }

  async loadRawText(studentFolder: string, filename: string): Promise<string | null> {
    try {
      const fs = await this.fs();
      const content = await fs.readFile(this.getImagePath(studentFolder, filename), { encoding: "utf-8" });
      return typeof content === "string" ? content : content.toString("utf-8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("ENOENT") || (err as { code?: string }).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async deleteRawText(studentFolder: string, filename: string): Promise<void> {
    try {
      const fs = await this.fs();
      await fs.deleteFile(this.getImagePath(studentFolder, filename));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("ENOENT") && (err as { code?: string }).code !== "ENOENT") {
        throw err;
      }
    }
  }

  async deleteStudentFolder(studentFolder: string): Promise<void> {
    const fs = await this.fs();
    try {
      await fs.rmdir(this.getStudentFolderPath(studentFolder), { recursive: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("ENOENT") && (err as { code?: string }).code !== "ENOENT") {
        throw err;
      }
    }
  }

  async clearAll(): Promise<void> {
    const fs = await this.fs();
    try {
      await fs.rmdir(EXTRACTED_ROOT, { recursive: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("ENOENT") && (err as { code?: string }).code !== "ENOENT") {
        throw err;
      }
    }
  }

  async loadByStudent(
    provider: ScopedRepositoryProvider,
    studentId: number,
  ): Promise<ExtractedAssessment | null> {
    const studentRepo = provider.getRepo(StudentRepository);
    const resultRepo = provider.getRepo(ResultsRepository);

    const student = await studentRepo.getStudentById(studentId);
    if (!student) return null;

    if (!student.classId || !student.sectionId) return null;
    void resultRepo;

    const studentFolder = this.formatName(student.fullName || "Unknown");
    return this.load(studentFolder);
  }

  async findLatestByStudent(
    provider: ScopedRepositoryProvider,
    studentId: number,
  ): Promise<ExtractedAssessment | null> {
    return this.loadByStudent(provider, studentId);
  }
}

export async function createTenantFileStorage(tenant: TenantContext): Promise<TenantFileStorage> {
  return new TenantFileStorage(tenant);
}

export { type ExtractedAssessment };
