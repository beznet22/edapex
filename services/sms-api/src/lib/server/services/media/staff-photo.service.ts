import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { NotFoundError, ValidationError } from "../errors";
import { discardPhoto, storePhoto, type StoredImage } from "./image.store";

/**
 * Staff profile photos.
 *
 * `sm_staffs.staff_photo` and `updateStaffPhoto` have existed since the port with nothing
 * calling them, so a staff member could not have a picture. `users` has no photo column —
 * a person's photo lives on their staff record (or their student record), which is where the
 * domain already puts it.
 *
 * Content-addressed through the shared store, so the 5 MB cap and the magic-byte check are
 * literally the same code as the student path rather than a copy that can drift.
 */
export interface StaffPhotoInput {
  readonly staffId: number;
  readonly file: Blob;
}

export interface StaffPhotoResult {
  readonly photoUrl: string;
  readonly contentHash: string;
  readonly contentType: string;
  readonly bytes: number;
  readonly cached: boolean;
}

export class StaffPhotoService {
  constructor(private readonly ctx: ServiceContext) {}

  /**
   * A staff member setting their own photo.
   *
   * Same storage and validation as the admin path; the only difference is that the id comes
   * from the session rather than the URL, so this can never be pointed at a colleague. That
   * is the whole reason it is a separate method rather than an optional parameter on `save`:
   * an "any staff id" argument on a self-service endpoint is a privilege bug waiting for the
   * next refactor.
   */
  async saveOwn(staffId: number, file: Blob): Promise<StaffPhotoResult> {
    return await this.save({ staffId, file });
  }

  async removeOwn(staffId: number): Promise<void> {
    await this.remove(staffId);
  }

  async save(input: StaffPhotoInput): Promise<StaffPhotoResult> {
    if (!Number.isInteger(input.staffId) || input.staffId <= 0) {
      throw new ValidationError("A positive staff id is required", "staffId");
    }

    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const staff = await this.ctx.repos.profiles.findStaffById(scoped, input.staffId);
    if (staff === null) throw new NotFoundError("Staff member", input.staffId);

    const stored: StoredImage = await storePhoto(this.ctx.ports.photos, "staff", input.file);

    const updated = await this.ctx.repos.profiles.updateStaffPhoto(
      scoped,
      input.staffId,
      stored.photoUrl
    );
    if (!updated) {
      // The row vanished between the read and the write. Remove the object we just
      // created so the bucket does not accumulate orphans.
      await discardPhoto(this.ctx.ports.photos, stored);
      throw new NotFoundError("Staff member", input.staffId);
    }

    return stored;
  }

  /** Clears the column. The object stays — other rows may share the same hash. */
  async remove(staffId: number): Promise<void> {
    if (!Number.isInteger(staffId) || staffId <= 0) {
      throw new ValidationError("A positive staff id is required", "staffId");
    }
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const staff = await this.ctx.repos.profiles.findStaffById(scoped, staffId);
    if (staff === null) throw new NotFoundError("Staff member", staffId);

    await this.ctx.repos.profiles.updateStaffPhoto(scoped, staffId, null);
  }
}
