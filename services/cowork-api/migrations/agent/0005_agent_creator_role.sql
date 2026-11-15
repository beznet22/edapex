-- Record the creator's role on the agent.
--
-- Spec 10 defines the invariant as
-- `agent.effectiveGrant ⊆ capabilityManifest(creator.role, features)`. Re-deriving
-- the creator's role at mutation time would mean a cross-service lookup on every
-- write, and inferring it from the actor would be wrong: an administrator editing a
-- teacher's agent could then grant admin operations the teacher cannot hold, which is
-- exactly the escalation this chunk exists to prevent.
--
-- The role is a snapshot, like `ceiling_snapshot` beside it. If the creator is later
-- demoted, the *ceiling* shrinks through `allowedOperationIds` at read time; the role
-- is only what that ceiling is computed from.

ALTER TABLE agents ADD COLUMN creator_role TEXT
  CHECK (creator_role IS NULL OR creator_role IN ('admin', 'teacher', 'parent', 'student'));

-- Existing rows predate this column and have no recorded role. They are left null
-- rather than defaulted: guessing 'admin' would widen them, and guessing 'student'
-- would shrink them. A null role means "unknown creator", and the service falls back
-- to the acting user's ceiling, which only ever narrows.
