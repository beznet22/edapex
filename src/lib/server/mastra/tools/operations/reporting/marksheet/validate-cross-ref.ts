import type { Marksheet, SubjectAssigned, MarksRecord } from '$lib/schema/marksheet';

export function crossReferenceSubjects(
	parsed: Marksheet,
	assignedSubjects: SubjectAssigned[],
): string[] {
	const parsedSubjectIds = new Set(parsed.subjects.map(s => s.subjectId));
	const warnings: string[] = [];
	for (const sub of assignedSubjects) {
		if (sub.subjectId != null && !parsedSubjectIds.has(sub.subjectId)) {
			warnings.push(`Missing subject in marksheet: ${sub.subjectCode ?? `id=${sub.subjectId}`} (assigned to class but not present in marksheet)`);
		}
	}
	console.log('warnings', warnings);
	return warnings;
}

export function padMissingRecords(
	marksheet: Marksheet,
	assignedSubjects: SubjectAssigned[],
): Marksheet {
	const existingSubjectIds = new Set(marksheet.records.map(r => r.subjectId));
	const missing = assignedSubjects.filter(
		s => s.subjectId != null && !existingSubjectIds.has(s.subjectId),
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
