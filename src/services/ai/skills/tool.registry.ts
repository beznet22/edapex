export const toolRegistry: Record<string, string[]> = {
  'academic.registrar': ['academic.enrollStudent', 'academic.searchRecords', 'academic.updateProfile'],
  'academic.hod': ['academic.createLessonPlan', 'academic.auditSyllabus', 'academic.assignTeacher'],
  'academic.teacherAssistant': ['academic.gradeExam', 'lms.createModule'],
  'ai.ops': ['it.checkAgentHealth', 'it.rotateAPIKeys', 'it.auditTokenCents'],
  'ai.auditor': ['finance.auditLedger', 'it.auditTokenCents'],
  'assessment.evaluator': ['assessment.gradeExam', 'assessment.computeSchoolAverages'],
  'attendance.safety': ['attendance.verifyPresence', 'attendance.flagSecurityAnomaly'],
  'attendance.health': ['attendance.verifyPresence'],
  'cms.contentHead': ['cms.publishPage', 'cms.updateNews', 'cms.seoAudit'],
  'communication.pr': ['comm.sendBroadcast', 'comm.moderateChat', 'comm.draftNewsletter'],
  'documents.archivist': ['docs.archiveRecord', 'docs.generateCertificate', 'docs.signDocument'],
  'events.planner': ['events.createEvent', 'events.sendInvites', 'events.checkVenue'],
  'facilities.assetManager': ['facilities.trackInventory', 'facilities.bookRoom', 'facilities.scheduleMaintenance'],
  'finance.bursar': ['finance.collectFees', 'finance.issueInvoice'],
  'finance.accountant': ['finance.auditLedger', 'finance.processPayroll'],
  'homeschooling.mentor': ['homeschool.createPath', 'homeschool.recommendSupplements'],
  'hr.manager': ['hr.getStaffDetails', 'hr.updateAttendance', 'hr.initiateOnboarding', 'hr.generateLeaveReport'],
  'hr.compliance': ['compliance.auditAttendanceRecords', 'compliance.generateNERDCReport', 'compliance.checkSafetyPolicy'],
  'library.librarian': ['library.searchBooks', 'library.issueBook', 'library.checkOverdue'],
  'lms.courseDesigner': ['lms.createModule', 'lms.generateQuiz'],
  'pbac.compliance': ['pbac.evaluatePolicy', 'pbac.grantRole', 'pbac.auditPerms'],
  'settings.configManager': ['settings.updateConfig', 'settings.setAcademicYear'],
  'classroom.teacher': ['wb_show_image', 'wb_highlight', 'wb_pan'],
};

/**
 * Filter tools by domain prefix (e.g., 'academic.*')
 */
export function getVettedTools(domain: string): string[] {
  // Aggregate all tools across roles for this domain
  const tools: string[] = [];
  const domainPrefix = `${domain}.`;

  for (const role in toolRegistry) {
    if (role.startsWith(domainPrefix)) {
      tools.push(...toolRegistry[role]);
    }
  }

  // Deduplicate and return
  return Array.from(new Set(tools));
}

export function getToolsByRole(role: string): string[] {
  return toolRegistry[role] || [];
}
