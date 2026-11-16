import { z } from "zod";
import type { RequestHandler } from "@sveltejs/kit";
import { error, json } from "@sveltejs/kit";
import { SettingsService } from "$lib/server/service/settings.service";
import { log } from "$lib/server/audit-log";
import { requireAdminOrIt, parseJsonBody } from "$lib/server/helpers/platform-tab";

const YearCreateSchema = z
	.object({
		year: z.string().trim().min(2).max(200),
		title: z.string().trim().min(2).max(200),
		startingDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, "startingDate must be YYYY-MM-DD"),
		endingDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, "endingDate must be YYYY-MM-DD")
	})
	.strict()
	.refine((value) => value.startingDate <= value.endingDate, {
		message: "startingDate must be on or before endingDate",
		path: ["endingDate"]
	});

const YearSetActiveSchema = z
	.object({
		yearId: z.number().int().positive()
	})
	.strict();

const ExamCreateSchema = z
	.object({
		academicId: z.number().int().positive(),
		title: z.string().trim().min(1).max(255),
		isAverage: z.union([z.literal(0), z.literal(1)]),
		percentage: z.number().min(0).max(100),
		averageMark: z.number().min(0).max(100)
	})
	.strict();

const ExamToggleSchema = z
	.object({
		examId: z.number().int().positive(),
		academicId: z.number().int().positive()
	})
	.strict();

type CalendarAction =
	| { kind: "create-year"; payload: z.infer<typeof YearCreateSchema> }
	| { kind: "set-active-year"; payload: z.infer<typeof YearSetActiveSchema> }
	| { kind: "create-exam"; payload: z.infer<typeof ExamCreateSchema> }
	| { kind: "toggle-exam"; payload: z.infer<typeof ExamToggleSchema> };

const ActionSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("create-year"), payload: YearCreateSchema }),
	z.object({ kind: z.literal("set-active-year"), payload: YearSetActiveSchema }),
	z.object({ kind: z.literal("create-exam"), payload: ExamCreateSchema }),
	z.object({ kind: z.literal("toggle-exam"), payload: ExamToggleSchema })
]);

export const GET: RequestHandler = async (event) => {
	const { session, user } = event.locals;
	if (!user || !session) error(401, "Unauthorized");
	const { schoolId } = requireAdminOrIt(event);

	const service = new SettingsService(schoolId);
	const years = await service.listAcademicYears();
	const active = await service.getActiveAcademicYear();
	const exams = active ? await service.listExamTypes(active.id) : [];

	return json({ schoolId, years, activeYear: active, examTypes: exams });
};

export const POST: RequestHandler = async (event) => {
	const { session, user } = event.locals;
	if (!user || !session) error(401, "Unauthorized");
	const { schoolId } = requireAdminOrIt(event);
	const action: CalendarAction = await parseJsonBody(event, ActionSchema);
	const service = new SettingsService(schoolId);

	switch (action.kind) {
		case "create-year": {
			const beforeYears = await service.listAcademicYears();
			const created = await service.createAcademicYear({
				year: action.payload.year,
				title: action.payload.title,
				startingDate: action.payload.startingDate,
				endingDate: action.payload.endingDate,
				createdBy: typeof user.staffId === "number" ? user.staffId : 1
			});
			const after = await service.listAcademicYears();
			if (typeof user.staffId === "number") {
				await log({
					schoolId,
					actorStaffId: user.staffId,
					action: "create",
					entityType: "smAcademicYears",
					entityId: String(created.id),
					before: { yearCount: beforeYears.length },
					after: { id: created.id, year: created.year, title: created.title }
				});
			}
			return json({ ok: true, kind: action.kind, years: after });
		}

		case "set-active-year": {
			const beforeRows = await service.listAcademicYears();
			const beforeSnapshot = beforeRows.map((row) => ({ ...row }));
			const after = await service.setActiveAcademicYear(action.payload.yearId);
			const newActive = after.find((row) => row.activeStatus === 1) ?? null;
			if (typeof user.staffId === "number") {
				await log({
					schoolId,
					actorStaffId: user.staffId,
					action: "update",
					entityType: "smAcademicYears.active",
					entityId: String(action.payload.yearId),
					before: {
						activeYearId:
							beforeSnapshot.find((row) => row.activeStatus === 1)?.id ?? null
					},
					after: { activeYearId: newActive?.id ?? null }
				});
			}
			return json({ ok: true, kind: action.kind, years: after });
		}

		case "create-exam": {
			const beforeExams = await service.listExamTypes(action.payload.academicId);
			const created = await service.createExamType({
				academicId: action.payload.academicId,
				title: action.payload.title,
				isAverage: action.payload.isAverage,
				percentage: action.payload.percentage,
				averageMark: action.payload.averageMark,
				createdBy: typeof user.staffId === "number" ? user.staffId : 1
			});
			const after = await service.listExamTypes(action.payload.academicId);
			if (typeof user.staffId === "number") {
				await log({
					schoolId,
					actorStaffId: user.staffId,
					action: "create",
					entityType: "smExamTypes",
					entityId: String(created.id),
					before: { examCount: beforeExams.length },
					after: { id: created.id, title: created.title }
				});
			}
			return json({ ok: true, kind: action.kind, examTypes: after });
		}

		case "toggle-exam": {
			const updated = await service.toggleExamTypeActive(action.payload.examId);
			if (!updated) error(404, "Exam type not found");
			const after = await service.listExamTypes(action.payload.academicId);
			if (typeof user.staffId === "number") {
				await log({
					schoolId,
					actorStaffId: user.staffId,
					action: updated.activeStatus === 1 ? "enable" : "disable",
					entityType: "smExamTypes",
					entityId: String(updated.id),
					before: { activeStatus: updated.activeStatus === 1 ? 0 : 1 },
					after: { activeStatus: updated.activeStatus }
				});
			}
			return json({ ok: true, kind: action.kind, examTypes: after });
		}
	}
};
