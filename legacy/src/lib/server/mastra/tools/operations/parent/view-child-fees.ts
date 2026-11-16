import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import {
  smFeesAssigns,
  smFeesGroups,
  smFeesMasters,
  smFeesPayments,
  smFeesTypes,
} from "$lib/server/db/sms-schema";
import { assertParentOwnsStudent } from "../../internal/parent-permissions";
import { loadStudentSchoolId, readParentContext } from "./index";

export const viewChildFeesTool = createTool({
  id: "view-child-fees",
  description:
    "Return a child's fee assignments, payments, and running balance broken down by fees type.",
  inputSchema: z.object({
    studentId: z.number().int().positive().describe("Numeric ID of the child student"),
  }),
  outputSchema: z.object({
    studentId: z.number(),
    totalAssigned: z.number(),
    totalPaid: z.number(),
    balance: z.number(),
    items: z.array(
      z.object({
        feesType: z.string().nullable(),
        feesGroup: z.string().nullable(),
        amount: z.number().nullable(),
        dueDate: z.string().nullable(),
        paidAmount: z.number().nullable(),
        paymentDate: z.string().nullable(),
        paymentMode: z.string().nullable(),
        status: z.string(),
      }),
    ),
  }),
  execute: async (input, ctx) => {
    const parent = readParentContext(ctx);
    assertParentOwnsStudent(parent, input.studentId);

    const schoolId = await loadStudentSchoolId(input.studentId);
    const db = await getDatabase();

    const assignments = await db
      .select({
        assignId: smFeesAssigns.id,
        amount: smFeesAssigns.feesAmount,
        feesType: smFeesTypes.name,
        feesGroup: smFeesGroups.name,
        activeStatus: smFeesAssigns.activeStatus,
      })
      .from(smFeesAssigns)
      .leftJoin(smFeesMasters, eq(smFeesAssigns.feesMasterId, smFeesMasters.id))
      .leftJoin(smFeesTypes, eq(smFeesMasters.feesTypeId, smFeesTypes.id))
      .leftJoin(smFeesGroups, eq(smFeesTypes.feesGroupId, smFeesGroups.id))
      .where(
        and(
          eq(smFeesAssigns.studentId, input.studentId),
          eq(smFeesAssigns.schoolId, schoolId),
        ),
      );

    const payments = await db
      .select({
        assignId: smFeesPayments.assignId,
        amount: smFeesPayments.amount,
        paymentDate: smFeesPayments.paymentDate,
        paymentMode: smFeesPayments.paymentMode,
        feesType: smFeesTypes.name,
        feesGroup: smFeesGroups.name,
      })
      .from(smFeesPayments)
      .leftJoin(smFeesTypes, eq(smFeesPayments.feesTypeId, smFeesTypes.id))
      .leftJoin(smFeesGroups, eq(smFeesTypes.feesGroupId, smFeesGroups.id))
      .where(
        and(
          eq(smFeesPayments.studentId, input.studentId),
          eq(smFeesPayments.schoolId, schoolId),
          eq(smFeesPayments.activeStatus, 1),
        ),
      );

    type Item = {
      feesType: string | null;
      feesGroup: string | null;
      amount: number | null;
      dueDate: string | null;
      paidAmount: number | null;
      paymentDate: string | null;
      paymentMode: string | null;
      status: string;
    };

    const items: Item[] = [];
    let totalAssigned = 0;
    let totalPaid = 0;

    if (assignments.length === 0 && payments.length > 0) {
      for (const p of payments) {
        const amount = p.amount !== null ? Number(p.amount) : null;
        if (amount !== null) totalPaid += amount;
        items.push({
          feesType: p.feesType,
          feesGroup: p.feesGroup,
          amount,
          dueDate: null,
          paidAmount: amount,
          paymentDate: p.paymentDate,
          paymentMode: p.paymentMode,
          status: amount !== null && amount > 0 ? "paid" : "unpaid",
        });
      }
    } else {
      for (const a of assignments) {
        const due = a.amount !== null ? Number(a.amount) : null;
        if (due !== null) totalAssigned += due;
        const related = payments.filter((p) => p.assignId === a.assignId);
        let paid = 0;
        let lastDate: string | null = null;
        let lastMode: string | null = null;
        for (const p of related) {
          const amt = p.amount !== null ? Number(p.amount) : 0;
          paid += amt;
          if (p.paymentDate !== null) lastDate = p.paymentDate;
          if (p.paymentMode !== null) lastMode = p.paymentMode;
        }
        totalPaid += paid;
        let status = "unpaid";
        if (due !== null) {
          if (paid >= due) status = "paid";
          else if (paid > 0) status = "partial";
        } else if (paid > 0) {
          status = "paid";
        }
        items.push({
          feesType: a.feesType,
          feesGroup: a.feesGroup,
          amount: due,
          dueDate: null,
          paidAmount: paid,
          paymentDate: lastDate,
          paymentMode: lastMode,
          status,
        });
      }
      for (const p of payments) {
        const stillOrphan = !assignments.some((a) => a.assignId === p.assignId);
        if (!stillOrphan) continue;
        const amt = p.amount !== null ? Number(p.amount) : null;
        if (amt !== null) totalPaid += amt;
        items.push({
          feesType: p.feesType,
          feesGroup: p.feesGroup,
          amount: null,
          dueDate: null,
          paidAmount: amt,
          paymentDate: p.paymentDate,
          paymentMode: p.paymentMode,
          status: amt !== null && amt > 0 ? "paid" : "unpaid",
        });
      }
    }

    return {
      studentId: input.studentId,
      totalAssigned,
      totalPaid,
      balance: totalAssigned - totalPaid,
      items,
    };
  },
});