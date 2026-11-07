/**
 * `05 §3` identity/guardian findings: P3, P4, F1, F2, D1, D2.
 *
 * The pass is deliberately ordered:
 *   F2 (childless parents) -> D1 (duplicate parent rows) -> F1 (dangling child)
 *   -> P3 (parents without a user) -> P4 (users without a profile) -> D2 (shared emails)
 *
 * F2 runs first so no user is created for a parent that is about to be removed.
 * D1 runs before P3 so a duplicate parent does not receive a second user.
 */
import {
  asInt,
  asNullableInt,
  byId,
  compareNewest,
  groupBy,
  maxBy,
  normalizeEmail,
  normalizeName,
  parentEmail,
  parentName
} from "./helpers.mjs";

const PLACEHOLDER_PREFIX = "PLACEHOLDER";

function resolution(findingId, entity, entityId, before, after, reason, archiveKey = null) {
  return {
    findingId,
    entity,
    entityId: entityId === null ? null : String(entityId),
    beforeJson: before === null ? null : JSON.stringify(before),
    afterJson: after === null ? null : JSON.stringify(after),
    reason,
    archiveKey
  };
}

function validUserIds(users) {
  return new Set(users.map((row) => asInt(row.id)));
}

function profileUserIds(students, staffs, parents) {
  const ids = new Set();
  for (const row of students) if (row.user_id !== null) ids.add(asInt(row.user_id));
  for (const row of staffs) if (row.user_id !== null) ids.add(asInt(row.user_id));
  for (const row of parents) if (row.user_id !== null) ids.add(asInt(row.user_id));
  return ids;
}

function emailGroups(users) {
  const groups = new Map();
  for (const user of users) {
    const email = normalizeEmail(user.email);
    if (email === null) continue;
    const list = groups.get(email);
    if (list === undefined) groups.set(email, [user]);
    else list.push(user);
  }
  return groups;
}

function templateParentUser(users) {
  return (
    users.find(
      (row) => String(row.usertype ?? "").toLowerCase() === "parent" && row.active_status === 1
    ) ??
    users.find((row) => String(row.usertype ?? "").toLowerCase() === "parent") ??
    users[0] ??
    null
  );
}

