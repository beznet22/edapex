export async function loadStudentFile(
    studentId: number,
    classId: number,
    sectionId: number,
    examId?: number
) {
    const params = new URLSearchParams({
        studentId: studentId.toString(),
        classId: classId.toString(),
        sectionId: sectionId.toString()
    });

    if (examId) {
        params.append("examId", examId.toString());
    }

    const res = await fetch(`/api/student-files?${params.toString()}`);
    if (!res.ok) {
        throw new Error("Failed to load student file");
    }

    const json = await res.json();
    if (!json.success) {
        return null;
    }
    return json.data; // This is the ExtractedAssessment object
}
