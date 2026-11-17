"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, Loader2, Trash2 } from "lucide-react";

import { Button } from "@edapex/ui/components/button";
import { Input } from "@edapex/ui/components/input";
import { Modal } from "@/components/ui/modal";
import {
  setStaffActive,
  updateStaff,
  uploadPhoto,
  type StaffRow
} from "@/lib/admin-api";
import { Avatar, AvatarFallback, AvatarImage } from "@edapex/ui/components/avatar";
import { initialsOf } from "@/components/admin/PersonCell";

/**
 * One staff member: edit, photo, and removal.
 *
 * Removal is the interesting half. `DELETE` is not routed — marks, attendance, timetables and
 * archives reference `sm_staffs.id`, so removing the row would orphan them. "Remove" sets
 * `active_status = 0`, and the confirm text says so in the body rather than relying on the
 * button label to explain a consequence the person cannot undo.
 */
export function StaffDetailModal({
  staff,
  academicId,
  onClose,
  onSaved
}: {
  readonly staff: StaffRow | null;
  readonly academicId: number;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (staff === null) return;
    const [first = "", ...rest] = (staff.fullName ?? "").split(" ");
    setFirstName(first);
    setLastName(rest.join(" "));
    setEmail(staff.email ?? "");
    setMobile(staff.mobile ?? "");
    setPhoto(staff.staffPhoto);
    setError("");
    setConfirmRemove(false);
  }, [staff]);

  if (staff === null) return null;

  const save = async (): Promise<void> => {
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      await updateStaff(academicId, staff.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().length === 0 ? null : email.trim(),
        mobile: mobile.trim().length === 0 ? null : mobile.trim()
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await setStaffActive(academicId, staff.id, false);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove");
    } finally {
      setSaving(false);
    }
  };

  const onFile = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return;
    setError("");
    try {
      const result = await uploadPhoto(`/api/v1/admin/staff/${staff.id}/photo`, file);
      setPhoto(result.photoUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload the photo");
    }
  };

  return (
    <Modal
      description="Staff record only. Their login is granted separately."
      footer={
        <>
          {confirmRemove ? (
            <>
              <span className="mr-auto text-[12px] leading-5 text-[var(--destructive-ink)]">
                They keep their record and history, and can no longer sign in.
              </span>
              <Button onClick={() => setConfirmRemove(false)} type="button" variant="ghost">
                Keep
              </Button>
              <Button
                disabled={saving}
                onClick={() => void remove()}
                type="button"
                variant="destructive"
              >
                {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                Remove
              </Button>
            </>
          ) : (
            <>
              <Button
                className="mr-auto text-muted-foreground"
                onClick={() => setConfirmRemove(true)}
                type="button"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" />
                Remove
              </Button>
              <Button onClick={onClose} type="button" variant="ghost">
                Cancel
              </Button>
              <Button disabled={saving} onClick={() => void save()} type="button">
                {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                Save changes
              </Button>
            </>
          )}
        </>
      }
      onClose={onClose}
      open
      title={staff.fullName ?? "Staff member"}
      widthClassName="max-w-xl"
    >
      <div className="space-y-5 py-1">
        <div className="flex items-center gap-3">
          <Avatar className="size-14">
            {photo === null ? null : <AvatarImage alt="" src={photo} />}
            <AvatarFallback className="text-sm font-semibold">
              {initialsOf(staff.fullName)}
            </AvatarFallback>
          </Avatar>
          <div>
            <input
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => void onFile(event.target.files?.[0])}
              ref={fileInput}
              type="file"
            />
            <Button
              onClick={() => fileInput.current?.click()}
              size="sm"
              type="button"
              variant="outline"
            >
              <Camera aria-hidden="true" />
              {photo === null ? "Add photo" : "Change photo"}
            </Button>
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              JPEG, PNG or WebP, up to 5 MB.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[13px] font-medium">First name</span>
            <Input
              className="mt-2"
              onChange={(event) => setFirstName(event.target.value)}
              value={firstName}
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-medium">Last name</span>
            <Input
              className="mt-2"
              onChange={(event) => setLastName(event.target.value)}
              value={lastName}
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[13px] font-medium">Email</span>
            <Input
              className="mt-2"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-medium">Mobile</span>
            <Input
              className="mt-2"
              inputMode="tel"
              onChange={(event) => setMobile(event.target.value)}
              value={mobile}
            />
          </label>
        </div>

        {error.length > 0 ? (
          <p className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-destructive/10 px-3 py-2.5 text-[13px] text-[var(--destructive-ink)]">
            <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