export function transformPeople({ users, parents, students, staffs, options }) {
  const resolutions = [];
  const removedParents = [];
  const deactivatedUsers = [];
  const now = options.now;
  const archiveKey = options.parentArchiveKey ?? null;

  const userIdsAtStart = validUserIds(users);
  const parentIdsAtStart = new Set(parents.map((row) => asInt(row.id)));
  const childrenByParent = new Map();
  for (const student of students) {
    const parentId = asNullableInt(student.parent_id);
    if (parentId === null) continue;
    childrenByParent.set(parentId, (childrenByParent.get(parentId) ?? 0) + 1);
  }

  const profileIdsAtStart = profileUserIds(students, staffs, parents);
  const findings = {
    P3: parents.filter(
      (row) => row.user_id === null || !userIdsAtStart.has(asInt(row.user_id))
    ).length,
    P4: users.filter(
      (row) =>
        String(row.is_administrator ?? "no").toLowerCase() !== "yes" &&
        !profileIdsAtStart.has(asInt(row.id))
    ).length,
    F1: students.filter(
      (row) => row.parent_id === null || !parentIdsAtStart.has(asInt(row.parent_id))
    ).length,
    F2: parents.filter((row) => !childrenByParent.has(asInt(row.id))).length,
    D1: [...groupBy(parents, (row) => asNullableInt(row.user_id)).entries()].filter(
      ([userId, group]) => userId !== null && group.length > 1
    ).length,
    D2: [...emailGroups(users).values()].filter((group) => group.length > 1).length
  };

  // F2 — childless parents. There is no parent_id in fees or chat; the only
  // reference is sm_students.parent_id, which is empty for this set by definition.
  const referencedByStudent = new Set(
    students.map((row) => asNullableInt(row.parent_id)).filter((id) => id !== null)
  );
  let currentParents = parents.filter((row) => {
    const id = asInt(row.id);
    if (referencedByStudent.has(id)) return true;
    if (options.isParentReferenced?.(id) === true) return true;
    removedParents.push({ row, reason: "F2_DELETED" });
    resolutions.push(
      resolution("F2", "sm_parents", id, null, null, "F2_DELETED", archiveKey)
    );
    return false;
  });

  // D1 — duplicate parent rows for one user. Newest survives; older rows are
  // archived, their students re-pointed, then removed.
  const d1Groups = [...groupBy(currentParents, (row) => asNullableInt(row.user_id)).entries()]
    .filter(([userId, group]) => userId !== null && group.length > 1);
  for (const [, group] of d1Groups) {
    const winner = maxBy(group, compareNewest);
    const losers = group.filter((row) => row !== winner);
    for (const loser of losers) {
      const loserId = asInt(loser.id);
      let repointed = 0;
      for (const student of students) {
        if (asNullableInt(student.parent_id) === loserId) {
          student.parent_id = asInt(winner.id);
          repointed += 1;
        }
      }
      removedParents.push({ row: loser, reason: "D1_DEDUPED" });
      resolutions.push(
        resolution(
          "D1",
          "sm_parents",
          loserId,
          { user_id: loser.user_id, parent_id: loserId },
          { user_id: winner.user_id, parent_id: asInt(winner.id), repointed },
          "D1_DEDUPED",
          archiveKey
        )
      );
    }
    currentParents = currentParents.filter((row) => row === winner || !losers.includes(row));
  }

  // F1 — students pointing at a missing parent. Create a flagged placeholder.
  let nextParentId =
    currentParents.reduce((max, row) => Math.max(max, asInt(row.id)), 0) + 1;
  const currentParentIds = new Set(currentParents.map((row) => asInt(row.id)));
  for (const student of students) {
    const parentId = asNullableInt(student.parent_id);
    if (parentId !== null && currentParentIds.has(parentId)) continue;
    const placeholder = {
      id: nextParentId,
      guardians_name: `${PLACEHOLDER_PREFIX} — review`,
      guardians_email: null,
      guardians_mobile: null,
      user_id: null,
      school_id: student.school_id ?? options.schoolId,
      academic_id: student.academic_id ?? options.currentAcademicId,
      active_status: 1,
      is_guardian: 1,
      created_at: now,
      updated_at: now
    };
    nextParentId += 1;
    currentParents.push(placeholder);
    currentParentIds.add(asInt(placeholder.id));
    student.parent_id = asInt(placeholder.id);
    resolutions.push(
      resolution(
        "F1",
        "sm_parents",
        placeholder.id,
        { student_id: asInt(student.id), parent_id: parentId },
        { student_id: asInt(student.id), parent_id: asInt(placeholder.id) },
        "F1_PLACEHOLDER"
      )
    );
  }

  // P3 — parents without a user. Link by email when one exists; otherwise create
  // a claimable user from the guardian email. No email -> quarantine.
  const parentTemplate = templateParentUser(users);
  const parentRoles = options.roles ?? [];
  const parentRoleId =
    parentTemplate?.role_id ??
    parentRoles.find((row) => /parent/i.test(String(row.name ?? "")))?.id ??
    1;
  let nextUserId = users.reduce((max, row) => Math.max(max, asInt(row.id)), 0) + 1;
  const usersById = byId(users);
  let usersByEmail = emailGroups(users);

  for (const parent of currentParents) {
    const userId = asNullableInt(parent.user_id);
    if (userId !== null && usersById.has(userId)) continue;
    if (normalizeName(parent.guardians_name).startsWith(PLACEHOLDER_PREFIX)) {
      resolutions.push(
        resolution("P3", "sm_parents", parent.id, null, null, "P3_QUARANTINED")
      );
      continue;
    }
    const email = parentEmail(parent);
    if (email === null) {
      resolutions.push(
        resolution("P3", "sm_parents", parent.id, null, { email: null }, "P3_QUARANTINED")
      );
      continue;
    }
    const existing = usersByEmail.get(email) ?? [];
    if (existing.length === 1) {
      const beforeUserId = parent.user_id ?? null;
      parent.user_id = asInt(existing[0].id);
      resolutions.push(
        resolution(
          "P3",
          "sm_parents",
          parent.id,
          { user_id: beforeUserId },
          { user_id: asInt(existing[0].id) },
          "P3_LINKED_EXISTING"
        )
      );
      continue;
    }
    if (existing.length > 1) {
      resolutions.push(
        resolution("P3", "sm_parents", parent.id, null, null, "P3_AMBIGUOUS_EMAIL")
      );
      continue;
    }
    const created = {
      id: nextUserId,
      full_name: parentName(parent),
      username: null,
      phone_number: parent.guardians_mobile ?? null,
      email,
      password: options.digest,
      usertype: parentTemplate?.usertype ?? "parent",
      active_status: 1,
      random_code: null,
      notification_token: null,
      remember_token: null,
      created_at: now,
      updated_at: now,
      language: parentTemplate?.language ?? "en",
      style_id: parentTemplate?.style_id ?? 1,
      rtl_ltl: parentTemplate?.rtl_ltl ?? 2,
      selected_session: parentTemplate?.selected_session ?? options.currentAcademicId,
      created_by: 1,
      updated_by: 1,
      access_status: 1,
      school_id: parent.school_id ?? options.schoolId,
      role_id: parentRoleId,
      previous_role_id: null,
      is_administrator: "no",
      email_verified_at: null,
      claim_status: "pending",
      is_registered: parentTemplate?.is_registered ?? 0,
      device_token: null,
      stripe_id: null,
      card_brand: null,
      card_last_four: null,
      verified: parentTemplate?.verified ?? null,
      trial_ends_at: null,
      wallet_balance: parentTemplate?.wallet_balance ?? 0
    };
    nextUserId += 1;
    users.push(created);
    usersById.set(asInt(created.id), created);
    usersByEmail = emailGroups(users);
    parent.user_id = asInt(created.id);
    resolutions.push(
      resolution(
        "P3",
        "sm_parents",
        parent.id,
        { user_id: null },
        { user_id: asInt(created.id), email },
        "P3_USER_CREATED"
      )
    );
  }

  // P4 — non-admin users with no profile. Link by email, otherwise deactivate
  // and flag; the decision CSV is generated by the CLI from this list.
  const profiles = () => profileUserIds(students, staffs, currentParents);
  for (const user of users) {
    if (String(user.is_administrator ?? "no").toLowerCase() === "yes") continue;
    if (profiles().has(asInt(user.id))) continue;
    const email = normalizeEmail(user.email);
    if (email !== null) {
      const parentMatches = currentParents.filter(
        (parent) =>
          parentEmail(parent) === email &&
          (parent.user_id === null || !usersById.has(asInt(parent.user_id)))
      );
      if (parentMatches.length === 1) {
        parentMatches[0].user_id = asInt(user.id);
        resolutions.push(
          resolution(
            "P4",
            "users",
            user.id,
            { profile: null },
            { profile: "sm_parents", profile_id: asInt(parentMatches[0].id) },
            "P4_LINKED"
          )
        );
        continue;
      }
      const staffMatches = staffs.filter(
        (staff) =>
          normalizeEmail(staff.email) === email &&
          (staff.user_id === null || !usersById.has(asInt(staff.user_id)))
      );
      if (staffMatches.length === 1) {
        staffMatches[0].user_id = asInt(user.id);
        resolutions.push(
          resolution(
            "P4",
            "users",
            user.id,
            { profile: null },
            { profile: "sm_staffs", profile_id: asInt(staffMatches[0].id) },
            "P4_LINKED"
          )
        );
        continue;
      }
    }
    const beforeStatus = asInt(user.active_status);
    user.active_status = 0;
    user.claim_status = "flagged";
    deactivatedUsers.push({
      id: asInt(user.id),
      emailHash: options.sha256 === undefined ? null : options.sha256(email ?? "")
    });
    resolutions.push(
      resolution(
        "P4",
        "users",
        user.id,
        { active_status: beforeStatus },
        { active_status: 0, claim_status: "flagged" },
        "P4_DEACTIVATED"
      )
    );
  }

  // D2 — shared emails are flagged, never merged. `/claim` returns 409 until an
  // administrator resolves them.
  for (const [email, group] of emailGroups(users)) {
    if (group.length < 2) continue;
    for (const user of group) user.claim_status = "flagged";
    resolutions.push(
      resolution(
        "D2",
        "users",
        options.sha256 === undefined ? null : options.sha256(email),
        { emailCount: group.length },
        { claim_status: "flagged" },
        "D2_FLAGGED"
      )
    );
  }

  return {
    users,
    parents: currentParents,
    students,
    resolutions,
    findings,
    removedParents,
    deactivatedUsers
  };
}

export { resolution as makeResolution };
