-- Drop MySQL telegram artifacts after the libSQL backfill is verified.
--
-- ORDER MATTERS:
--   1. Drop the connect_tokens table first (it has no FK to sm_parents in
--      practice, but if any column references sm_parents.id later, dropping
--      the table first avoids FK constraint violations).
--   2. Drop the telegram_chat_id index from sm_parents FIRST so the
--      ALTER TABLE DROP COLUMN doesn't fail with a "needed in a foreign key"
--      error (the UNIQUE index on telegram_chat_id may be used as a soft FK).
--   3. Then drop the three telegram_* columns from sm_parents.
--
-- SAFETY:
--   - Run the live backfill first (pnpm run migrate:telegram-links) and
--     verify SELECT count(*) parity between MySQL sm_parents.telegram_chat_id
--     and libSQL telegram_parent_link before executing this script.
--   - These operations are IRREVERSIBLE. Take a MySQL backup before running.

-- 1. Drop the connect_tokens table (entire table is going away)
DROP TABLE IF EXISTS connect_tokens;

-- 2. Drop the unique index on sm_parents.telegram_chat_id (if it exists)
--    so the column drop below doesn't fail
ALTER TABLE sm_parents DROP INDEX IF EXISTS sm_parents_telegram_chat_id_unique;

-- 3. Drop the three telegram_* columns from sm_parents
ALTER TABLE sm_parents DROP COLUMN telegram_chat_id;
ALTER TABLE sm_parents DROP COLUMN telegram_phone;
ALTER TABLE sm_parents DROP COLUMN telegram_linked_at;

-- VERIFICATION (run after):
--   SHOW TABLES LIKE 'connect_tokens';                    -- expect 0 rows
--   DESCRIBE sm_parents;                                  -- no telegram_* columns
--   SHOW INDEX FROM sm_parents WHERE Key_name LIKE '%telegram%';  -- expect empty
