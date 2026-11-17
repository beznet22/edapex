"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, UserPlus } from "lucide-react";

import { Button } from "@edapex/ui/components/button";
import { Input } from "@edapex/ui/components/input";
import { Modal } from "@/components/ui/modal";
import { createStaff, type StaffRow } from "@/lib/admin-api";

/**
 * Adding a staff member.
 *
 * `sm_staffs` has 63 columns and exactly one non-defaulted NOT NULL (`id`), so "required" is
 * a product decision rather than a schema one. The form asks for the four things that make a
 * record usable — a name, a way to reach them, and what they do — and leaves the rest to the
 * detail modal.
 *
 * Creating a record does **not** create a login. That is the claim-link flow, offered
 * separately, so "this person exists" and "this person can sign in" stay two decisions.
 */
export function StaffFormModal({
  open,
  academicId,
  onClose,
  onSaved
}: {
  readonly open: boolean;
  readonly academicId: number;
  readonly onClose: () => void;
  readonly onSaved: (staff: StaffRow) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [qualification, setQualification] = useState("");
  const [experience, setExperience] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // A reopened dialog must not carry the previous draft.
  useEffect(() => {
    if (!open) return;
    setFirstName("");
    setLastName("");
    setEmail("");
    setMobile("");
    setQualification("");
    setExperience("");
    setError("");
  }, [open]);

  const submit = async (): Promise<void> => {
    if (saving) return;
    setError("");

    if (firstName.trim().length === 0 || lastName.trim().length === 0) {
      setError("A first and last name are required.");
      return;
    }
    if (email.trim().length === 0 && mobile.trim().length === 0) {
      setError("Add an email address or a mobile number — we need one way to reach them.");
      return;
    }

    setSaving(true);
    try {
      const staff = await createStaff(academicId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().length === 0 ? null : email.trim(),
        mobile: mobile.trim().length === 0 ? null : mobile.trim(),
        designationId: null,
        departmentId: null,
        qualification: qualification.trim().length === 0 ? null : qualification.trim(),
        experience: experience.trim().length === 0 ? null : experience.trim(),
        dateOfBirth: null,
        genderId: null,
        roleId: null
      });
      onSaved(staff);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the staff member");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      description="They get a record, not a login. Invite them to sign in afterwards."
      footer={
        <>
          <span className="mr-auto text-[12px] text-muted-foreground">* required</span>
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void submit()} type="button">
            {saving ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <UserPlus aria-hidden="true" />
            )}
            Add staff
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title="Add a staff member"
      widthClassName="max-w-xl"
    >
      <div className="space-y-5 py-1">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[13px] font-medium">First name *</span>
            <Input
              autoFocus
              className="mt-2"
              onChange={(event) => setFirstName(event.target.value)}
              value={firstName}
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-medium">Last name *</span>
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
              placeholder="name@school.example"
              type="email"
              value={email}
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-medium">Mobile</span>
            <Input
              className="mt-2"
              onChange={(event) => setMobile(event.target.value)}
              inputMode="tel"
              value={mobile}
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[13px] font-medium">Qualification</span>
            <Input
              className="mt-2"
              onChange={(event) => setQualification(event.target.value)}
              placeholder="B.Ed"
              value={qualification}
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-medium">Experience</span>
            <Input
              className="mt-2"
              onChange={(event) => setExperience(event.target.value)}
              placeholder="6 years"
              value={experience}
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
