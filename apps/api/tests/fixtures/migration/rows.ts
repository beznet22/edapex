/**
 * Deterministic miniature dump for the pure transform tests.
 *
 * The fixture deliberately contains one instance of each finding class:
 * R1/R2/R3, C1, P3, P4, F1, F2, D1, D2, duplicate term names, duplicate chat
 * group ids, a PDF photo and an excluded timeline row.
 */

export interface FixtureTable {
  readonly columns: readonly string[];
  readonly rows: readonly unknown[][];
}

export function makeDump(tables: Record<string, FixtureTable>): {
  tables: Map<string, { columns: string[]; rows: unknown[][] }>;
} {
  return {
    tables: new Map(
      Object.entries(tables).map(([name, table]) => [
        name,
        { columns: [...table.columns], rows: table.rows.map((row) => [...row]) }
      ])
    )
  };
}

export function buildDumpFixture(): {
  tables: Map<string, { columns: string[]; rows: unknown[][] }>;
} {
  return makeDump({
    infix_roles: {
      columns: ["id", "name", "school_id"],
      rows: [
        [1, "Admin", 1],
        [9, "Parent", 1]
      ]
    },
    users: {
      columns: [
        "id",
        "full_name",
        "email",
        "password",
        "usertype",
        "active_status",
        "created_at",
        "updated_at",
        "school_id",
        "role_id",
        "is_administrator"
      ],
      rows: [
        [1, "Admin", "admin@example.test", "hash-admin", null, 1, 100, 100, 1, 1, "yes"],
        [2, "Teacher", "teacher@example.test", "hash-teacher", "teacher", 1, 100, 100, 1, 2, "no"],
        [3, "Pending Teacher", "pending@example.test", "hash-pending", "teacher", 1, 100, 100, 1, 2, "no"],
        [4, "Duplicate A", "dup@example.test", "hash-dup-a", "parent", 1, 100, 100, 1, 9, "no"],
        [5, "Duplicate B", "dup@example.test", "hash-dup-b", "parent", 1, 100, 100, 1, 9, "no"],
        [6, "Parent One", "p1@example.test", "hash-p1", "parent", 1, 100, 100, 1, 9, "no"],
        [7, "Parent Shared", "shared@example.test", "hash-shared", "parent", 1, 100, 100, 1, 9, "no"],
        [8, "Orphan", "orphan@example.test", "hash-orphan", "teacher", 1, 100, 100, 1, 2, "no"]
      ]
    },
    sm_staffs: {
      columns: ["id", "full_name", "email", "user_id", "active_status", "school_id"],
      rows: [
        [1, "Teacher", "teacher@example.test", 2, 1, 1],
        [2, "Pending Teacher", "pending@example.test", null, 1, 1]
      ]
    },
    sm_academic_years: {
      columns: [
        "id",
        "year",
        "title",
        "starting_date",
        "ending_date",
        "copy_with_academic_year",
        "active_status",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
        "school_id"
      ],
      rows: [
        [1, "2024", "2024/2025", "2024-09-01", "2025-07-31", 0, 0, 100, 100, 1, 1, 1],
        [4, "2025", "2025/2026", "2025-09-01", "2026-07-31", 1, 1, 100, 100, 1, 1, 1]
      ]
    },
    sm_classes: {
      columns: [
        "id",
        "class_name",
        "pass_mark",
        "active_status",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
        "school_id",
        "academic_id",
        "parent_id"
      ],
      rows: [
        [1, "GRADE 1", null, 1, 100, 100, 1, 1, 1, 1, null],
        [12, "CRECHE", null, 1, 100, 100, 1, 1, 1, 4, null],
        [13, "NURSERY  1", null, 1, 100, 100, 1, 1, 1, 4, null],
        [22, "MIDDLE  BASIC 6", null, 1, 100, 100, 1, 1, 1, 4, null]
      ]
    },
    sm_parents: {
      columns: [
        "id",
        "guardians_name",
        "guardians_email",
        "guardians_mobile",
        "user_id",
        "school_id",
        "academic_id",
        "active_status",
        "created_at",
        "updated_at"
      ],
      rows: [
        [1, "Parent One", "p1@example.test", "0801", 6, 1, 4, 1, 100, 100],
        [2, "Parent Two", "p2@example.test", "0802", null, 1, 4, 1, 100, 100],
        [3, "Parent Three", "shared@example.test", "0803", 7, 1, 4, 1, 100, 100],
        [4, "Parent Four", "shared@example.test", "0804", 7, 1, 4, 1, 200, 200],
        [5, "Childless", "childless@example.test", "0805", null, 1, 4, 1, 100, 100],
        [6, "Parent Six", "p6@example.test", "0806", null, 1, 4, 1, 100, 100]
      ]
    },
    sm_students: {
      columns: [
        "id",
        "admission_no",
        "full_name",
        "student_photo",
        "active_status",
        "class_id",
        "section_id",
        "parent_id",
        "user_id",
        "school_id",
        "academic_id",
        "created_at",
        "updated_at"
      ],
      rows: [
        [1, 1001, "Student One", "/uploads/students/a.jpg", 1, null, null, 1, null, 1, 4, 100, 100],
        [2, 1002, "Student Two", "/uploads/students/b.pdf", 1, null, null, 3, null, 1, 4, 100, 100],
        [3, 1003, "Student Three", "/uploads/students/c.png", 1, null, null, 4, null, 1, 4, 100, 100],
        [4, 1004, "Student Four", null, 1, null, null, 6, null, 1, 4, 100, 100],
        [5, 1005, "Student Five", null, 1, null, null, null, null, 1, 1, 100, 100]
      ]
    },
    student_records: {
      columns: [
        "id",
        "class_id",
        "section_id",
        "is_promote",
        "is_default",
        "session_id",
        "school_id",
        "academic_id",
        "student_id",
        "active_status",
        "created_at",
        "updated_at",
        "is_graduate"
      ],
      rows: [
        [1, 12, 1, 0, 1, 4, 1, 4, 1, 1, 100, 100, 0],
        [2, 1, 1, 1, 0, 1, 1, 1, 1, 1, 50, 50, 0],
        [3, 12, 1, 0, 1, 4, 1, 4, 2, 1, 100, 100, 0],
        [4, 12, 1, 0, 1, 4, 1, 4, 2, 1, 200, 200, 0],
        [5, 12, 1, 0, 0, 4, 1, 4, 3, 1, 100, 100, 0],
        [6, 12, 1, 0, 1, 4, 1, 4, 4, 1, 100, 100, 0]
      ]
    },
    sm_exam_types: {
      columns: [
        "id",
        "active_status",
        "title",
        "is_average",
        "percentage",
        "average_mark",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
        "school_id",
        "academic_id",
        "parent_id",
        "percantage"
      ],
      rows: [
        [1, 1, "FIRST TERM EXAMINATION - DEC/2025", 0, null, 0, 100, 100, 1, 1, 1, 4, 0, 100],
        [2, 1, "FIRST TERM EXAMINATION - DEC/2025", 0, null, 0, 200, 200, 1, 1, 1, 4, 0, 100],
        [3, 1, "SECOND TERM EXAMINATION - MCH/2025", 0, null, 0, 100, 100, 1, 1, 1, 1, 0, 100]
      ]
    },
    sm_general_settings: {
      columns: [
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
        "extra_one",
        "extra_two"
      ],
      rows: [[1, 1, 4, 4, 1, 1, "School", "0800", "office@example.test", "Road", "logo.png", "x", "y"]]
    },
    sm_class_sections: {
      columns: [
        "id",
        "active_status",
        "created_at",
        "updated_at",
        "class_id",
        "section_id",
        "school_id",
        "academic_id",
        "parent_id"
      ],
      rows: [[1, 1, 100, 100, 12, 1, 1, 4, null]]
    },
    sm_student_timelines: {
      columns: ["id", "student_id", "academic_id", "title", "created_at"],
      rows: [[1, 1, 4, "Enrolled", 100]]
    },
    chat_groups: {
      columns: [
        "id",
        "name",
        "description",
        "created_by",
        "class_id",
        "section_id",
        "subject_id",
        "teacher_id",
        "school_id",
        "academic_id"
      ],
      rows: [
        [10, "Class Group", null, 1, 12, 1, null, 1, 1, 4],
        [10, "Duplicate Group", null, 1, 13, 1, null, 1, 1, 4]
      ]
    },
    chat_group_users: {
      columns: ["id", "group_id", "user_id", "role", "added_by", "created_at"],
      rows: [
        [1, 10, 1, 1, 1, 100],
        [2, 10, 2, 1, 1, 100]
      ]
    }
  });
}
