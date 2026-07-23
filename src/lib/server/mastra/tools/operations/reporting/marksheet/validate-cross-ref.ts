import type { Marksheet, SubjectAssigned, MarksRecord } from '$lib/schema/marksheet';

export interface CrossRefWarning {
	subjectId: number;
	subjectCode: string | null;
	message: string;
	/** `unresolved` — blocking error the user must Allow or Omit.
	 *  `allowed` — user has allowed auto-fill; non-blocking info. */
	status: 'unresolved' | 'allowed';
}

export function crossReferenceSubjects(
	parsed: Marksheet,
	assignedSubjects: SubjectAssigned[],
	omitSubjectIds?: Set<number>,
	allowSubjectIds?: Set<number>,
): CrossRefWarning[] {
	const parsedSubjectIds = new Set(parsed.subjects.map(s => s.subjectId));
	const warnings: CrossRefWarning[] = [];
	for (const sub of assignedSubjects) {
		if (sub.subjectId == null) continue;
		if (omitSubjectIds?.has(sub.subjectId)) continue;
		if (!parsedSubjectIds.has(sub.subjectId)) {
			const isAllowed = allowSubjectIds?.has(sub.subjectId) ?? false;
			warnings.push({
				subjectId: sub.subjectId,
				subjectCode: sub.subjectCode,
				message: isAllowed
					? `Subject ${sub.subjectCode ?? `id=${sub.subjectId}`} will be auto-filled on commit`
					: `Missing subject in marksheet: ${sub.subjectCode ?? `id=${sub.subjectId}`} (assigned to class but not present in marksheet)`,
				status: isAllowed ? 'allowed' : 'unresolved',
			});
		}
	}
	return warnings;
}

export function padMissingRecords(
	marksheet: Marksheet,
	assignedSubjects: SubjectAssigned[],
	omitSubjectIds?: Set<number>,
): Marksheet {
	if (omitSubjectIds && omitSubjectIds.size > 0) {
		marksheet = {
			...marksheet,
			records: marksheet.records.filter(
				r => r.subjectId == null || !omitSubjectIds.has(r.subjectId),
			),
			subjects: marksheet.subjects.filter(
				s => s.subjectId == null || !omitSubjectIds.has(s.subjectId),
			),
		};
	}
	const existingSubjectIds = new Set(marksheet.records.map(r => r.subjectId));
	const missing = assignedSubjects.filter(
		s => s.subjectId != null && !existingSubjectIds.has(s.subjectId) && !(omitSubjectIds?.has(s.subjectId)),
	);
	if (missing.length === 0) return marksheet;

	const blankRecordTemplate: Omit<MarksRecord, 'subjectId' | 'subject' | 'subjectCode'> = {
		studentId: marksheet.student.id,
		resultId: 0,
		objectives: null,
		titleIds: [],
		titles: [],
		markIds: [],
		marks: [],
		fullMarks: [],
		totalScore: undefined,
		grade: '',
		color: undefined,
		category: marksheet.student.category,
		learningOutcome: marksheet.student.category === 'DAYCARE' ? '' : null,
	};

	const newRecords: MarksRecord[] = marksheet.records.map(r => ({ ...r }));
	const newSubjects: SubjectAssigned[] = marksheet.subjects.map(s => ({ ...s }));

	for (const sub of missing) {
		const subjectName = sub.subjectCode ?? `subject-${sub.subjectId}`;
		newRecords.push({
			...blankRecordTemplate,
			subjectId: sub.subjectId!,
			subject: subjectName,
			subjectCode: sub.subjectCode ?? '',
		});
		if (!newSubjects.find(s => s.subjectId === sub.subjectId)) {
			newSubjects.push({
				subjectId: sub.subjectId,
				subjectCode: sub.subjectCode,
				teacherId: sub.teacherId,
			});
		}
	}

	return { ...marksheet, records: newRecords, subjects: newSubjects };
}
