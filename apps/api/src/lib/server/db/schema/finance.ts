import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { auditTimestamps, calendarDate, moneyMinorUnits } from "./common";
import { smStudents } from "./people";
import { smAcademicYears, smSchools } from "./tenancy";

const DISCOUNT_TYPE = ["once", "year"] as const;

export const smFeesGroups = sqliteTable(
  "sm_fees_groups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name"),
    type: text("type"),
    startDate: calendarDate("start_date"),
    endDate: calendarDate("end_date"),
    dueDate: calendarDate("due_date"),
    description: text("description"),
    activeStatus: integer("active_status").notNull().default(1),
    ...auditTimestamps(),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id")
      .default(1)
      .references(() => smAcademicYears.id, { onDelete: "cascade", onUpdate: "restrict" }),
    unSemesterLabelId: integer("un_semester_label_id")
  },
  (table) => [
    index("sm_fees_groups_academic_id_foreign").on(table.academicId),
    index("sm_fees_groups_school_id_foreign").on(table.schoolId)
  ]
);

export const smFeesTypes = sqliteTable(
  "sm_fees_types",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name"),
    description: text("description"),
    activeStatus: integer("active_status").notNull().default(1),
    ...auditTimestamps(),
    feesGroupId: integer("fees_group_id")
      .default(1)
      .references(() => smFeesGroups.id, { onDelete: "cascade", onUpdate: "restrict" }),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id")
      .default(1)
      .references(() => smAcademicYears.id, { onDelete: "cascade", onUpdate: "restrict" }),
    unSemesterLabelId: integer("un_semester_label_id")
  },
  (table) => [
    index("sm_fees_types_academic_id_foreign").on(table.academicId),
    index("sm_fees_types_fees_group_id_foreign").on(table.feesGroupId),
    index("sm_fees_types_school_id_foreign").on(table.schoolId)
  ]
);

export const smFeesMasters = sqliteTable(
  "sm_fees_masters",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: calendarDate("date"),
    amount: moneyMinorUnits("amount"),
    activeStatus: integer("active_status").notNull().default(1),
    ...auditTimestamps(),
    feesGroupId: integer("fees_group_id").references(() => smFeesGroups.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    feesTypeId: integer("fees_type_id").references(() => smFeesTypes.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id")
      .default(1)
      .references(() => smAcademicYears.id, { onDelete: "cascade", onUpdate: "restrict" }),
    classId: integer("class_id"),
    sectionId: integer("section_id"),
    unSemesterLabelId: integer("un_semester_label_id")
  },
  (table) => [
    index("sm_fees_masters_academic_id_foreign").on(table.academicId),
    index("sm_fees_masters_fees_group_id_foreign").on(table.feesGroupId),
    index("sm_fees_masters_fees_type_id_foreign").on(table.feesTypeId),
    index("sm_fees_masters_school_id_foreign").on(table.schoolId)
  ]
);

export const smFeesDiscounts = sqliteTable(
  "sm_fees_discounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name"),
    code: text("code"),
    type: text("type", { enum: DISCOUNT_TYPE }),
    amount: moneyMinorUnits("amount"),
    description: text("description"),
    activeStatus: integer("active_status").notNull().default(1),
    ...auditTimestamps(),
    recordId: integer("record_id"),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id")
      .default(1)
      .references(() => smAcademicYears.id, { onDelete: "cascade", onUpdate: "restrict" })
  },
  (table) => [
    index("sm_fees_discounts_academic_id_foreign").on(table.academicId),
    index("sm_fees_discounts_school_id_foreign").on(table.schoolId)
  ]
);

export const smFeesAssigns = sqliteTable(
  "sm_fees_assigns",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    activeStatus: integer("active_status").notNull().default(1),
    ...auditTimestamps(),
    feesAmount: moneyMinorUnits("fees_amount"),
    appliedDiscount: moneyMinorUnits("applied_discount"),
    feesMasterId: integer("fees_master_id").references(() => smFeesMasters.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    feesDiscountId: integer("fees_discount_id").references(() => smFeesDiscounts.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    recordId: integer("record_id"),
    studentId: integer("student_id").references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id")
      .default(1)
      .references(() => smAcademicYears.id, { onDelete: "cascade", onUpdate: "restrict" }),
    classId: integer("class_id"),
    sectionId: integer("section_id")
  },
  (table) => [
    index("sm_fees_assigns_academic_id_foreign").on(table.academicId),
    index("sm_fees_assigns_fees_discount_id_foreign").on(table.feesDiscountId),
    index("sm_fees_assigns_fees_master_id_foreign").on(table.feesMasterId),
    index("sm_fees_assigns_school_id_foreign").on(table.schoolId),
    index("sm_fees_assigns_student_id_foreign").on(table.studentId),
    index("sm_fees_assigns_school_academic_student_index").on(
      table.schoolId,
      table.academicId,
      table.studentId
    )
  ]
);

export const smBankAccounts = sqliteTable(
  "sm_bank_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bankName: text("bank_name"),
    accountName: text("account_name"),
    accountNumber: text("account_number"),
    accountType: text("account_type"),
    openingBalance: moneyMinorUnits("opening_balance").notNull(),
    currentBalance: moneyMinorUnits("current_balance").notNull(),
    note: text("note"),
    activeStatus: integer("active_status").notNull().default(0),
    ...auditTimestamps(),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id").references(() => smAcademicYears.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    })
  },
  (table) => [
    index("sm_bank_accounts_academic_id_foreign").on(table.academicId),
    index("sm_bank_accounts_school_id_foreign").on(table.schoolId)
  ]
);

export const smFeesPayments = sqliteTable(
  "sm_fees_payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    discountMonth: integer("discount_month"),
    discountAmount: moneyMinorUnits("discount_amount"),
    fine: moneyMinorUnits("fine"),
    amount: moneyMinorUnits("amount"),
    paymentDate: calendarDate("payment_date"),
    paymentMode: text("payment_mode"),
    note: text("note"),
    slip: text("slip"),
    fineTitle: text("fine_title"),
    activeStatus: integer("active_status").notNull().default(1),
    ...auditTimestamps(),
    assignId: integer("assign_id").references(() => smFeesAssigns.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    bankId: integer("bank_id").references(() => smBankAccounts.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    feesDiscountId: integer("fees_discount_id").references(() => smFeesDiscounts.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    feesTypeId: integer("fees_type_id").references(() => smFeesTypes.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    recordId: integer("record_id"),
    studentId: integer("student_id").references(() => smStudents.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id")
      .default(1)
      .references(() => smAcademicYears.id, { onDelete: "cascade", onUpdate: "restrict" }),
    directFeesInstallmentAssignId: integer("direct_fees_installment_assign_id"),
    installmentPaymentId: integer("installment_payment_id")
  },
  (table) => [
    index("sm_fees_payments_academic_id_foreign").on(table.academicId),
    index("sm_fees_payments_assign_id_foreign").on(table.assignId),
    index("sm_fees_payments_bank_id_foreign").on(table.bankId),
    index("sm_fees_payments_fees_discount_id_foreign").on(table.feesDiscountId),
    index("sm_fees_payments_fees_type_id_foreign").on(table.feesTypeId),
    index("sm_fees_payments_school_id_foreign").on(table.schoolId),
    index("sm_fees_payments_student_id_foreign").on(table.studentId)
  ]
);

export const financeTables = [
  smFeesGroups,
  smFeesTypes,
  smFeesMasters,
  smFeesDiscounts,
  smFeesAssigns,
  smBankAccounts,
  smFeesPayments
];
