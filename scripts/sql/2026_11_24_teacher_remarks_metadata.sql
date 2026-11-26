-- 2026_11_24_teacher_remarks_metadata.sql
--
-- Adds `teacher_remarks.metadata LONGTEXT NULL` — the draft/scan-state envelope used by the
-- PWA document scanner. `remark` stays a real teacher remark and is never recycled as storage.
--
-- PORTABLE BY DESIGN: the guard uses information_schema + PREPARE, which behaves identically on
-- MySQL 8.0 and MariaDB. `ADD COLUMN IF NOT EXISTS` is MariaDB-only (MySQL 8 rejects it), and
-- `PREPARE` is MySQL-only in MariaDB's case for some forms — so this uses the narrow form that
-- both accept. Verified on MariaDB 11.5.2 (dev) and correct by construction for MySQL 8.0.41.
--
-- ALGORITHM=INSTANT: nullable text column appended last = metadata-only change on both engines.
-- No rebuild, no row rewrite, no table lock. MariaDB verified to accept it here.
--
-- BLAST RADIUS: teacher_remarks is 3,728 rows / 1.92 MB. The column is nullable and nothing in
-- the codebase reads it yet, so no existing query plan or reader changes.
--
-- Run:    mysql -h HOST -u USER -p DBNAME < scripts/sql/2026_11_24_teacher_remarks_metadata.sql
-- Revert: ALTER TABLE teacher_remarks DROP COLUMN metadata;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'teacher_remarks'
     AND COLUMN_NAME  = 'metadata'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE teacher_remarks ADD COLUMN metadata LONGTEXT NULL, ALGORITHM=INSTANT',
  'DO 0'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Ledger entry. All 349 existing rows are batch 1 (legacy Laravel import); this becomes batch 2,
-- the first hand-applied schema change of this migration. Guarded so re-runs add nothing.
--
-- NOTE the `FROM DUAL` + scalar subquery: writing this as
--   INSERT ... SELECT 'x', MAX(batch)+1 FROM migrations WHERE NOT EXISTS (...)
-- is WRONG — an aggregate without GROUP BY always yields one row, so when the guard filters
-- every row out the aggregate still returns a row (MAX of the empty set is NULL) and the insert
-- happens anyway, silently writing batch 1. Verified on MariaDB 11.5.2; the form below is
-- correct on both MariaDB and MySQL 8.
INSERT INTO migrations (migration, batch)
SELECT '2026_11_24_teacher_remarks_metadata',
       COALESCE((SELECT MAX(batch) FROM migrations), 0) + 1
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM migrations WHERE migration = '2026_11_24_teacher_remarks_metadata'
 );

-- Post-verify: expect exactly one row (longtext / YES) and an unchanged row count.
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'teacher_remarks'
   AND COLUMN_NAME  = 'metadata';

SELECT COUNT(*) AS teacher_remarks_rows FROM teacher_remarks;
