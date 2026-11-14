import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { NotFoundError, TenantScopeError, ValidationError } from "../errors";
import { sha256Hex } from "../crypto/digest";

export const MAX_STUDENT_PHOTO_BYTES = 5 * 1024 * 1024;

export interface StudentPhotoInput {
  readonly studentId: number;
  readonly file: Blob;
}

export interface StudentPhotoResult {
  readonly photoUrl: string;
  readonly contentHash: string;
  readonly contentType: string;
  readonly bytes: number;
  readonly cached: boolean;
}

export interface StudentPhotoClaimInput {
  readonly studentId: number;
  readonly url: string;
}

export interface StudentPhotoClaimResult {
  readonly studentId: number;
  readonly photoUrl: string;
}

const PHOTO_URL_PATTERN =
  /^\/uploads\/students\/([a-f0-9]{64})\.(jpe?g|png|webp)$/i;

interface ImageType {
  readonly contentType: string;
  readonly ext: "jpg" | "png" | "webp";
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

const asciiAt = (bytes: Uint8Array, offset: number, value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
};

const detectImageType = (bytes: Uint8Array): ImageType | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", ext: "jpg" };
  }
  if (
    bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((value, index) => bytes[index] === value)
  ) {
    return { contentType: "image/png", ext: "png" };
  }
  if (
    bytes.length >= 12 &&
    asciiAt(bytes, 0, "RIFF") &&
    asciiAt(bytes, 8, "WEBP")
  ) {
    return { contentType: "image/webp", ext: "webp" };
  }
  return null;
};

export class StudentPhotoService {
  constructor(private readonly ctx: ServiceContext) {}

  async save(input: StudentPhotoInput): Promise<StudentPhotoResult> {
    if (input.studentId <= 0) {
      throw new ValidationError("A positive student id is required", "studentId");
    }
    if (input.file.size === 0) {
      throw new ValidationError("The uploaded photo is empty", "file");
    }
    if (input.file.size > MAX_STUDENT_PHOTO_BYTES) {
      throw new ValidationError("Student photos must be 5 MB or smaller", "file");
    }

    const bytes = new Uint8Array(await input.file.arrayBuffer());
    const image = detectImageType(bytes);
    if (image === null) {
      throw new ValidationError(
        "Student photos must be JPEG, PNG or WebP images",
        "file"
      );
    }

    const contentHash = await sha256Hex(bytes);
    const key = `uploads/students/${contentHash}.${image.ext}`;
    const photoUrl = `/${key}`;
    const cached = await this.ctx.ports.photos.head(key);
    if (!cached) {
      await this.ctx.ports.photos.put(key, bytes, image.contentType, contentHash);
    }

    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const updated = await this.ctx.repos.profiles.updateStudentPhoto(
      scoped,
      input.studentId,
      photoUrl
    );
    if (!updated) {
      if (!cached) {
        try {
          await this.ctx.ports.photos.delete(key);
        } catch {
          // The content-addressed object is harmless if cleanup fails.
        }
      }
      throw new ValidationError("Student not found", "studentId");
    }

    return {
      photoUrl,
      contentHash,
      contentType: image.contentType,
      bytes: bytes.byteLength,
      cached
    };
  }

  async claim(input: StudentPhotoClaimInput): Promise<StudentPhotoClaimResult> {
    if (!Number.isInteger(input.studentId) || input.studentId <= 0) {
      throw new ValidationError("A positive student id is required", "studentId");
    }
    const match = PHOTO_URL_PATTERN.exec(input.url);
    const hash = match?.[1];
    const extension = match?.[2];
    if (hash === undefined || extension === undefined) {
      throw new ValidationError(
        "Photo URL must be a content-addressed student photo",
        "url"
      );
    }
    const key = `uploads/students/${hash}.${extension}`;
    if (!(await this.ctx.ports.photos.head(key))) {
      throw new NotFoundError("Photo", key);
    }

    const scoped = requireScopedContext(this.ctx.repos.ctx);
    if (
      scoped.tenant.classId === null ||
      scoped.tenant.sectionId === null ||
      scoped.tenant.academicId === null
    ) {
      throw new TenantScopeError("Class and section are required to claim a photo");
    }
    const roster = await this.ctx.ports.students.listRoster({
      classId: scoped.tenant.classId,
      sectionId: scoped.tenant.sectionId,
      academicId: scoped.tenant.academicId
    });
    if (!roster.some((entry) => entry.id === input.studentId)) {
      throw new ValidationError("Student is not in the class roster", "studentId");
    }

    const updated = await this.ctx.repos.profiles.updateStudentPhoto(
      scoped,
      input.studentId,
      input.url
    );
    if (!updated) throw new NotFoundError("Student", input.studentId);
    return { studentId: input.studentId, photoUrl: input.url };
  }

  async remove(studentId: number): Promise<void> {
    if (!Number.isInteger(studentId) || studentId <= 0) {
      throw new ValidationError("A positive student id is required", "studentId");
    }
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const updated = await this.ctx.repos.profiles.updateStudentPhoto(
      scoped,
      studentId,
      null
    );
    if (!updated) throw new NotFoundError("Student", studentId);
  }
}
