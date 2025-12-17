import {
  mysqlTable,
  varchar,
  int,
  timestamp,
  text,
  double,
  longtext,
  char,
  datetime,
  mysqlEnum,
  unique,
  check,
  date,
  index,
  time,
  decimal,
  bigint,
  tinyint,
  boolean,
  foreignKey,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const absentNotificationTimeSetups = mysqlTable("absent_notification_time_setups", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  timeFrom: varchar("time_from", { length: 191 }).default(sql`NULL`),
  timeTo: varchar("time_to", { length: 191 }).default(sql`NULL`),
  activeStatus: int("active_status").default(1).notNull(),
  schoolId: int("school_id").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const admitCards = mysqlTable("admit_cards", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  studentRecordId: int("student_record_id").notNull(),
  examTypeId: int("exam_type_id").notNull(),
  createdBy: int("created_by").notNull(),
  schoolId: int("school_id").default(1),
  academicId: int("academic_id").default(1),
  activeStatus: int("active_status").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const admitCardSettings = mysqlTable("admit_card_settings", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  studentPhoto: tinyint("student_photo").default(sql`NULL`),
  studentName: tinyint("student_name").default(sql`NULL`),
  admissionNo: tinyint("admission_no").default(sql`NULL`),
  classSection: tinyint("class_section").default(sql`NULL`),
  examName: tinyint("exam_name").default(sql`NULL`),
  academicYear: tinyint("academic_year").default(sql`NULL`),
  principalSignature: tinyint("principal_signature").default(sql`NULL`),
  classTeacherSignature: tinyint("class_teacher_signature").default(sql`NULL`),
  gaurdianName: tinyint("gaurdian_name").default(sql`NULL`),
  schoolAddress: tinyint("school_address").default(sql`NULL`),
  studentDownload: tinyint("student_download").default(sql`NULL`),
  parentDownload: tinyint("parent_download").default(sql`NULL`),
  studentNotification: tinyint("student_notification").default(sql`NULL`),
  parentNotification: tinyint("parent_notification").default(sql`NULL`),
  principalSignaturePhoto: varchar("principal_signature_photo", {
    length: 191,
  }).default(sql`NULL`),
  teacherSignaturePhoto: varchar("teacher_signature_photo", {
    length: 191,
  }).default(sql`NULL`),
  schoolId: int("school_id").default(1),
  academicId: int("academic_id").default(1),
  admitLayout: int("admit_layout").default(1).notNull(),
  admitSubTitle: varchar("admit_sub_title", { length: 191 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const allExamWisePositions = mysqlTable("all_exam_wise_positions", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  classId: int("class_id").default(sql`NULL`),
  sectionId: int("section_id").default(sql`NULL`),
  totalMark: double("total_mark", { precision: 8, scale: 2 }).default(sql`NULL`),
  position: int().default(sql`NULL`),
  rollNo: int("roll_no").default(sql`NULL`),
  admissionNo: int("admission_no").default(sql`NULL`),
  gpa: double({ precision: 8, scale: 2 }).default(sql`NULL`),
  grade: double({ precision: 8, scale: 2 }).default(sql`NULL`),
  recordId: int("record_id").default(sql`NULL`),
  schoolId: int("school_id").notNull(),
  academicId: int("academic_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const assignIncidents = mysqlTable("assign_incidents", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  point: int().default(sql`NULL`),
  incidentId: int("incident_id").notNull(),
  recordId: int("record_id").notNull(),
  studentId: int("student_id").default(sql`NULL`),
  addedBy: int("added_by").notNull(),
  academicId: int("academic_id").default(sql`NULL`),
  schoolId: int("school_id").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const assignIncidentComments = mysqlTable("assign_incident_comments", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  userId: int("user_id").default(sql`NULL`),
  comment: longtext().default(sql`NULL`),
  incidentId: int("incident_id").notNull(),
  schoolId: int("school_id").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const assignPermissions = mysqlTable(
  "assign_permissions",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    permissionId: int("permission_id").default(sql`NULL`),
    roleId: int("role_id").default(sql`NULL`),
    status: tinyint().default(1).notNull(),
    menuStatus: tinyint("menu_status").default(1).notNull(),
    saasSchools: text("saas_schools").default(sql`NULL`),
    createdBy: int("created_by").default(1).notNull(),
    updatedBy: int("updated_by").default(1).notNull(),
    schoolId: int("school_id").default(1),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    schoolFk: foreignKey({
      name: "ap_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const behaviourRecordSettings = mysqlTable("behaviour_record_settings", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  studentComment: int("student_comment").default(sql`NULL`),
  parentComment: int("parent_comment").default(sql`NULL`),
  studentView: int("student_view").default(sql`NULL`),
  parentView: int("parent_view").default(sql`NULL`),
  schoolId: int("school_id").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const chatBlockUsers = mysqlTable("chat_block_users", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  blockBy: bigint("block_by", { mode: "number" }).notNull(),
  blockTo: bigint("block_to", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const chatConversations = mysqlTable("chat_conversations", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  fromId: bigint("from_id", { mode: "number" }).default(sql`NULL`),
  toId: bigint("to_id", { mode: "number" }).default(sql`NULL`),
  message: text().default(sql`NULL`),
  status: tinyint().default(0).notNull(),
  messageType: tinyint("message_type").default(0).notNull(),
  fileName: text("file_name").default(sql`NULL`),
  originalFileName: text("original_file_name").default(sql`NULL`),
  initial: tinyint().default(0).notNull(),
  reply: bigint({ mode: "number" }).default(sql`NULL`),
  forward: bigint({ mode: "number" }).default(sql`NULL`),
  deletedByTo: tinyint("deleted_by_to").default(0).notNull(),
  deletedAt: timestamp("deleted_at", { mode: "string" }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const chatGroups = mysqlTable(
  "chat_groups",
  {
    id: char({ length: 36 }).notNull(),
    name: varchar({ length: 191 }).notNull(),
    description: varchar({ length: 191 }).default(sql`NULL`),
    photoUrl: varchar("photo_url", { length: 191 }).default(sql`NULL`),
    privacy: int().default(sql`NULL`),
    readOnly: tinyint("read_only").default(0).notNull(),
    groupType: int("group_type").default(1).notNull(),
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    classId: int("class_id").default(sql`NULL`),
    sectionId: int("section_id").default(sql`NULL`),
    subjectId: int("subject_id").default(sql`NULL`),
    teacherId: int("teacher_id").default(sql`NULL`),
    schoolId: int("school_id").default(sql`NULL`),
    academicId: int("academic_id").default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    classFk: foreignKey({
      name: "cg_class_id_fk",
      columns: [table.classId],
      foreignColumns: [smClasses.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    sectionFk: foreignKey({
      name: "cg_section_id_fk",
      columns: [table.sectionId],
      foreignColumns: [smSections.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    subjectFk: foreignKey({
      name: "cg_subject_id_fk",
      columns: [table.subjectId],
      foreignColumns: [smSubjects.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    teacherFk: foreignKey({
      name: "cg_teacher_id_fk",
      columns: [table.teacherId],
      foreignColumns: [smStaffs.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "cg_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "cg_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const chatGroupMessageRecipients = mysqlTable("chat_group_message_recipients", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  conversationId: bigint("conversation_id", { mode: "number" }).notNull(),
  groupId: varchar("group_id", { length: 191 }).notNull(),
  readAt: datetime("read_at", { mode: "string" }).default(sql`NULL`),
  deletedAt: timestamp("deleted_at", { mode: "string" }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const chatGroupMessageRemoves = mysqlTable("chat_group_message_removes", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  groupMessageRecipientId: bigint("group_message_recipient_id", {
    mode: "number",
  }).notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const chatGroupUsers = mysqlTable("chat_group_users", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  groupId: char("group_id", { length: 36 }).notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  role: int().default(1).notNull(),
  addedBy: bigint("added_by", { mode: "number" }).notNull(),
  removedBy: bigint("removed_by", { mode: "number" }).default(sql`NULL`),
  deletedAt: datetime("deleted_at", { mode: "string" }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const chatInvitations = mysqlTable("chat_invitations", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  from: int().notNull(),
  to: int().notNull(),
  status: tinyint().default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const chatInvitationTypes = mysqlTable("chat_invitation_types", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  invitationId: bigint("invitation_id", { mode: "number" }).notNull(),
  type: mysqlEnum("type", ["one-to-one", "group", "class-teacher"]).default("one-to-one").notNull(),
  sectionId: bigint("section_id", { mode: "number" }).default(sql`NULL`),
  classTeacherId: bigint("class_teacher_id", { mode: "number" }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const chatStatuses = mysqlTable("chat_statuses", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  status: tinyint().default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const checkClasses = mysqlTable("check_classes", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const classAttendances = mysqlTable(
  "class_attendances",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    daysOpened: int("days_opened").default(sql`NULL`),
    daysAbsent: int("days_absent").default(sql`NULL`),
    daysPresent: int("days_present").default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    examTypeId: int("exam_type_id").default(sql`NULL`),
    studentId: int("student_id").default(sql`NULL`),
    schoolId: int("school_id").default(sql`NULL`),
    academicId: int("academic_id").default(sql`NULL`),
  },
  (table) => ({
    studentExamUnique: unique("student_exam_unique").on(table.studentId, table.examTypeId),
    examTypeFk: foreignKey({
      name: "ca_exam_type_id_fk",
      columns: [table.examTypeId],
      foreignColumns: [smExamTypes.id],
    })
      .onDelete("set null")
      .onUpdate("restrict"),
    studentFk: foreignKey({
      name: "ca_student_id_fk",
      columns: [table.studentId],
      foreignColumns: [smStudents.id],
    })
      .onDelete("set null")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "ca_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("set null")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "ca_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("set null")
      .onUpdate("restrict"),
  })
);

export const colors = mysqlTable("colors", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  name: varchar({ length: 191 }).default(sql`NULL`),
  isColor: tinyint("is_color").default(1),
  status: tinyint().default(1),
  defaultValue: varchar("default_value", { length: 191 }).default(sql`NULL`),
  lawnGreen: varchar("lawn_green", { length: 191 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const colorTheme = mysqlTable(
  "color_theme",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    colorId: bigint("color_id", { mode: "number" }).default(sql`NULL`),
    value: varchar({ length: 191 }).default(sql`NULL`),
    themeId: bigint("theme_id", { mode: "number" }).default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    colorFk: foreignKey({
      name: "ct_color_id_fk",
      columns: [table.colorId],
      foreignColumns: [colors.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    themeFk: foreignKey({
      name: "ct_theme_id_fk",
      columns: [table.themeId],
      foreignColumns: [themes.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const comments = mysqlTable(
  "comments",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    text: text().notNull(),
    isFlagged: tinyint("is_flagged").default(0).notNull(),
    type: varchar({ length: 256 }).default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    schoolId: int("school_id").default(sql`NULL`),
    academicId: int("academic_id").default(sql`NULL`),
  },
  (table) => ({
    schoolFk: foreignKey({
      name: "com_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("set null")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "com_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("set null")
      .onUpdate("restrict"),
  })
);

export const commentPivots = mysqlTable(
  "comment_pivots",
  {
    commentId: bigint("comment_id", { mode: "number" }).default(sql`NULL`),
    commentTagId: bigint("comment_tag_id", { mode: "number" }).default(sql`NULL`),
  },
  (table) => ({
    commentFk: foreignKey({
      name: "cp_comment_id_fk",
      columns: [table.commentId],
      foreignColumns: [comments.id],
    })
      .onDelete("set null")
      .onUpdate("restrict"),
    commentTagFk: foreignKey({
      name: "cp_comment_tag_id_fk",
      columns: [table.commentTagId],
      foreignColumns: [commentTags.id],
    })
      .onDelete("set null")
      .onUpdate("restrict"),
  })
);

export const commentTags = mysqlTable(
  "comment_tags",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    tag: varchar({ length: 256 }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    academicId: int("academic_id").default(sql`NULL`),
  },
  (table) => ({
    tagUnique: unique("comment_tags_tag_unique").on(table.tag),
    academicFk: foreignKey({
      name: "ct_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("set null")
      .onUpdate("restrict"),
  })
);

export const contents = mysqlTable(
  "contents",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    fileName: varchar("file_name", { length: 191 }).default(sql`NULL`),
    fileSize: int("file_size").default(sql`NULL`),
    contentTypeId: int("content_type_id").notNull(),
    youtubeLink: varchar("youtube_link", { length: 191 }).default(sql`NULL`),
    uploadFile: varchar("upload_file", { length: 200 }).default(sql`NULL`),
    uploadedBy: int("uploaded_by").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    academicId: int("academic_id").default(sql`NULL`),
    schoolId: int("school_id").default(1),
  },
  (table) => ({
    academicFk: foreignKey({
      name: "con_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "con_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const contentShareLists = mysqlTable(
  "content_share_lists",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    title: varchar({ length: 191 }).default(sql`NULL`),
    // you can use { mode: 'date' }, if you want to have Date as type for this column
    shareDate: date("share_date", { mode: "string" }).default(sql`NULL`),
    // you can use { mode: 'date' }, if you want to have Date as type for this column
    validUpto: date("valid_upto", { mode: "string" }).default(sql`NULL`),
    description: text().default(sql`NULL`),
    sendType: varchar("send_type", { length: 191 }).default(sql`NULL`),
    contentIds: longtext("content_ids").default(sql`NULL`),
    grRoleIds: longtext("gr_role_ids").default(sql`NULL`),
    indUserIds: longtext("ind_user_ids").default(sql`NULL`),
    classId: int("class_id").default(sql`NULL`),
    sectionIds: longtext("section_ids").default(sql`NULL`),
    url: text().default(sql`NULL`),
    sharedBy: int("shared_by").default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    academicId: int("academic_id").default(sql`NULL`),
    schoolId: int("school_id").default(1),
  },
  (table) => ({
    contentIdsCheck: check("content_ids", sql`json_valid(\`content_ids\`)`),
    grRoleIdsCheck: check("gr_role_ids", sql`json_valid(\`gr_role_ids\`)`),
    indUserIdsCheck: check("ind_user_ids", sql`json_valid(\`ind_user_ids\`)`),
    sectionIdsCheck: check("section_ids", sql`json_valid(\`section_ids\`)`),
    academicFk: foreignKey({
      name: "csl_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "csl_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const contentTypes = mysqlTable(
  "content_types",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    name: varchar({ length: 100 }).notNull(),
    description: text().default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    academicId: int("academic_id").default(sql`NULL`),
    schoolId: int("school_id").default(1),
  },
  (table) => ({
    academicFk: foreignKey({
      name: "cty_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "cty_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const continents = mysqlTable(
  "continents",
  {
    id: int().autoincrement().primaryKey().notNull(),
    code: varchar({ length: 191 }).notNull(),
    name: varchar({ length: 191 }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    schoolId: int("school_id").default(1),
  },
  (table) => ({
    schoolFk: foreignKey({
      name: "cont_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const continets = mysqlTable(
  "continets",
  {
    id: int().autoincrement().primaryKey().notNull(),
    code: varchar({ length: 255 }).default(sql`NULL`),
    name: varchar({ length: 255 }).default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
  },
  (table) => ({
    schoolFk: foreignKey({
      name: "conts_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const countries = mysqlTable(
  "countries",
  {
    id: int().autoincrement().primaryKey().notNull(),
    code: varchar({ length: 191 }).notNull(),
    name: varchar({ length: 191 }).notNull(),
    native: varchar({ length: 191 }).notNull(),
    phone: varchar({ length: 191 }).notNull(),
    continent: varchar({ length: 191 }).notNull(),
    capital: varchar({ length: 191 }).notNull(),
    currency: varchar({ length: 191 }).notNull(),
    languages: varchar({ length: 191 }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    schoolId: int("school_id").default(1),
    academicId: int("academic_id").default(1),
  },
  (table) => ({
    schoolFk: foreignKey({
      name: "cou_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "cou_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const customResultSettings = mysqlTable(
  "custom_result_settings",
  {
    id: int().autoincrement().primaryKey().notNull(),
    examTypeId: int("exam_type_id").default(sql`NULL`),
    examPercentage: double("exam_percentage", { precision: 8, scale: 2 }).default(sql`NULL`),
    meritListSetting: varchar("merit_list_setting", { length: 191 }).notNull(),
    printStatus: varchar("print_status", { length: 191 }).default(sql`NULL`),
    profileImage: varchar("profile_image", { length: 191 }).default(sql`NULL`),
    headerBackground: varchar("header_background", { length: 191 }).default(sql`NULL`),
    bodyBackground: varchar("body_background", { length: 191 }).default(sql`NULL`),
    academicYear: int("academic_year").default(sql`NULL`),
    schoolId: int("school_id").default(1),
    academicId: int("academic_id").default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    verticalBoarder: varchar("vertical_boarder", { length: 191 }).default(sql`NULL`),
  },
  (table) => ({
    schoolFk: foreignKey({
      name: "crs_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "crs_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const customSmsSettings = mysqlTable("custom_sms_settings", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  gatewayId: int("gateway_id").notNull(),
  gatewayName: varchar("gateway_name", { length: 191 }).notNull(),
  setAuth: varchar("set_auth", { length: 191 }).default(sql`NULL`),
  gatewayUrl: varchar("gateway_url", { length: 191 }).notNull(),
  requestMethod: varchar("request_method", { length: 191 }).notNull(),
  sendToParameterName: varchar("send_to_parameter_name", {
    length: 191,
  }).notNull(),
  messegeToParameterName: varchar("messege_to_parameter_name", {
    length: 191,
  }).notNull(),
  paramKey1: varchar("param_key_1", { length: 191 }).default(sql`NULL`),
  paramValue1: varchar("param_value_1", { length: 191 }).default(sql`NULL`),
  paramKey2: varchar("param_key_2", { length: 191 }).default(sql`NULL`),
  paramValue2: varchar("param_value_2", { length: 191 }).default(sql`NULL`),
  paramKey3: varchar("param_key_3", { length: 191 }).default(sql`NULL`),
  paramValue3: varchar("param_value_3", { length: 191 }).default(sql`NULL`),
  paramKey4: varchar("param_key_4", { length: 191 }).default(sql`NULL`),
  paramValue4: varchar("param_value_4", { length: 191 }).default(sql`NULL`),
  paramKey5: varchar("param_key_5", { length: 191 }).default(sql`NULL`),
  paramValue5: varchar("param_value_5", { length: 191 }).default(sql`NULL`),
  paramKey6: varchar("param_key_6", { length: 191 }).default(sql`NULL`),
  paramValue6: varchar("param_value_6", { length: 191 }).default(sql`NULL`),
  paramKey7: varchar("param_key_7", { length: 191 }).default(sql`NULL`),
  paramValue7: varchar("param_value_7", { length: 191 }).default(sql`NULL`),
  paramKey8: varchar("param_key_8", { length: 191 }).default(sql`NULL`),
  paramValue8: varchar("param_value_8", { length: 191 }).default(sql`NULL`),
  schoolId: int("school_id").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const directFeesInstallments = mysqlTable(
  "direct_fees_installments",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    title: varchar({ length: 191 }).notNull(),
    feesMasterId: int("fees_master_id").notNull(),
    percentange: double({ precision: 8, scale: 2 }).notNull(),
    amount: double({ precision: 8, scale: 2 }).notNull(),
    // you can use { mode: 'date' }, if you want to have Date as type for this column
    dueDate: date("due_date", { mode: "string" }).notNull(),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    academicId: int("academic_id").default(1),
    schoolId: int("school_id").default(1),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    schoolFk: foreignKey({
      name: "dfi_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const directFeesInstallmentAssigns = mysqlTable(
  "direct_fees_installment_assigns",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey().notNull(),
    feesInstallmentId: int("fees_installment_id").notNull(),
    feesMasterIds: text("fees_master_ids").default(sql`NULL`),
    amount: double("amount", { precision: 10, scale: 2 }).default(sql`NULL`),
    paidAmount: double("paid_amount", { precision: 10, scale: 2 }).default(sql`NULL`),
    dueDate: date("due_date", { mode: "string" }).default(sql`NULL`),
    paymentDate: date("payment_date", { mode: "string" }).default(sql`NULL`),
    paymentMode: varchar("payment_mode", { length: 100 }).default(sql`NULL`),
    note: text("note").default(sql`NULL`),
    slip: varchar("slip", { length: 191 }).default(sql`NULL`),
    activeStatus: tinyint("active_status").default(0).notNull(),
    assignIds: text("assign_ids").default(sql`NULL`),
    bankId: int("bank_id").default(sql`NULL`), // Moved reference definition below
    discountAmount: double("discount_amount", { precision: 10, scale: 2 }),
    feesDiscountId: int("fees_discount_id").default(sql`NULL`), // Moved reference definition below
    feesTypeId: int("fees_type_id").default(sql`NULL`), // Moved reference definition below
    studentId: int("student_id").default(sql`NULL`), // Moved reference definition below
    recordId: int("record_id").default(sql`NULL`),
    collectedBy: int("collected_by").default(1),
    academicId: int("academic_id").default(1),
    createdBy: int("created_by").default(sql`NULL`),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1), // Moved reference definition below
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => {
    return {
      // Define foreign keys here with explicit names
      bankFk: foreignKey({
        name: "dfia_bank_id_fk", // Shortened name
        columns: [table.bankId],
        foreignColumns: [smBankAccounts.id],
      })
        .onDelete("cascade")
        .onUpdate("restrict"),
      feesDiscountFk: foreignKey({
        name: "dfia_fees_discount_id_fk", // Shortened name
        columns: [table.feesDiscountId],
        foreignColumns: [smFeesDiscounts.id],
      })
        .onDelete("cascade")
        .onUpdate("restrict"),
      feesTypeFk: foreignKey({
        name: "dfia_fees_type_id_fk", // Shortened name
        columns: [table.feesTypeId],
        foreignColumns: [smFeesTypes.id],
      })
        .onDelete("cascade")
        .onUpdate("restrict"),
      studentFk: foreignKey({
        name: "dfia_student_id_fk", // Shortened name
        columns: [table.studentId],
        foreignColumns: [smStudents.id],
      })
        .onDelete("cascade")
        .onUpdate("restrict"),
      schoolFk: foreignKey({
        name: "dfia_school_id_fk", // Shortened name
        columns: [table.schoolId],
        foreignColumns: [smSchools.id],
      })
        .onDelete("cascade")
        .onUpdate("restrict"),
    };
  }
);

export const directFeesReminders = mysqlTable(
  "direct_fees_reminders",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    dueDateBefore: int("due_date_before").notNull(),
    notificationTypes: varchar("notification_types", { length: 191 }).notNull(),
    academicId: int("academic_id").default(1),
    schoolId: int("school_id").default(1),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    schoolFk: foreignKey({
      name: "dfr_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const directFeesSettings = mysqlTable(
  "direct_fees_settings",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    feesInstallment: tinyint("fees_installment").default(0).notNull(),
    feesReminder: tinyint("fees_reminder").default(0).notNull(),
    reminderBefore: int("reminder_before").default(5).notNull(),
    noInstallment: int("no_installment").default(0).notNull(),
    dueDateFromSem: int("due_date_from_sem").default(10).notNull(),
    endDay: int("end_day").default(sql`NULL`),
    academicId: int("academic_id").default(sql`NULL`),
    schoolId: int("school_id").default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    schoolFk: foreignKey({
      name: "dfs_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const direFeesInstallmentChildPayments = mysqlTable(
  "dire_fees_installment_child_payments",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey().notNull(),
    directFeesInstallmentAssignId: int("direct_fees_installment_assign_id").notNull(),
    invoiceNo: int("invoice_no").default(1).notNull(),
    amount: double("amount", { precision: 10, scale: 2 }).default(sql`NULL`),
    paidAmount: double("paid_amount", { precision: 10, scale: 2 }).default(sql`NULL`),
    balanceAmount: double("balance_amount", { precision: 10, scale: 2 }).default(sql`NULL`),
    paymentDate: date("payment_date", { mode: "string" }).default(sql`NULL`),
    paymentMode: varchar("payment_mode", { length: 100 }).default(sql`NULL`),
    note: text("note").default(sql`NULL`),
    slip: varchar("slip", { length: 191 }).default(sql`NULL`),
    activeStatus: tinyint("active_status").default(0).notNull(),
    bankId: int("bank_id").default(sql`NULL`), // Remove .references() here
    discountAmount: double("discount_amount", { precision: 10, scale: 2 }),
    feesTypeId: int("fees_type_id").default(sql`NULL`), // Remove .references() here
    studentId: int("student_id").default(sql`NULL`), // Remove .references() here
    recordId: int("record_id").default(sql`NULL`),
    createdBy: int("created_by").default(sql`NULL`),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1), // Remove .references() here
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => {
    return {
      // Define all foreign keys here with explicit names
      bankFk: foreignKey({
        name: "dficp_bank_id_sm_bank_accounts_id_fk",
        columns: [table.bankId],
        foreignColumns: [smBankAccounts.id],
      })
        .onDelete("cascade")
        .onUpdate("restrict"),
      feesTypeFk: foreignKey({
        name: "dficp_fees_type_id_sm_fees_types_id_fk",
        columns: [table.feesTypeId],
        foreignColumns: [smFeesTypes.id],
      })
        .onDelete("cascade")
        .onUpdate("restrict"),
      studentFk: foreignKey({
        name: "dficp_student_id_sm_students_id_fk",
        columns: [table.studentId],
        foreignColumns: [smStudents.id],
      })
        .onDelete("cascade")
        .onUpdate("restrict"),
      schoolFk: foreignKey({
        name: "dficp_school_id_sm_schools_id_fk",
        columns: [table.schoolId],
        foreignColumns: [smSchools.id],
      })
        .onDelete("cascade")
        .onUpdate("restrict"),
    };
  }
);

export const dueFeesLoginPrevents = mysqlTable(
  "due_fees_login_prevents",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    userId: int("user_id").default(sql`NULL`),
    roleId: int("role_id").default(sql`NULL`),
    schoolId: int("school_id").default(1).notNull(),
    academicId: int("academic_id").default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    userFk: foreignKey({
      name: "dflp_user_id_fk",
      columns: [table.userId],
      foreignColumns: [users.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    roleFk: foreignKey({
      name: "dflp_role_id_fk",
      columns: [table.roleId],
      foreignColumns: [infixRoles.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "dflp_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "dflp_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const examMeritPositions = mysqlTable("exam_merit_positions", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  classId: int("class_id").default(sql`NULL`),
  sectionId: int("section_id").default(sql`NULL`),
  examTermId: int("exam_term_id").default(sql`NULL`),
  totalMark: double("total_mark").default(sql`NULL`),
  position: int().default(sql`NULL`),
  admissionNo: int("admission_no").default(sql`NULL`),
  gpa: double({ precision: 8, scale: 2 }).default(sql`NULL`),
  grade: varchar({ length: 191 }).default(sql`NULL`),
  recordId: int("record_id").default(sql`NULL`),
  schoolId: int("school_id").notNull(),
  academicId: int("academic_id").notNull(),
  activeStatus: int("active_status").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const examStepSkips = mysqlTable(
  "exam_step_skips",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    name: varchar({ length: 50 }).default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
    academicId: int("academic_id").default(1),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    schoolFk: foreignKey({
      name: "ess_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "ess_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const failedJobs = mysqlTable(
  "failed_jobs",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    uuid: varchar({ length: 191 }).notNull(),
    connection: text().notNull(),
    queue: text().notNull(),
    payload: longtext().notNull(),
    exception: longtext().notNull(),
    failedAt: timestamp("failed_at", { mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [unique("failed_jobs_uuid_unique").on(table.uuid)]
);

export const feesCarryForwardLogs = mysqlTable(
  "fees_carry_forward_logs",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    studentRecordId: int("student_record_id").notNull(),
    note: text().notNull(),
    amount: double({ precision: 8, scale: 2 }).notNull(),
    amountType: varchar("amount_type", { length: 191 }).notNull(),
    createdBy: int("created_by").default(sql`NULL`),
    updatedBy: int("updated_by").default(sql`NULL`),
    type: varchar({ length: 191 }).notNull(),
    date: timestamp({ mode: "string" }).notNull(),
    schoolId: int("school_id").default(1),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    schoolFk: foreignKey({
      name: "fcfl_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const feesCarryForwardSettings = mysqlTable(
  "fees_carry_forward_settings",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    title: varchar({ length: 191 }).notNull(),
    feesDueDays: int("fees_due_days").notNull(),
    paymentGateway: varchar("payment_gateway", { length: 191 }).notNull(),
    schoolId: int("school_id").default(1),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    schoolFk: foreignKey({
      name: "fcfs_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const feesInstallmentCredits = mysqlTable("fees_installment_credits", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  studentId: int("student_id").notNull(),
  studentRecordId: int("student_record_id").notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  schoolId: int("school_id").notNull(),
  amount: double({ precision: 8, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const feesInvoices = mysqlTable(
  "fees_invoices",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    prefix: varchar({ length: 191 }).default(sql`NULL`),
    startForm: int("start_form").default(sql`NULL`),
    unAcademicId: int("un_academic_id").default(1),
    schoolId: int("school_id").default(1),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    schoolFk: foreignKey({
      name: "fi_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const feesInvoiceSettings = mysqlTable(
  "fees_invoice_settings",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    perTh: int("per_th").default(2).notNull(),
    invoiceType: varchar("invoice_type", { length: 191 }).default("invoice").notNull(),
    studentName: tinyint("student_name").default(1).notNull(),
    studentSection: tinyint("student_section").default(1).notNull(),
    studentClass: tinyint("student_class").default(1).notNull(),
    studentRoll: tinyint("student_roll").default(1).notNull(),
    studentGroup: tinyint("student_group").default(1).notNull(),
    studentAdmissionNo: tinyint("student_admission_no").default(1).notNull(),
    footer1: varchar("footer_1", { length: 255 }).default("Parent/Student"),
    footer2: varchar("footer_2", { length: 255 }).default("Casier").notNull(),
    footer3: varchar("footer_3", { length: 255 }).default("Officer").notNull(),
    signatureP: tinyint("signature_p").default(1).notNull(),
    signatureC: tinyint("signature_c").default(1).notNull(),
    signatureO: tinyint("signature_o").default(1).notNull(),
    cSignatureP: tinyint("c_signature_p").default(1).notNull(),
    cSignatureC: tinyint("c_signature_c").default(0).notNull(),
    cSignatureO: tinyint("c_signature_o").default(1).notNull(),
    copyS: varchar("copy_s", { length: 255 }).default("Parent/Student"),
    copyO: varchar("copy_o", { length: 255 }).default("Office").notNull(),
    copyC: varchar("copy_c", { length: 255 }).default("Casier").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    copyWriteMsg: text("copy_write_msg").default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
    academicId: int("academic_id").default(1),
  },
  (table) => ({
    createdByFk: foreignKey({
      name: "fis_created_by_fk",
      columns: [table.createdBy],
      foreignColumns: [users.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    updatedByFk: foreignKey({
      name: "fis_updated_by_fk",
      columns: [table.updatedBy],
      foreignColumns: [users.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "fis_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "fis_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const fmFeesGroups = mysqlTable("fm_fees_groups", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  name: varchar({ length: 200 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id").default(1),
  academicId: int("academic_id").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const fmFeesInvoices = mysqlTable(
  "fm_fees_invoices",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    invoiceId: varchar("invoice_id", { length: 191 }).notNull(),
    studentId: int("student_id").default(sql`NULL`),
    classId: int("class_id").default(sql`NULL`),
    // you can use { mode: 'date' }, if you want to have Date as type for this column
    createDate: date("create_date", { mode: "string" }).default(sql`NULL`),
    // you can use { mode: 'date' }, if you want to have Date as type for this column
    dueDate: date("due_date", { mode: "string" }).default(sql`NULL`),
    paymentStatus: varchar("payment_status", { length: 191 }).default(sql`NULL`),
    paymentMethod: varchar("payment_method", { length: 191 }).default(sql`NULL`),
    bankId: int("bank_id").default(sql`NULL`),
    type: varchar({ length: 191 }).default("fees"),
    schoolId: int("school_id").default(sql`NULL`),
    academicId: int("academic_id").default(sql`NULL`),
    activeStatus: int("active_status").default(1),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    recordId: bigint("record_id", { mode: "number" }).default(sql`NULL`),
  },
  (table) => ({
    studentFk: foreignKey({
      name: "fmfi_student_id_fk",
      columns: [table.studentId],
      foreignColumns: [smStudents.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const fmFeesInvoiceChields = mysqlTable(
  "fm_fees_invoice_chields",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    feesInvoiceId: bigint("fees_invoice_id", { mode: "number" }).default(sql`NULL`),
    feesType: int("fees_type").default(sql`NULL`),
    amount: double({ precision: 8, scale: 2 }).default(sql`NULL`),
    weaver: double({ precision: 8, scale: 2 }).default(sql`NULL`),
    fine: double({ precision: 8, scale: 2 }).default(sql`NULL`),
    subTotal: double("sub_total", { precision: 8, scale: 2 }).default(sql`NULL`),
    paidAmount: double("paid_amount", { precision: 8, scale: 2 }).default(sql`NULL`),
    serviceCharge: double("service_charge", { precision: 8, scale: 2 }).default(sql`NULL`),
    dueAmount: double("due_amount", { precision: 8, scale: 2 }).default(sql`NULL`),
    note: varchar({ length: 191 }).default(sql`NULL`),
    schoolId: int("school_id").default(sql`NULL`),
    academicId: int("academic_id").default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    feesInvoiceFk: foreignKey({
      name: "fmfic_fees_invoice_id_fk",
      columns: [table.feesInvoiceId],
      foreignColumns: [fmFeesInvoices.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const fmFeesInvoiceSettings = mysqlTable("fm_fees_invoice_settings", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  invoicePositions: text("invoice_positions").default(sql`NULL`),
  uniqIdStart: varchar("uniq_id_start", { length: 191 }).default(sql`NULL`),
  prefix: varchar({ length: 191 }).default(sql`NULL`),
  classLimit: int("class_limit").default(sql`NULL`),
  sectionLimit: int("section_limit").default(sql`NULL`),
  admissionLimit: int("admission_limit").default(sql`NULL`),
  weaver: varchar({ length: 191 }).default(sql`NULL`),
  schoolId: int("school_id").default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const fmFeesTransactions = mysqlTable(
  "fm_fees_transactions",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    invoiceNumber: varchar("invoice_number", { length: 191 }).default(sql`NULL`),
    studentId: int("student_id").default(sql`NULL`),
    userId: int("user_id").default(sql`NULL`),
    paymentMethod: varchar("payment_method", { length: 191 }).default(sql`NULL`),
    bankId: int("bank_id").default(sql`NULL`),
    addWalletMoney: double("add_wallet_money", {
      precision: 8,
      scale: 2,
    }).default(sql`NULL`),
    paymentNote: varchar("payment_note", { length: 191 }).default(sql`NULL`),
    file: text().default(sql`NULL`),
    paidStatus: varchar("paid_status", { length: 191 }).default(sql`NULL`),
    feesInvoiceId: bigint("fees_invoice_id", { mode: "number" }).default(sql`NULL`),
    schoolId: int("school_id").default(sql`NULL`),
    academicId: int("academic_id").default(sql`NULL`),
    serviceCharge: double("service_charge", { precision: 8, scale: 2 }).default(sql`NULL`),
    activeStatus: int("active_status").default(1),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    recordId: bigint("record_id", { mode: "number" }).default(sql`NULL`),
    totalPaidAmount: varchar("total_paid_amount", { length: 191 }).default(sql`NULL`),
  },
  (table) => ({
    feesInvoiceFk: foreignKey({
      name: "fmft_fees_invoice_id_fk",
      columns: [table.feesInvoiceId],
      foreignColumns: [fmFeesInvoices.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const fmFeesTransactionChields = mysqlTable(
  "fm_fees_transaction_chields",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey().notNull(),
    feesType: varchar("fees_type", { length: 191 }).default(sql`NULL`),
    paidAmount: double("paid_amount", { precision: 8, scale: 2 }).default(sql`NULL`),
    serviceCharge: double("service_charge", { precision: 8, scale: 2 }).default(sql`NULL`),
    fine: double("fine", { precision: 8, scale: 2 }).default(sql`NULL`),
    weaver: double("weaver", { precision: 8, scale: 2 }).default(sql`NULL`),
    note: varchar("note", { length: 191 }).default(sql`NULL`),
    feesTransactionId: bigint("fees_transaction_id", { mode: "number" }).default(sql`NULL`),
    schoolId: int("school_id").default(sql`NULL`),
    academicId: int("academic_id").default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => {
    return {
      // Define foreign key here with an explicit, short name (under 64 characters)
      feesTransactionFk: foreignKey({
        name: "fmtc_fees_transaction_id_fk", // Manually set a short name
        columns: [table.feesTransactionId],
        foreignColumns: [fmFeesTransactions.id],
      })
        .onDelete("cascade")
        .onUpdate("restrict"),
    };
  }
);

export const fmFeesTypes = mysqlTable("fm_fees_types", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  name: varchar({ length: 230 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  feesGroupId: int("fees_group_id").default(1),
  type: varchar({ length: 191 }).default("fees"),
  courseId: int("course_id").default(sql`NULL`),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id").default(1),
  academicId: int("academic_id").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const fmFeesWeavers = mysqlTable("fm_fees_weavers", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  feesInvoiceId: bigint("fees_invoice_id", { mode: "number" })
    .default(sql`NULL`)
    .references(() => fmFeesInvoices.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  feesType: int("fees_type").default(sql`NULL`),
  studentId: int("student_id").default(sql`NULL`),
  weaver: double({ precision: 8, scale: 2 }).default(sql`NULL`),
  note: varchar({ length: 191 }).default(sql`NULL`),
  schoolId: int("school_id").default(sql`NULL`),
  academicId: int("academic_id").default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const frontendExamResults = mysqlTable("frontend_exam_results", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  mainTitle: varchar("main_title", { length: 191 }).default(sql`NULL`),
  mainDescription: text("main_description").default(sql`NULL`),
  image: varchar({ length: 191 }).default(sql`NULL`),
  mainImage: varchar("main_image", { length: 191 }).default(sql`NULL`),
  buttonText: varchar("button_text", { length: 191 }).default(sql`NULL`),
  buttonUrl: varchar("button_url", { length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const frontAcademicCalendars = mysqlTable("front_academic_calendars", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  publishDate: varchar("publish_date", { length: 191 }).default(sql`NULL`),
  calendarFile: varchar("calendar_file", { length: 191 }).default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const frontClassRoutines = mysqlTable("front_class_routines", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  publishDate: varchar("publish_date", { length: 191 }).default(sql`NULL`),
  resultFile: varchar("result_file", { length: 191 }).default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const frontExamRoutines = mysqlTable("front_exam_routines", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  publishDate: varchar("publish_date", { length: 191 }).default(sql`NULL`),
  resultFile: varchar("result_file", { length: 191 }).default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const frontResults = mysqlTable("front_results", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  publishDate: varchar("publish_date", { length: 191 }).default(sql`NULL`),
  resultFile: varchar("result_file", { length: 191 }).default(sql`NULL`),
  link: varchar({ length: 191 }).default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const graduates = mysqlTable("graduates", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  recordId: int("record_id").default(sql`NULL`),
  studentId: int("student_id")
    .default(sql`NULL`)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(sql`NULL`),
  unDepartmentId: int("un_department_id").default(sql`NULL`),
  unFacultyId: int("un_faculty_id").default(sql`NULL`),
  graduationDate: int("graduation_date").default(sql`NULL`),
  unSessionId: int("un_session_id").default(1),
  schoolId: int("school_id")
    .default(1)
    .notNull()
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sessionId: int("session_id")
    .default(sql`NULL`)
    .references(() => smSessions.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const homeSliders = mysqlTable("home_sliders", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  image: varchar({ length: 191 }).notNull(),
  link: varchar({ length: 191 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const incidents = mysqlTable("incidents", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  point: int().default(sql`NULL`),
  description: text().default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .notNull()
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const infixeduPages = mysqlTable(
  "infixedu__pages",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    name: varchar({ length: 191 }).notNull(),
    title: varchar({ length: 191 }).notNull(),
    description: text().default(sql`NULL`),
    slug: varchar({ length: 191 }).default(sql`NULL`),
    settings: longtext().default(sql`NULL`),
    homePage: tinyint("home_page").default(0),
    isDefault: tinyint("is_default").default(0),
    status: mysqlEnum(["draft", "published"]).default("draft").notNull(),
    createdBy: int("created_by").default(sql`NULL`),
    updatedBy: int("updated_by").default(sql`NULL`),
    publishedBy: int("published_by").default(sql`NULL`),
    schoolId: int("school_id")
      .notNull()
      .references(() => smSchools.id, {
        onDelete: "cascade",
        onUpdate: "restrict",
      }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => [
    index("infixedu__pages_status_index").on(table.status),
    index("infixedu__pages_name_fulltext").on(table.name),
  ]
);

export const infixeduSettings = mysqlTable("infixedu__settings", {
  section: varchar({ length: 191 }).notNull(),
  key: varchar({ length: 191 }).notNull(),
  value: text().default(sql`NULL`),
});

export const infixModuleInfos = mysqlTable("infix_module_infos", {
  id: int().autoincrement().primaryKey().notNull(),
  moduleId: int("module_id").default(sql`NULL`),
  moduleName: varchar("module_name", { length: 191 }).default(sql`NULL`),
  parentId: int("parent_id").default(0),
  name: varchar({ length: 191 }).default(sql`NULL`),
  isSaas: tinyint("is_saas").default(0).notNull(),
  route: varchar({ length: 191 }).default(sql`NULL`),
  parentRoute: varchar("parent_route", { length: 191 }).default(sql`NULL`),
  langName: varchar("lang_name", { length: 191 }).default(sql`NULL`),
  iconClass: varchar("icon_class", { length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdBy: int("created_by")
    .default(1)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  updatedBy: int("updated_by")
    .default(1)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  schoolId: int("school_id")
    .default(sql`NULL`)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  type: int().default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const infixModuleManagers = mysqlTable("infix_module_managers", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  name: varchar({ length: 200 }).default(sql`NULL`),
  email: varchar({ length: 200 }).default(sql`NULL`),
  notes: varchar({ length: 255 }).default(sql`NULL`),
  version: varchar({ length: 200 }).default(sql`NULL`),
  updateUrl: varchar("update_url", { length: 200 }).default(sql`NULL`),
  purchaseCode: varchar("purchase_code", { length: 200 }).default(sql`NULL`),
  checksum: varchar({ length: 200 }).default(sql`NULL`),
  installedDomain: varchar("installed_domain", { length: 200 }).default(sql`NULL`),
  isDefault: tinyint("is_default").default(0).notNull(),
  addonUrl: varchar("addon_url", { length: 191 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  activatedDate: date("activated_date", { mode: "string" }).default(sql`NULL`),
  langType: int("lang_type").default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const infixModuleStudentParentInfos = mysqlTable(
  "infix_module_student_parent_infos",
  {
    id: int().autoincrement().primaryKey().notNull(),
    moduleId: int("module_id").default(sql`NULL`),
    parentId: int("parent_id").default(0),
    name: varchar({ length: 191 }).default(sql`NULL`),
    route: varchar({ length: 191 }).default(sql`NULL`),
    langName: varchar("lang_name", { length: 191 }).default(sql`NULL`),
    iconClass: varchar("icon_class", { length: 191 }).default(sql`NULL`),
    activeStatus: tinyint("active_status").default(1).notNull(),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
    type: int().default(sql`NULL`),
    userType: int("user_type").default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    adminSection: varchar("admin_section", { length: 191 }).default(sql`NULL`),
  },
  (table) => ({
    createdByFk: foreignKey({
      name: "imspi_created_by_fk",
      columns: [table.createdBy],
      foreignColumns: [users.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    updatedByFk: foreignKey({
      name: "imspi_updated_by_fk",
      columns: [table.updatedBy],
      foreignColumns: [users.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "imspi_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const infixPermissionAssigns = mysqlTable("infix_permission_assigns", {
  id: int().autoincrement().primaryKey().notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  moduleId: int("module_id").default(sql`NULL`),
  moduleInfo: varchar("module_info", { length: 191 }).default(sql`NULL`),
  roleId: int("role_id")
    .default(sql`NULL`)
    .references(() => infixRoles.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  saasSchools: text("saas_schools").default(sql`NULL`),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const infixRoles = mysqlTable("infix_roles", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 100 }).default(sql`NULL`),
  type: varchar({ length: 191 }).default("System").notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdBy: varchar("created_by", { length: 191 }).default("1"),
  updatedBy: varchar("updated_by", { length: 191 }).default("1"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  isSaas: int("is_saas").default(0),
});

export const invoiceSettings = mysqlTable("invoice_settings", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  perTh: int("per_th").default(2).notNull(),
  prefix: varchar({ length: 191 }).default(sql`NULL`),
  studentName: tinyint("student_name").default(1).notNull(),
  studentSection: tinyint("student_section").default(1).notNull(),
  studentClass: tinyint("student_class").default(1).notNull(),
  studentRoll: tinyint("student_roll").default(1).notNull(),
  studentGroup: tinyint("student_group").default(1).notNull(),
  studentAdmissionNo: tinyint("student_admission_no").default(1).notNull(),
  footer1: varchar("footer_1", { length: 255 }).default("Parent/Student"),
  footer2: varchar("footer_2", { length: 255 }).default("Casier").notNull(),
  footer3: varchar("footer_3", { length: 255 }).default("Officer").notNull(),
  signatureP: tinyint("signature_p").default(1).notNull(),
  signatureC: tinyint("signature_c").default(1).notNull(),
  signatureO: tinyint("signature_o").default(1).notNull(),
  cSignatureP: tinyint("c_signature_p").default(1).notNull(),
  cSignatureC: tinyint("c_signature_c").default(0).notNull(),
  cSignatureO: tinyint("c_signature_o").default(1).notNull(),
  copyS: varchar("copy_s", { length: 255 }).default("Parent/Student"),
  copyO: varchar("copy_o", { length: 255 }).default("Office").notNull(),
  copyC: varchar("copy_c", { length: 255 }).default("Casier").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  copyWriteMsg: text("copy_write_msg").default(sql`NULL`),
  createdBy: int("created_by")
    .default(1)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  updatedBy: int("updated_by")
    .default(1)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const jobs = mysqlTable(
  "jobs",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    queue: varchar({ length: 191 }).notNull(),
    payload: longtext().notNull(),
    attempts: tinyint().notNull(),
    reservedAt: int("reserved_at").default(sql`NULL`),
    availableAt: int("available_at").notNull(),
    createdAt: int("created_at").notNull(),
  },
  (table) => [index("jobs_queue_index").on(table.queue)]
);

export const languages = mysqlTable("languages", {
  id: int().autoincrement().primaryKey().notNull(),
  code: varchar({ length: 191 }).notNull(),
  name: varchar({ length: 191 }).notNull(),
  native: varchar({ length: 191 }).notNull(),
  rtl: tinyint().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  activeStatus: tinyint("active_status").default(0).notNull(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const learningObjectives = mysqlTable("learning_objectives", {
  id: int().autoincrement().primaryKey().notNull(),
  objectives: text().default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  examTypeId: int("exam_type_id")
    .default(sql`NULL`)
    .references(() => smExamTypes.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
});

export const lessonPlanners = mysqlTable("lesson_planners", {
  id: int().autoincrement().primaryKey().notNull(),
  day: int().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  lessonId: int("lesson_id").default(sql`NULL`),
  topicId: int("topic_id").default(sql`NULL`),
  lessonDetailId: int("lesson_detail_id").notNull(),
  topicDetailId: int("topic_detail_id").default(sql`NULL`),
  subTopic: varchar("sub_topic", { length: 191 }).default(sql`NULL`),
  lectureYouubeLink: text("lecture_youube_link").default(sql`NULL`),
  lectureVedio: text("lecture_vedio").default(sql`NULL`),
  attachment: text().default(sql`NULL`),
  teachingMethod: text("teaching_method").default(sql`NULL`),
  generalObjectives: text("general_objectives").default(sql`NULL`),
  previousKnowlege: text("previous_knowlege").default(sql`NULL`),
  compQuestion: text("comp_question").default(sql`NULL`),
  zoomSetup: text("zoom_setup").default(sql`NULL`),
  presentation: text().default(sql`NULL`),
  note: text().default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  lessonDate: date("lesson_date", { mode: "string" }).notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  competedDate: date("competed_date", { mode: "string" }).default(sql`NULL`),
  completedStatus: varchar("completed_status", { length: 191 }).default(sql`NULL`),
  roomId: int("room_id")
    .default(sql`NULL`)
    .references(() => smClassRooms.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  teacherId: int("teacher_id")
    .default(sql`NULL`)
    .references(() => smStaffs.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classPeriodId: int("class_period_id")
    .default(sql`NULL`)
    .references(() => smClassTimes.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  routineId: int("routine_id").default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const lessonPlanTopics = mysqlTable("lesson_plan_topics", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  subTopicTitle: varchar("sub_topic_title", { length: 191 }).notNull(),
  topicId: int("topic_id")
    .default(sql`NULL`)
    .references(() => smLessonTopicDetails.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  lessonPlannerId: int("lesson_planner_id")
    .default(sql`NULL`)
    .references(() => lessonPlanners.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const librarySubjects = mysqlTable("library_subjects", {
  id: int().autoincrement().primaryKey().notNull(),
  subjectName: varchar("subject_name", { length: 255 }).notNull(),
  sbCategoryId: varchar("sb_category_id", { length: 255 }).default(sql`NULL`),
  subjectCode: varchar("subject_code", { length: 255 }).default(sql`NULL`),
  subjectType: varchar("subject_type", { length: 191 }).default("T").notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const maintenanceSettings = mysqlTable("maintenance_settings", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).default("We will be back soon!"),
  subTitle: varchar("sub_title", { length: 191 }).default(
    "'Sorry for the inconvenience but we are performing some maintenance at the moment.'"
  ),
  image: varchar({ length: 191 }).default(sql`NULL`),
  applicableFor: varchar("applicable_for", { length: 191 }).default(sql`NULL`),
  maintenanceMode: tinyint("maintenance_mode").default(0),
  schoolId: int("school_id")
    .default(1)
    .notNull()
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const migrations = mysqlTable("migrations", {
  id: int().autoincrement().primaryKey().notNull(),
  migration: varchar({ length: 191 }).notNull(),
  batch: int().notNull(),
});

export const newsletters = mysqlTable(
  "newsletters",
  {
    id: int().autoincrement().primaryKey().notNull(),
    email: varchar({ length: 191 }).notNull(),
    name: varchar({ length: 191 }).default(sql`NULL`),
    verificationToken: varchar("verification_token", { length: 191 }).default(sql`NULL`),
    isActive: tinyint("is_active").default(1).notNull(),
    verifiedAt: timestamp("verified_at", { mode: "string" }).default(sql`NULL`),
    activeStatus: tinyint("active_status").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id")
      .default(1)
      .references(() => smSchools.id, {
        onDelete: "cascade",
        onUpdate: "restrict",
      }),
  },
  (table) => [unique("newsletters_email_unique").on(table.email)]
);

export const notifications = mysqlTable(
  "notifications",
  {
    id: char({ length: 36 }).notNull(),
    type: varchar({ length: 191 }).notNull(),
    notifiableType: varchar("notifiable_type", { length: 191 }).notNull(),
    notifiableId: bigint("notifiable_id", { mode: "number" }).notNull(),
    data: text().notNull(),
    readAt: timestamp("read_at", { mode: "string" }).default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => [
    index("notifications_notifiable_type_notifiable_id_index").on(table.notifiableType, table.notifiableId),
  ]
);

export const oauthAccessTokens = mysqlTable(
  "oauth_access_tokens",
  {
    id: varchar({ length: 191 }).notNull(),
    userId: bigint("user_id", { mode: "number" }).default(sql`NULL`),
    clientId: int("client_id").notNull(),
    name: varchar({ length: 100 }).default(sql`NULL`),
    scopes: varchar({ length: 100 }).default(sql`NULL`),
    revoked: varchar({ length: 100 }).notNull(),
    expiresAt: datetime("expires_at", { mode: "string" }).default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => [index("oauth_access_tokens_user_id_index").on(table.userId)]
);

export const oauthAuthCodes = mysqlTable("oauth_auth_codes", {
  id: int().autoincrement().primaryKey().notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  clientId: int("client_id").notNull(),
  scopes: text().default(sql`NULL`),
  revoked: tinyint().notNull(),
  expiresAt: datetime("expires_at", { mode: "string" }).default(sql`NULL`),
});

export const oauthClients = mysqlTable(
  "oauth_clients",
  {
    id: int().autoincrement().primaryKey().notNull(),
    userId: bigint("user_id", { mode: "number" }).default(sql`NULL`),
    provider: varchar({ length: 191 }).default(sql`NULL`),
    name: varchar({ length: 191 }).notNull(),
    secret: varchar({ length: 200 }).notNull(),
    redirect: text().notNull(),
    personalAccessClient: tinyint("personal_access_client").notNull(),
    passwordClient: tinyint("password_client").notNull(),
    revoked: tinyint().notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => [index("oauth_clients_user_id_index").on(table.userId)]
);

export const oauthPersonalAccessClients = mysqlTable(
  "oauth_personal_access_clients",
  {
    id: int().autoincrement().primaryKey().notNull(),
    clientId: int("client_id").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => [index("oauth_personal_access_clients_client_id_index").on(table.clientId)]
);

export const oauthRefreshTokens = mysqlTable(
  "oauth_refresh_tokens",
  {
    id: int().autoincrement().primaryKey().notNull(),
    accessTokenId: bigint("access_token_id", { mode: "number" }).default(sql`NULL`),
    revoked: tinyint().notNull(),
    expiresAt: datetime("expires_at", { mode: "string" }).default(sql`NULL`),
  },
  (table) => [index("oauth_refresh_tokens_access_token_id_index").on(table.accessTokenId)]
);

export const onlineExamStudentAnswerMarkings = mysqlTable("online_exam_student_answer_markings", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  onlineExamId: int("online_exam_id").default(sql`NULL`),
  studentId: int("student_id").default(sql`NULL`),
  questionId: int("question_id").default(sql`NULL`),
  userAnswer: varchar("user_answer", { length: 191 }).default(sql`NULL`),
  answerStatus: varchar("answer_status", { length: 191 }).default(sql`NULL`),
  obtainMarks: int("obtain_marks").default(sql`NULL`),
  schoolId: int("school_id").default(sql`NULL`),
  markedBy: int("marked_by").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const passwordResets = mysqlTable(
  "password_resets",
  {
    email: varchar({ length: 100 }).notNull(),
    token: varchar({ length: 191 }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("password_resets_email_index").on(table.email)]
);

export const payrollPayments = mysqlTable(
  "payroll_payments",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey().notNull(),
    smHrPayrollGenerateId: int("sm_hr_payroll_generate_id").default(sql`NULL`),
    amount: double("amount").default(sql`NULL`),
    paymentMode: varchar("payment_mode", { length: 191 }).default(sql`NULL`),
    paymentMethodId: int("payment_method_id").default(sql`NULL`),
    paymentDate: date("payment_date", { mode: "string" }).default(sql`NULL`),
    bankId: int("bank_id").default(sql`NULL`),
    note: varchar("note", { length: 200 }).default(sql`NULL`),
    createdBy: int("created_by").default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => {
    return {
      // Define foreign key here with an explicit, short name (under 64 characters)
      payrollGenerateFk: foreignKey({
        name: "pp_payroll_generate_id_fk", // Manually set a short name
        columns: [table.smHrPayrollGenerateId],
        foreignColumns: [smHrPayrollGenerates.id],
      })
        .onDelete("restrict")
        .onUpdate("restrict"),
    };
  }
);

export const permissions = mysqlTable("permissions", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  module: varchar({ length: 191 }).default(sql`NULL`),
  sidebarMenu: varchar("sidebar_menu", { length: 191 }).default(sql`NULL`),
  oldId: int("old_id").default(sql`NULL`),
  sectionId: int("section_id").default(1),
  parentId: int("parent_id").default(0),
  name: varchar({ length: 191 }).default(sql`NULL`),
  route: varchar({ length: 191 }).default(sql`NULL`),
  parentRoute: varchar("parent_route", { length: 191 }).default(sql`NULL`),
  type: int().default(sql`NULL`),
  langName: varchar("lang_name", { length: 191 }).default(sql`NULL`),
  icon: text().default(sql`NULL`),
  svg: text().default(sql`NULL`),
  status: tinyint().default(1).notNull(),
  menuStatus: tinyint("menu_status").default(1).notNull(),
  position: int().default(1).notNull(),
  isSaas: tinyint("is_saas").default(0).notNull(),
  relateToChild: tinyint("relate_to_child").default(0),
  isMenu: tinyint("is_menu").default(sql`NULL`),
  isAdmin: tinyint("is_admin").default(0),
  isTeacher: tinyint("is_teacher").default(0),
  isStudent: tinyint("is_student").default(0),
  isParent: tinyint("is_parent").default(0),
  isAlumni: tinyint("is_alumni").default(0),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  permissionSection: tinyint("permission_section").default(sql`NULL`),
  alternateModule: varchar("alternate_module", { length: 191 }).default(sql`NULL`),
  userId: int("user_id").default(sql`NULL`),
  schoolId: int("school_id")
    .default(sql`NULL`)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const permissionSections = mysqlTable("permission_sections", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  name: varchar({ length: 191 }).default(sql`NULL`),
  position: int().default(9999).notNull(),
  userId: int("user_id").default(1).notNull(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  saas: tinyint().default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const personalAccessTokens = mysqlTable(
  "personal_access_tokens",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
    tokenableType: varchar("tokenable_type", { length: 191 }).notNull(),
    tokenableId: bigint("tokenable_id", { mode: "number" }).notNull(),
    name: varchar({ length: 191 }).notNull(),
    token: varchar({ length: 64 }).notNull(),
    abilities: text().default(sql`NULL`),
    lastUsedAt: timestamp("last_used_at", { mode: "string" }).default(sql`NULL`),
    expiresAt: timestamp("expires_at", { mode: "string" }).default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => [
    index("personal_access_tokens_tokenable_type_tokenable_id_index").on(
      table.tokenableType,
      table.tokenableId
    ),
    unique("personal_access_tokens_token_unique").on(table.token),
  ]
);

export const plugins = mysqlTable("plugins", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  name: varchar({ length: 191 }).notNull(),
  isEnable: tinyint("is_enable").default(0).notNull(),
  availability: varchar({ length: 191 }).default("both").notNull(),
  showAdminPanel: tinyint("show_admin_panel").default(0).notNull(),
  showWebsite: tinyint("show_website").default(1).notNull(),
  showingPage: varchar("showing_page", { length: 191 }).default("all").notNull(),
  applicableFor: varchar("applicable_for", { length: 191 }).default(sql`NULL`),
  position: varchar({ length: 191 }).default(sql`NULL`),
  shortCode: varchar("short_code", { length: 50 }).default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .notNull()
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const roles = mysqlTable("roles", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 100 }).default(sql`NULL`),
  type: varchar({ length: 191 }).default("System").notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdBy: varchar("created_by", { length: 191 }).default("1"),
  updatedBy: varchar("updated_by", { length: 191 }).default("1"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const schoolModules = mysqlTable("school_modules", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  modules: longtext().default(sql`NULL`),
  menus: longtext().default(sql`NULL`),
  moduleName: varchar("module_name", { length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  updatedBy: int("updated_by").default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .notNull()
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const seatPlans = mysqlTable("seat_plans", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  studentRecordId: int("student_record_id").notNull(),
  examTypeId: int("exam_type_id").notNull(),
  createdBy: int("created_by").notNull(),
  schoolId: int("school_id").default(1),
  academicId: int("academic_id").default(1),
  activeStatus: int("active_status").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const seatPlanSettings = mysqlTable("seat_plan_settings", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  schoolName: tinyint("school_name").default(sql`NULL`),
  studentPhoto: tinyint("student_photo").default(sql`NULL`),
  studentName: tinyint("student_name").default(sql`NULL`),
  admissionNo: tinyint("admission_no").default(sql`NULL`),
  classSection: tinyint("class_section").default(sql`NULL`),
  examName: tinyint("exam_name").default(sql`NULL`),
  rollNo: tinyint("roll_no").default(sql`NULL`),
  academicYear: tinyint("academic_year").default(sql`NULL`),
  schoolId: int("school_id").default(1),
  academicId: int("academic_id").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const sidebars = mysqlTable("sidebars", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  permissionId: int("permission_id").default(sql`NULL`),
  position: int().default(sql`NULL`),
  sectionId: int("section_id").default(1),
  parent: int().default(sql`NULL`),
  parentRoute: int("parent_route").default(sql`NULL`),
  level: int().default(sql`NULL`),
  userId: int("user_id")
    .default(sql`NULL`)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  isSaas: tinyint("is_saas").default(0).notNull(),
  ignore: int().default(0).notNull(),
  roleId: int("role_id").default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smsTemplates = mysqlTable("sms_templates", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  type: varchar({ length: 191 }).notNull(),
  purpose: text().notNull(),
  subject: text().notNull(),
  body: longtext().notNull(),
  module: varchar({ length: 191 }).notNull(),
  variable: text().notNull(),
  status: int().default(1).notNull(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smAboutPages = mysqlTable("sm_about_pages", {
  id: int().autoincrement().primaryKey().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  mainTitle: varchar("main_title", { length: 191 }).default(sql`NULL`),
  mainDescription: text("main_description").default(sql`NULL`),
  image: varchar({ length: 191 }).default(sql`NULL`),
  mainImage: varchar("main_image", { length: 191 }).default(sql`NULL`),
  buttonText: varchar("button_text", { length: 191 }).default(sql`NULL`),
  buttonUrl: varchar("button_url", { length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smAcademicYears = mysqlTable("sm_academic_years", {
  id: int().autoincrement().primaryKey().notNull(),
  year: varchar({ length: 200 }).notNull(),
  title: varchar({ length: 200 }).notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  startingDate: date("starting_date", { mode: "string" }).notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  endingDate: date("ending_date", { mode: "string" }).notNull(),
  copyWithAcademicYear: varchar("copy_with_academic_year", {
    length: 191,
  }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: varchar("created_at", { length: 191 }).default(sql`NULL`),
  updatedAt: varchar("updated_at", { length: 191 }).default(sql`NULL`),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smAddExpenses = mysqlTable("sm_add_expenses", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 255 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  date: date({ mode: "string" }).default(sql`NULL`),
  amount: double({ precision: 10, scale: 2 }).default(sql`NULL`),
  file: varchar({ length: 191 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  itemReceiveId: int("item_receive_id").default(sql`NULL`),
  inventoryId: int("inventory_id").default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  expenseHeadId: int("expense_head_id").default(sql`NULL`),
  accountId: int("account_id").default(sql`NULL`),
  paymentMethodId: int("payment_method_id").default(sql`NULL`),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  payrollPaymentId: int("payroll_payment_id").default(sql`NULL`),
});

export const smAddIncomes = mysqlTable("sm_add_incomes", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 255 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  date: date({ mode: "string" }).default(sql`NULL`),
  amount: double({ precision: 10, scale: 2 }).default(sql`NULL`),
  file: varchar({ length: 191 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  itemSellId: int("item_sell_id").default(sql`NULL`),
  feesCollectionId: int("fees_collection_id").default(sql`NULL`),
  inventoryId: int("inventory_id").default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  incomeHeadId: int("income_head_id").default(sql`NULL`),
  accountId: int("account_id")
    .default(sql`NULL`)
    .references(() => smBankAccounts.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  paymentMethodId: int("payment_method_id")
    .default(sql`NULL`)
    .references(() => smPaymentMethhods.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  installmentPaymentId: int("installment_payment_id").default(sql`NULL`),
});

export const smAddOns = mysqlTable("sm_add_ons", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smAdmissionQueries = mysqlTable("sm_admission_queries", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 191 }).default(sql`NULL`),
  phone: varchar({ length: 191 }).default(sql`NULL`),
  email: varchar({ length: 191 }).default(sql`NULL`),
  address: text().default(sql`NULL`),
  description: text().default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  date: date({ mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  followUpDate: date("follow_up_date", { mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  nextFollowUpDate: date("next_follow_up_date", { mode: "string" }).default(sql`NULL`),
  assigned: varchar({ length: 191 }).default(sql`NULL`),
  reference: int().default(sql`NULL`),
  source: int().default(sql`NULL`),
  noOfChild: int("no_of_child").default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  class: int()
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smAdmissionQueryFollowups = mysqlTable(
  "sm_admission_query_followups",
  {
    id: int().autoincrement().primaryKey().notNull(),
    response: text().default(sql`NULL`),
    note: text().default(sql`NULL`),
    // you can use { mode: 'date' }, if you want to have Date as type for this column
    date: date({ mode: "string" }).default(sql`NULL`),
    activeStatus: tinyint("active_status").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    admissionQueryId: int("admission_query_id").default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
    academicId: int("academic_id").default(1),
  },
  (table) => {
    return {
      admissionQueryFk: foreignKey({
        name: "sqf_admission_query_id_fk", // Shortened name
        columns: [table.admissionQueryId],
        foreignColumns: [smAdmissionQueries.id],
      })
        .onDelete("cascade")
        .onUpdate("restrict"),
      schoolFk: foreignKey({
        name: "sqf_school_id_fk", // Shortened name
        columns: [table.schoolId],
        foreignColumns: [smSchools.id],
      })
        .onDelete("cascade")
        .onUpdate("restrict"),
      academicFk: foreignKey({
        name: "sqf_academic_id_fk", // Shortened name
        columns: [table.academicId],
        foreignColumns: [smAcademicYears.id],
      })
        .onDelete("cascade")
        .onUpdate("restrict"),
    };
  }
);

export const smAmountTransfers = mysqlTable("sm_amount_transfers", {
  id: int().autoincrement().primaryKey().notNull(),
  amount: int().default(sql`NULL`),
  purpose: varchar({ length: 191 }).default(sql`NULL`),
  fromPaymentMethod: int("from_payment_method").default(sql`NULL`),
  fromBankName: int("from_bank_name").default(sql`NULL`),
  toPaymentMethod: int("to_payment_method").default(sql`NULL`),
  toBankName: int("to_bank_name").default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  transferDate: date("transfer_date", { mode: "string" }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smAssignClassTeachers = mysqlTable(
  "sm_assign_class_teachers",
  {
    id: int().autoincrement().primaryKey().notNull(),
    activeStatus: tinyint("active_status").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    classId: int("class_id").default(sql`NULL`),
    sectionId: int("section_id").default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
    academicId: int("academic_id").default(1),
  },
  (table) => ({
    classFk: foreignKey({
      name: "sact_class_id_fk",
      columns: [table.classId],
      foreignColumns: [smClasses.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    sectionFk: foreignKey({
      name: "sact_section_id_fk",
      columns: [table.sectionId],
      foreignColumns: [smSections.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "sact_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "sact_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const smAssignSubjects = mysqlTable("sm_assign_subjects", {
  id: int().autoincrement().primaryKey().notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  teacherId: int("teacher_id")
    .default(sql`NULL`)
    .references(() => smStaffs.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  parentId: int("parent_id").default(sql`NULL`),
});

export const smAssignVehicles = mysqlTable("sm_assign_vehicles", {
  id: int().autoincrement().primaryKey().notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  vehicleId: int("vehicle_id")
    .default(sql`NULL`)
    .references(() => smVehicles.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  routeId: int("route_id")
    .default(sql`NULL`)
    .references(() => smRoutes.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smBackgroundSettings = mysqlTable("sm_background_settings", {
  id: int().autoincrement().primaryKey().notNull(),
  title: varchar({ length: 255 }).default(sql`NULL`),
  type: varchar({ length: 255 }).default(sql`NULL`),
  image: varchar({ length: 255 }).default(sql`NULL`),
  color: varchar({ length: 255 }).default(sql`NULL`),
  isDefault: int("is_default").default(0).notNull(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smBackups = mysqlTable("sm_backups", {
  id: int().autoincrement().primaryKey().notNull(),
  fileName: varchar("file_name", { length: 255 }).default(sql`NULL`),
  sourceLink: varchar("source_link", { length: 255 }).default(sql`NULL`),
  fileType: tinyint("file_type").default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  langType: int("lang_type").default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smBankAccounts = mysqlTable("sm_bank_accounts", {
  id: int().autoincrement().primaryKey().notNull(),
  bankName: varchar("bank_name", { length: 191 }).default(sql`NULL`),
  accountName: varchar("account_name", { length: 191 }).default(sql`NULL`),
  accountNumber: varchar("account_number", { length: 191 }).default(sql`NULL`),
  accountType: varchar("account_type", { length: 191 }).default(sql`NULL`),
  openingBalance: double("opening_balance").notNull(),
  currentBalance: double("current_balance").notNull(),
  note: text().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smBankPaymentSlips = mysqlTable("sm_bank_payment_slips", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  date: date({ mode: "string" }).notNull(),
  amount: double({ precision: 10, scale: 2 }).default(sql`NULL`),
  slip: varchar({ length: 191 }).default(sql`NULL`),
  note: text().default(sql`NULL`),
  bankId: int("bank_id").default(sql`NULL`),
  approveStatus: tinyint("approve_status").default(0).notNull(),
  paymentMode: varchar("payment_mode", { length: 191 }).notNull(),
  reason: text().default(sql`NULL`),
  feesDiscountId: int("fees_discount_id")
    .default(sql`NULL`)
    .references(() => smFeesDiscounts.id, {
      onDelete: "restrict",
      onUpdate: "restrict",
    }),
  feesTypeId: int("fees_type_id").default(sql`NULL`),
  recordId: int("record_id").default(sql`NULL`),
  studentId: int("student_id")
    .default(sql`NULL`)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classId: int("class_id").default(sql`NULL`),
  assignId: int("assign_id").default(sql`NULL`),
  sectionId: int("section_id").default(sql`NULL`),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "restrict",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id").default(1),
  childPaymentId: int("child_payment_id").default(sql`NULL`),
  installmentId: int("installment_id").default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  activeStatus: int("active_status").default(1),
});

export const smBankStatements = mysqlTable("sm_bank_statements", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  bankId: int("bank_id").default(sql`NULL`),
  afterBalance: int("after_balance").default(sql`NULL`),
  amount: double({ precision: 10, scale: 2 }).default(sql`NULL`),
  type: varchar({ length: 11 }).default(sql`NULL`),
  paymentMethod: int("payment_method").default(sql`NULL`),
  details: varchar({ length: 500 }).default(sql`NULL`),
  itemReceiveId: int("item_receive_id").default(sql`NULL`),
  itemReceiveBankStatementId: int("item_receive_bank_statement_id").default(sql`NULL`),
  itemSellBankStatementId: int("item_sell_bank_statement_id").default(sql`NULL`),
  itemSellId: int("item_sell_id").default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  paymentDate: date("payment_date", { mode: "string" }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  schoolId: int("school_id").default(1),
  academicId: int("academic_id").default(sql`NULL`),
  feesPaymentId: int("fees_payment_id").default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  payrollPaymentId: int("payroll_payment_id").default(sql`NULL`),
});

export const smBaseGroups = mysqlTable("sm_base_groups", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 200 }).notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smBaseSetups = mysqlTable("sm_base_setups", {
  id: int().autoincrement().primaryKey().notNull(),
  baseSetupName: varchar("base_setup_name", { length: 255 }).notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  baseGroupId: int("base_group_id")
    .default(1)
    .references(() => smBaseGroups.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smBooks = mysqlTable("sm_books", {
  id: int().autoincrement().primaryKey().notNull(),
  bookTitle: varchar("book_title", { length: 200 }).default(sql`NULL`),
  bookNumber: varchar("book_number", { length: 200 }).default(sql`NULL`),
  isbnNo: varchar("isbn_no", { length: 200 }).default(sql`NULL`),
  publisherName: varchar("publisher_name", { length: 200 }).default(sql`NULL`),
  authorName: varchar("author_name", { length: 200 }).default(sql`NULL`),
  rackNumber: varchar("rack_number", { length: 50 }).default(sql`NULL`),
  quantity: int().default(0),
  bookPrice: int("book_price").default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  postDate: date("post_date", { mode: "string" }).default(sql`NULL`),
  details: varchar({ length: 500 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  bookSubjectId: int("book_subject_id").default(sql`NULL`),
  bookCategoryId: int("book_category_id")
    .default(sql`NULL`)
    .references(() => smBookCategories.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smBookCategories = mysqlTable("sm_book_categories", {
  id: int().autoincrement().primaryKey().notNull(),
  categoryName: varchar("category_name", { length: 200 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smBookIssues = mysqlTable("sm_book_issues", {
  id: int().autoincrement().primaryKey().notNull(),
  quantity: int().default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  givenDate: date("given_date", { mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  dueDate: date("due_date", { mode: "string" }).default(sql`NULL`),
  issueStatus: varchar("issue_status", { length: 191 }).default(sql`NULL`),
  note: varchar({ length: 500 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  bookId: int("book_id")
    .default(sql`NULL`)
    .references(() => smBooks.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  memberId: int("member_id")
    .default(sql`NULL`)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smCalendarSettings = mysqlTable("sm_calendar_settings", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  menuName: varchar("menu_name", { length: 191 }).notNull(),
  status: tinyint().default(0).notNull(),
  fontColor: varchar("font_color", { length: 191 }).notNull(),
  bgColor: varchar("bg_color", { length: 191 }).notNull(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smChartOfAccounts = mysqlTable("sm_chart_of_accounts", {
  id: int().autoincrement().primaryKey().notNull(),
  head: varchar({ length: 200 }).default(sql`NULL`),
  type: varchar({ length: 1 }).default(sql`NULL`),
  activeStatus: int("active_status").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smClasses = mysqlTable("sm_classes", {
  id: int().autoincrement().primaryKey().notNull(),
  className: varchar("class_name", { length: 200 }).notNull(),
  passMark: double("pass_mark", { precision: 8, scale: 2 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  parentId: int("parent_id").default(sql`NULL`),
});

export const smClassExamRoutinePages = mysqlTable("sm_class_exam_routine_pages", {
  id: int().autoincrement().primaryKey().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  mainTitle: varchar("main_title", { length: 191 }).default(sql`NULL`),
  mainDescription: text("main_description").default(sql`NULL`),
  image: varchar({ length: 191 }).default(sql`NULL`),
  mainImage: varchar("main_image", { length: 191 }).default(sql`NULL`),
  buttonText: varchar("button_text", { length: 191 }).default(sql`NULL`),
  buttonUrl: varchar("button_url", { length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  isParent: tinyint("is_parent").default(1).notNull(),
  classRoutine: varchar("class_routine", { length: 191 }).default("show").notNull(),
  examRoutine: varchar("exam_routine", { length: 191 }).default("show").notNull(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smClassOptionalSubject = mysqlTable("sm_class_optional_subject", {
  id: int().autoincrement().primaryKey().notNull(),
  classId: int("class_id").notNull(),
  gpaAbove: double("gpa_above", { precision: 8, scale: 2 }).notNull(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smClassRooms = mysqlTable("sm_class_rooms", {
  id: int().autoincrement().primaryKey().notNull(),
  roomNo: varchar("room_no", { length: 50 }).default(sql`NULL`),
  capacity: int().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smClassRoutines = mysqlTable("sm_class_routines", {
  id: int().autoincrement().primaryKey().notNull(),
  monday: varchar({ length: 200 }).default(sql`NULL`),
  mondayStartFrom: varchar("monday_start_from", { length: 200 }).default(sql`NULL`),
  mondayEndTo: varchar("monday_end_to", { length: 200 }).default(sql`NULL`),
  mondayRoomId: int("monday_room_id").default(sql`NULL`),
  tuesday: varchar({ length: 200 }).default(sql`NULL`),
  tuesdayStartFrom: varchar("tuesday_start_from", { length: 200 }).default(sql`NULL`),
  tuesdayEndTo: varchar("tuesday_end_to", { length: 200 }).default(sql`NULL`),
  tuesdayRoomId: int("tuesday_room_id").default(sql`NULL`),
  wednesday: varchar({ length: 200 }).default(sql`NULL`),
  wednesdayStartFrom: varchar("wednesday_start_from", { length: 200 }).default(sql`NULL`),
  wednesdayEndTo: varchar("wednesday_end_to", { length: 200 }).default(sql`NULL`),
  wednesdayRoomId: int("wednesday_room_id").default(sql`NULL`),
  thursday: varchar({ length: 200 }).default(sql`NULL`),
  thursdayStartFrom: varchar("thursday_start_from", { length: 200 }).default(sql`NULL`),
  thursdayEndTo: varchar("thursday_end_to", { length: 200 }).default(sql`NULL`),
  thursdayRoomId: int("thursday_room_id").default(sql`NULL`),
  friday: varchar({ length: 200 }).default(sql`NULL`),
  fridayStartFrom: varchar("friday_start_from", { length: 200 }).default(sql`NULL`),
  fridayEndTo: varchar("friday_end_to", { length: 200 }).default(sql`NULL`),
  fridayRoomId: int("friday_room_id").default(sql`NULL`),
  saturday: varchar({ length: 200 }).default(sql`NULL`),
  saturdayStartFrom: varchar("saturday_start_from", { length: 200 }).default(sql`NULL`),
  saturdayEndTo: varchar("saturday_end_to", { length: 200 }).default(sql`NULL`),
  saturdayRoomId: int("saturday_room_id").default(sql`NULL`),
  sunday: varchar({ length: 200 }).default(sql`NULL`),
  sundayStartFrom: varchar("sunday_start_from", { length: 200 }).default(sql`NULL`),
  sundayEndTo: varchar("sunday_end_to", { length: 200 }).default(sql`NULL`),
  sundayRoomId: int("sunday_room_id").default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smClassRoutineUpdates = mysqlTable("sm_class_routine_updates", {
  id: int().autoincrement().primaryKey().notNull(),
  day: int().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  startTime: time("start_time").default(sql`NULL`),
  endTime: time("end_time").default(sql`NULL`),
  isBreak: tinyint("is_break").default(sql`NULL`),
  roomId: int("room_id")
    .default(sql`NULL`)
    .references(() => smClassRooms.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  teacherId: int("teacher_id")
    .default(sql`NULL`)
    .references(() => smStaffs.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classPeriodId: int("class_period_id")
    .default(sql`NULL`)
    .references(() => smClassTimes.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smClassSections = mysqlTable(
  "sm_class_sections",
  {
    id: int().autoincrement().primaryKey().notNull(),
    activeStatus: tinyint("active_status").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    classId: int("class_id")
      .default(sql`NULL`)
      .references(() => smClasses.id, {
        onDelete: "cascade",
        onUpdate: "restrict",
      }),
    sectionId: int("section_id")
      .default(sql`NULL`)
      .references(() => smSections.id, {
        onDelete: "cascade",
        onUpdate: "restrict",
      }),
    schoolId: int("school_id")
      .default(1)
      .references(() => smSchools.id, {
        onDelete: "cascade",
        onUpdate: "restrict",
      }),
    academicId: int("academic_id")
      .default(1)
      .references(() => smAcademicYears.id, {
        onDelete: "cascade",
        onUpdate: "restrict",
      }),
    parentId: int("parent_id").default(sql`NULL`),
  },
  (table) => [index("sm_class_sections_class_id_section_id_index").on(table.classId, table.sectionId)]
);

export const smClassTeachers = mysqlTable(
  "sm_class_teachers",
  {
    id: int().autoincrement().primaryKey().notNull(),
    activeStatus: tinyint("active_status").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    teacherId: int("teacher_id")
      .default(sql`NULL`)
      .references(() => smStaffs.id, {
        onDelete: "cascade",
        onUpdate: "restrict",
      }),
    assignClassTeacherId: int("assign_class_teacher_id").default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id")
      .default(1)
      .references(() => smSchools.id, {
        onDelete: "cascade",
        onUpdate: "restrict",
      }),
    academicId: int("academic_id")
      .default(1)
      .references(() => smAcademicYears.id, {
        onDelete: "cascade",
        onUpdate: "restrict",
      }),
  },
  (table) => {
    return {
      assignClassTeacherFk: foreignKey({
        name: "sct_assign_class_teacher_id_fk", // Shortened name
        columns: [table.assignClassTeacherId],
        foreignColumns: [smAssignClassTeachers.id],
      })
        .onDelete("cascade")
        .onUpdate("restrict"),
    };
  }
);

export const smClassTimes = mysqlTable("sm_class_times", {
  id: int().autoincrement().primaryKey().notNull(),
  type: mysqlEnum(["exam", "class"]).default(sql`NULL`),
  period: varchar({ length: 191 }).default(sql`NULL`),
  startTime: time("start_time").default(sql`NULL`),
  endTime: time("end_time").default(sql`NULL`),
  isBreak: tinyint("is_break").default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smComplaints = mysqlTable("sm_complaints", {
  id: int().autoincrement().primaryKey().notNull(),
  complaintBy: varchar("complaint_by", { length: 191 }).default(sql`NULL`),
  complaintType: tinyint("complaint_type").default(sql`NULL`),
  complaintSource: tinyint("complaint_source").default(sql`NULL`),
  phone: varchar({ length: 191 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  date: date({ mode: "string" }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  actionTaken: varchar("action_taken", { length: 191 }).default(sql`NULL`),
  assigned: varchar({ length: 191 }).default(sql`NULL`),
  file: varchar({ length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smContactMessages = mysqlTable("sm_contact_messages", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 191 }).default(sql`NULL`),
  phone: varchar({ length: 191 }).default(sql`NULL`),
  email: varchar({ length: 191 }).default(sql`NULL`),
  subject: varchar({ length: 191 }).default(sql`NULL`),
  message: text().default(sql`NULL`),
  viewStatus: tinyint("view_status").default(0).notNull(),
  replyStatus: tinyint("reply_status").default(0).notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smContactPages = mysqlTable("sm_contact_pages", {
  id: int().autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  image: varchar({ length: 191 }).default(sql`NULL`),
  buttonText: varchar("button_text", { length: 191 }).default(sql`NULL`),
  buttonUrl: varchar("button_url", { length: 191 }).default(sql`NULL`),
  address: varchar({ length: 191 }).default(sql`NULL`),
  addressText: varchar("address_text", { length: 191 }).default(sql`NULL`),
  phone: varchar({ length: 191 }).default(sql`NULL`),
  phoneText: varchar("phone_text", { length: 191 }).default(sql`NULL`),
  email: varchar({ length: 191 }).default(sql`NULL`),
  emailText: varchar("email_text", { length: 191 }).default(sql`NULL`),
  latitude: varchar({ length: 191 }).default(sql`NULL`),
  longitude: varchar({ length: 191 }).default(sql`NULL`),
  zoomLevel: int("zoom_level").default(sql`NULL`),
  googleMapAddress: varchar("google_map_address", { length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smContentTypes = mysqlTable("sm_content_types", {
  id: int().autoincrement().primaryKey().notNull(),
  typeName: varchar("type_name", { length: 200 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smCountries = mysqlTable("sm_countries", {
  id: int().autoincrement().primaryKey().notNull(),
  code: varchar({ length: 255 }).default(sql`NULL`),
  name: varchar({ length: 255 }).default(sql`NULL`),
  native: varchar({ length: 255 }).default(sql`NULL`),
  phone: varchar({ length: 255 }).default(sql`NULL`),
  continent: varchar({ length: 255 }).default(sql`NULL`),
  capital: varchar({ length: 255 }).default(sql`NULL`),
  currency: varchar({ length: 255 }).default(sql`NULL`),
  languages: varchar({ length: 255 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smCourses = mysqlTable("sm_courses", {
  id: int().autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).notNull(),
  image: text().notNull(),
  categoryId: int("category_id").notNull(),
  overview: text().default(sql`NULL`),
  outline: text().default(sql`NULL`),
  prerequisites: text().default(sql`NULL`),
  resources: text().default(sql`NULL`),
  stats: text().default(sql`NULL`),
  activeStatus: int("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smCourseCategories = mysqlTable("sm_course_categories", {
  id: int().autoincrement().primaryKey().notNull(),
  categoryName: varchar("category_name", { length: 191 }).default(sql`NULL`),
  categoryImage: text("category_image").default(sql`NULL`),
  schoolId: bigint("school_id", { mode: "number" }).default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smCoursePages = mysqlTable("sm_course_pages", {
  id: int().autoincrement().primaryKey().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  mainTitle: varchar("main_title", { length: 191 }).default(sql`NULL`),
  mainDescription: text("main_description").default(sql`NULL`),
  image: varchar({ length: 191 }).default(sql`NULL`),
  mainImage: varchar("main_image", { length: 191 }).default(sql`NULL`),
  buttonText: varchar("button_text", { length: 191 }).default(sql`NULL`),
  buttonUrl: varchar("button_url", { length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  isParent: tinyint("is_parent").default(1).notNull(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smCurrencies = mysqlTable("sm_currencies", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 191 }).default(sql`NULL`),
  code: varchar({ length: 191 }).default(sql`NULL`),
  symbol: varchar({ length: 191 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  currencyType: varchar("currency_type", { length: 2 }).default("2"),
  currencyPosition: varchar("currency_position", { length: 2 }).default("2"),
  space: tinyint().default(1),
  decimalDigit: int("decimal_digit").default(sql`NULL`),
  decimalSeparator: varchar("decimal_separator", { length: 1 }).default(sql`NULL`),
  thousandSeparator: varchar("thousand_separator", { length: 191 }).default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id").default(sql`NULL`),
});

export const smCustomFields = mysqlTable("sm_custom_fields", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  formName: varchar("form_name", { length: 191 }).notNull(),
  label: varchar({ length: 191 }).notNull(),
  type: varchar({ length: 191 }).notNull(),
  minMaxLength: varchar("min_max_length", { length: 191 }).default(sql`NULL`),
  minMaxValue: varchar("min_max_value", { length: 191 }).default(sql`NULL`),
  nameValue: varchar("name_value", { length: 191 }).default(sql`NULL`),
  width: varchar({ length: 191 }).default(sql`NULL`),
  required: tinyint().default(sql`NULL`),
  schoolId: int("school_id").default(1),
  academicId: int("academic_id").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smCustomLinks = mysqlTable("sm_custom_links", {
  id: int().autoincrement().primaryKey().notNull(),
  title1: varchar({ length: 255 }).default(sql`NULL`),
  title2: varchar({ length: 255 }).default(sql`NULL`),
  title3: varchar({ length: 255 }).default(sql`NULL`),
  title4: varchar({ length: 255 }).default(sql`NULL`),
  linkLabel1: varchar("link_label1", { length: 255 }).default(sql`NULL`),
  linkHref1: varchar("link_href1", { length: 255 }).default(sql`NULL`),
  linkLabel2: varchar("link_label2", { length: 255 }).default(sql`NULL`),
  linkHref2: varchar("link_href2", { length: 255 }).default(sql`NULL`),
  linkLabel3: varchar("link_label3", { length: 255 }).default(sql`NULL`),
  linkHref3: varchar("link_href3", { length: 255 }).default(sql`NULL`),
  linkLabel4: varchar("link_label4", { length: 255 }).default(sql`NULL`),
  linkHref4: varchar("link_href4", { length: 255 }).default(sql`NULL`),
  linkLabel5: varchar("link_label5", { length: 255 }).default(sql`NULL`),
  linkHref5: varchar("link_href5", { length: 255 }).default(sql`NULL`),
  linkLabel6: varchar("link_label6", { length: 255 }).default(sql`NULL`),
  linkHref6: varchar("link_href6", { length: 255 }).default(sql`NULL`),
  linkLabel7: varchar("link_label7", { length: 255 }).default(sql`NULL`),
  linkHref7: varchar("link_href7", { length: 255 }).default(sql`NULL`),
  linkLabel8: varchar("link_label8", { length: 255 }).default(sql`NULL`),
  linkHref8: varchar("link_href8", { length: 255 }).default(sql`NULL`),
  linkLabel9: varchar("link_label9", { length: 255 }).default(sql`NULL`),
  linkHref9: varchar("link_href9", { length: 255 }).default(sql`NULL`),
  linkLabel10: varchar("link_label10", { length: 255 }).default(sql`NULL`),
  linkHref10: varchar("link_href10", { length: 255 }).default(sql`NULL`),
  linkLabel11: varchar("link_label11", { length: 255 }).default(sql`NULL`),
  linkHref11: varchar("link_href11", { length: 255 }).default(sql`NULL`),
  linkLabel12: varchar("link_label12", { length: 255 }).default(sql`NULL`),
  linkHref12: varchar("link_href12", { length: 255 }).default(sql`NULL`),
  linkLabel13: varchar("link_label13", { length: 255 }).default(sql`NULL`),
  linkHref13: varchar("link_href13", { length: 255 }).default(sql`NULL`),
  linkLabel14: varchar("link_label14", { length: 255 }).default(sql`NULL`),
  linkHref14: varchar("link_href14", { length: 255 }).default(sql`NULL`),
  linkLabel15: varchar("link_label15", { length: 255 }).default(sql`NULL`),
  linkHref15: varchar("link_href15", { length: 255 }).default(sql`NULL`),
  linkLabel16: varchar("link_label16", { length: 255 }).default(sql`NULL`),
  linkHref16: varchar("link_href16", { length: 255 }).default(sql`NULL`),
  facebookUrl: varchar("facebook_url", { length: 255 }).default(sql`NULL`),
  twitterUrl: varchar("twitter_url", { length: 255 }).default(sql`NULL`),
  dribbleUrl: varchar("dribble_url", { length: 255 }).default(sql`NULL`),
  linkedinUrl: varchar("linkedin_url", { length: 255 }).default(sql`NULL`),
  behanceUrl: varchar("behance_url", { length: 255 }).default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smCustomTemporaryResults = mysqlTable("sm_custom_temporary_results", {
  id: int().autoincrement().primaryKey().notNull(),
  studentId: int("student_id").default(sql`NULL`),
  admissionNo: varchar("admission_no", { length: 200 }).default(sql`NULL`),
  fullName: varchar("full_name", { length: 200 }).default(sql`NULL`),
  term1: varchar({ length: 200 }).default(sql`NULL`),
  gpa1: varchar({ length: 200 }).default(sql`NULL`),
  term2: varchar({ length: 200 }).default(sql`NULL`),
  gpa2: varchar({ length: 200 }).default(sql`NULL`),
  term3: varchar({ length: 200 }).default(sql`NULL`),
  gpa3: varchar({ length: 200 }).default(sql`NULL`),
  finalResult: varchar("final_result", { length: 200 }).default(sql`NULL`),
  finalGrade: varchar("final_grade", { length: 200 }).default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "restrict",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smDashboardSettings = mysqlTable("sm_dashboard_settings", {
  id: int().autoincrement().primaryKey().notNull(),
  dashboardSecId: int("dashboard_sec_id").notNull(),
  activeStatus: int("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  roleId: int("role_id")
    .default(sql`NULL`)
    .references(() => roles.id, { onDelete: "cascade", onUpdate: "restrict" }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smDateFormats = mysqlTable("sm_date_formats", {
  id: int().autoincrement().primaryKey().notNull(),
  format: varchar({ length: 191 }).default(sql`NULL`),
  normalView: varchar("normal_view", { length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smDesignations = mysqlTable("sm_designations", {
  id: int().autoincrement().primaryKey().notNull(),
  title: varchar({ length: 255 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  isSaas: int("is_saas").default(0),
});

export const smDonors = mysqlTable("sm_donors", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  fullName: varchar("full_name", { length: 200 }).default(sql`NULL`),
  profession: varchar({ length: 200 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  dateOfBirth: date("date_of_birth", { mode: "string" }).default(sql`NULL`),
  email: varchar({ length: 200 }).default(sql`NULL`),
  mobile: varchar({ length: 200 }).default(sql`NULL`),
  photo: varchar({ length: 191 }).default(sql`NULL`),
  age: varchar({ length: 200 }).default(sql`NULL`),
  currentAddress: varchar("current_address", { length: 500 }).default(sql`NULL`),
  permanentAddress: varchar("permanent_address", { length: 500 }).default(sql`NULL`),
  showPublic: tinyint("show_public").default(1).notNull(),
  customField: text("custom_field").default(sql`NULL`),
  customFieldFormName: varchar("custom_field_form_name", {
    length: 191,
  }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  bloodgroupId: int("bloodgroup_id")
    .default(sql`NULL`)
    .references(() => smBaseSetups.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  religionId: int("religion_id")
    .default(sql`NULL`)
    .references(() => smBaseSetups.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  genderId: int("gender_id")
    .default(sql`NULL`)
    .references(() => smBaseSetups.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smDormitoryLists = mysqlTable("sm_dormitory_lists", {
  id: int().autoincrement().primaryKey().notNull(),
  dormitoryName: varchar("dormitory_name", { length: 200 }).notNull(),
  type: varchar({ length: 191 }).notNull(),
  address: varchar({ length: 191 }).default(sql`NULL`),
  intake: int().default(sql`NULL`),
  description: text().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smEmailSettings = mysqlTable("sm_email_settings", {
  id: int().autoincrement().primaryKey().notNull(),
  emailEngineType: varchar("email_engine_type", { length: 191 }).default(sql`NULL`),
  fromName: varchar("from_name", { length: 191 }).default(sql`NULL`),
  fromEmail: varchar("from_email", { length: 191 }).default(sql`NULL`),
  mailDriver: varchar("mail_driver", { length: 191 }).default(sql`NULL`),
  mailHost: varchar("mail_host", { length: 191 }).default(sql`NULL`),
  mailPort: varchar("mail_port", { length: 191 }).default(sql`NULL`),
  mailUsername: varchar("mail_username", { length: 191 }).default(sql`NULL`),
  mailPassword: varchar("mail_password", { length: 191 }).default(sql`NULL`),
  mailEncryption: varchar("mail_encryption", { length: 191 }).default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smEmailSmsLogs = mysqlTable("sm_email_sms_logs", {
  id: int().autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  description: varchar({ length: 191 }).default(sql`NULL`),
  gmailMessageId: varchar("gmail_message_id", { length: 191 }).default(sql`NULL`),
  deliveryStatus: mysqlEnum("delivery_status", ["sent", "delivered", "read", "bounced", "failed"])
    .default("sent")
    .notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  sendDate: date("send_date", { mode: "string" }).default(sql`NULL`),
  sendThrough: varchar("send_through", { length: 191 }).default(sql`NULL`),
  sendTo: varchar("send_to", { length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smEvents = mysqlTable("sm_events", {
  id: int().autoincrement().primaryKey().notNull(),
  eventTitle: varchar("event_title", { length: 200 }).default(sql`NULL`),
  forWhom: varchar("for_whom", { length: 200 }).default(sql`NULL`),
  roleIds: text("role_ids").default(sql`NULL`),
  url: text().default(sql`NULL`),
  eventLocation: varchar("event_location", { length: 200 }).default(sql`NULL`),
  eventDes: varchar("event_des", { length: 500 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  fromDate: date("from_date", { mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  toDate: date("to_date", { mode: "string" }).default(sql`NULL`),
  upladImageFile: varchar("uplad_image_file", { length: 200 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smExams = mysqlTable("sm_exams", {
  id: int().autoincrement().primaryKey().notNull(),
  parentId: int("parent_id").default(0),
  examMark: double("exam_mark", { precision: 8, scale: 2 }).default(sql`NULL`),
  passMark: double("pass_mark", { precision: 8, scale: 2 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  examTypeId: int("exam_type_id")
    .default(sql`NULL`)
    .references(() => smExamTypes.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smExamAttendances = mysqlTable("sm_exam_attendances", {
  id: int().autoincrement().primaryKey().notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  examId: int("exam_id")
    .default(sql`NULL`)
    .references(() => smExams.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smExamAttendanceChildren = mysqlTable(
  "sm_exam_attendance_children",
  {
    id: int().autoincrement().primaryKey().notNull(),
    attendanceType: varchar("attendance_type", { length: 2 }).default(sql`NULL`),
    activeStatus: tinyint("active_status").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    examAttendanceId: int("exam_attendance_id").default(sql`NULL`),
    studentRecordId: bigint("student_record_id", { mode: "number" }).default(sql`NULL`),
    classId: int("class_id").default(sql`NULL`),
    sectionId: int("section_id").default(sql`NULL`),
    studentId: int("student_id").default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
    academicId: int("academic_id").default(1),
  },
  (table) => ({
    examAttendanceFk: foreignKey({
      name: "seac_exam_attendance_id_fk",
      columns: [table.examAttendanceId],
      foreignColumns: [smExamAttendances.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    studentRecordFk: foreignKey({
      name: "seac_student_record_id_fk",
      columns: [table.studentRecordId],
      foreignColumns: [studentRecords.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    classFk: foreignKey({
      name: "seac_class_id_fk",
      columns: [table.classId],
      foreignColumns: [smClasses.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    sectionFk: foreignKey({
      name: "seac_section_id_fk",
      columns: [table.sectionId],
      foreignColumns: [smSections.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    studentFk: foreignKey({
      name: "seac_student_id_fk",
      columns: [table.studentId],
      foreignColumns: [smStudents.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "seac_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "seac_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const smExamMarksRegisters = mysqlTable("sm_exam_marks_registers", {
  id: int().autoincrement().primaryKey().notNull(),
  obtainedMarks: varchar("obtained_marks", { length: 200 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  examDate: date("exam_date", { mode: "string" }).default(sql`NULL`),
  comments: varchar({ length: 500 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  examId: int("exam_id")
    .notNull()
    .references(() => smExams.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  studentId: int("student_id")
    .default(sql`NULL`)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smExamSchedules = mysqlTable("sm_exam_schedules", {
  id: int().autoincrement().primaryKey().notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  date: date({ mode: "string" }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  examPeriodId: int("exam_period_id")
    .default(sql`NULL`)
    .references(() => smClassTimes.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  roomId: int("room_id").default(sql`NULL`),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  examTermId: int("exam_term_id")
    .default(sql`NULL`)
    .references(() => smExamTypes.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  examId: int("exam_id")
    .default(sql`NULL`)
    .references(() => smExams.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  startTime: time("start_time").default(sql`NULL`),
  endTime: time("end_time").default(sql`NULL`),
  teacherId: int("teacher_id")
    .default(sql`NULL`)
    .references(() => smStaffs.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smExamScheduleSubjects = mysqlTable(
  "sm_exam_schedule_subjects",
  {
    id: int().autoincrement().primaryKey().notNull(),
    // you can use { mode: 'date' }, if you want to have Date as type for this column
    date: date({ mode: "string" }).default(sql`NULL`),
    startTime: varchar("start_time", { length: 200 }).default(sql`NULL`),
    endTime: varchar("end_time", { length: 200 }).default(sql`NULL`),
    room: varchar({ length: 200 }).default(sql`NULL`),
    fullMark: int("full_mark").default(sql`NULL`),
    passMark: int("pass_mark").default(sql`NULL`),
    activeStatus: tinyint("active_status").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    examScheduleId: int("exam_schedule_id").default(sql`NULL`),
    subjectId: int("subject_id").default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
    academicId: int("academic_id").default(1),
  },
  (table) => ({
    examScheduleFk: foreignKey({
      name: "sess_exam_schedule_id_fk",
      columns: [table.examScheduleId],
      foreignColumns: [smExamSchedules.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    subjectFk: foreignKey({
      name: "sess_subject_id_fk",
      columns: [table.subjectId],
      foreignColumns: [smSubjects.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "sess_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "sess_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const smExamSettings = mysqlTable("sm_exam_settings", {
  id: int().autoincrement().primaryKey().notNull(),
  examType: int("exam_type").default(sql`NULL`),
  title: varchar({ length: 191 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  publishDate: date("publish_date", { mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  startDate: date("start_date", { mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  endDate: date("end_date", { mode: "string" }).default(sql`NULL`),
  file: varchar({ length: 200 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smExamSetups = mysqlTable("sm_exam_setups", {
  id: int().autoincrement().primaryKey().notNull(),
  examTitle: varchar("exam_title", { length: 255 }).default(sql`NULL`),
  examMark: double("exam_mark", { precision: 8, scale: 2 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  examId: int("exam_id")
    .default(sql`NULL`)
    .references(() => smExams.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  examTermId: int("exam_term_id")
    .default(sql`NULL`)
    .references(() => smExamTypes.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smExamSignatures = mysqlTable("sm_exam_signatures", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).notNull(),
  signature: text().notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smExamTypes = mysqlTable("sm_exam_types", {
  id: int().autoincrement().primaryKey().notNull(),
  activeStatus: int("active_status").default(1).notNull(),
  title: varchar({ length: 255 }).notNull(),
  isAverage: tinyint("is_average").default(0).notNull(),
  percentage: double({ precision: 8, scale: 2 }).default(sql`NULL`),
  averageMark: double("average_mark", { precision: 8, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  parentId: int("parent_id").default(0),
  percantage: double({ precision: 8, scale: 2 }).default(100),
});

export const smExpenseHeads = mysqlTable("sm_expense_heads", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 200 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smExpertTeachers = mysqlTable("sm_expert_teachers", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  staffId: tinyint("staff_id").notNull(),
  createdBy: tinyint("created_by").default(sql`NULL`),
  updatedBy: tinyint("updated_by").default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  position: int().default(0).notNull(),
});

export const smFeesAssigns = mysqlTable("sm_fees_assigns", {
  id: int().autoincrement().primaryKey().notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  feesAmount: double("fees_amount", { precision: 10, scale: 2 }).default(sql`NULL`),
  appliedDiscount: double("applied_discount", {
    precision: 10,
    scale: 2,
  }).default(sql`NULL`),
  feesMasterId: int("fees_master_id")
    .default(sql`NULL`)
    .references(() => smFeesMasters.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  feesDiscountId: int("fees_discount_id")
    .default(sql`NULL`)
    .references(() => smFeesDiscounts.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  recordId: int("record_id").default(sql`NULL`),
  studentId: int("student_id")
    .default(sql`NULL`)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classId: int("class_id").default(sql`NULL`),
  sectionId: int("section_id").default(sql`NULL`),
});

export const smFeesAssignDiscounts = mysqlTable(
  "sm_fees_assign_discounts",
  {
    id: int().autoincrement().primaryKey().notNull(),
    activeStatus: tinyint("active_status").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    studentId: int("student_id").default(sql`NULL`),
    recordId: int("record_id").default(sql`NULL`),
    feesDiscountId: int("fees_discount_id").default(sql`NULL`),
    feesTypeId: int("fees_type_id").default(sql`NULL`),
    feesGroupId: int("fees_group_id").default(sql`NULL`),
    appliedAmount: double("applied_amount"),
    unappliedAmount: double("unapplied_amount").default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
    academicId: int("academic_id").default(1),
  },
  (table) => ({
    studentFk: foreignKey({
      name: "sfad_student_id_fk",
      columns: [table.studentId],
      foreignColumns: [smStudents.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    feesDiscountFk: foreignKey({
      name: "sfad_fees_discount_id_fk",
      columns: [table.feesDiscountId],
      foreignColumns: [smFeesDiscounts.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "sfad_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "sfad_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const smFeesCarryForwards = mysqlTable("sm_fees_carry_forwards", {
  id: int().autoincrement().primaryKey().notNull(),
  balance: double({ precision: 16, scale: 2 }).notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  notes: varchar({ length: 191 }).default("Fees Carry Forward").notNull(),
  balanceType: varchar("balance_type", { length: 191 }).default(sql`NULL`),
  dueDate: timestamp("due_date", { mode: "string" }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  studentId: int("student_id")
    .default(sql`NULL`)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smFeesDiscounts = mysqlTable("sm_fees_discounts", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 200 }).default(sql`NULL`),
  code: varchar({ length: 200 }).default(sql`NULL`),
  type: mysqlEnum(["once", "year"]).default(sql`NULL`),
  amount: double({ precision: 10, scale: 2 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  recordId: int("record_id").default(sql`NULL`),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smFeesGroups = mysqlTable("sm_fees_groups", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 200 }).default(sql`NULL`),
  type: varchar({ length: 200 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  startDate: date("start_date", { mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  endDate: date("end_date", { mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  dueDate: date("due_date", { mode: "string" }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  unSemesterLabelId: int("un_semester_label_id").default(sql`NULL`),
});

export const smFeesMasters = mysqlTable("sm_fees_masters", {
  id: int().autoincrement().primaryKey().notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  date: date({ mode: "string" }).default(sql`NULL`),
  amount: double({ precision: 10, scale: 2 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  feesGroupId: int("fees_group_id")
    .default(sql`NULL`)
    .references(() => smFeesGroups.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  feesTypeId: int("fees_type_id")
    .default(sql`NULL`)
    .references(() => smFeesTypes.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classId: int("class_id").default(sql`NULL`),
  sectionId: int("section_id").default(sql`NULL`),
  unSemesterLabelId: int("un_semester_label_id").default(sql`NULL`),
});

export const smFeesPayments = mysqlTable("sm_fees_payments", {
  id: int().autoincrement().primaryKey().notNull(),
  discountMonth: tinyint("discount_month").default(sql`NULL`),
  discountAmount: double("discount_amount", { precision: 8, scale: 2 }).default(sql`NULL`),
  fine: double({ precision: 8, scale: 2 }).default(sql`NULL`),
  amount: double({ precision: 10, scale: 2 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  paymentDate: date("payment_date", { mode: "string" }).default(sql`NULL`),
  paymentMode: varchar("payment_mode", { length: 100 }).default(sql`NULL`),
  note: text().default(sql`NULL`),
  slip: varchar({ length: 191 }).default(sql`NULL`),
  fineTitle: varchar("fine_title", { length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  assignId: int("assign_id")
    .default(sql`NULL`)
    .references(() => smFeesAssigns.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  bankId: int("bank_id")
    .default(sql`NULL`)
    .references(() => smBankAccounts.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  feesDiscountId: int("fees_discount_id")
    .default(sql`NULL`)
    .references(() => smFeesDiscounts.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  feesTypeId: int("fees_type_id")
    .default(sql`NULL`)
    .references(() => smFeesTypes.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  recordId: int("record_id").default(sql`NULL`),
  studentId: int("student_id")
    .default(sql`NULL`)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  directFeesInstallmentAssignId: int("direct_fees_installment_assign_id").default(sql`NULL`),
  installmentPaymentId: int("installment_payment_id").default(sql`NULL`),
});

export const smFeesTypes = mysqlTable("sm_fees_types", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 230 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  feesGroupId: int("fees_group_id")
    .default(1)
    .references(() => smFeesGroups.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  unSemesterLabelId: int("un_semester_label_id").default(sql`NULL`),
});

export const smFormDownloads = mysqlTable("sm_form_downloads", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  shortDescription: varchar("short_description", { length: 200 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  publishDate: date("publish_date", { mode: "string" }).default(sql`NULL`),
  link: varchar({ length: 191 }).default(sql`NULL`),
  file: varchar({ length: 191 }).default(sql`NULL`),
  showPublic: tinyint("show_public").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smFrontendPersmissions = mysqlTable("sm_frontend_persmissions", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 255 }).default(sql`NULL`),
  parentId: int("parent_id").default(0).notNull(),
  isPublished: int("is_published").default(0).notNull(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smGeneralSettings = mysqlTable("sm_general_settings", {
  id: int().autoincrement().primaryKey().notNull(),
  schoolName: varchar("school_name", { length: 191 }).default(sql`NULL`),
  siteTitle: varchar("site_title", { length: 191 }).default(sql`NULL`),
  schoolCode: varchar("school_code", { length: 191 }).default(sql`NULL`),
  address: varchar({ length: 191 }).default(sql`NULL`),
  phone: varchar({ length: 191 }).default(sql`NULL`),
  email: varchar({ length: 191 }).default(sql`NULL`),
  fileSize: varchar("file_size", { length: 191 }).default("102400").notNull(),
  currency: varchar({ length: 191 }).default("USD"),
  currencySymbol: varchar("currency_symbol", { length: 191 }).default("$"),
  currencyFormat: varchar("currency_format", { length: 191 }).default("'symbol_amount'"),
  promotionSetting: int().default(0),
  logo: varchar({ length: 191 }).default(sql`NULL`),
  favicon: varchar({ length: 191 }).default(sql`NULL`),
  systemVersion: varchar("system_version", { length: 191 }).default("8.2.3"),
  activeStatus: int("active_status").default(1),
  currencyCode: varchar("currency_code", { length: 191 }).default("USD"),
  languageName: varchar("language_name", { length: 191 }).default("en"),
  sessionYear: varchar("session_year", { length: 191 }).default("2020"),
  systemPurchaseCode: text("system_purchase_code").default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  systemActivatedDate: date("system_activated_date", {
    mode: "string",
  }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  lastUpdate: date("last_update", { mode: "string" }).default(sql`NULL`),
  envatoUser: varchar("envato_user", { length: 191 }).default(sql`NULL`),
  envatoItemId: varchar("envato_item_id", { length: 191 }).default(sql`NULL`),
  systemDomain: varchar("system_domain", { length: 191 }).default(sql`NULL`),
  copyrightText: text("copyright_text").default(sql`NULL`),
  apiUrl: int("api_url").default(1).notNull(),
  websiteBtn: int("website_btn").default(1).notNull(),
  dashboardBtn: int("dashboard_btn").default(1).notNull(),
  reportBtn: int("report_btn").default(1).notNull(),
  styleBtn: int("style_btn").default(1).notNull(),
  ltlRtlBtn: int("ltl_rtl_btn").default(1).notNull(),
  langBtn: int("lang_btn").default(1).notNull(),
  websiteUrl: varchar("website_url", { length: 191 }).default(sql`NULL`),
  ttlRtl: int("ttl_rtl").default(2).notNull(),
  phoneNumberPrivacy: int("phone_number_privacy").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  weekStartId: int("week_start_id").default(sql`NULL`),
  timeZoneId: int("time_zone_id").default(sql`NULL`),
  attendanceLayout: int("attendance_layout").default(1),
  sessionId: int("session_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  languageId: int("language_id")
    .default(1)
    .references(() => smLanguages.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  dateFormatId: int("date_format_id")
    .default(1)
    .references(() => smDateFormats.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  ssPageLoad: int("ss_page_load").default(3),
  subTopicEnable: tinyint("sub_topic_enable").default(1).notNull(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  softwareVersion: varchar("software_version", { length: 100 }).default(sql`NULL`),
  emailDriver: varchar("email_driver", { length: 191 }).default("php").notNull(),
  fcmKey: text("fcm_key").default(sql`NULL`),
  multipleRoll: tinyint("multiple_roll").default(0),
  lesson: int("Lesson").default(1),
  chat: int("Chat").default(1),
  feesCollection: int("FeesCollection").default(0),
  incomeHeadId: int("income_head_id").default(0),
  infixBiometrics: int("InfixBiometrics").default(0),
  resultReports: int("ResultReports").default(0),
  templateSettings: int("TemplateSettings").default(1),
  menuManage: int("MenuManage").default(1),
  rolePermission: int("RolePermission").default(1),
  razorPay: int("RazorPay").default(0),
  saas: int("Saas").default(1),
  studentAbsentNotification: int("StudentAbsentNotification").default(1),
  parentRegistration: int("ParentRegistration").default(0),
  zoom: int("Zoom").default(0),
  bbb: int("BBB").default(0),
  videoWatch: int("VideoWatch").default(0),
  jitsi: int("Jitsi").default(0),
  onlineExam: int("OnlineExam").default(0),
  saasRolePermission: int("SaasRolePermission").default(0),
  bulkPrint: int("BulkPrint").default(1),
  himalayaSms: int("HimalayaSms").default(1),
  xenditPayment: int("XenditPayment").default(1),
  wallet: int("Wallet").default(1),
  lms: int("Lms").default(0),
  examPlan: int("ExamPlan").default(1),
  university: int("University").default(0),
  gmeet: int("Gmeet").default(0),
  khaltiPayment: int("KhaltiPayment").default(0),
  raudhahpay: int("Raudhahpay").default(0),
  appSlider: int("AppSlider").default(1),
  behaviourRecords: int("BehaviourRecords").default(0),
  downloadCenter: int("DownloadCenter").default(1),
  aiContent: int("AiContent").default(0),
  whatsappSupport: int("WhatsappSupport").default(0),
  inAppLiveClass: int("InAppLiveClass").default(0),
  feesStatus: int("fees_status").default(1),
  lmsCheckout: int("lms_checkout").default(0),
  academicId: int("academic_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  isComment: tinyint("is_comment").default(0),
  autoApprove: tinyint("auto_approve").default(0),
  blogSearch: tinyint("blog_search").default(1),
  recentBlog: tinyint("recent_blog").default(1),
  unAcademicId: int("un_academic_id").default(1),
  directFeesAssign: tinyint("direct_fees_assign").default(0).notNull(),
  withGuardian: tinyint("with_guardian").default(1).notNull(),
  resultType: varchar("result_type", { length: 191 }).default(sql`NULL`),
  preloaderStatus: tinyint("preloader_status").default(1).notNull(),
  preloaderStyle: tinyint("preloader_style").default(3).notNull(),
  preloaderType: tinyint("preloader_type").default(1).notNull(),
  preloaderImage: varchar("preloader_image", { length: 191 })
    .default("public/uploads/settings/preloader/preloader1.gif")
    .notNull(),
  dueFeesLogin: tinyint("due_fees_login").default(0).notNull(),
  twoFactor: tinyint("two_factor").default(0).notNull(),
  activeTheme: varchar("active_theme", { length: 191 }).default("edulia").notNull(),
  queueConnection: varchar("queue_connection", { length: 191 }).default("database").notNull(),
  isCustomSaas: int("is_custom_saas").default(0).notNull(),
});

export const smHeaderMenuManagers = mysqlTable("sm_header_menu_managers", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  type: varchar({ length: 191 }).notNull(),
  elementId: bigint("element_id", { mode: "number" }).default(sql`NULL`),
  title: varchar({ length: 191 }).default(sql`NULL`),
  link: varchar({ length: 191 }).default(sql`NULL`),
  parentId: bigint("parent_id", { mode: "number" }).default(sql`NULL`),
  position: int().default(0).notNull(),
  show: tinyint().default(0).notNull(),
  isNewtab: tinyint("is_newtab").default(0).notNull(),
  theme: varchar({ length: 191 }).default("default").notNull(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smHolidays = mysqlTable("sm_holidays", {
  id: int().autoincrement().primaryKey().notNull(),
  holidayTitle: varchar("holiday_title", { length: 200 }).default(sql`NULL`),
  details: varchar({ length: 500 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  fromDate: date("from_date", { mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  toDate: date("to_date", { mode: "string" }).default(sql`NULL`),
  uploadImageFile: varchar("upload_image_file", { length: 200 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smHomeworks = mysqlTable("sm_homeworks", {
  id: int().autoincrement().primaryKey().notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  homeworkDate: date("homework_date", { mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  submissionDate: date("submission_date", { mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  evaluationDate: date("evaluation_date", { mode: "string" }).default(sql`NULL`),
  file: varchar({ length: 200 }).default(sql`NULL`),
  marks: varchar({ length: 200 }).default(sql`NULL`),
  description: varchar({ length: 500 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  evaluatedBy: int("evaluated_by")
    .default(sql`NULL`)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  recordId: int("record_id").default(sql`NULL`),
  sectionId: int("section_id").default(sql`NULL`),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  courseId: bigint("course_id", { mode: "number" }).default(sql`NULL`),
  lessonId: bigint("lesson_id", { mode: "number" }).default(sql`NULL`),
  chapterId: bigint("chapter_id", { mode: "number" }).default(sql`NULL`),
});

export const smHomeworkStudents = mysqlTable("sm_homework_students", {
  id: int().autoincrement().primaryKey().notNull(),
  marks: varchar({ length: 200 }).default(sql`NULL`),
  teacherComments: varchar("teacher_comments", { length: 255 }).default(sql`NULL`),
  completeStatus: varchar("complete_status", { length: 200 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  studentId: int("student_id")
    .default(sql`NULL`)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  homeworkId: int("homework_id")
    .default(sql`NULL`)
    .references(() => smHomeworks.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smHomePageSettings = mysqlTable("sm_home_page_settings", {
  id: int().autoincrement().primaryKey().notNull(),
  title: varchar({ length: 255 }).default(sql`NULL`),
  longTitle: varchar("long_title", { length: 255 }).default(sql`NULL`),
  shortDescription: text("short_description").default(sql`NULL`),
  linkLabel: varchar("link_label", { length: 255 }).default(sql`NULL`),
  linkUrl: varchar("link_url", { length: 255 }).default(sql`NULL`),
  image: varchar({ length: 255 }).default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smHourlyRates = mysqlTable("sm_hourly_rates", {
  id: int().autoincrement().primaryKey().notNull(),
  grade: varchar({ length: 191 }).default(sql`NULL`),
  rate: int().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smHrPayrollEarnDeducs = mysqlTable(
  "sm_hr_payroll_earn_deducs",
  {
    id: int().autoincrement().primaryKey().notNull(),
    typeName: varchar("type_name", { length: 191 }).default(sql`NULL`),
    amount: double({ precision: 10, scale: 2 }).default(sql`NULL`),
    earnDedcType: varchar("earn_dedc_type", { length: 5 }).default(sql`NULL`),
    activeStatus: tinyint("active_status").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    payrollGenerateId: int("payroll_generate_id").default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
    academicId: int("academic_id").default(1),
  },
  (table) => ({
    payrollGenerateFk: foreignKey({
      name: "shped_payroll_gen_id_fk",
      columns: [table.payrollGenerateId],
      foreignColumns: [smHrPayrollGenerates.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "shped_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "shped_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const smHrPayrollGenerates = mysqlTable("sm_hr_payroll_generates", {
  id: int().autoincrement().primaryKey().notNull(),
  basicSalary: double("basic_salary").default(sql`NULL`),
  totalEarning: double("total_earning").default(sql`NULL`),
  totalDeduction: double("total_deduction").default(sql`NULL`),
  grossSalary: double("gross_salary").default(sql`NULL`),
  tax: double().default(sql`NULL`),
  netSalary: double("net_salary").default(sql`NULL`),
  payrollMonth: varchar("payroll_month", { length: 191 }).default(sql`NULL`),
  payrollYear: varchar("payroll_year", { length: 191 }).default(sql`NULL`),
  payrollStatus: varchar("payroll_status", { length: 191 }).default(sql`NULL`),
  paymentMode: varchar("payment_mode", { length: 191 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  paymentDate: date("payment_date", { mode: "string" }).default(sql`NULL`),
  bankId: int("bank_id").default(sql`NULL`),
  note: varchar({ length: 200 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  paidAmount: int("paid_amount").default(sql`NULL`),
  isPartial: int("is_partial").default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  staffId: int("staff_id")
    .default(sql`NULL`)
    .references(() => smStaffs.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smHrSalaryTemplates = mysqlTable("sm_hr_salary_templates", {
  id: int().autoincrement().primaryKey().notNull(),
  salaryGrades: varchar("salary_grades", { length: 200 }).default(sql`NULL`),
  salaryBasic: varchar("salary_basic", { length: 200 }).default(sql`NULL`),
  overtimeRate: varchar("overtime_rate", { length: 200 }).default(sql`NULL`),
  houseRent: int("house_rent").default(sql`NULL`),
  providentFund: int("provident_fund").default(sql`NULL`),
  grossSalary: int("gross_salary").default(sql`NULL`),
  totalDeduction: int("total_deduction").default(sql`NULL`),
  netSalary: int("net_salary").default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smHumanDepartments = mysqlTable("sm_human_departments", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by")
    .default(1)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  updatedBy: int("updated_by")
    .default(1)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  isSaas: int("is_saas").default(0),
});

export const smIncomeHeads = mysqlTable("sm_income_heads", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 200 }).notNull(),
  description: text().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smInstructions = mysqlTable("sm_instructions", {
  id: int().autoincrement().primaryKey().notNull(),
  title: varchar({ length: 200 }).notNull(),
  description: text().notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smInventoryPayments = mysqlTable("sm_inventory_payments", {
  id: int().autoincrement().primaryKey().notNull(),
  itemReceiveSellId: int("item_receive_sell_id").default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  paymentDate: date("payment_date", { mode: "string" }).default(sql`NULL`),
  amount: double({ precision: 10, scale: 2 }).default(sql`NULL`),
  referenceNo: varchar("reference_no", { length: 50 }).default(sql`NULL`),
  paymentType: varchar("payment_type", { length: 11 }).default(sql`NULL`),
  paymentMethod: int("payment_method").default(sql`NULL`),
  notes: varchar({ length: 500 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smItems = mysqlTable("sm_items", {
  id: int().autoincrement().primaryKey().notNull(),
  itemName: varchar("item_name", { length: 100 }).default(sql`NULL`),
  totalInStock: double("total_in_stock", { precision: 8, scale: 2 }).default(sql`NULL`),
  description: varchar({ length: 500 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  itemCategoryId: int("item_category_id")
    .default(sql`NULL`)
    .references(() => smItemCategories.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smItemCategories = mysqlTable("sm_item_categories", {
  id: int().autoincrement().primaryKey().notNull(),
  categoryName: varchar("category_name", { length: 100 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smItemIssues = mysqlTable("sm_item_issues", {
  id: int().autoincrement().primaryKey().notNull(),
  issueTo: int("issue_to").default(sql`NULL`),
  issueBy: int("issue_by").default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  issueDate: date("issue_date", { mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  dueDate: date("due_date", { mode: "string" }).default(sql`NULL`),
  quantity: int().default(sql`NULL`),
  issueStatus: varchar("issue_status", { length: 191 }).default(sql`NULL`),
  note: varchar({ length: 500 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  roleId: int("role_id")
    .default(sql`NULL`)
    .references(() => roles.id, { onDelete: "cascade", onUpdate: "restrict" }),
  itemCategoryId: int("item_category_id")
    .default(sql`NULL`)
    .references(() => smItemCategories.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  itemId: int("item_id")
    .default(sql`NULL`)
    .references(() => smItems.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smItemReceives = mysqlTable("sm_item_receives", {
  id: int().autoincrement().primaryKey().notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  receiveDate: date("receive_date", { mode: "string" }).default(sql`NULL`),
  referenceNo: varchar("reference_no", { length: 191 }).default(sql`NULL`),
  grandTotal: decimal("grand_total", { precision: 20, scale: 2 }).default(sql`NULL`),
  totalQuantity: decimal("total_quantity", { precision: 20, scale: 2 }).default(sql`NULL`),
  totalPaid: decimal("total_paid", { precision: 20, scale: 2 }).default(sql`NULL`),
  totalDue: decimal("total_due", { precision: 20, scale: 2 }).default(sql`NULL`),
  expenseHeadId: int("expense_head_id").default(sql`NULL`),
  accountId: int("account_id").default(sql`NULL`),
  paymentMethod: varchar("payment_method", { length: 191 }).default(sql`NULL`),
  paidStatus: varchar("paid_status", { length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  supplierId: int("supplier_id")
    .default(sql`NULL`)
    .references(() => smSuppliers.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  storeId: int("store_id")
    .default(sql`NULL`)
    .references(() => smItemStores.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smItemReceiveChildren = mysqlTable("sm_item_receive_children", {
  id: int().autoincrement().primaryKey().notNull(),
  unitPrice: decimal("unit_price", { precision: 20, scale: 2 }).default(sql`NULL`),
  quantity: decimal({ precision: 20, scale: 2 }).default(sql`NULL`),
  subTotal: decimal("sub_total", { precision: 20, scale: 2 }).default(sql`NULL`),
  description: varchar({ length: 500 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  itemId: int("item_id")
    .default(sql`NULL`)
    .references(() => smItems.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  itemReceiveId: int("item_receive_id")
    .default(sql`NULL`)
    .references(() => smItemReceives.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smItemSells = mysqlTable("sm_item_sells", {
  id: int().autoincrement().primaryKey().notNull(),
  studentStaffId: int("student_staff_id").default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  sellDate: date("sell_date", { mode: "string" }).default(sql`NULL`),
  referenceNo: varchar("reference_no", { length: 50 }).default(sql`NULL`),
  grandTotal: decimal("grand_total", { precision: 20, scale: 2 }).default(sql`NULL`),
  totalQuantity: decimal("total_quantity", { precision: 20, scale: 2 }).default(sql`NULL`),
  totalPaid: decimal("total_paid", { precision: 20, scale: 2 }).default(sql`NULL`),
  totalDue: decimal("total_due", { precision: 20, scale: 2 }).default(sql`NULL`),
  incomeHeadId: int("income_head_id").default(sql`NULL`),
  accountId: int("account_id").default(sql`NULL`),
  paymentMethod: varchar("payment_method", { length: 191 }).default(sql`NULL`),
  paidStatus: varchar("paid_status", { length: 191 }).default(sql`NULL`),
  description: varchar({ length: 500 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  roleId: int("role_id")
    .default(sql`NULL`)
    .references(() => roles.id, { onDelete: "cascade", onUpdate: "restrict" }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smItemSellChildren = mysqlTable("sm_item_sell_children", {
  id: int().autoincrement().primaryKey().notNull(),
  sellPrice: decimal("sell_price", { precision: 20, scale: 2 }).default(sql`NULL`),
  quantity: decimal({ precision: 20, scale: 2 }).default(sql`NULL`),
  subTotal: decimal("sub_total", { precision: 20, scale: 2 }).default(sql`NULL`),
  description: varchar({ length: 500 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  itemSellId: int("item_sell_id").default(sql`NULL`),
  itemId: int("item_id").default(sql`NULL`),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smItemStores = mysqlTable("sm_item_stores", {
  id: int().autoincrement().primaryKey().notNull(),
  storeName: varchar("store_name", { length: 100 }).default(sql`NULL`),
  storeNo: varchar("store_no", { length: 100 }).default(sql`NULL`),
  description: varchar({ length: 500 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smLanguages = mysqlTable("sm_languages", {
  id: int().autoincrement().primaryKey().notNull(),
  languageName: varchar("language_name", { length: 191 }).default(sql`NULL`),
  native: varchar({ length: 191 }).default(sql`NULL`),
  languageUniversal: varchar("language_universal", { length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  langId: int("lang_id")
    .default(1)
    .references(() => languages.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smLanguagePhrases = mysqlTable("sm_language_phrases", {
  id: int().autoincrement().primaryKey().notNull(),
  modules: text().default(sql`NULL`),
  defaultPhrases: text("default_phrases").default(sql`NULL`),
  en: text().default(sql`NULL`),
  es: text().default(sql`NULL`),
  bn: text().default(sql`NULL`),
  fr: text().default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smLeaveDeductionInfos = mysqlTable("sm_leave_deduction_infos", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  staffId: int("staff_id").default(sql`NULL`),
  payrollId: int("payroll_id").default(sql`NULL`),
  extraLeave: int("extra_leave").default(sql`NULL`),
  salaryDeduct: int("salary_deduct").default(sql`NULL`),
  payMonth: varchar("pay_month", { length: 191 }).default(sql`NULL`),
  payYear: varchar("pay_year", { length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(0),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "restrict",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smLeaveDefines = mysqlTable("sm_leave_defines", {
  id: int().autoincrement().primaryKey().notNull(),
  days: int().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  roleId: int("role_id")
    .default(sql`NULL`)
    .references(() => roles.id, { onDelete: "cascade", onUpdate: "restrict" }),
  userId: int("user_id")
    .default(sql`NULL`)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  typeId: int("type_id")
    .default(sql`NULL`)
    .references(() => smLeaveTypes.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  totalDays: int("total_days").default(0),
});

export const smLeaveRequests = mysqlTable("sm_leave_requests", {
  id: int().autoincrement().primaryKey().notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  applyDate: date("apply_date", { mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  leaveFrom: date("leave_from", { mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  leaveTo: date("leave_to", { mode: "string" }).default(sql`NULL`),
  reason: text().default(sql`NULL`),
  note: text().default(sql`NULL`),
  file: varchar({ length: 191 }).default(sql`NULL`),
  approveStatus: varchar("approve_status", { length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  leaveDefineId: int("leave_define_id")
    .default(sql`NULL`)
    .references(() => smLeaveDefines.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  staffId: int("staff_id")
    .default(sql`NULL`)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  roleId: int("role_id")
    .default(sql`NULL`)
    .references(() => roles.id, { onDelete: "cascade", onUpdate: "restrict" }),
  typeId: int("type_id")
    .default(sql`NULL`)
    .references(() => smLeaveTypes.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smLeaveTypes = mysqlTable("sm_leave_types", {
  id: int().autoincrement().primaryKey().notNull(),
  type: varchar({ length: 191 }).default(sql`NULL`),
  totalDays: int("total_days").default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smLessons = mysqlTable("sm_lessons", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  lessonTitle: varchar("lesson_title", { length: 191 }).default(sql`NULL`),
  activeStatus: int("active_status").default(1).notNull(),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  userId: int("user_id").default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smLessonDetails = mysqlTable("sm_lesson_details", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  lessonId: int("lesson_id").notNull(),
  lessonTitle: varchar("lesson_title", { length: 191 }).default(sql`NULL`),
  userId: int("user_id").default(sql`NULL`),
  activeStatus: int("active_status").default(1).notNull(),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smLessonTopics = mysqlTable("sm_lesson_topics", {
  id: int().autoincrement().primaryKey().notNull(),
  lessonId: int("lesson_id").notNull(),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  activeStatus: int("active_status").default(1).notNull(),
  userId: int("user_id").default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smLessonTopicDetails = mysqlTable("sm_lesson_topic_details", {
  id: int().autoincrement().primaryKey().notNull(),
  lessonId: int("lesson_id").default(sql`NULL`),
  topicTitle: varchar("topic_title", { length: 191 }).notNull(),
  completedStatus: varchar("completed_status", { length: 191 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  competedDate: date("competed_date", { mode: "string" }).default(sql`NULL`),
  activeStatus: int("active_status").default(1).notNull(),
  topicId: int("topic_id")
    .default(1)
    .references(() => smLessonTopics.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  userId: int("user_id").default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smLibraryMembers = mysqlTable("sm_library_members", {
  id: int().autoincrement().primaryKey().notNull(),
  memberUdId: varchar("member_ud_id", { length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  memberType: int("member_type")
    .default(sql`NULL`)
    .references(() => roles.id, { onDelete: "cascade", onUpdate: "restrict" }),
  studentStaffId: int("student_staff_id")
    .default(sql`NULL`)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smMarksGrades = mysqlTable("sm_marks_grades", {
  id: int().autoincrement().primaryKey().notNull(),
  gradeName: varchar("grade_name", { length: 191 }).default(sql`NULL`),
  gpa: double({ precision: 8, scale: 2 }).default(sql`NULL`),
  from: double({ precision: 8, scale: 2 }).default(sql`NULL`),
  up: double({ precision: 8, scale: 2 }).default(sql`NULL`),
  percentFrom: double("percent_from", { precision: 8, scale: 2 }).default(sql`NULL`),
  percentUpto: double("percent_upto", { precision: 8, scale: 2 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smMarksRegisters = mysqlTable("sm_marks_registers", {
  id: int().autoincrement().primaryKey().notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  studentId: int("student_id")
    .default(sql`NULL`)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  examId: int("exam_id")
    .default(sql`NULL`)
    .references(() => smExams.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smMarksRegisterChildren = mysqlTable(
  "sm_marks_register_children",
  {
    id: int().autoincrement().primaryKey().notNull(),
    marks: int().default(sql`NULL`),
    abs: int().default(0).notNull(),
    gpaPoint: double("gpa_point", { precision: 8, scale: 2 }).default(sql`NULL`),
    gpaGrade: varchar("gpa_grade", { length: 55 }).default(sql`NULL`),
    activeStatus: tinyint("active_status").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    marksRegisterId: int("marks_register_id").default(sql`NULL`),
    subjectId: int("subject_id").default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
    academicId: int("academic_id").default(1),
  },
  (table) => ({
    marksRegisterFk: foreignKey({
      name: "smrc_marks_reg_id_fk",
      columns: [table.marksRegisterId],
      foreignColumns: [smMarksRegisters.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    subjectFk: foreignKey({
      name: "smrc_subject_id_fk",
      columns: [table.subjectId],
      foreignColumns: [smSubjects.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "smrc_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "smrc_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const smMarksSendSms = mysqlTable("sm_marks_send_sms", {
  id: int().autoincrement().primaryKey().notNull(),
  smsSendStatus: tinyint("sms_send_status").default(1).notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  examId: int("exam_id")
    .default(sql`NULL`)
    .references(() => smExams.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  studentId: int("student_id")
    .default(sql`NULL`)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smMarkStores = mysqlTable("sm_mark_stores", {
  id: int().autoincrement().primaryKey().notNull(),
  studentRollNo: int("student_roll_no").default(1).notNull(),
  studentAddmissionNo: int("student_addmission_no").default(1).notNull(),
  totalMarks: double("total_marks", { precision: 8, scale: 2 }).notNull(),
  isAbsent: tinyint("is_absent").default(1).notNull(),
  teacherRemarks: text("teacher_remarks").default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  examTermId: int("exam_term_id")
    .default(sql`NULL`)
    .references(() => smExamTypes.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  examSetupId: int("exam_setup_id")
    .default(sql`NULL`)
    .references(() => smExamSetups.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  studentId: int("student_id")
    .default(sql`NULL`)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  studentRecordId: bigint("student_record_id", { mode: "number" })
    .default(sql`NULL`)
    .references(() => studentRecords.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  activeStatus: int("active_status").default(1),
});

export const smModules = mysqlTable("sm_modules", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 191 }).notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  order: int().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smModuleLinks = mysqlTable("sm_module_links", {
  id: int().autoincrement().primaryKey().notNull(),
  moduleId: int("module_id")
    .default(sql`NULL`)
    .references(() => smModules.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  name: varchar({ length: 191 }).default(sql`NULL`),
  route: varchar({ length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdBy: int("created_by")
    .default(1)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  updatedBy: int("updated_by")
    .default(1)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smModulePermissions = mysqlTable("sm_module_permissions", {
  id: int().autoincrement().primaryKey().notNull(),
  dashboardId: int("dashboard_id").default(sql`NULL`),
  name: varchar({ length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smModulePermissionAssigns = mysqlTable(
  "sm_module_permission_assigns",
  {
    id: int().autoincrement().primaryKey().notNull(),
    activeStatus: tinyint("active_status").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    moduleId: int("module_id").default(sql`NULL`),
    roleId: int("role_id").default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
  },
  (table) => ({
    moduleFk: foreignKey({
      name: "smpa_module_id_fk",
      columns: [table.moduleId],
      foreignColumns: [smModulePermissions.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    roleFk: foreignKey({
      name: "smpa_role_id_fk",
      columns: [table.roleId],
      foreignColumns: [roles.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "smpa_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const smNews = mysqlTable("sm_news", {
  id: int().autoincrement().primaryKey().notNull(),
  newsTitle: varchar("news_title", { length: 191 }).notNull(),
  viewCount: int("view_count").default(sql`NULL`),
  activeStatus: int("active_status").default(sql`NULL`),
  image: varchar({ length: 191 }).default(sql`NULL`),
  imageThumb: varchar("image_thumb", { length: 191 }).default(sql`NULL`),
  newsBody: longtext("news_body").default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  publishDate: date("publish_date", { mode: "string" }).default(sql`NULL`),
  status: tinyint().default(1),
  isGlobal: tinyint("is_global").default(1),
  autoApprove: tinyint("auto_approve").default(0),
  isComment: tinyint("is_comment").default(0),
  order: varchar({ length: 191 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  categoryId: int("category_id")
    .default(sql`NULL`)
    .references(() => smNewsCategories.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id").default(1),
  academicId: int("academic_id").default(1),
});

export const smNewsCategories = mysqlTable("sm_news_categories", {
  id: int().autoincrement().primaryKey().notNull(),
  categoryName: varchar("category_name", { length: 191 }).notNull(),
  type: varchar({ length: 191 }).default("news").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  schoolId: bigint("school_id", { mode: "number" }).default(1).notNull(),
});

export const smNewsComments = mysqlTable("sm_news_comments", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  message: text().notNull(),
  newsId: int("news_id")
    .default(sql`NULL`)
    .references(() => smNews.id, { onDelete: "cascade", onUpdate: "restrict" }),
  userId: int("user_id")
    .default(sql`NULL`)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  parentId: int("parent_id").default(sql`NULL`),
  status: tinyint().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smNewsPages = mysqlTable("sm_news_pages", {
  id: int().autoincrement().primaryKey().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  mainTitle: varchar("main_title", { length: 191 }).default(sql`NULL`),
  mainDescription: text("main_description").default(sql`NULL`),
  image: varchar({ length: 191 }).default(sql`NULL`),
  mainImage: varchar("main_image", { length: 191 }).default(sql`NULL`),
  buttonText: varchar("button_text", { length: 191 }).default(sql`NULL`),
  buttonUrl: varchar("button_url", { length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdBy: int("created_by")
    .default(1)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  updatedBy: int("updated_by")
    .default(1)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smNoticeBoards = mysqlTable("sm_notice_boards", {
  id: int().autoincrement().primaryKey().notNull(),
  noticeTitle: varchar("notice_title", { length: 200 }).default(sql`NULL`),
  noticeMessage: text("notice_message").default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  noticeDate: date("notice_date", { mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  publishOn: date("publish_on", { mode: "string" }).default(sql`NULL`),
  informTo: varchar("inform_to", { length: 200 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  isPublished: int("is_published").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smNotifications = mysqlTable("sm_notifications", {
  id: int().autoincrement().primaryKey().notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  date: date({ mode: "string" }).default(sql`NULL`),
  message: varchar({ length: 191 }).default(sql`NULL`),
  url: varchar({ length: 191 }).default(sql`NULL`),
  isRead: tinyint("is_read").default(0).notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  userId: int("user_id").default(1),
  roleId: int("role_id").default(1).notNull(),
  createdBy: int("created_by").default(1).notNull(),
  updatedBy: int("updated_by").default(1).notNull(),
  schoolId: int("school_id")
    .default(1)
    .notNull()
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smNotificationSettings = mysqlTable("sm_notification_settings", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  event: varchar({ length: 191 }).default(sql`NULL`),
  destination: varchar({ length: 191 }).default(sql`NULL`),
  recipient: varchar({ length: 191 }).default(sql`NULL`),
  subject: varchar({ length: 191 }).default(sql`NULL`),
  template: longtext().default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  shortcode: text().default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smOnlineExams = mysqlTable("sm_online_exams", {
  id: int().autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  date: date({ mode: "string" }).default(sql`NULL`),
  startTime: varchar("start_time", { length: 200 }).default(sql`NULL`),
  endTime: varchar("end_time", { length: 200 }).default(sql`NULL`),
  endDateTime: varchar("end_date_time", { length: 191 }).default(sql`NULL`),
  percentage: int().default(sql`NULL`),
  instruction: text().default(sql`NULL`),
  status: tinyint().default(sql`NULL`),
  isTaken: tinyint("is_taken").default(0),
  isClosed: tinyint("is_closed").default(0),
  isWaiting: tinyint("is_waiting").default(0),
  isRunning: tinyint("is_running").default(0),
  autoMark: tinyint("auto_mark").default(0),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smOnlineExamMarks = mysqlTable("sm_online_exam_marks", {
  id: int().autoincrement().primaryKey().notNull(),
  marks: int().default(sql`NULL`),
  abs: int().default(0).notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  studentId: int("student_id")
    .default(sql`NULL`)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  examId: int("exam_id")
    .default(sql`NULL`)
    .references(() => smExams.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smOnlineExamQuestions = mysqlTable("sm_online_exam_questions", {
  id: int().autoincrement().primaryKey().notNull(),
  type: varchar({ length: 1 }).default(sql`NULL`),
  mark: int().default(sql`NULL`),
  title: text().default(sql`NULL`),
  trueFalse: varchar({ length: 1 }).default(sql`NULL`),
  suitableWords: text("suitable_words").default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  onlineExamId: int("online_exam_id")
    .default(sql`NULL`)
    .references(() => smOnlineExams.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smOnlineExamQuestionAssigns = mysqlTable(
  "sm_online_exam_question_assigns",
  {
    id: int().autoincrement().primaryKey().notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    onlineExamId: int("online_exam_id").default(sql`NULL`),
    questionBankId: int("question_bank_id").default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
    academicId: int("academic_id").default(1),
  },
  (table) => ({
    onlineExamFk: foreignKey({
      name: "soeqa_online_exam_id_fk",
      columns: [table.onlineExamId],
      foreignColumns: [smOnlineExams.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    questionBankFk: foreignKey({
      name: "soeqa_question_bank_id_fk",
      columns: [table.questionBankId],
      foreignColumns: [smQuestionBanks.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "soeqa_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "soeqa_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const smOnlineExamQuestionMuOptions = mysqlTable(
  "sm_online_exam_question_mu_options",
  {
    id: int().autoincrement().primaryKey().notNull(),
    title: varchar({ length: 191 }).default(sql`NULL`),
    status: tinyint().default(sql`NULL`),
    activeStatus: tinyint("active_status").default(1).notNull(),
    onlineExamQuestionId: int("online_exam_question_id").default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
    academicId: int("academic_id").default(1),
  },
  (table) => ({
    onlineExamQuestionFk: foreignKey({
      name: "soeqmo_online_exam_q_id_fk",
      columns: [table.onlineExamQuestionId],
      foreignColumns: [smOnlineExamQuestions.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "soeqmo_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "soeqmo_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const smOptionalSubjectAssigns = mysqlTable(
  "sm_optional_subject_assigns",
  {
    id: int().autoincrement().primaryKey().notNull(),
    studentId: int("student_id").default(sql`NULL`),
    recordId: bigint("record_id", { mode: "number" }).default(sql`NULL`),
    subjectId: int("subject_id").default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
    sessionId: int("session_id").notNull(),
    academicId: int("academic_id").default(1),
    activeStatus: int("active_status").default(1),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    studentFk: foreignKey({
      name: "sosa_student_id_fk",
      columns: [table.studentId],
      foreignColumns: [smStudents.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    subjectFk: foreignKey({
      name: "sosa_subject_id_fk",
      columns: [table.subjectId],
      foreignColumns: [smSubjects.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "sosa_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    sessionFk: foreignKey({
      name: "sosa_session_id_fk",
      columns: [table.sessionId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "sosa_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const smPages = mysqlTable(
  "sm_pages",
  {
    id: int().autoincrement().primaryKey().notNull(),
    title: varchar({ length: 191 }).default(sql`NULL`),
    subTitle: varchar("sub_title", { length: 191 }).default(sql`NULL`),
    slug: varchar({ length: 191 }).default(sql`NULL`),
    headerImage: text("header_image").default(sql`NULL`),
    details: longtext().default(sql`NULL`),
    activeStatus: tinyint("active_status").default(1).notNull(),
    isDynamic: tinyint("is_dynamic").default(1).notNull(),
    schoolId: int("school_id")
      .default(1)
      .references(() => smSchools.id, {
        onDelete: "cascade",
        onUpdate: "restrict",
      }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => [unique("sm_pages_sub_title_unique").on(table.subTitle)]
);

export const smParents = mysqlTable("sm_parents", {
  id: int().autoincrement().primaryKey().notNull(),
  fathersName: varchar("fathers_name", { length: 200 }).default(sql`NULL`),
  fathersMobile: varchar("fathers_mobile", { length: 200 }).default(sql`NULL`),
  fathersOccupation: varchar("fathers_occupation", { length: 200 }).default(sql`NULL`),
  fathersPhoto: varchar("fathers_photo", { length: 200 }).default(sql`NULL`),
  mothersName: varchar("mothers_name", { length: 200 }).default(sql`NULL`),
  mothersMobile: varchar("mothers_mobile", { length: 200 }).default(sql`NULL`),
  mothersOccupation: varchar("mothers_occupation", { length: 200 }).default(sql`NULL`),
  mothersPhoto: varchar("mothers_photo", { length: 200 }).default(sql`NULL`),
  relation: varchar({ length: 200 }).default(sql`NULL`),
  guardiansName: varchar("guardians_name", { length: 200 }).default(sql`NULL`),
  guardiansMobile: varchar("guardians_mobile", { length: 200 }).default(sql`NULL`),
  guardiansEmail: varchar("guardians_email", { length: 200 }).default(sql`NULL`),
  guardiansOccupation: varchar("guardians_occupation", { length: 200 }).default(sql`NULL`),
  guardiansRelation: varchar("guardians_relation", { length: 30 }).default(sql`NULL`),
  guardiansPhoto: varchar("guardians_photo", { length: 200 }).default(sql`NULL`),
  guardiansAddress: varchar("guardians_address", { length: 200 }).default(sql`NULL`),
  isGuardian: int("is_guardian").default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  userId: int("user_id")
    .default(1)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smPaymentGatewaySettings = mysqlTable("sm_payment_gateway_settings", {
  id: int().autoincrement().primaryKey().notNull(),
  gatewayName: varchar("gateway_name", { length: 191 }).default(sql`NULL`),
  gatewayUsername: varchar("gateway_username", { length: 191 }).default(sql`NULL`),
  gatewayPassword: varchar("gateway_password", { length: 191 }).default(sql`NULL`),
  gatewaySignature: varchar("gateway_signature", { length: 191 }).default(sql`NULL`),
  gatewayClientId: varchar("gateway_client_id", { length: 191 }).default(sql`NULL`),
  gatewayMode: varchar("gateway_mode", { length: 191 }).default(sql`NULL`),
  gatewaySecretKey: varchar("gateway_secret_key", { length: 191 }).default(sql`NULL`),
  gatewaySecretWord: varchar("gateway_secret_word", { length: 191 }).default(sql`NULL`),
  gatewayPublisherKey: varchar("gateway_publisher_key", {
    length: 191,
  }).default(sql`NULL`),
  gatewayPrivateKey: varchar("gateway_private_key", { length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  bankDetails: text("bank_details").default(sql`NULL`),
  chequeDetails: text("cheque_details").default(sql`NULL`),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  serviceCharge: tinyint("service_charge").default(0),
  chargeType: varchar("charge_type", { length: 2 }).default(sql`NULL`),
  charge: double({ precision: 8, scale: 2 }),
});

export const smPaymentMethhods = mysqlTable("sm_payment_methhods", {
  id: int().autoincrement().primaryKey().notNull(),
  method: varchar({ length: 255 }).notNull(),
  type: varchar({ length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  gatewayId: int("gateway_id")
    .default(sql`NULL`)
    .references(() => smPaymentGatewaySettings.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smPhoneCallLogs = mysqlTable("sm_phone_call_logs", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 191 }).default(sql`NULL`),
  phone: varchar({ length: 191 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  date: date({ mode: "string" }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  nextFollowUpDate: date("next_follow_up_date", { mode: "string" }).default(sql`NULL`),
  callDuration: varchar("call_duration", { length: 100 }).default(sql`NULL`),
  callType: varchar("call_type", { length: 2 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smPhotoGalleries = mysqlTable("sm_photo_galleries", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  parentId: int("parent_id").default(sql`NULL`),
  name: varchar({ length: 191 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  featureImage: varchar("feature_image", { length: 191 }).default(sql`NULL`),
  galleryImage: varchar("gallery_image", { length: 191 }).default(sql`NULL`),
  isPublish: tinyint("is_publish").default(1).notNull(),
  position: int().default(0).notNull(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smPostalDispatches = mysqlTable("sm_postal_dispatches", {
  id: int().autoincrement().primaryKey().notNull(),
  toTitle: varchar("to_title", { length: 191 }).default(sql`NULL`),
  fromTitle: varchar("from_title", { length: 191 }).default(sql`NULL`),
  referenceNo: varchar("reference_no", { length: 191 }).default(sql`NULL`),
  address: varchar({ length: 191 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  date: date({ mode: "string" }).default(sql`NULL`),
  note: text().default(sql`NULL`),
  file: varchar({ length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smPostalReceives = mysqlTable("sm_postal_receives", {
  id: int().autoincrement().primaryKey().notNull(),
  fromTitle: varchar("from_title", { length: 191 }).default(sql`NULL`),
  toTitle: varchar("to_title", { length: 191 }).default(sql`NULL`),
  referenceNo: varchar("reference_no", { length: 191 }).default(sql`NULL`),
  address: varchar({ length: 191 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  date: date({ mode: "string" }).default(sql`NULL`),
  note: text().default(sql`NULL`),
  file: varchar({ length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smProductPurchases = mysqlTable("sm_product_purchases", {
  id: int().autoincrement().primaryKey().notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  purchaseDate: date("purchase_date", { mode: "string" }).notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  expaireDate: date("expaire_date", { mode: "string" }).notNull(),
  price: double({ precision: 10, scale: 2 }).default(sql`NULL`),
  paidAmount: double("paid_amount", { precision: 10, scale: 2 }).default(sql`NULL`),
  dueAmount: double("due_amount", { precision: 10, scale: 2 }).default(sql`NULL`),
  package: varchar({ length: 10 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  userId: int("user_id")
    .default(sql`NULL`)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  staffId: int("staff_id")
    .default(sql`NULL`)
    .references(() => smStaffs.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smQuestionBanks = mysqlTable("sm_question_banks", {
  id: int().autoincrement().primaryKey().notNull(),
  type: varchar({ length: 2 }).notNull(),
  question: text().default(sql`NULL`),
  marks: int().default(sql`NULL`),
  trueFalse: varchar({ length: 1 }).default(sql`NULL`),
  suitableWords: text("suitable_words").default(sql`NULL`),
  numberOfOption: varchar("number_of_option", { length: 2 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  qGroupId: int("q_group_id")
    .default(sql`NULL`)
    .references(() => smQuestionGroups.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smQuestionBankMuOptions = mysqlTable("sm_question_bank_mu_options", {
  id: int().autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  status: tinyint().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  questionBankId: int("question_bank_id")
    .default(sql`NULL`)
    .references(() => smQuestionBanks.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smQuestionGroups = mysqlTable("sm_question_groups", {
  id: int().autoincrement().primaryKey().notNull(),
  title: varchar({ length: 200 }).notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smQuestionLevels = mysqlTable("sm_question_levels", {
  id: int().autoincrement().primaryKey().notNull(),
  level: varchar({ length: 200 }).notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smResultStores = mysqlTable("sm_result_stores", {
  id: int().autoincrement().primaryKey().notNull(),
  studentRollNo: int("student_roll_no").default(1).notNull(),
  studentAddmissionNo: int("student_addmission_no").default(1).notNull(),
  isAbsent: int("is_absent").default(0).notNull(),
  totalMarks: double("total_marks", { precision: 8, scale: 2 }).notNull(),
  totalGpaPoint: double("total_gpa_point", { precision: 8, scale: 2 }).default(sql`NULL`),
  totalGpaGrade: varchar("total_gpa_grade", { length: 255 }).default("0"),
  teacherRemarks: text("teacher_remarks").default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  examTypeId: int("exam_type_id")
    .default(sql`NULL`)
    .references(() => smExamTypes.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  activeStatus: int("active_status").default(1),
  examSetupId: int("exam_setup_id")
    .default(sql`NULL`)
    .references(() => smExamSetups.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  studentId: int("student_id")
    .default(sql`NULL`)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  studentRecordId: bigint("student_record_id", { mode: "number" })
    .default(sql`NULL`)
    .references(() => studentRecords.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smRolePermissions = mysqlTable("sm_role_permissions", {
  id: int().autoincrement().primaryKey().notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  moduleLinkId: int("module_link_id")
    .default(sql`NULL`)
    .references(() => smModuleLinks.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  roleId: int("role_id")
    .default(sql`NULL`)
    .references(() => roles.id, { onDelete: "cascade", onUpdate: "cascade" }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smRoomLists = mysqlTable("sm_room_lists", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 255 }).notNull(),
  numberOfBed: int("number_of_bed").notNull(),
  costPerBed: double("cost_per_bed", { precision: 16, scale: 2 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  dormitoryId: int("dormitory_id")
    .default(1)
    .references(() => smDormitoryLists.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  roomTypeId: int("room_type_id")
    .default(1)
    .references(() => smRoomTypes.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smRoomTypes = mysqlTable("sm_room_types", {
  id: int().autoincrement().primaryKey().notNull(),
  type: varchar({ length: 255 }).notNull(),
  description: text().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smRoutes = mysqlTable("sm_routes", {
  id: int().autoincrement().primaryKey().notNull(),
  title: varchar({ length: 200 }).notNull(),
  far: double({ precision: 10, scale: 2 }).notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smSchools = mysqlTable("sm_schools", {
  id: int().autoincrement().primaryKey().notNull(),
  schoolName: varchar("school_name", { length: 200 }).default(sql`NULL`),
  createdBy: tinyint("created_by").default(1).notNull(),
  updatedBy: tinyint("updated_by").default(1).notNull(),
  email: varchar({ length: 200 }).default(sql`NULL`),
  domain: varchar({ length: 191 }).default("school").notNull(),
  address: text().default(sql`NULL`),
  phone: varchar({ length: 20 }).default(sql`NULL`),
  schoolCode: varchar("school_code", { length: 200 }).default(sql`NULL`),
  isEmailVerified: tinyint("is_email_verified").default(0).notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  startingDate: date("starting_date", { mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  endingDate: date("ending_date", { mode: "string" }).default(sql`NULL`),
  packageId: int("package_id").default(sql`NULL`),
  planType: varchar("plan_type", { length: 200 }).default(sql`NULL`),
  region: int().default(sql`NULL`),
  contactType: mysqlEnum("contact_type", ["yearly", "monthly", "once"]).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  isEnabled: varchar("is_enabled", { length: 20 }).default("yes").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smSeatPlans = mysqlTable("sm_seat_plans", {
  id: int().autoincrement().primaryKey().notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  examId: int("exam_id")
    .default(sql`NULL`)
    .references(() => smExams.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smSeatPlanChildren = mysqlTable("sm_seat_plan_children", {
  id: int().autoincrement().primaryKey().notNull(),
  roomId: tinyint("room_id").default(sql`NULL`),
  assignStudents: int("assign_students").default(sql`NULL`),
  startTime: time("start_time").default(sql`NULL`),
  endTime: time("end_time").default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  seatPlanId: int("seat_plan_id")
    .default(sql`NULL`)
    .references(() => smSeatPlans.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smSections = mysqlTable("sm_sections", {
  id: int().autoincrement().primaryKey().notNull(),
  parentId: int("parent_id").default(sql`NULL`),
  sectionName: varchar("section_name", { length: 200 }).notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  unAcademicId: int("un_academic_id").default(sql`NULL`),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smSendMessages = mysqlTable("sm_send_messages", {
  id: int().autoincrement().primaryKey().notNull(),
  messageTitle: varchar("message_title", { length: 200 }).default(sql`NULL`),
  messageDes: varchar("message_des", { length: 500 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  noticeDate: date("notice_date", { mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  publishOn: date("publish_on", { mode: "string" }).default(sql`NULL`),
  messageTo: varchar("message_to", { length: 200 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smSessions = mysqlTable("sm_sessions", {
  id: int().autoincrement().primaryKey().notNull(),
  session: varchar({ length: 255 }).notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smSetupAdmins = mysqlTable("sm_setup_admins", {
  id: int().autoincrement().primaryKey().notNull(),
  type: tinyint().default(sql`NULL`),
  name: varchar({ length: 191 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smSmsGateways = mysqlTable("sm_sms_gateways", {
  id: int().autoincrement().primaryKey().notNull(),
  gatewayName: varchar("gateway_name", { length: 255 }).default(sql`NULL`),
  type: varchar({ length: 5 }).default("com"),
  clickatellUsername: varchar("clickatell_username", { length: 255 }).default(sql`NULL`),
  clickatellPassword: varchar("clickatell_password", { length: 255 }).default(sql`NULL`),
  clickatellApiId: varchar("clickatell_api_id", { length: 255 }).default(sql`NULL`),
  twilioAccountSid: varchar("twilio_account_sid", { length: 255 }).default(sql`NULL`),
  twilioAuthenticationToken: varchar("twilio_authentication_token", {
    length: 255,
  }).default(sql`NULL`),
  twilioRegisteredNo: varchar("twilio_registered_no", { length: 255 }).default(sql`NULL`),
  msg91AuthenticationKeySid: varchar("msg91_authentication_key_sid", {
    length: 255,
  }).default(sql`NULL`),
  msg91SenderId: varchar("msg91_sender_id", { length: 255 }).default(sql`NULL`),
  msg91Route: varchar("msg91_route", { length: 255 }).default(sql`NULL`),
  msg91CountryCode: varchar("msg91_country_code", { length: 255 }).default(sql`NULL`),
  textlocalUsername: varchar("textlocal_username", { length: 255 }).default(sql`NULL`),
  textlocalHash: varchar("textlocal_hash", { length: 255 }).default(sql`NULL`),
  textlocalSender: varchar("textlocal_sender", { length: 255 }).default(sql`NULL`),
  deviceInfo: text("device_info").default(sql`NULL`),
  africatalkingUsername: varchar("africatalking_username", {
    length: 255,
  }).default(sql`NULL`),
  africatalkingApiKey: varchar("africatalking_api_key", {
    length: 255,
  }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  gatewayType: varchar("gateway_type", { length: 191 }).default(sql`NULL`),
});

export const smSocialMediaIcons = mysqlTable("sm_social_media_icons", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  url: varchar({ length: 191 }).default(sql`NULL`),
  icon: varchar({ length: 191 }).default(sql`NULL`),
  status: tinyint().default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smStaffs = mysqlTable("sm_staffs", {
  id: int().autoincrement().primaryKey().notNull(),
  staffNo: int("staff_no").default(sql`NULL`),
  firstName: varchar("first_name", { length: 100 }).default(sql`NULL`),
  lastName: varchar("last_name", { length: 100 }).default(sql`NULL`),
  fullName: varchar("full_name", { length: 200 }).default(sql`NULL`),
  fathersName: varchar("fathers_name", { length: 100 }).default(sql`NULL`),
  mothersName: varchar("mothers_name", { length: 100 }).default(sql`NULL`),
  dateOfBirth: date("date_of_birth", { mode: "date" }).default(sql`'2024-11-04'`),
  dateOfJoining: date("date_of_joining", { mode: "date" }).default(sql`'2024-11-04'`),
  email: varchar({ length: 50 }).default(sql`NULL`),
  mobile: varchar({ length: 50 }).default(sql`NULL`),
  emergencyMobile: varchar("emergency_mobile", { length: 50 }).default(sql`NULL`),
  maritalStatus: varchar("marital_status", { length: 30 }).default(sql`NULL`),
  meritalStatus: varchar("merital_status", { length: 30 }).default(sql`NULL`),
  staffPhoto: varchar("staff_photo", { length: 191 }).default(sql`NULL`),
  currentAddress: varchar("current_address", { length: 500 }).default(sql`NULL`),
  permanentAddress: varchar("permanent_address", { length: 500 }).default(sql`NULL`),
  qualification: varchar({ length: 200 }).default(sql`NULL`),
  experience: varchar({ length: 200 }).default(sql`NULL`),
  epfNo: varchar("epf_no", { length: 20 }).default(sql`NULL`),
  basicSalary: varchar("basic_salary", { length: 200 }).default(sql`NULL`),
  contractType: varchar("contract_type", { length: 200 }).default(sql`NULL`),
  location: varchar({ length: 50 }).default(sql`NULL`),
  casualLeave: varchar("casual_leave", { length: 15 }).default(sql`NULL`),
  medicalLeave: varchar("medical_leave", { length: 15 }).default(sql`NULL`),
  metarnityLeave: varchar("metarnity_leave", { length: 15 }).default(sql`NULL`),
  bankAccountName: varchar("bank_account_name", { length: 50 }).default(sql`NULL`),
  bankAccountNo: varchar("bank_account_no", { length: 50 }).default(sql`NULL`),
  bankName: varchar("bank_name", { length: 20 }).default(sql`NULL`),
  bankBrach: varchar("bank_brach", { length: 30 }).default(sql`NULL`),
  facebookUrl: varchar("facebook_url", { length: 100 }).default(sql`NULL`),
  twiteerUrl: varchar("twiteer_url", { length: 100 }).default(sql`NULL`),
  linkedinUrl: varchar("linkedin_url", { length: 100 }).default(sql`NULL`),
  instragramUrl: varchar("instragram_url", { length: 100 }).default(sql`NULL`),
  joiningLetter: varchar("joining_letter", { length: 500 }).default(sql`NULL`),
  resume: varchar({ length: 500 }).default(sql`NULL`),
  otherDocument: varchar("other_document", { length: 500 }).default(sql`NULL`),
  notes: varchar({ length: 500 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  showPublic: tinyint("show_public").default(0).notNull(),
  drivingLicense: varchar("driving_license", { length: 255 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  drivingLicenseExDate: date("driving_license_ex_date", {
    mode: "string",
  }).default(sql`NULL`),
  customField: text("custom_field").default(sql`NULL`),
  customFieldFormName: varchar("custom_field_form_name", {
    length: 191,
  }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  designationId: int("designation_id")
    .default(1)
    .references(() => smDesignations.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  departmentId: int("department_id")
    .default(1)
    .references(() => smHumanDepartments.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  userId: int("user_id")
    .default(1)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  parentId: int("parent_id").default(sql`NULL`),
  roleId: int("role_id")
    .default(1)
    .references(() => infixRoles.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  previousRoleId: int("previous_role_id").default(sql`NULL`),
  genderId: int("gender_id")
    .default(1)
    .references(() => smBaseSetups.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  isSaas: int("is_saas").default(0),
});

export const smStaffAttendanceImports = mysqlTable(
  "sm_staff_attendance_imports",
  {
    id: int().autoincrement().primaryKey().notNull(),
    // you can use { mode: 'date' }, if you want to have Date as type for this column
    attendenceDate: date("attendence_date", { mode: "string" }).default(sql`NULL`),
    inTime: varchar("in_time", { length: 50 }).default(sql`NULL`),
    outTime: varchar("out_time", { length: 50 }).default(sql`NULL`),
    attendanceType: varchar("attendance_type", { length: 10 }).default(sql`NULL`),
    notes: varchar({ length: 500 }).default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    staffId: int("staff_id").default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
    academicId: int("academic_id").default(1),
  },
  (table) => ({
    staffFk: foreignKey({
      name: "ssai_staff_id_fk",
      columns: [table.staffId],
      foreignColumns: [smStaffs.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "ssai_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "ssai_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const smStaffAttendences = mysqlTable("sm_staff_attendences", {
  id: int().autoincrement().primaryKey().notNull(),
  attendenceType: varchar("attendence_type", { length: 10 }).default(sql`NULL`),
  notes: varchar({ length: 500 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  attendenceDate: date("attendence_date", { mode: "string" }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  staffId: int("staff_id")
    .default(sql`NULL`)
    .references(() => smStaffs.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smStaffRegistrationFields = mysqlTable("sm_staff_registration_fields", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  fieldName: varchar("field_name", { length: 191 }).default(sql`NULL`),
  labelName: varchar("label_name", { length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1),
  isRequired: tinyint("is_required").default(0),
  staffEdit: tinyint("staff_edit").default(0),
  requiredType: tinyint("required_type").default(sql`NULL`),
  position: int().default(sql`NULL`),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smStudents = mysqlTable("sm_students", {
  id: int().autoincrement().primaryKey().notNull(),
  admissionNo: int("admission_no").default(sql`NULL`),
  rollNo: int("roll_no").default(sql`NULL`),
  firstName: varchar("first_name", { length: 200 }).default(sql`NULL`),
  lastName: varchar("last_name", { length: 200 }).default(sql`NULL`),
  fullName: varchar("full_name", { length: 200 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  dateOfBirth: date("date_of_birth", { mode: "string" }).default(sql`NULL`),
  caste: varchar({ length: 200 }).default(sql`NULL`),
  email: varchar({ length: 200 }).default(sql`NULL`),
  mobile: varchar({ length: 200 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  admissionDate: date("admission_date", { mode: "string" }).default(sql`NULL`),
  studentPhoto: varchar("student_photo", { length: 191 }).default(sql`NULL`),
  age: varchar({ length: 200 }).default(sql`NULL`),
  height: varchar({ length: 200 }).default(sql`NULL`),
  weight: varchar({ length: 200 }).default(sql`NULL`),
  currentAddress: varchar("current_address", { length: 500 }).default(sql`NULL`),
  permanentAddress: varchar("permanent_address", { length: 500 }).default(sql`NULL`),
  driverId: varchar("driver_id", { length: 200 }).default(sql`NULL`),
  nationalIdNo: varchar("national_id_no", { length: 200 }).default(sql`NULL`),
  localIdNo: varchar("local_id_no", { length: 200 }).default(sql`NULL`),
  bankAccountNo: varchar("bank_account_no", { length: 200 }).default(sql`NULL`),
  bankName: varchar("bank_name", { length: 200 }).default(sql`NULL`),
  previousSchoolDetails: varchar("previous_school_details", {
    length: 500,
  }).default(sql`NULL`),
  aditionalNotes: text("aditional_notes").default(sql`NULL`),
  ifscCode: varchar("ifsc_code", { length: 50 }).default(sql`NULL`),
  documentTitle1: varchar("document_title_1", { length: 200 }).default(sql`NULL`),
  documentFile1: varchar("document_file_1", { length: 200 }).default(sql`NULL`),
  documentTitle2: varchar("document_title_2", { length: 200 }).default(sql`NULL`),
  documentFile2: varchar("document_file_2", { length: 200 }).default(sql`NULL`),
  documentTitle3: varchar("document_title_3", { length: 200 }).default(sql`NULL`),
  documentFile3: varchar("document_file_3", { length: 200 }).default(sql`NULL`),
  documentTitle4: varchar("document_title_4", { length: 200 }).default(sql`NULL`),
  documentFile4: varchar("document_file_4", { length: 200 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  customField: text("custom_field").default(sql`NULL`),
  customFieldFormName: varchar("custom_field_form_name", {
    length: 191,
  }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  bloodgroupId: int("bloodgroup_id")
    .default(sql`NULL`)
    .references(() => smBaseSetups.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  religionId: int("religion_id")
    .default(sql`NULL`)
    .references(() => smBaseSetups.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  routeListId: int("route_list_id")
    .default(sql`NULL`)
    .references(() => smRoutes.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  dormitoryId: int("dormitory_id")
    .default(sql`NULL`)
    .references(() => smDormitoryLists.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  vechileId: int("vechile_id")
    .default(sql`NULL`)
    .references(() => smVehicles.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  roomId: int("room_id")
    .default(sql`NULL`)
    .references(() => smRoomLists.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  studentCategoryId: int("student_category_id")
    .default(sql`NULL`)
    .references(() => smStudentCategories.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  studentGroupId: int("student_group_id")
    .default(sql`NULL`)
    .references(() => smStudentGroups.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  sessionId: int("session_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  parentId: int("parent_id")
    .default(sql`NULL`)
    .references(() => smParents.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  userId: int("user_id")
    .default(sql`NULL`)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  roleId: int("role_id")
    .default(sql`NULL`)
    .references(() => infixRoles.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  genderId: int("gender_id")
    .default(sql`NULL`)
    .references(() => smBaseSetups.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  schoolId: int("school_id")
    .default(1)
    .notNull()
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smStudentAttendances = mysqlTable("sm_student_attendances", {
  id: int().autoincrement().primaryKey().notNull(),
  attendanceType: varchar("attendance_type", { length: 10 }).default(sql`NULL`),
  notes: varchar({ length: 500 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  attendanceDate: date("attendance_date", { mode: "string" }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  studentId: int("student_id")
    .default(sql`NULL`)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  recordId: int("record_id").default(sql`NULL`),
  studentRecordId: bigint("student_record_id", { mode: "number" }).default(sql`NULL`),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  activeStatus: int("active_status").default(1),
});

export const smStudentAttendanceImports = mysqlTable(
  "sm_student_attendance_imports",
  {
    id: int().autoincrement().primaryKey().notNull(),
    // you can use { mode: 'date' }, if you want to have Date as type for this column
    attendanceDate: date("attendance_date", { mode: "string" }).default(sql`NULL`),
    inTime: varchar("in_time", { length: 50 }).default(sql`NULL`),
    outTime: varchar("out_time", { length: 50 }).default(sql`NULL`),
    attendanceType: varchar("attendance_type", { length: 10 }).default(sql`NULL`),
    notes: varchar({ length: 500 }).default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    studentId: int("student_id").default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
    academicId: int("academic_id").default(1),
  },
  (table) => ({
    studentFk: foreignKey({
      name: "ssai_student_id_fk",
      columns: [table.studentId],
      foreignColumns: [smStudents.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "ssai_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "ssai_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const smStudentCategories = mysqlTable("sm_student_categories", {
  id: int().autoincrement().primaryKey().notNull(),
  categoryName: varchar("category_name", { length: 255 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smStudentCertificates = mysqlTable("sm_student_certificates", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 191 }).default(sql`NULL`),
  headerLeftText: varchar("header_left_text", { length: 191 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  date: date({ mode: "string" }).default(sql`NULL`),
  body: text().default(sql`NULL`),
  bodyTwo: text("body_two").default(sql`NULL`),
  certificateNo: text("certificate_no").default(sql`NULL`),
  type: varchar({ length: 191 }).default("school"),
  footerLeftText: varchar("footer_left_text", { length: 191 }).default(sql`NULL`),
  footerCenterText: varchar("footer_center_text", { length: 191 }).default(sql`NULL`),
  footerRightText: varchar("footer_right_text", { length: 191 }).default(sql`NULL`),
  studentPhoto: tinyint("student_photo").default(1).notNull(),
  file: varchar({ length: 191 }).default(sql`NULL`),
  layout: int().default(sql`NULL`),
  bodyFontFamily: varchar("body_font_family", { length: 191 }).default("'Arial'"),
  bodyFontSize: varchar("body_font_size", { length: 191 }).default("2em"),
  height: varchar({ length: 50 }).default(sql`NULL`),
  width: varchar({ length: 50 }).default(sql`NULL`),
  defaultFor: varchar("default_for", { length: 50 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smStudentDocuments = mysqlTable("sm_student_documents", {
  id: int().autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  studentStaffId: int("student_staff_id").default(sql`NULL`),
  type: varchar({ length: 191 }).default(sql`NULL`),
  file: varchar({ length: 191 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smStudentExcelFormats = mysqlTable("sm_student_excel_formats", {
  rollNo: varchar("roll_no", { length: 191 }).default(sql`NULL`),
  firstName: varchar("first_name", { length: 191 }).default(sql`NULL`),
  lastName: varchar("last_name", { length: 191 }).default(sql`NULL`),
  dateOfBirth: varchar("date_of_birth", { length: 191 }).default(sql`NULL`),
  religion: varchar({ length: 191 }).default(sql`NULL`),
  caste: varchar({ length: 191 }).default(sql`NULL`),
  mobile: varchar({ length: 191 }).default(sql`NULL`),
  email: varchar({ length: 191 }).default(sql`NULL`),
  admissionDate: varchar("admission_date", { length: 191 }).default(sql`NULL`),
  category: varchar({ length: 191 }).default(sql`NULL`),
  bloodGroup: varchar("blood_group", { length: 191 }).default(sql`NULL`),
  height: varchar({ length: 191 }).default(sql`NULL`),
  weight: varchar({ length: 191 }).default(sql`NULL`),
  siblingsId: varchar("siblings_id", { length: 191 }).default(sql`NULL`),
  fatherName: varchar("father_name", { length: 191 }).default(sql`NULL`),
  fatherPhone: varchar("father_phone", { length: 191 }).default(sql`NULL`),
  fatherOccupation: varchar("father_occupation", { length: 191 }).default(sql`NULL`),
  motherName: varchar("mother_name", { length: 191 }).default(sql`NULL`),
  motherPhone: varchar("mother_phone", { length: 191 }).default(sql`NULL`),
  motherOccupation: varchar("mother_occupation", { length: 191 }).default(sql`NULL`),
  guardianName: varchar("guardian_name", { length: 191 }).default(sql`NULL`),
  guardianRelation: varchar("guardian_relation", { length: 191 }).default(sql`NULL`),
  guardianEmail: varchar("guardian_email", { length: 191 }).default(sql`NULL`),
  guardianPhone: varchar("guardian_phone", { length: 191 }).default(sql`NULL`),
  guardianOccupation: varchar("guardian_occupation", { length: 191 }).default(sql`NULL`),
  guardianAddress: varchar("guardian_address", { length: 191 }).default(sql`NULL`),
  currentAddress: varchar("current_address", { length: 191 }).default(sql`NULL`),
  permanentAddress: varchar("permanent_address", { length: 191 }).default(sql`NULL`),
  bankAccountNo: varchar("bank_account_no", { length: 191 }).default(sql`NULL`),
  bankName: varchar("bank_name", { length: 191 }).default(sql`NULL`),
  nationalIdentificationNo: varchar("national_identification_no", {
    length: 191,
  }).default(sql`NULL`),
  localIdentificationNo: varchar("local_identification_no", {
    length: 191,
  }).default(sql`NULL`),
  previousSchoolDetails: varchar("previous_school_details", {
    length: 191,
  }).default(sql`NULL`),
  note: varchar({ length: 191 }).default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smStudentGroups = mysqlTable("sm_student_groups", {
  id: int().autoincrement().primaryKey().notNull(),
  group: varchar({ length: 200 }).notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smStudentHomeworks = mysqlTable("sm_student_homeworks", {
  id: int().autoincrement().primaryKey().notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  homeworkDate: date("homework_date", { mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  submissionDate: date("submission_date", { mode: "string" }).default(sql`NULL`),
  description: varchar({ length: 500 }).default(sql`NULL`),
  percentage: varchar({ length: 200 }).default(sql`NULL`),
  status: varchar({ length: 200 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  evaluatedBy: int("evaluated_by")
    .default(sql`NULL`)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  studentId: int("student_id")
    .default(sql`NULL`)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smStudentIdCards = mysqlTable("sm_student_id_cards", {
  id: int().autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  logo: varchar({ length: 191 }).default(sql`NULL`),
  signature: varchar({ length: 191 }).default(sql`NULL`),
  backgroundImg: varchar("background_img", { length: 191 }).default(sql`NULL`),
  profileImage: varchar("profile_image", { length: 191 }).default(sql`NULL`),
  roleId: text("role_id").default(sql`NULL`),
  pageLayoutStyle: varchar("page_layout_style", { length: 191 }).default(sql`NULL`),
  userPhotoStyle: varchar("user_photo_style", { length: 191 }).default(sql`NULL`),
  userPhotoWidth: varchar("user_photo_width", { length: 191 }).default(sql`NULL`),
  userPhotoHeight: varchar("user_photo_height", { length: 191 }).default(sql`NULL`),
  plWidth: int("pl_width").default(sql`NULL`),
  plHeight: int("pl_height").default(sql`NULL`),
  tSpace: int("t_space").default(sql`NULL`),
  bSpace: int("b_space").default(sql`NULL`),
  rSpace: int("r_space").default(sql`NULL`),
  lSpace: int("l_space").default(sql`NULL`),
  admissionNo: varchar("admission_no", { length: 191 }).default("0").notNull(),
  studentName: varchar("student_name", { length: 191 }).default("0").notNull(),
  class: varchar({ length: 191 }).default("0").notNull(),
  fatherName: varchar("father_name", { length: 191 }).default("0").notNull(),
  motherName: varchar("mother_name", { length: 191 }).default("0").notNull(),
  studentAddress: varchar("student_address", { length: 191 }).default("0").notNull(),
  phoneNumber: varchar("phone_number", { length: 191 }).default("0").notNull(),
  dob: varchar({ length: 191 }).default("0").notNull(),
  blood: varchar({ length: 191 }).default("0").notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smStudentPromotions = mysqlTable("sm_student_promotions", {
  id: int().autoincrement().primaryKey().notNull(),
  resultStatus: varchar("result_status", { length: 10 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  previousClassId: int("previous_class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  currentClassId: int("current_class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  previousSectionId: int("previous_section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  currentSectionId: int("current_section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  previousSessionId: int("previous_session_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  currentSessionId: int("current_session_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  studentId: int("student_id")
    .default(sql`NULL`)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  admissionNumber: int("admission_number").default(sql`NULL`),
  studentInfo: longtext("student_info").default(sql`NULL`),
  meritStudentInfo: longtext("merit_student_info").default(sql`NULL`),
  previousRollNumber: int("previous_roll_number").default(sql`NULL`),
  currentRollNumber: int("current_roll_number").default(sql`NULL`),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smStudentRegistrationFields = mysqlTable("sm_student_registration_fields", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  fieldName: varchar("field_name", { length: 191 }).default(sql`NULL`),
  labelName: varchar("label_name", { length: 191 }).default(sql`NULL`),
  isShow: tinyint("is_show").default(1),
  activeStatus: tinyint("active_status").default(1),
  isRequired: tinyint("is_required").default(0),
  studentEdit: tinyint("student_edit").default(0),
  parentEdit: tinyint("parent_edit").default(0),
  staffEdit: tinyint("staff_edit").default(0),
  type: tinyint().default(sql`NULL`),
  isSystemRequired: tinyint("is_system_required").default(0),
  requiredType: tinyint("required_type").default(sql`NULL`),
  position: int().default(sql`NULL`),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  adminSection: varchar("admin_section", { length: 191 }).default(sql`NULL`),
});

export const smStudentTakeOnlineExams = mysqlTable(
  "sm_student_take_online_exams",
  {
    id: int().autoincrement().primaryKey().notNull(),
    status: tinyint().default(0).notNull(),
    studentDone: tinyint("student_done").default(0).notNull(),
    totalMarks: int("total_marks").default(sql`NULL`),
    activeStatus: tinyint("active_status").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    recordId: int("record_id").default(sql`NULL`),
    studentId: int("student_id").default(sql`NULL`),
    onlineExamId: int("online_exam_id").default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
    academicId: int("academic_id").default(1),
  },
  (table) => ({
    studentFk: foreignKey({
      name: "sstoe_student_id_fk",
      columns: [table.studentId],
      foreignColumns: [smStudents.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    onlineExamFk: foreignKey({
      name: "sstoe_online_exam_id_fk",
      columns: [table.onlineExamId],
      foreignColumns: [smOnlineExams.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "sstoe_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "sstoe_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const smStudentTakeOnlineExamQuestions = mysqlTable(
  "sm_student_take_online_exam_questions",
  {
    id: int().autoincrement().primaryKey().notNull(),
    trueFalse: varchar({ length: 1 }).default(sql`NULL`),
    suitableWords: text("suitable_words").default(sql`NULL`),
    activeStatus: tinyint("active_status").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    takeOnlineExamId: int("take_online_exam_id").default(sql`NULL`),
    questionBankId: int("question_bank_id").default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
    academicId: int("academic_id").default(1),
  },
  (table) => ({
    takeOnlineExamFk: foreignKey({
      name: "sstoeq_take_online_exam_id_fk",
      columns: [table.takeOnlineExamId],
      foreignColumns: [smStudentTakeOnlineExams.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    questionBankFk: foreignKey({
      name: "sstoeq_question_bank_id_fk",
      columns: [table.questionBankId],
      foreignColumns: [smQuestionBanks.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "sstoeq_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "sstoeq_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const smStudentTakeOnlnExQuesOptions = mysqlTable(
  "sm_student_take_onln_ex_ques_options",
  {
    id: int().autoincrement().primaryKey().notNull(),
    title: varchar({ length: 191 }).default(sql`NULL`),
    status: tinyint().default(sql`NULL`),
    activeStatus: tinyint("active_status").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    takeOnlineExamQuestionId: int("take_online_exam_question_id").default(sql`NULL`),
    createdBy: int("created_by").default(1),
    updatedBy: int("updated_by").default(1),
    schoolId: int("school_id").default(1),
    academicId: int("academic_id").default(1),
  },
  (table) => ({
    takeOnlineExamQuestionFk: foreignKey({
      name: "sstoeqo_take_oe_q_id_fk",
      columns: [table.takeOnlineExamQuestionId],
      foreignColumns: [smStudentTakeOnlineExamQuestions.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    schoolFk: foreignKey({
      name: "sstoeqo_school_id_fk",
      columns: [table.schoolId],
      foreignColumns: [smSchools.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
    academicFk: foreignKey({
      name: "sstoeqo_academic_id_fk",
      columns: [table.academicId],
      foreignColumns: [smAcademicYears.id],
    })
      .onDelete("cascade")
      .onUpdate("restrict"),
  })
);

export const smStudentTimelines = mysqlTable("sm_student_timelines", {
  id: int().autoincrement().primaryKey().notNull(),
  staffStudentId: int("staff_student_id").notNull(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  date: date({ mode: "string" }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  file: varchar({ length: 191 }).default(sql`NULL`),
  type: varchar({ length: 191 }).default(sql`NULL`),
  visibleToStudent: int("visible_to_student").default(0).notNull(),
  activeStatus: int("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smStyles = mysqlTable("sm_styles", {
  id: int().autoincrement().primaryKey().notNull(),
  styleName: varchar("style_name", { length: 255 }).default(sql`NULL`),
  pathMainStyle: varchar("path_main_style", { length: 255 }).default(sql`NULL`),
  pathInfixStyle: varchar("path_infix_style", { length: 255 }).default(sql`NULL`),
  primaryColor: varchar("primary_color", { length: 255 }).default(sql`NULL`),
  primaryColor2: varchar("primary_color2", { length: 255 }).default(sql`NULL`),
  titleColor: varchar("title_color", { length: 255 }).default(sql`NULL`),
  textColor: varchar("text_color", { length: 255 }).default(sql`NULL`),
  white: varchar({ length: 255 }).default(sql`NULL`),
  black: varchar({ length: 255 }).default(sql`NULL`),
  sidebarBg: varchar("sidebar_bg", { length: 255 }).default(sql`NULL`),
  barchart1: varchar({ length: 255 }).default(sql`NULL`),
  barchart2: varchar({ length: 255 }).default(sql`NULL`),
  barcharttextcolor: varchar({ length: 255 }).default(sql`NULL`),
  barcharttextfamily: varchar({ length: 255 }).default(sql`NULL`),
  areachartlinecolor1: varchar({ length: 255 }).default(sql`NULL`),
  areachartlinecolor2: varchar({ length: 255 }).default(sql`NULL`),
  dashboardbackground: varchar({ length: 255 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  isActive: tinyint("is_active").default(0).notNull(),
  isDefault: tinyint("is_default").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smSubjects = mysqlTable("sm_subjects", {
  id: int().autoincrement().primaryKey().notNull(),
  subjectName: varchar("subject_name", { length: 255 }).notNull(),
  subjectCode: varchar("subject_code", { length: 255 }).default(sql`NULL`),
  passMark: double("pass_mark", { precision: 8, scale: 2 }).default(sql`NULL`),
  subjectType: mysqlEnum("subject_type", ["T", "P"]).notNull(),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  parentId: int("parent_id").default(sql`NULL`),
});

export const smSubjectAttendances = mysqlTable("sm_subject_attendances", {
  id: int().autoincrement().primaryKey().notNull(),
  attendanceType: varchar("attendance_type", { length: 10 }).default(sql`NULL`),
  notes: varchar({ length: 500 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  attendanceDate: date("attendance_date", { mode: "string" }).default(sql`NULL`),
  notify: tinyint().default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  subjectId: int("subject_id")
    .default(sql`NULL`)
    .references(() => smSubjects.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  studentId: int("student_id")
    .default(sql`NULL`)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  studentRecordId: bigint("student_record_id", { mode: "number" })
    .default(sql`NULL`)
    .references(() => studentRecords.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  activeStatus: int("active_status").default(1),
});

export const smSuppliers = mysqlTable("sm_suppliers", {
  id: int().autoincrement().primaryKey().notNull(),
  companyName: varchar("company_name", { length: 100 }).default(sql`NULL`),
  companyAddress: varchar("company_address", { length: 500 }).default(sql`NULL`),
  contactPersonName: varchar("contact_person_name", { length: 191 }).default(sql`NULL`),
  contactPersonMobile: varchar("contact_person_mobile", {
    length: 191,
  }).default(sql`NULL`),
  contactPersonEmail: varchar("contact_person_email", { length: 100 }).default(sql`NULL`),
  cotactPersonAddress: varchar("cotact_person_address", {
    length: 500,
  }).default(sql`NULL`),
  description: varchar({ length: 500 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id").default(1),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smSystemVersions = mysqlTable("sm_system_versions", {
  id: int().autoincrement().primaryKey().notNull(),
  versionName: varchar("version_name", { length: 255 }).notNull(),
  title: varchar({ length: 255 }).notNull(),
  features: varchar({ length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smTeacherUploadContents = mysqlTable("sm_teacher_upload_contents", {
  id: int().autoincrement().primaryKey().notNull(),
  contentTitle: varchar("content_title", { length: 200 }).default(sql`NULL`),
  contentType: varchar("content_type", { length: 191 }).default(sql`NULL`),
  availableForAdmin: int("available_for_admin").default(0),
  availableForAllClasses: int("available_for_all_classes").default(0).notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  uploadDate: date("upload_date", { mode: "string" }).default(sql`NULL`),
  description: varchar({ length: 500 }).default(sql`NULL`),
  sourceUrl: varchar("source_url", { length: 191 }).default(sql`NULL`),
  uploadFile: varchar("upload_file", { length: 200 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  courseId: int("course_id").default(sql`NULL`),
  parentCourseId: int("parent_course_id").default(sql`NULL`),
  class: int()
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  section: int().default(sql`NULL`),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  chapterId: bigint("chapter_id", { mode: "number" }).default(sql`NULL`),
  lessonId: bigint("lesson_id", { mode: "number" }).default(sql`NULL`),
  parentId: int("parent_id").default(sql`NULL`),
});

export const smTemporaryMeritlists = mysqlTable("sm_temporary_meritlists", {
  id: int().autoincrement().primaryKey().notNull(),
  iid: varchar({ length: 250 }).default(sql`NULL`),
  studentId: varchar("student_id", { length: 250 }).default(sql`NULL`),
  meritOrder: double("merit_order", { precision: 8, scale: 2 }).default(sql`NULL`),
  studentName: varchar("student_name", { length: 250 }).default(sql`NULL`),
  admissionNo: varchar("admission_no", { length: 250 }).default(sql`NULL`),
  subjectsIdString: varchar("subjects_id_string", { length: 250 }).default(sql`NULL`),
  subjectsString: varchar("subjects_string", { length: 250 }).default(sql`NULL`),
  marksString: varchar("marks_string", { length: 250 }).default(sql`NULL`),
  totalMarks: double("total_marks", { precision: 8, scale: 2 }).default(sql`NULL`),
  averageMark: double("average_mark", { precision: 20, scale: 2 }).default(sql`NULL`),
  gpaPoint: double("gpa_point", { precision: 20, scale: 2 }).default(sql`NULL`),
  result: varchar({ length: 250 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  examId: int("exam_id")
    .default(sql`NULL`)
    .references(() => smExams.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  rollNo: int("roll_no").default(sql`NULL`),
});

export const smTestimonials = mysqlTable("sm_testimonials", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 191 }).notNull(),
  designation: varchar({ length: 191 }).notNull(),
  institutionName: varchar("institution_name", { length: 191 }).notNull(),
  image: varchar({ length: 191 }).notNull(),
  description: text().notNull(),
  starRating: int("star_rating").default(5).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smTimeZones = mysqlTable("sm_time_zones", {
  id: int().autoincrement().primaryKey().notNull(),
  code: varchar({ length: 191 }).default(sql`NULL`),
  timeZone: varchar("time_zone", { length: 191 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smToDos = mysqlTable("sm_to_dos", {
  id: int().autoincrement().primaryKey().notNull(),
  todoTitle: varchar("todo_title", { length: 191 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  date: date({ mode: "string" }).default(sql`NULL`),
  completeStatus: varchar("complete_status", { length: 191 }).default("P"),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smUploadContents = mysqlTable("sm_upload_contents", {
  id: int().autoincrement().primaryKey().notNull(),
  contentTitle: varchar("content_title", { length: 200 }).default(sql`NULL`),
  contentType: int("content_type").default(sql`NULL`),
  availableForRole: int("available_for_role").default(sql`NULL`),
  availableForClass: int("available_for_class").default(sql`NULL`),
  availableForSection: int("available_for_section").default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  uploadDate: date("upload_date", { mode: "string" }).default(sql`NULL`),
  description: varchar({ length: 500 }).default(sql`NULL`),
  uploadFile: varchar("upload_file", { length: 200 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smUploadHomeworkContents = mysqlTable("sm_upload_homework_contents", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  studentId: int("student_id")
    .default(1)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  homeworkId: int("homework_id")
    .default(1)
    .references(() => smHomeworks.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  description: text().default(sql`NULL`),
  file: text().default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smUserLogs = mysqlTable("sm_user_logs", {
  id: int().autoincrement().primaryKey().notNull(),
  ipAddress: varchar("ip_address", { length: 191 }).default(sql`NULL`),
  userAgent: varchar("user_agent", { length: 191 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  userId: int("user_id")
    .default(sql`NULL`)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  roleId: int("role_id")
    .default(sql`NULL`)
    .references(() => infixRoles.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smVehicles = mysqlTable("sm_vehicles", {
  id: int().autoincrement().primaryKey().notNull(),
  vehicleNo: varchar("vehicle_no", { length: 255 }).notNull(),
  vehicleModel: varchar("vehicle_model", { length: 255 }).notNull(),
  madeYear: int("made_year").default(sql`NULL`),
  note: text().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  driverId: int("driver_id").default(sql`NULL`),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smVideoGalleries = mysqlTable("sm_video_galleries", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  name: varchar({ length: 191 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  videoLink: text("video_link").default(sql`NULL`),
  isPublish: tinyint("is_publish").default(1).notNull(),
  position: int().default(0).notNull(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const smVisitors = mysqlTable("sm_visitors", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 255 }).notNull(),
  phone: varchar({ length: 255 }).default(sql`NULL`),
  visitorId: varchar("visitor_id", { length: 255 }).default(sql`NULL`),
  noOfPerson: int("no_of_person").default(sql`NULL`),
  purpose: varchar({ length: 255 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  date: date({ mode: "string" }).default(sql`NULL`),
  inTime: varchar("in_time", { length: 255 }).default(sql`NULL`),
  outTime: varchar("out_time", { length: 255 }).default(sql`NULL`),
  file: varchar({ length: 255 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const smWeekends = mysqlTable("sm_weekends", {
  id: int().autoincrement().primaryKey().notNull(),
  name: varchar({ length: 191 }).default(sql`NULL`),
  order: int().default(sql`NULL`),
  isWeekend: int("is_weekend").default(sql`NULL`),
  activeStatus: int("active_status").default(1).notNull(),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: varchar("created_at", { length: 191 }).default(sql`NULL`),
  updatedAt: varchar("updated_at", { length: 191 }).default(sql`NULL`),
  academicId: int("academic_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "set null",
      onUpdate: "restrict",
    }),
});

export const speechSliders = mysqlTable("speech_sliders", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  name: varchar({ length: 191 }).default(sql`NULL`),
  designation: varchar({ length: 191 }).default(sql`NULL`),
  speech: text().default(sql`NULL`),
  image: varchar({ length: 191 }).default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const staffImportBulkTemporaries = mysqlTable("staff_import_bulk_temporaries", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  staffNo: int("staff_no").default(sql`NULL`),
  firstName: varchar("first_name", { length: 100 }).default(sql`NULL`),
  lastName: varchar("last_name", { length: 100 }).default(sql`NULL`),
  fullName: varchar("full_name", { length: 200 }).default(sql`NULL`),
  fathersName: varchar("fathers_name", { length: 100 }).default(sql`NULL`),
  mothersName: varchar("mothers_name", { length: 100 }).default(sql`NULL`),
  dateOfBirth: date("date_of_birth", { mode: "date" }).default(sql`'2024-11-04'`),
  dateOfJoining: date("date_of_joining", { mode: "date" }).default(sql`'2024-11-04'`),
  email: varchar({ length: 50 }).default(sql`NULL`),
  mobile: varchar({ length: 50 }).default(sql`NULL`),
  emergencyMobile: varchar("emergency_mobile", { length: 50 }).default(sql`NULL`),
  maritalStatus: varchar("marital_status", { length: 30 }).default(sql`NULL`),
  staffPhoto: varchar("staff_photo", { length: 191 }).default(sql`NULL`),
  currentAddress: varchar("current_address", { length: 500 }).default(sql`NULL`),
  permanentAddress: varchar("permanent_address", { length: 500 }).default(sql`NULL`),
  qualification: varchar({ length: 200 }).default(sql`NULL`),
  experience: varchar({ length: 200 }).default(sql`NULL`),
  epfNo: varchar("epf_no", { length: 20 }).default(sql`NULL`),
  basicSalary: varchar("basic_salary", { length: 200 }).default(sql`NULL`),
  contractType: varchar("contract_type", { length: 200 }).default(sql`NULL`),
  location: varchar({ length: 50 }).default(sql`NULL`),
  casualLeave: varchar("casual_leave", { length: 15 }).default(sql`NULL`),
  medicalLeave: varchar("medical_leave", { length: 15 }).default(sql`NULL`),
  maternityLeave: varchar("maternity_leave", { length: 15 }).default(sql`NULL`),
  bankAccountName: varchar("bank_account_name", { length: 50 }).default(sql`NULL`),
  bankAccountNo: varchar("bank_account_no", { length: 50 }).default(sql`NULL`),
  bankName: varchar("bank_name", { length: 20 }).default(sql`NULL`),
  bankBrach: varchar("bank_brach", { length: 30 }).default(sql`NULL`),
  facebookUrl: varchar("facebook_url", { length: 100 }).default(sql`NULL`),
  twitterUrl: varchar("twitter_url", { length: 100 }).default(sql`NULL`),
  linkedinUrl: varchar("linkedin_url", { length: 100 }).default(sql`NULL`),
  instagramUrl: varchar("instagram_url", { length: 100 }).default(sql`NULL`),
  joiningLetter: varchar("joining_letter", { length: 500 }).default(sql`NULL`),
  resume: varchar({ length: 500 }).default(sql`NULL`),
  otherDocument: varchar("other_document", { length: 500 }).default(sql`NULL`),
  notes: varchar({ length: 500 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  drivingLicense: varchar("driving_license", { length: 255 }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  drivingLicenseExDate: date("driving_license_ex_date", {
    mode: "string",
  }).default(sql`NULL`),
  role: varchar({ length: 191 }).default(sql`NULL`),
  department: varchar({ length: 191 }).default(sql`NULL`),
  designation: varchar({ length: 191 }).default(sql`NULL`),
  genderId: int("gender_id").default(sql`NULL`),
  userId: int("user_id")
    .default(1)
    .references(() => users.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  parentId: int("parent_id").default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const studentAcademicHistories = mysqlTable("student_academic_histories", {
  id: int().autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).notNull(),
  description: text().default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  occuranceDate: date("occurance_date", { mode: "string" }).notNull(),
  studentId: int("student_id")
    .default(sql`NULL`)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(1)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const studentAttendanceBulks = mysqlTable("student_attendance_bulks", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  attendanceDate: varchar("attendance_date", { length: 191 }).default(sql`NULL`),
  attendanceType: varchar("attendance_type", { length: 191 }).default(sql`NULL`),
  note: varchar({ length: 191 }).default(sql`NULL`),
  studentId: int("student_id").default(sql`NULL`),
  studentRecordId: int("student_record_id").default(sql`NULL`),
  classId: int("class_id").default(sql`NULL`),
  sectionId: int("section_id").default(sql`NULL`),
  schoolId: int("school_id").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const studentBulkTemporaries = mysqlTable("student_bulk_temporaries", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  admissionNumber: varchar("admission_number", { length: 191 }).default(sql`NULL`),
  rollNo: varchar("roll_no", { length: 191 }).default(sql`NULL`),
  firstName: varchar("first_name", { length: 191 }).default(sql`NULL`),
  lastName: varchar("last_name", { length: 191 }).default(sql`NULL`),
  dateOfBirth: varchar("date_of_birth", { length: 191 }).default(sql`NULL`),
  religion: varchar({ length: 191 }).default(sql`NULL`),
  gender: varchar({ length: 191 }).default(sql`NULL`),
  caste: varchar({ length: 191 }).default(sql`NULL`),
  mobile: varchar({ length: 191 }).default(sql`NULL`),
  email: varchar({ length: 191 }).default(sql`NULL`),
  admissionDate: varchar("admission_date", { length: 191 }).default(sql`NULL`),
  bloodGroup: varchar("blood_group", { length: 191 }).default(sql`NULL`),
  height: varchar({ length: 191 }).default(sql`NULL`),
  weight: varchar({ length: 191 }).default(sql`NULL`),
  fatherName: varchar("father_name", { length: 191 }).default(sql`NULL`),
  fatherPhone: varchar("father_phone", { length: 191 }).default(sql`NULL`),
  fatherOccupation: varchar("father_occupation", { length: 191 }).default(sql`NULL`),
  motherName: varchar("mother_name", { length: 191 }).default(sql`NULL`),
  motherPhone: varchar("mother_phone", { length: 191 }).default(sql`NULL`),
  motherOccupation: varchar("mother_occupation", { length: 191 }).default(sql`NULL`),
  guardianName: varchar("guardian_name", { length: 191 }).default(sql`NULL`),
  guardianRelation: varchar("guardian_relation", { length: 191 }).default(sql`NULL`),
  guardianEmail: varchar("guardian_email", { length: 191 }).default(sql`NULL`),
  guardianPhone: varchar("guardian_phone", { length: 191 }).default(sql`NULL`),
  guardianOccupation: varchar("guardian_occupation", { length: 191 }).default(sql`NULL`),
  guardianAddress: varchar("guardian_address", { length: 191 }).default(sql`NULL`),
  currentAddress: varchar("current_address", { length: 191 }).default(sql`NULL`),
  permanentAddress: varchar("permanent_address", { length: 191 }).default(sql`NULL`),
  bankAccountNo: varchar("bank_account_no", { length: 191 }).default(sql`NULL`),
  bankName: varchar("bank_name", { length: 191 }).default(sql`NULL`),
  nationalIdentificationNo: varchar("national_identification_no", {
    length: 191,
  }).default(sql`NULL`),
  localIdentificationNo: varchar("local_identification_no", {
    length: 191,
  }).default(sql`NULL`),
  previousSchoolDetails: varchar("previous_school_details", {
    length: 191,
  }).default(sql`NULL`),
  note: text().default(sql`NULL`),
  userId: varchar("user_id", { length: 191 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const studentRatings = mysqlTable(
  "student_ratings",
  {
    id: int().autoincrement().primaryKey().notNull(),
    rate: int().default(sql`NULL`),
    attribute: varchar({ length: 200 }).default(sql`NULL`),
    color: varchar({ length: 200 }).default(sql`NULL`),
    remark: varchar({ length: 200 }).default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    studentId: int("student_id")
      .default(sql`NULL`)
      .references(() => smStudents.id, {
        onDelete: "set null",
        onUpdate: "restrict",
      }),
    examTypeId: int("exam_type_id")
      .default(sql`NULL`)
      .references(() => smExamTypes.id, {
        onDelete: "set null",
        onUpdate: "restrict",
      }),
    academicId: int("academic_id")
      .default(sql`NULL`)
      .references(() => smAcademicYears.id, {
        onDelete: "set null",
        onUpdate: "restrict",
      }),
  },
  (table) => [
    unique("student_id_exam_type_id_attribute").on(table.studentId, table.examTypeId, table.attribute),
  ]
);

export const studentRecords = mysqlTable("student_records", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  classId: int("class_id")
    .default(sql`NULL`)
    .references(() => smClasses.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  sectionId: int("section_id")
    .default(sql`NULL`)
    .references(() => smSections.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  rollNo: varchar("roll_no", { length: 191 }).default(sql`NULL`),
  isPromote: tinyint("is_promote").default(0),
  isDefault: tinyint("is_default").default(0),
  sessionId: int("session_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  schoolId: int("school_id")
    .default(1)
    .notNull()
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  academicId: int("academic_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  studentId: int("student_id")
    .default(sql`NULL`)
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  activeStatus: int("active_status").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  isGraduate: tinyint("is_graduate").default(0),
});

export const studentRecordTemporaries = mysqlTable("student_record_temporaries", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  smStudentId: int("sm_student_id")
    .notNull()
    .references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  studentRecordId: bigint("student_record_id", { mode: "number" })
    .notNull()
    .references(() => studentRecords.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  userId: int("user_id").default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .notNull()
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  activeStatus: int("active_status").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const teacherEvaluations = mysqlTable("teacher_evaluations", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  rating: text().default(sql`NULL`),
  comment: varchar({ length: 191 }).default(sql`NULL`),
  status: tinyint().default(0),
  recordId: int("record_id").notNull(),
  subjectId: int("subject_id").default(sql`NULL`),
  teacherId: int("teacher_id").default(sql`NULL`),
  studentId: int("student_id").default(sql`NULL`),
  roleId: int("role_id").default(sql`NULL`),
  parentId: int("parent_id").default(sql`NULL`),
  academicId: int("academic_id").default(sql`NULL`),
  schoolId: int("school_id").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const teacherEvaluationSettings = mysqlTable("teacher_evaluation_settings", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  isEnable: tinyint("is_enable").default(0).notNull(),
  submittedBy: varchar("submitted_by", { length: 191 }).default("[]").notNull(),
  ratingSubmissionTime: varchar("rating_submission_time", { length: 191 }).default("any").notNull(),
  autoApproval: tinyint("auto_approval").default(1).notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  fromDate: date("from_date", { mode: "string" }).default(sql`NULL`),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  toDate: date("to_date", { mode: "string" }).default(sql`NULL`),
  schoolId: int("school_id").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const teacherRemarks = mysqlTable(
  "teacher_remarks",
  {
    id: int().autoincrement().primaryKey().notNull(),
    remark: text().default(sql`NULL`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    teacherId: int("teacher_id")
      .default(sql`NULL`)
      .references(() => smStaffs.id, {
        onDelete: "set null",
        onUpdate: "restrict",
      }),
    studentId: int("student_id")
      .default(sql`NULL`)
      .references(() => smStudents.id, {
        onDelete: "set null",
        onUpdate: "restrict",
      }),
    examTypeId: int("exam_type_id")
      .default(sql`NULL`)
      .references(() => smExamTypes.id, {
        onDelete: "set null",
        onUpdate: "restrict",
      }),
    academicId: int("academic_id")
      .default(sql`NULL`)
      .references(() => smAcademicYears.id, {
        onDelete: "set null",
        onUpdate: "restrict",
      }),
  },
  (table) => [unique("tr_student_exam_academic_unq").on(table.studentId, table.examTypeId, table.academicId)]
);

export const themes = mysqlTable("themes", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).default(sql`NULL`),
  pathMainStyle: varchar("path_main_style", { length: 255 }).default(sql`NULL`),
  pathInfixStyle: varchar("path_infix_style", { length: 255 }).default(sql`NULL`),
  replicateTheme: varchar("replicate_theme", { length: 255 }).default(sql`NULL`),
  colorMode: varchar("color_mode", { length: 191 }).default("gradient").notNull(),
  boxShadow: tinyint("box_shadow").default(1),
  backgroundType: varchar("background_type", { length: 191 }).default("image").notNull(),
  backgroundColor: varchar("background_color", { length: 191 }).default(sql`NULL`),
  backgroundImage: varchar("background_image", { length: 191 }).default(sql`NULL`),
  isDefault: tinyint("is_default").default(0).notNull(),
  isSystem: tinyint("is_system").default(0).notNull(),
  createdBy: int("created_by").default(sql`NULL`),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const transcations = mysqlTable("transcations", {
  id: int().notNull(),
  title: text().default(sql`NULL`),
  type: varchar({ length: 20 }).default("debit").notNull(),
  paymentMethod: varchar("payment_method", { length: 20 }).default(sql`NULL`),
  reference: varchar({ length: 20 }).default(sql`NULL`),
  description: text().default(sql`NULL`),
  morphableId: bigint("morphable_id", { mode: "number" }).default(sql`NULL`),
  morphableType: varchar("morphable_type", { length: 191 }).default(sql`NULL`),
  amount: bigint({ mode: "number" }).notNull(),
  // you can use { mode: 'date' }, if you want to have Date as type for this column
  transactionDate: date("transaction_date", { mode: "string" }).default(sql`NULL`),
  userId: int("user_id")
    .default(sql`NULL`)
    .references(() => users.id, { onDelete: "set null", onUpdate: "restrict" }),
  schoolId: int("school_id").default(1).notNull(),
  academicId: int("academic_id").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const twoFactorSettings = mysqlTable("two_factor_settings", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  viaSms: tinyint("via_sms").default(0).notNull(),
  viaEmail: tinyint("via_email").default(1).notNull(),
  forStudent: tinyint("for_student").default(2).notNull(),
  forParent: tinyint("for_parent").default(3).notNull(),
  forTeacher: tinyint("for_teacher").default(4).notNull(),
  forStaff: tinyint("for_staff").default(6).notNull(),
  forAdmin: tinyint("for_admin").default(1).notNull(),
  expiredTime: double("expired_time", { precision: 8, scale: 2 }).default(300).notNull(),
  schoolId: int("school_id")
    .default(1)
    .notNull()
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const users = mysqlTable("users", {
  id: int().autoincrement().primaryKey().notNull(),
  fullName: varchar("full_name", { length: 192 }).default(sql`NULL`),
  username: varchar({ length: 192 }).default(sql`NULL`),
  phoneNumber: varchar("phone_number", { length: 191 }).default(sql`NULL`),
  email: varchar({ length: 192 }).default(sql`NULL`),
  password: varchar({ length: 100 }).default(sql`NULL`),
  usertype: varchar({ length: 210 }).default(sql`NULL`),
  activeStatus: tinyint("active_status").default(1).notNull(),
  randomCode: text("random_code").default(sql`NULL`),
  notificationToken: text().default(sql`NULL`),
  rememberToken: varchar("remember_token", { length: 100 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  language: varchar({ length: 191 }).default("en"),
  styleId: int("style_id").default(1),
  rtlLtl: int("rtl_ltl").default(2),
  selectedSession: int("selected_session").default(1),
  createdBy: int("created_by").default(1),
  updatedBy: int("updated_by").default(1),
  accessStatus: int("access_status").default(1),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  roleId: int("role_id")
    .default(sql`NULL`)
    .references(() => infixRoles.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  isAdministrator: mysqlEnum("is_administrator", ["yes", "no"]).default("no").notNull(),
  isRegistered: tinyint("is_registered").default(0).notNull(),
  deviceToken: text("device_token").default(sql`NULL`),
  stripeId: varchar("stripe_id", { length: 191 }).default(sql`NULL`),
  cardBrand: varchar("card_brand", { length: 191 }).default(sql`NULL`),
  cardLastFour: varchar("card_last_four", { length: 4 }).default(sql`NULL`),
  verified: varchar({ length: 191 }).default(sql`NULL`),
  trialEndsAt: timestamp("trial_ends_at", { mode: "string" }).default(sql`NULL`),
  walletBalance: double("wallet_balance", { precision: 8, scale: 2 }).notNull(),
});

export const userOtpCodes = mysqlTable("user_otp_codes", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  userId: int("user_id")
    .default(sql`NULL`)
    .references(() => users.id, { onDelete: "set null", onUpdate: "restrict" }),
  otpCode: varchar("otp_code", { length: 191 }).notNull(),
  expiredTime: varchar("expired_time", { length: 200 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const versionHistories = mysqlTable("version_histories", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  version: varchar({ length: 191 }).default(sql`NULL`),
  releaseDate: varchar("release_date", { length: 191 }).default(sql`NULL`),
  url: varchar({ length: 191 }).default(sql`NULL`),
  notes: varchar({ length: 191 }).default(sql`NULL`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const videoUploads = mysqlTable("video_uploads", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  title: varchar({ length: 191 }).notNull(),
  description: text().default(sql`NULL`),
  youtubeLink: varchar("youtube_link", { length: 191 }).notNull(),
  classId: int("class_id").notNull(),
  sectionId: int("section_id").notNull(),
  createdBy: int("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  academicId: int("academic_id")
    .default(sql`NULL`)
    .references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
  schoolId: int("school_id")
    .default(1)
    .references(() => smSchools.id, {
      onDelete: "cascade",
      onUpdate: "restrict",
    }),
});

export const walletTransactions = mysqlTable("wallet_transactions", {
  id: bigint({ mode: "number" }).autoincrement().primaryKey().notNull(),
  amount: double({ precision: 8, scale: 2 }).default(sql`NULL`),
  paymentMethod: varchar("payment_method", { length: 191 }).default(sql`NULL`),
  userId: int("user_id")
    .default(sql`NULL`)
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  bankId: int("bank_id").default(sql`NULL`),
  note: varchar({ length: 191 }).default(sql`NULL`),
  type: varchar({ length: 191 }).default(sql`NULL`),
  file: text().default(sql`NULL`),
  rejectNote: text("reject_note").default(sql`NULL`),
  expense: double({ precision: 8, scale: 2 }).default(sql`NULL`),
  status: varchar({ length: 191 }).default("pending").notNull(),
  createdBy: int("created_by").default(sql`NULL`),
  academicId: int("academic_id").default(1).notNull(),
  schoolId: int("school_id").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});
