/**
 * `01a §6` / `05 §4`: the 106-column `sm_general_settings` row splits into the
 * queryable 12-column surface plus an `extras` JSON tail holding the remaining
 * 95 legacy fields verbatim.
 */
export const ACTIVE_SETTINGS_COLUMNS = Object.freeze([
  "id",
  "school_id",
  "academic_id",
  "session_id",
  "language_id",
  "date_format_id",
  "school_name",
  "phone",
  "email",
  "address",
  "logo",
  "identity"
]);

export function transformSettings(rows) {
  return rows.map((row) => {
    const extras = {};
    for (const [key, value] of Object.entries(row)) {
      if (!ACTIVE_SETTINGS_COLUMNS.includes(key)) extras[key] = value;
    }
    return {
      id: row.id,
      school_id: row.school_id,
      academic_id: row.academic_id,
      session_id: row.session_id,
      language_id: row.language_id,
      date_format_id: row.date_format_id,
      school_name: row.school_name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      logo: row.logo,
      identity: "",
      extras: JSON.stringify(extras)
    };
  });
}
