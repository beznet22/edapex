import { relations } from "drizzle-orm/relations";
import {
  smSchools,
  assignPermissions,
  smAcademicYears,
  chatGroups,
  smClasses,
  smSections,
  smSubjects,
  smStaffs,
  classAttendances,
  smExamTypes,
  smStudents,
  colors,
  colorTheme,
  themes,
  comments,
  commentPivots,
  commentTags,
  contents,
  contentShareLists,
  contentTypes,
  continents,
  continets,
  countries,
  customResultSettings,
  directFeesInstallments,
  smBankAccounts,
  directFeesInstallmentAssigns,
  smFeesDiscounts,
  smFeesTypes,
  directFeesReminders,
  directFeesSettings,
  direFeesInstallmentChildPayments,
  dueFeesLoginPrevents,
  infixRoles,
  users,
  examStepSkips,
  feesCarryForwardLogs,
  feesCarryForwardSettings,
  feesInvoices,
  feesInvoiceSettings,
  fmFeesInvoices,
  fmFeesInvoiceChields,
  fmFeesTransactions,
  fmFeesTransactionChields,
  fmFeesWeavers,
  frontendExamResults,
  frontAcademicCalendars,
  frontClassRoutines,
  frontExamRoutines,
  frontResults,
  graduates,
  smSessions,
  homeSliders,
  incidents,
  infixeduPages,
  infixModuleInfos,
  infixModuleStudentParentInfos,
  infixPermissionAssigns,
  invoiceSettings,
  languages,
  learningObjectives,
  lessonPlanners,
  smClassTimes,
  smClassRooms,
  lessonPlanTopics,
  smLessonTopicDetails,
  librarySubjects,
  maintenanceSettings,
  newsletters,
  smHrPayrollGenerates,
  payrollPayments,
  permissions,
  permissionSections,
  plugins,
  roles,
  schoolModules,
  sidebars,
  smsTemplates,
  smAboutPages,
  smAddExpenses,
  smAddIncomes,
  smPaymentMethhods,
  smAdmissionQueries,
  smAdmissionQueryFollowups,
  smAmountTransfers,
  smAssignClassTeachers,
  smAssignSubjects,
  smAssignVehicles,
  smRoutes,
  smVehicles,
  smBackgroundSettings,
  smBackups,
  smBankPaymentSlips,
  smBaseGroups,
  smBaseSetups,
  smBooks,
  smBookCategories,
  smBookIssues,
  smCalendarSettings,
  smChartOfAccounts,
  smClassExamRoutinePages,
  smClassOptionalSubject,
  smClassRoutines,
  smClassRoutineUpdates,
  smClassSections,
  smClassTeachers,
  smComplaints,
  smContactMessages,
  smContactPages,
  smContentTypes,
  smCountries,
  smCourses,
  smCoursePages,
  smCurrencies,
  smCustomLinks,
  smCustomTemporaryResults,
  smDashboardSettings,
  smDateFormats,
  smDesignations,
  smDonors,
  smDormitoryLists,
  smEmailSettings,
  smEmailSmsLogs,
  smEvents,
  smExams,
  smExamAttendances,
  smExamAttendanceChildren,
  studentRecords,
  smExamMarksRegisters,
  smExamSchedules,
  smExamScheduleSubjects,
  smExamSettings,
  smExamSetups,
  smExamSignatures,
  smExpenseHeads,
  smExpertTeachers,
  smFeesAssigns,
  smFeesMasters,
  smFeesAssignDiscounts,
  smFeesCarryForwards,
  smFeesGroups,
  smFeesPayments,
  smFormDownloads,
  smFrontendPersmissions,
  smGeneralSettings,
  smLanguages,
  smHeaderMenuManagers,
  smHolidays,
  smHomeworks,
  smHomeworkStudents,
  smHomePageSettings,
  smHourlyRates,
  smHrPayrollEarnDeducs,
  smHrSalaryTemplates,
  smHumanDepartments,
  smIncomeHeads,
  smInstructions,
  smInventoryPayments,
  smItems,
  smItemCategories,
  smItemIssues,
  smItemReceives,
  smItemStores,
  smSuppliers,
  smItemReceiveChildren,
  smItemSells,
  smItemSellChildren,
  smLanguagePhrases,
  smLeaveDeductionInfos,
  smLeaveDefines,
  smLeaveTypes,
  smLeaveRequests,
  smLessons,
  smLessonDetails,
  smLessonTopics,
  smLibraryMembers,
  smMarksGrades,
  smMarksRegisters,
  smMarksRegisterChildren,
  smMarksSendSms,
  smMarkStores,
  smModules,
  smModuleLinks,
  smModulePermissions,
  smModulePermissionAssigns,
  smNewsCategories,
  smNews,
  smNewsComments,
  smNewsPages,
  smNoticeBoards,
  smNotifications,
  smNotificationSettings,
  smOnlineExams,
  smOnlineExamMarks,
  smOnlineExamQuestions,
  smOnlineExamQuestionAssigns,
  smQuestionBanks,
  smOnlineExamQuestionMuOptions,
  smOptionalSubjectAssigns,
  smPages,
  smParents,
  smPaymentGatewaySettings,
  smPhoneCallLogs,
  smPhotoGalleries,
  smPostalDispatches,
  smPostalReceives,
  smProductPurchases,
  smQuestionGroups,
  smQuestionBankMuOptions,
  smQuestionLevels,
  smResultStores,
  smRolePermissions,
  smRoomLists,
  smRoomTypes,
  smSeatPlans,
  smSeatPlanChildren,
  smSendMessages,
  smSetupAdmins,
  smSmsGateways,
  smSocialMediaIcons,
  smStaffAttendanceImports,
  smStaffAttendences,
  smStaffRegistrationFields,
  smStudentCategories,
  smStudentGroups,
  smStudentAttendances,
  smStudentAttendanceImports,
  smStudentCertificates,
  smStudentDocuments,
  smStudentExcelFormats,
  smStudentHomeworks,
  smStudentIdCards,
  smStudentPromotions,
  smStudentRegistrationFields,
  smStudentTakeOnlineExams,
  smStudentTakeOnlineExamQuestions,
  smStudentTakeOnlnExQuesOptions,
  smStudentTimelines,
  smStyles,
  smSubjectAttendances,
  smTeacherUploadContents,
  smTemporaryMeritlists,
  smTestimonials,
  smToDos,
  smUploadContents,
  smUploadHomeworkContents,
  smUserLogs,
  smVideoGalleries,
  smVisitors,
  smWeekends,
  speechSliders,
  staffImportBulkTemporaries,
  studentAcademicHistories,
  studentRatings,
  studentRecordTemporaries,
  teacherRemarks,
  transcations,
  twoFactorSettings,
  userOtpCodes,
  videoUploads,
  walletTransactions,
} from "./sms-schema";

export const assignPermissionsRelations = relations(assignPermissions, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [assignPermissions.schoolId],
    references: [smSchools.id],
  }),
}));

export const smSchoolsRelations = relations(smSchools, ({ many }) => ({
  assignPermissions: many(assignPermissions),
  chatGroups: many(chatGroups),
  classAttendances: many(classAttendances),
  comments: many(comments),
  contents: many(contents),
  contentShareLists: many(contentShareLists),
  contentTypes: many(contentTypes),
  continents: many(continents),
  continets: many(continets),
  countries: many(countries),
  customResultSettings: many(customResultSettings),
  directFeesInstallments: many(directFeesInstallments),
  directFeesInstallmentAssigns: many(directFeesInstallmentAssigns),
  directFeesReminders: many(directFeesReminders),
  directFeesSettings: many(directFeesSettings),
  direFeesInstallmentChildPayments: many(direFeesInstallmentChildPayments),
  dueFeesLoginPrevents: many(dueFeesLoginPrevents),
  examStepSkips: many(examStepSkips),
  feesCarryForwardLogs: many(feesCarryForwardLogs),
  feesCarryForwardSettings: many(feesCarryForwardSettings),
  feesInvoices: many(feesInvoices),
  feesInvoiceSettings: many(feesInvoiceSettings),
  frontendExamResults: many(frontendExamResults),
  frontAcademicCalendars: many(frontAcademicCalendars),
  frontClassRoutines: many(frontClassRoutines),
  frontExamRoutines: many(frontExamRoutines),
  frontResults: many(frontResults),
  graduates: many(graduates),
  homeSliders: many(homeSliders),
  incidents: many(incidents),
  infixeduPages: many(infixeduPages),
  infixModuleInfos: many(infixModuleInfos),
  infixModuleStudentParentInfos: many(infixModuleStudentParentInfos),
  infixPermissionAssigns: many(infixPermissionAssigns),
  infixRoles: many(infixRoles),
  invoiceSettings: many(invoiceSettings),
  languages: many(languages),
  lessonPlanners: many(lessonPlanners),
  librarySubjects: many(librarySubjects),
  maintenanceSettings: many(maintenanceSettings),
  newsletters: many(newsletters),
  permissions: many(permissions),
  permissionSections: many(permissionSections),
  plugins: many(plugins),
  roles: many(roles),
  schoolModules: many(schoolModules),
  sidebars: many(sidebars),
  smsTemplates: many(smsTemplates),
  smAboutPages: many(smAboutPages),
  smAcademicYears: many(smAcademicYears),
  smAddExpenses: many(smAddExpenses),
  smAddIncomes: many(smAddIncomes),
  smAdmissionQueries: many(smAdmissionQueries),
  smAdmissionQueryFollowups: many(smAdmissionQueryFollowups),
  smAmountTransfers: many(smAmountTransfers),
  smAssignClassTeachers: many(smAssignClassTeachers),
  smAssignSubjects: many(smAssignSubjects),
  smAssignVehicles: many(smAssignVehicles),
  smBackgroundSettings: many(smBackgroundSettings),
  smBackups: many(smBackups),
  smBankAccounts: many(smBankAccounts),
  smBankPaymentSlips: many(smBankPaymentSlips),
  smBaseGroups: many(smBaseGroups),
  smBaseSetups: many(smBaseSetups),
  smBooks: many(smBooks),
  smBookCategories: many(smBookCategories),
  smBookIssues: many(smBookIssues),
  smCalendarSettings: many(smCalendarSettings),
  smChartOfAccounts: many(smChartOfAccounts),
  smClasses: many(smClasses),
  smClassExamRoutinePages: many(smClassExamRoutinePages),
  smClassOptionalSubjects: many(smClassOptionalSubject),
  smClassRooms: many(smClassRooms),
  smClassRoutines: many(smClassRoutines),
  smClassRoutineUpdates: many(smClassRoutineUpdates),
  smClassSections: many(smClassSections),
  smClassTeachers: many(smClassTeachers),
  smClassTimes: many(smClassTimes),
  smComplaints: many(smComplaints),
  smContactMessages: many(smContactMessages),
  smContactPages: many(smContactPages),
  smContentTypes: many(smContentTypes),
  smCountries: many(smCountries),
  smCourses: many(smCourses),
  smCoursePages: many(smCoursePages),
  smCurrencies: many(smCurrencies),
  smCustomLinks: many(smCustomLinks),
  smCustomTemporaryResults: many(smCustomTemporaryResults),
  smDashboardSettings: many(smDashboardSettings),
  smDateFormats: many(smDateFormats),
  smDesignations: many(smDesignations),
  smDonors: many(smDonors),
  smDormitoryLists: many(smDormitoryLists),
  smEmailSettings: many(smEmailSettings),
  smEmailSmsLogs: many(smEmailSmsLogs),
  smEvents: many(smEvents),
  smExams: many(smExams),
  smExamAttendances: many(smExamAttendances),
  smExamAttendanceChildren: many(smExamAttendanceChildren),
  smExamMarksRegisters: many(smExamMarksRegisters),
  smExamSchedules: many(smExamSchedules),
  smExamScheduleSubjects: many(smExamScheduleSubjects),
  smExamSettings: many(smExamSettings),
  smExamSetups: many(smExamSetups),
  smExamSignatures: many(smExamSignatures),
  smExamTypes: many(smExamTypes),
  smExpenseHeads: many(smExpenseHeads),
  smExpertTeachers: many(smExpertTeachers),
  smFeesAssigns: many(smFeesAssigns),
  smFeesAssignDiscounts: many(smFeesAssignDiscounts),
  smFeesCarryForwards: many(smFeesCarryForwards),
  smFeesDiscounts: many(smFeesDiscounts),
  smFeesGroups: many(smFeesGroups),
  smFeesMasters: many(smFeesMasters),
  smFeesPayments: many(smFeesPayments),
  smFeesTypes: many(smFeesTypes),
  smFormDownloads: many(smFormDownloads),
  smFrontendPersmissions: many(smFrontendPersmissions),
  smGeneralSettings: many(smGeneralSettings),
  smHeaderMenuManagers: many(smHeaderMenuManagers),
  smHolidays: many(smHolidays),
  smHomeworks: many(smHomeworks),
  smHomeworkStudents: many(smHomeworkStudents),
  smHomePageSettings: many(smHomePageSettings),
  smHourlyRates: many(smHourlyRates),
  smHrPayrollEarnDeducs: many(smHrPayrollEarnDeducs),
  smHrPayrollGenerates: many(smHrPayrollGenerates),
  smHrSalaryTemplates: many(smHrSalaryTemplates),
  smHumanDepartments: many(smHumanDepartments),
  smIncomeHeads: many(smIncomeHeads),
  smInstructions: many(smInstructions),
  smInventoryPayments: many(smInventoryPayments),
  smItems: many(smItems),
  smItemCategories: many(smItemCategories),
  smItemIssues: many(smItemIssues),
  smItemReceives: many(smItemReceives),
  smItemReceiveChildren: many(smItemReceiveChildren),
  smItemSells: many(smItemSells),
  smItemSellChildren: many(smItemSellChildren),
  smItemStores: many(smItemStores),
  smLanguages: many(smLanguages),
  smLanguagePhrases: many(smLanguagePhrases),
  smLeaveDeductionInfos: many(smLeaveDeductionInfos),
  smLeaveDefines: many(smLeaveDefines),
  smLeaveRequests: many(smLeaveRequests),
  smLeaveTypes: many(smLeaveTypes),
  smLessons: many(smLessons),
  smLessonDetails: many(smLessonDetails),
  smLessonTopics: many(smLessonTopics),
  smLessonTopicDetails: many(smLessonTopicDetails),
  smLibraryMembers: many(smLibraryMembers),
  smMarksGrades: many(smMarksGrades),
  smMarksRegisters: many(smMarksRegisters),
  smMarksRegisterChildren: many(smMarksRegisterChildren),
  smMarksSendSms: many(smMarksSendSms),
  smMarkStores: many(smMarkStores),
  smModules: many(smModules),
  smModuleLinks: many(smModuleLinks),
  smModulePermissions: many(smModulePermissions),
  smModulePermissionAssigns: many(smModulePermissionAssigns),
  smNewsPages: many(smNewsPages),
  smNoticeBoards: many(smNoticeBoards),
  smNotifications: many(smNotifications),
  smNotificationSettings: many(smNotificationSettings),
  smOnlineExams: many(smOnlineExams),
  smOnlineExamMarks: many(smOnlineExamMarks),
  smOnlineExamQuestions: many(smOnlineExamQuestions),
  smOnlineExamQuestionAssigns: many(smOnlineExamQuestionAssigns),
  smOnlineExamQuestionMuOptions: many(smOnlineExamQuestionMuOptions),
  smOptionalSubjectAssigns: many(smOptionalSubjectAssigns),
  smPages: many(smPages),
  smParents: many(smParents),
  smPaymentGatewaySettings: many(smPaymentGatewaySettings),
  smPaymentMethhods: many(smPaymentMethhods),
  smPhoneCallLogs: many(smPhoneCallLogs),
  smPhotoGalleries: many(smPhotoGalleries),
  smPostalDispatches: many(smPostalDispatches),
  smPostalReceives: many(smPostalReceives),
  smProductPurchases: many(smProductPurchases),
  smQuestionBanks: many(smQuestionBanks),
  smQuestionBankMuOptions: many(smQuestionBankMuOptions),
  smQuestionGroups: many(smQuestionGroups),
  smQuestionLevels: many(smQuestionLevels),
  smResultStores: many(smResultStores),
  smRolePermissions: many(smRolePermissions),
  smRoomLists: many(smRoomLists),
  smRoomTypes: many(smRoomTypes),
  smRoutes: many(smRoutes),
  smSeatPlans: many(smSeatPlans),
  smSeatPlanChildren: many(smSeatPlanChildren),
  smSections: many(smSections),
  smSendMessages: many(smSendMessages),
  smSessions: many(smSessions),
  smSetupAdmins: many(smSetupAdmins),
  smSmsGateways: many(smSmsGateways),
  smSocialMediaIcons: many(smSocialMediaIcons),
  smStaffs: many(smStaffs),
  smStaffAttendanceImports: many(smStaffAttendanceImports),
  smStaffAttendences: many(smStaffAttendences),
  smStaffRegistrationFields: many(smStaffRegistrationFields),
  smStudents: many(smStudents),
  smStudentAttendances: many(smStudentAttendances),
  smStudentAttendanceImports: many(smStudentAttendanceImports),
  smStudentCategories: many(smStudentCategories),
  smStudentCertificates: many(smStudentCertificates),
  smStudentDocuments: many(smStudentDocuments),
  smStudentExcelFormats: many(smStudentExcelFormats),
  smStudentGroups: many(smStudentGroups),
  smStudentHomeworks: many(smStudentHomeworks),
  smStudentIdCards: many(smStudentIdCards),
  smStudentPromotions: many(smStudentPromotions),
  smStudentRegistrationFields: many(smStudentRegistrationFields),
  smStudentTakeOnlineExams: many(smStudentTakeOnlineExams),
  smStudentTakeOnlineExamQuestions: many(smStudentTakeOnlineExamQuestions),
  smStudentTakeOnlnExQuesOptions: many(smStudentTakeOnlnExQuesOptions),
  smStudentTimelines: many(smStudentTimelines),
  smStyles: many(smStyles),
  smSubjects: many(smSubjects),
  smSubjectAttendances: many(smSubjectAttendances),
  smTeacherUploadContents: many(smTeacherUploadContents),
  smTemporaryMeritlists: many(smTemporaryMeritlists),
  smTestimonials: many(smTestimonials),
  smToDos: many(smToDos),
  smUploadContents: many(smUploadContents),
  smUploadHomeworkContents: many(smUploadHomeworkContents),
  smUserLogs: many(smUserLogs),
  smVehicles: many(smVehicles),
  smVideoGalleries: many(smVideoGalleries),
  smVisitors: many(smVisitors),
  smWeekends: many(smWeekends),
  speechSliders: many(speechSliders),
  studentAcademicHistories: many(studentAcademicHistories),
  studentRecords: many(studentRecords),
  studentRecordTemporaries: many(studentRecordTemporaries),
  themes: many(themes),
  twoFactorSettings: many(twoFactorSettings),
  users: many(users),
  videoUploads: many(videoUploads),
}));

export const chatGroupsRelations = relations(chatGroups, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [chatGroups.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [chatGroups.classId],
    references: [smClasses.id],
  }),
  smSchool: one(smSchools, {
    fields: [chatGroups.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [chatGroups.sectionId],
    references: [smSections.id],
  }),
  smSubject: one(smSubjects, {
    fields: [chatGroups.subjectId],
    references: [smSubjects.id],
  }),
  smStaff: one(smStaffs, {
    fields: [chatGroups.teacherId],
    references: [smStaffs.id],
  }),
}));

export const smAcademicYearsRelations = relations(smAcademicYears, ({ one, many }) => ({
  chatGroups: many(chatGroups),
  classAttendances: many(classAttendances),
  comments: many(comments),
  commentTags: many(commentTags),
  contents: many(contents),
  contentShareLists: many(contentShareLists),
  contentTypes: many(contentTypes),
  countries: many(countries),
  customResultSettings: many(customResultSettings),
  dueFeesLoginPrevents: many(dueFeesLoginPrevents),
  examStepSkips: many(examStepSkips),
  feesInvoiceSettings: many(feesInvoiceSettings),
  invoiceSettings: many(invoiceSettings),
  learningObjectives: many(learningObjectives),
  lessonPlanners: many(lessonPlanners),
  librarySubjects: many(librarySubjects),
  smSchool: one(smSchools, {
    fields: [smAcademicYears.schoolId],
    references: [smSchools.id],
  }),
  smAddExpenses: many(smAddExpenses),
  smAddIncomes: many(smAddIncomes),
  smAdmissionQueries: many(smAdmissionQueries),
  smAdmissionQueryFollowups: many(smAdmissionQueryFollowups),
  smAmountTransfers: many(smAmountTransfers),
  smAssignClassTeachers: many(smAssignClassTeachers),
  smAssignSubjects: many(smAssignSubjects),
  smAssignVehicles: many(smAssignVehicles),
  smBackups: many(smBackups),
  smBankAccounts: many(smBankAccounts),
  smBooks: many(smBooks),
  smBookCategories: many(smBookCategories),
  smBookIssues: many(smBookIssues),
  smChartOfAccounts: many(smChartOfAccounts),
  smClasses: many(smClasses),
  smClassOptionalSubjects: many(smClassOptionalSubject),
  smClassRooms: many(smClassRooms),
  smClassRoutines: many(smClassRoutines),
  smClassRoutineUpdates: many(smClassRoutineUpdates),
  smClassSections: many(smClassSections),
  smClassTeachers: many(smClassTeachers),
  smClassTimes: many(smClassTimes),
  smComplaints: many(smComplaints),
  smContentTypes: many(smContentTypes),
  smCustomTemporaryResults: many(smCustomTemporaryResults),
  smDormitoryLists: many(smDormitoryLists),
  smEmailSettings: many(smEmailSettings),
  smEmailSmsLogs: many(smEmailSmsLogs),
  smEvents: many(smEvents),
  smExams: many(smExams),
  smExamAttendances: many(smExamAttendances),
  smExamAttendanceChildren: many(smExamAttendanceChildren),
  smExamMarksRegisters: many(smExamMarksRegisters),
  smExamSchedules: many(smExamSchedules),
  smExamScheduleSubjects: many(smExamScheduleSubjects),
  smExamSettings: many(smExamSettings),
  smExamSetups: many(smExamSetups),
  smExamSignatures: many(smExamSignatures),
  smExamTypes: many(smExamTypes),
  smExpenseHeads: many(smExpenseHeads),
  smFeesAssigns: many(smFeesAssigns),
  smFeesAssignDiscounts: many(smFeesAssignDiscounts),
  smFeesCarryForwards: many(smFeesCarryForwards),
  smFeesDiscounts: many(smFeesDiscounts),
  smFeesGroups: many(smFeesGroups),
  smFeesMasters: many(smFeesMasters),
  smFeesPayments: many(smFeesPayments),
  smFeesTypes: many(smFeesTypes),
  smGeneralSettings_academicId: many(smGeneralSettings, {
    relationName: "smGeneralSettings_academicId_smAcademicYears_id",
  }),
  smGeneralSettings_sessionId: many(smGeneralSettings, {
    relationName: "smGeneralSettings_sessionId_smAcademicYears_id",
  }),
  smHolidays: many(smHolidays),
  smHomeworks: many(smHomeworks),
  smHomeworkStudents: many(smHomeworkStudents),
  smHourlyRates: many(smHourlyRates),
  smHrPayrollEarnDeducs: many(smHrPayrollEarnDeducs),
  smHrPayrollGenerates: many(smHrPayrollGenerates),
  smHrSalaryTemplates: many(smHrSalaryTemplates),
  smIncomeHeads: many(smIncomeHeads),
  smInventoryPayments: many(smInventoryPayments),
  smItems: many(smItems),
  smItemCategories: many(smItemCategories),
  smItemIssues: many(smItemIssues),
  smItemReceives: many(smItemReceives),
  smItemReceiveChildren: many(smItemReceiveChildren),
  smItemSells: many(smItemSells),
  smItemSellChildren: many(smItemSellChildren),
  smItemStores: many(smItemStores),
  smLeaveDeductionInfos: many(smLeaveDeductionInfos),
  smLeaveDefines: many(smLeaveDefines),
  smLeaveRequests: many(smLeaveRequests),
  smLeaveTypes: many(smLeaveTypes),
  smLessons: many(smLessons),
  smLessonDetails: many(smLessonDetails),
  smLessonTopics: many(smLessonTopics),
  smLessonTopicDetails: many(smLessonTopicDetails),
  smLibraryMembers: many(smLibraryMembers),
  smMarksGrades: many(smMarksGrades),
  smMarksRegisters: many(smMarksRegisters),
  smMarksRegisterChildren: many(smMarksRegisterChildren),
  smMarksSendSms: many(smMarksSendSms),
  smMarkStores: many(smMarkStores),
  smNoticeBoards: many(smNoticeBoards),
  smNotifications: many(smNotifications),
  smOnlineExams: many(smOnlineExams),
  smOnlineExamMarks: many(smOnlineExamMarks),
  smOnlineExamQuestions: many(smOnlineExamQuestions),
  smOnlineExamQuestionAssigns: many(smOnlineExamQuestionAssigns),
  smOnlineExamQuestionMuOptions: many(smOnlineExamQuestionMuOptions),
  smOptionalSubjectAssigns_academicId: many(smOptionalSubjectAssigns, {
    relationName: "smOptionalSubjectAssigns_academicId_smAcademicYears_id",
  }),
  smOptionalSubjectAssigns_sessionId: many(smOptionalSubjectAssigns, {
    relationName: "smOptionalSubjectAssigns_sessionId_smAcademicYears_id",
  }),
  smParents: many(smParents),
  smPhoneCallLogs: many(smPhoneCallLogs),
  smPostalDispatches: many(smPostalDispatches),
  smPostalReceives: many(smPostalReceives),
  smQuestionBanks: many(smQuestionBanks),
  smQuestionBankMuOptions: many(smQuestionBankMuOptions),
  smQuestionGroups: many(smQuestionGroups),
  smQuestionLevels: many(smQuestionLevels),
  smResultStores: many(smResultStores),
  smRoomLists: many(smRoomLists),
  smRoomTypes: many(smRoomTypes),
  smRoutes: many(smRoutes),
  smSeatPlans: many(smSeatPlans),
  smSeatPlanChildren: many(smSeatPlanChildren),
  smSections: many(smSections),
  smSendMessages: many(smSendMessages),
  smSetupAdmins: many(smSetupAdmins),
  smStaffAttendanceImports: many(smStaffAttendanceImports),
  smStaffAttendences: many(smStaffAttendences),
  smStaffRegistrationFields: many(smStaffRegistrationFields),
  smStudents_academicId: many(smStudents, {
    relationName: "smStudents_academicId_smAcademicYears_id",
  }),
  smStudents_sessionId: many(smStudents, {
    relationName: "smStudents_sessionId_smAcademicYears_id",
  }),
  smStudentAttendances: many(smStudentAttendances),
  smStudentAttendanceImports: many(smStudentAttendanceImports),
  smStudentCategories: many(smStudentCategories),
  smStudentCertificates: many(smStudentCertificates),
  smStudentDocuments: many(smStudentDocuments),
  smStudentExcelFormats: many(smStudentExcelFormats),
  smStudentGroups: many(smStudentGroups),
  smStudentHomeworks: many(smStudentHomeworks),
  smStudentIdCards: many(smStudentIdCards),
  smStudentPromotions_academicId: many(smStudentPromotions, {
    relationName: "smStudentPromotions_academicId_smAcademicYears_id",
  }),
  smStudentPromotions_currentSessionId: many(smStudentPromotions, {
    relationName: "smStudentPromotions_currentSessionId_smAcademicYears_id",
  }),
  smStudentPromotions_previousSessionId: many(smStudentPromotions, {
    relationName: "smStudentPromotions_previousSessionId_smAcademicYears_id",
  }),
  smStudentRegistrationFields: many(smStudentRegistrationFields),
  smStudentTakeOnlineExams: many(smStudentTakeOnlineExams),
  smStudentTakeOnlineExamQuestions: many(smStudentTakeOnlineExamQuestions),
  smStudentTakeOnlnExQuesOptions: many(smStudentTakeOnlnExQuesOptions),
  smStudentTimelines: many(smStudentTimelines),
  smSubjects: many(smSubjects),
  smSubjectAttendances: many(smSubjectAttendances),
  smSuppliers: many(smSuppliers),
  smTeacherUploadContents: many(smTeacherUploadContents),
  smTemporaryMeritlists: many(smTemporaryMeritlists),
  smToDos: many(smToDos),
  smUploadContents: many(smUploadContents),
  smUploadHomeworkContents: many(smUploadHomeworkContents),
  smUserLogs: many(smUserLogs),
  smVehicles: many(smVehicles),
  smVisitors: many(smVisitors),
  smWeekends: many(smWeekends),
  studentAcademicHistories: many(studentAcademicHistories),
  studentRatings: many(studentRatings),
  studentRecords_academicId: many(studentRecords, {
    relationName: "studentRecords_academicId_smAcademicYears_id",
  }),
  studentRecords_sessionId: many(studentRecords, {
    relationName: "studentRecords_sessionId_smAcademicYears_id",
  }),
  teacherRemarks: many(teacherRemarks),
  videoUploads: many(videoUploads),
}));

export const smClassesRelations = relations(smClasses, ({ one, many }) => ({
  chatGroups: many(chatGroups),
  graduates: many(graduates),
  learningObjectives: many(learningObjectives),
  lessonPlanners: many(lessonPlanners),
  smAdmissionQueries: many(smAdmissionQueries),
  smAssignClassTeachers: many(smAssignClassTeachers),
  smAssignSubjects: many(smAssignSubjects),
  smAcademicYear: one(smAcademicYears, {
    fields: [smClasses.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smClasses.schoolId],
    references: [smSchools.id],
  }),
  smClassRoutines: many(smClassRoutines),
  smClassRoutineUpdates: many(smClassRoutineUpdates),
  smClassSections: many(smClassSections),
  smExams: many(smExams),
  smExamAttendances: many(smExamAttendances),
  smExamAttendanceChildren: many(smExamAttendanceChildren),
  smExamSchedules: many(smExamSchedules),
  smExamSetups: many(smExamSetups),
  smHomeworks: many(smHomeworks),
  smLessons: many(smLessons),
  smLessonDetails: many(smLessonDetails),
  smLessonTopics: many(smLessonTopics),
  smMarksRegisters: many(smMarksRegisters),
  smMarkStores: many(smMarkStores),
  smOnlineExams: many(smOnlineExams),
  smQuestionBanks: many(smQuestionBanks),
  smResultStores: many(smResultStores),
  smSeatPlans: many(smSeatPlans),
  smStudents: many(smStudents),
  smStudentAttendances: many(smStudentAttendances),
  smStudentPromotions_currentClassId: many(smStudentPromotions, {
    relationName: "smStudentPromotions_currentClassId_smClasses_id",
  }),
  smStudentPromotions_previousClassId: many(smStudentPromotions, {
    relationName: "smStudentPromotions_previousClassId_smClasses_id",
  }),
  smSubjectAttendances: many(smSubjectAttendances),
  smTeacherUploadContents: many(smTeacherUploadContents),
  smTemporaryMeritlists: many(smTemporaryMeritlists),
  studentRecords: many(studentRecords),
}));

export const smSectionsRelations = relations(smSections, ({ one, many }) => ({
  chatGroups: many(chatGroups),
  graduates: many(graduates),
  lessonPlanners: many(lessonPlanners),
  smAssignClassTeachers: many(smAssignClassTeachers),
  smAssignSubjects: many(smAssignSubjects),
  smClassRoutines: many(smClassRoutines),
  smClassRoutineUpdates: many(smClassRoutineUpdates),
  smClassSections: many(smClassSections),
  smExams: many(smExams),
  smExamAttendances: many(smExamAttendances),
  smExamAttendanceChildren: many(smExamAttendanceChildren),
  smExamSchedules: many(smExamSchedules),
  smExamSetups: many(smExamSetups),
  smLessons: many(smLessons),
  smLessonDetails: many(smLessonDetails),
  smLessonTopics: many(smLessonTopics),
  smMarksRegisters: many(smMarksRegisters),
  smMarkStores: many(smMarkStores),
  smOnlineExams: many(smOnlineExams),
  smQuestionBanks: many(smQuestionBanks),
  smResultStores: many(smResultStores),
  smSeatPlans: many(smSeatPlans),
  smAcademicYear: one(smAcademicYears, {
    fields: [smSections.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smSections.schoolId],
    references: [smSchools.id],
  }),
  smStudents: many(smStudents),
  smStudentAttendances: many(smStudentAttendances),
  smStudentPromotions_currentSectionId: many(smStudentPromotions, {
    relationName: "smStudentPromotions_currentSectionId_smSections_id",
  }),
  smStudentPromotions_previousSectionId: many(smStudentPromotions, {
    relationName: "smStudentPromotions_previousSectionId_smSections_id",
  }),
  smSubjectAttendances: many(smSubjectAttendances),
  smTemporaryMeritlists: many(smTemporaryMeritlists),
  studentRecords: many(studentRecords),
}));

export const smSubjectsRelations = relations(smSubjects, ({ one, many }) => ({
  chatGroups: many(chatGroups),
  learningObjectives: many(learningObjectives),
  lessonPlanners: many(lessonPlanners),
  smAssignSubjects: many(smAssignSubjects),
  smClassRoutines: many(smClassRoutines),
  smClassRoutineUpdates: many(smClassRoutineUpdates),
  smExams: many(smExams),
  smExamAttendances: many(smExamAttendances),
  smExamMarksRegisters: many(smExamMarksRegisters),
  smExamSchedules: many(smExamSchedules),
  smExamScheduleSubjects: many(smExamScheduleSubjects),
  smExamSetups: many(smExamSetups),
  smHomeworks: many(smHomeworks),
  smLessons: many(smLessons),
  smLessonDetails: many(smLessonDetails),
  smLessonTopics: many(smLessonTopics),
  smMarksRegisterChildren: many(smMarksRegisterChildren),
  smMarkStores: many(smMarkStores),
  smOnlineExams: many(smOnlineExams),
  smOnlineExamMarks: many(smOnlineExamMarks),
  smOptionalSubjectAssigns: many(smOptionalSubjectAssigns),
  smResultStores: many(smResultStores),
  smSeatPlans: many(smSeatPlans),
  smStudentHomeworks: many(smStudentHomeworks),
  smAcademicYear: one(smAcademicYears, {
    fields: [smSubjects.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smSubjects.schoolId],
    references: [smSchools.id],
  }),
  smSubjectAttendances: many(smSubjectAttendances),
}));

export const smStaffsRelations = relations(smStaffs, ({ one, many }) => ({
  chatGroups: many(chatGroups),
  lessonPlanners: many(lessonPlanners),
  smAssignSubjects: many(smAssignSubjects),
  smClassRoutineUpdates: many(smClassRoutineUpdates),
  smClassTeachers: many(smClassTeachers),
  smExamSchedules: many(smExamSchedules),
  smHrPayrollGenerates: many(smHrPayrollGenerates),
  smProductPurchases: many(smProductPurchases),
  smHumanDepartment: one(smHumanDepartments, {
    fields: [smStaffs.departmentId],
    references: [smHumanDepartments.id],
  }),
  smDesignation: one(smDesignations, {
    fields: [smStaffs.designationId],
    references: [smDesignations.id],
  }),
  smBaseSetup: one(smBaseSetups, {
    fields: [smStaffs.genderId],
    references: [smBaseSetups.id],
  }),
  infixRole: one(infixRoles, {
    fields: [smStaffs.roleId],
    references: [infixRoles.id],
  }),
  smSchool: one(smSchools, {
    fields: [smStaffs.schoolId],
    references: [smSchools.id],
  }),
  user: one(users, {
    fields: [smStaffs.userId],
    references: [users.id],
  }),
  smStaffAttendanceImports: many(smStaffAttendanceImports),
  smStaffAttendences: many(smStaffAttendences),
  teacherRemarks: many(teacherRemarks),
}));

export const classAttendancesRelations = relations(classAttendances, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [classAttendances.academicId],
    references: [smAcademicYears.id],
  }),
  smExamType: one(smExamTypes, {
    fields: [classAttendances.examTypeId],
    references: [smExamTypes.id],
  }),
  smSchool: one(smSchools, {
    fields: [classAttendances.schoolId],
    references: [smSchools.id],
  }),
  smStudent: one(smStudents, {
    fields: [classAttendances.studentId],
    references: [smStudents.id],
  }),
}));

export const smExamTypesRelations = relations(smExamTypes, ({ one, many }) => ({
  classAttendances: many(classAttendances),
  learningObjectives: many(learningObjectives),
  smExams: many(smExams),
  smExamSchedules: many(smExamSchedules),
  smExamSetups: many(smExamSetups),
  smAcademicYear: one(smAcademicYears, {
    fields: [smExamTypes.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smExamTypes.schoolId],
    references: [smSchools.id],
  }),
  smMarkStores: many(smMarkStores),
  smResultStores: many(smResultStores),
  studentRatings: many(studentRatings),
  teacherRemarks: many(teacherRemarks),
}));

export const smStudentsRelations = relations(smStudents, ({ one, many }) => ({
  classAttendances: many(classAttendances),
  directFeesInstallmentAssigns: many(directFeesInstallmentAssigns),
  direFeesInstallmentChildPayments: many(direFeesInstallmentChildPayments),
  fmFeesInvoices: many(fmFeesInvoices),
  graduates: many(graduates),
  smBankPaymentSlips: many(smBankPaymentSlips),
  smExamAttendanceChildren: many(smExamAttendanceChildren),
  smExamMarksRegisters: many(smExamMarksRegisters),
  smFeesAssigns: many(smFeesAssigns),
  smFeesAssignDiscounts: many(smFeesAssignDiscounts),
  smFeesCarryForwards: many(smFeesCarryForwards),
  smFeesPayments: many(smFeesPayments),
  smHomeworkStudents: many(smHomeworkStudents),
  smMarksRegisters: many(smMarksRegisters),
  smMarksSendSms: many(smMarksSendSms),
  smMarkStores: many(smMarkStores),
  smOnlineExamMarks: many(smOnlineExamMarks),
  smOptionalSubjectAssigns: many(smOptionalSubjectAssigns),
  smResultStores: many(smResultStores),
  smAcademicYear_academicId: one(smAcademicYears, {
    fields: [smStudents.academicId],
    references: [smAcademicYears.id],
    relationName: "smStudents_academicId_smAcademicYears_id",
  }),
  smBaseSetup_bloodgroupId: one(smBaseSetups, {
    fields: [smStudents.bloodgroupId],
    references: [smBaseSetups.id],
    relationName: "smStudents_bloodgroupId_smBaseSetups_id",
  }),
  smClass: one(smClasses, {
    fields: [smStudents.classId],
    references: [smClasses.id],
  }),
  smDormitoryList: one(smDormitoryLists, {
    fields: [smStudents.dormitoryId],
    references: [smDormitoryLists.id],
  }),
  smBaseSetup_genderId: one(smBaseSetups, {
    fields: [smStudents.genderId],
    references: [smBaseSetups.id],
    relationName: "smStudents_genderId_smBaseSetups_id",
  }),
  smParent: one(smParents, {
    fields: [smStudents.parentId],
    references: [smParents.id],
  }),
  smBaseSetup_religionId: one(smBaseSetups, {
    fields: [smStudents.religionId],
    references: [smBaseSetups.id],
    relationName: "smStudents_religionId_smBaseSetups_id",
  }),
  infixRole: one(infixRoles, {
    fields: [smStudents.roleId],
    references: [infixRoles.id],
  }),
  smRoomList: one(smRoomLists, {
    fields: [smStudents.roomId],
    references: [smRoomLists.id],
  }),
  smRoute: one(smRoutes, {
    fields: [smStudents.routeListId],
    references: [smRoutes.id],
  }),
  smSchool: one(smSchools, {
    fields: [smStudents.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smStudents.sectionId],
    references: [smSections.id],
  }),
  smAcademicYear_sessionId: one(smAcademicYears, {
    fields: [smStudents.sessionId],
    references: [smAcademicYears.id],
    relationName: "smStudents_sessionId_smAcademicYears_id",
  }),
  smStudentCategory: one(smStudentCategories, {
    fields: [smStudents.studentCategoryId],
    references: [smStudentCategories.id],
  }),
  smStudentGroup: one(smStudentGroups, {
    fields: [smStudents.studentGroupId],
    references: [smStudentGroups.id],
  }),
  user: one(users, {
    fields: [smStudents.userId],
    references: [users.id],
  }),
  smVehicle: one(smVehicles, {
    fields: [smStudents.vechileId],
    references: [smVehicles.id],
  }),
  smStudentAttendances: many(smStudentAttendances),
  smStudentAttendanceImports: many(smStudentAttendanceImports),
  smStudentHomeworks: many(smStudentHomeworks),
  smStudentPromotions: many(smStudentPromotions),
  smStudentTakeOnlineExams: many(smStudentTakeOnlineExams),
  smSubjectAttendances: many(smSubjectAttendances),
  smUploadHomeworkContents: many(smUploadHomeworkContents),
  studentAcademicHistories: many(studentAcademicHistories),
  studentRatings: many(studentRatings),
  studentRecords: many(studentRecords),
  studentRecordTemporaries: many(studentRecordTemporaries),
  teacherRemarks: many(teacherRemarks),
}));

export const colorThemeRelations = relations(colorTheme, ({ one }) => ({
  color: one(colors, {
    fields: [colorTheme.colorId],
    references: [colors.id],
  }),
  theme: one(themes, {
    fields: [colorTheme.themeId],
    references: [themes.id],
  }),
}));

export const colorsRelations = relations(colors, ({ many }) => ({
  colorThemes: many(colorTheme),
}));

export const themesRelations = relations(themes, ({ one, many }) => ({
  colorThemes: many(colorTheme),
  smSchool: one(smSchools, {
    fields: [themes.schoolId],
    references: [smSchools.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [comments.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [comments.schoolId],
    references: [smSchools.id],
  }),
  commentPivots: many(commentPivots),
}));

export const commentPivotsRelations = relations(commentPivots, ({ one }) => ({
  comment: one(comments, {
    fields: [commentPivots.commentId],
    references: [comments.id],
  }),
  commentTag: one(commentTags, {
    fields: [commentPivots.commentTagId],
    references: [commentTags.id],
  }),
}));

export const commentTagsRelations = relations(commentTags, ({ one, many }) => ({
  commentPivots: many(commentPivots),
  smAcademicYear: one(smAcademicYears, {
    fields: [commentTags.academicId],
    references: [smAcademicYears.id],
  }),
}));

export const contentsRelations = relations(contents, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [contents.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [contents.schoolId],
    references: [smSchools.id],
  }),
}));

export const contentShareListsRelations = relations(contentShareLists, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [contentShareLists.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [contentShareLists.schoolId],
    references: [smSchools.id],
  }),
}));

export const contentTypesRelations = relations(contentTypes, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [contentTypes.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [contentTypes.schoolId],
    references: [smSchools.id],
  }),
}));

export const continentsRelations = relations(continents, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [continents.schoolId],
    references: [smSchools.id],
  }),
}));

export const continetsRelations = relations(continets, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [continets.schoolId],
    references: [smSchools.id],
  }),
}));

export const countriesRelations = relations(countries, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [countries.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [countries.schoolId],
    references: [smSchools.id],
  }),
}));

export const customResultSettingsRelations = relations(customResultSettings, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [customResultSettings.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [customResultSettings.schoolId],
    references: [smSchools.id],
  }),
}));

export const directFeesInstallmentsRelations = relations(directFeesInstallments, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [directFeesInstallments.schoolId],
    references: [smSchools.id],
  }),
}));

export const directFeesInstallmentAssignsRelations = relations(directFeesInstallmentAssigns, ({ one }) => ({
  smBankAccount: one(smBankAccounts, {
    fields: [directFeesInstallmentAssigns.bankId],
    references: [smBankAccounts.id],
  }),
  smFeesDiscount: one(smFeesDiscounts, {
    fields: [directFeesInstallmentAssigns.feesDiscountId],
    references: [smFeesDiscounts.id],
  }),
  smFeesType: one(smFeesTypes, {
    fields: [directFeesInstallmentAssigns.feesTypeId],
    references: [smFeesTypes.id],
  }),
  smSchool: one(smSchools, {
    fields: [directFeesInstallmentAssigns.schoolId],
    references: [smSchools.id],
  }),
  smStudent: one(smStudents, {
    fields: [directFeesInstallmentAssigns.studentId],
    references: [smStudents.id],
  }),
}));

export const smBankAccountsRelations = relations(smBankAccounts, ({ one, many }) => ({
  directFeesInstallmentAssigns: many(directFeesInstallmentAssigns),
  direFeesInstallmentChildPayments: many(direFeesInstallmentChildPayments),
  smAddIncomes: many(smAddIncomes),
  smAcademicYear: one(smAcademicYears, {
    fields: [smBankAccounts.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smBankAccounts.schoolId],
    references: [smSchools.id],
  }),
  smFeesPayments: many(smFeesPayments),
}));

export const smFeesDiscountsRelations = relations(smFeesDiscounts, ({ one, many }) => ({
  directFeesInstallmentAssigns: many(directFeesInstallmentAssigns),
  smBankPaymentSlips: many(smBankPaymentSlips),
  smFeesAssigns: many(smFeesAssigns),
  smFeesAssignDiscounts: many(smFeesAssignDiscounts),
  smAcademicYear: one(smAcademicYears, {
    fields: [smFeesDiscounts.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smFeesDiscounts.schoolId],
    references: [smSchools.id],
  }),
  smFeesPayments: many(smFeesPayments),
}));

export const smFeesTypesRelations = relations(smFeesTypes, ({ one, many }) => ({
  directFeesInstallmentAssigns: many(directFeesInstallmentAssigns),
  direFeesInstallmentChildPayments: many(direFeesInstallmentChildPayments),
  smFeesMasters: many(smFeesMasters),
  smFeesPayments: many(smFeesPayments),
  smAcademicYear: one(smAcademicYears, {
    fields: [smFeesTypes.academicId],
    references: [smAcademicYears.id],
  }),
  smFeesGroup: one(smFeesGroups, {
    fields: [smFeesTypes.feesGroupId],
    references: [smFeesGroups.id],
  }),
  smSchool: one(smSchools, {
    fields: [smFeesTypes.schoolId],
    references: [smSchools.id],
  }),
}));

export const directFeesRemindersRelations = relations(directFeesReminders, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [directFeesReminders.schoolId],
    references: [smSchools.id],
  }),
}));

export const directFeesSettingsRelations = relations(directFeesSettings, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [directFeesSettings.schoolId],
    references: [smSchools.id],
  }),
}));

export const direFeesInstallmentChildPaymentsRelations = relations(
  direFeesInstallmentChildPayments,
  ({ one }) => ({
    smBankAccount: one(smBankAccounts, {
      fields: [direFeesInstallmentChildPayments.bankId],
      references: [smBankAccounts.id],
    }),
    smFeesType: one(smFeesTypes, {
      fields: [direFeesInstallmentChildPayments.feesTypeId],
      references: [smFeesTypes.id],
    }),
    smSchool: one(smSchools, {
      fields: [direFeesInstallmentChildPayments.schoolId],
      references: [smSchools.id],
    }),
    smStudent: one(smStudents, {
      fields: [direFeesInstallmentChildPayments.studentId],
      references: [smStudents.id],
    }),
  })
);

export const dueFeesLoginPreventsRelations = relations(dueFeesLoginPrevents, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [dueFeesLoginPrevents.academicId],
    references: [smAcademicYears.id],
  }),
  infixRole: one(infixRoles, {
    fields: [dueFeesLoginPrevents.roleId],
    references: [infixRoles.id],
  }),
  smSchool: one(smSchools, {
    fields: [dueFeesLoginPrevents.schoolId],
    references: [smSchools.id],
  }),
  user: one(users, {
    fields: [dueFeesLoginPrevents.userId],
    references: [users.id],
  }),
}));

export const infixRolesRelations = relations(infixRoles, ({ one, many }) => ({
  dueFeesLoginPrevents: many(dueFeesLoginPrevents),
  infixPermissionAssigns: many(infixPermissionAssigns),
  smSchool: one(smSchools, {
    fields: [infixRoles.schoolId],
    references: [smSchools.id],
  }),
  smStaffs: many(smStaffs),
  smStudents: many(smStudents),
  smUserLogs: many(smUserLogs),
  users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  dueFeesLoginPrevents: many(dueFeesLoginPrevents),
  feesInvoiceSettings_createdBy: many(feesInvoiceSettings, {
    relationName: "feesInvoiceSettings_createdBy_users_id",
  }),
  feesInvoiceSettings_updatedBy: many(feesInvoiceSettings, {
    relationName: "feesInvoiceSettings_updatedBy_users_id",
  }),
  infixModuleInfos_createdBy: many(infixModuleInfos, {
    relationName: "infixModuleInfos_createdBy_users_id",
  }),
  infixModuleInfos_updatedBy: many(infixModuleInfos, {
    relationName: "infixModuleInfos_updatedBy_users_id",
  }),
  infixModuleStudentParentInfos_createdBy: many(infixModuleStudentParentInfos, {
    relationName: "infixModuleStudentParentInfos_createdBy_users_id",
  }),
  infixModuleStudentParentInfos_updatedBy: many(infixModuleStudentParentInfos, {
    relationName: "infixModuleStudentParentInfos_updatedBy_users_id",
  }),
  invoiceSettings_createdBy: many(invoiceSettings, {
    relationName: "invoiceSettings_createdBy_users_id",
  }),
  invoiceSettings_updatedBy: many(invoiceSettings, {
    relationName: "invoiceSettings_updatedBy_users_id",
  }),
  sidebars: many(sidebars),
  smBookIssues: many(smBookIssues),
  smHomeworks: many(smHomeworks),
  smHumanDepartments_createdBy: many(smHumanDepartments, {
    relationName: "smHumanDepartments_createdBy_users_id",
  }),
  smHumanDepartments_updatedBy: many(smHumanDepartments, {
    relationName: "smHumanDepartments_updatedBy_users_id",
  }),
  smLeaveDefines: many(smLeaveDefines),
  smLeaveRequests: many(smLeaveRequests),
  smLibraryMembers: many(smLibraryMembers),
  smModuleLinks_createdBy: many(smModuleLinks, {
    relationName: "smModuleLinks_createdBy_users_id",
  }),
  smModuleLinks_updatedBy: many(smModuleLinks, {
    relationName: "smModuleLinks_updatedBy_users_id",
  }),
  smNewsComments: many(smNewsComments),
  smNewsPages_createdBy: many(smNewsPages, {
    relationName: "smNewsPages_createdBy_users_id",
  }),
  smNewsPages_updatedBy: many(smNewsPages, {
    relationName: "smNewsPages_updatedBy_users_id",
  }),
  smParents: many(smParents),
  smProductPurchases: many(smProductPurchases),
  smStaffs: many(smStaffs),
  smStudents: many(smStudents),
  smStudentHomeworks: many(smStudentHomeworks),
  smUserLogs: many(smUserLogs),
  staffImportBulkTemporaries: many(staffImportBulkTemporaries),
  transcations: many(transcations),
  infixRole: one(infixRoles, {
    fields: [users.roleId],
    references: [infixRoles.id],
  }),
  smSchool: one(smSchools, {
    fields: [users.schoolId],
    references: [smSchools.id],
  }),
  userOtpCodes: many(userOtpCodes),
  walletTransactions: many(walletTransactions),
}));

export const examStepSkipsRelations = relations(examStepSkips, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [examStepSkips.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [examStepSkips.schoolId],
    references: [smSchools.id],
  }),
}));

export const feesCarryForwardLogsRelations = relations(feesCarryForwardLogs, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [feesCarryForwardLogs.schoolId],
    references: [smSchools.id],
  }),
}));

export const feesCarryForwardSettingsRelations = relations(feesCarryForwardSettings, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [feesCarryForwardSettings.schoolId],
    references: [smSchools.id],
  }),
}));

export const feesInvoicesRelations = relations(feesInvoices, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [feesInvoices.schoolId],
    references: [smSchools.id],
  }),
}));

export const feesInvoiceSettingsRelations = relations(feesInvoiceSettings, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [feesInvoiceSettings.academicId],
    references: [smAcademicYears.id],
  }),
  user_createdBy: one(users, {
    fields: [feesInvoiceSettings.createdBy],
    references: [users.id],
    relationName: "feesInvoiceSettings_createdBy_users_id",
  }),
  smSchool: one(smSchools, {
    fields: [feesInvoiceSettings.schoolId],
    references: [smSchools.id],
  }),
  user_updatedBy: one(users, {
    fields: [feesInvoiceSettings.updatedBy],
    references: [users.id],
    relationName: "feesInvoiceSettings_updatedBy_users_id",
  }),
}));

export const fmFeesInvoicesRelations = relations(fmFeesInvoices, ({ one, many }) => ({
  smStudent: one(smStudents, {
    fields: [fmFeesInvoices.studentId],
    references: [smStudents.id],
  }),
  fmFeesInvoiceChields: many(fmFeesInvoiceChields),
  fmFeesTransactions: many(fmFeesTransactions),
  fmFeesWeavers: many(fmFeesWeavers),
}));

export const fmFeesInvoiceChieldsRelations = relations(fmFeesInvoiceChields, ({ one }) => ({
  fmFeesInvoice: one(fmFeesInvoices, {
    fields: [fmFeesInvoiceChields.feesInvoiceId],
    references: [fmFeesInvoices.id],
  }),
}));

export const fmFeesTransactionsRelations = relations(fmFeesTransactions, ({ one, many }) => ({
  fmFeesInvoice: one(fmFeesInvoices, {
    fields: [fmFeesTransactions.feesInvoiceId],
    references: [fmFeesInvoices.id],
  }),
  fmFeesTransactionChields: many(fmFeesTransactionChields),
}));

export const fmFeesTransactionChieldsRelations = relations(fmFeesTransactionChields, ({ one }) => ({
  fmFeesTransaction: one(fmFeesTransactions, {
    fields: [fmFeesTransactionChields.feesTransactionId],
    references: [fmFeesTransactions.id],
  }),
}));

export const fmFeesWeaversRelations = relations(fmFeesWeavers, ({ one }) => ({
  fmFeesInvoice: one(fmFeesInvoices, {
    fields: [fmFeesWeavers.feesInvoiceId],
    references: [fmFeesInvoices.id],
  }),
}));

export const frontendExamResultsRelations = relations(frontendExamResults, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [frontendExamResults.schoolId],
    references: [smSchools.id],
  }),
}));

export const frontAcademicCalendarsRelations = relations(frontAcademicCalendars, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [frontAcademicCalendars.schoolId],
    references: [smSchools.id],
  }),
}));

export const frontClassRoutinesRelations = relations(frontClassRoutines, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [frontClassRoutines.schoolId],
    references: [smSchools.id],
  }),
}));

export const frontExamRoutinesRelations = relations(frontExamRoutines, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [frontExamRoutines.schoolId],
    references: [smSchools.id],
  }),
}));

export const frontResultsRelations = relations(frontResults, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [frontResults.schoolId],
    references: [smSchools.id],
  }),
}));

export const graduatesRelations = relations(graduates, ({ one }) => ({
  smClass: one(smClasses, {
    fields: [graduates.classId],
    references: [smClasses.id],
  }),
  smSchool: one(smSchools, {
    fields: [graduates.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [graduates.sectionId],
    references: [smSections.id],
  }),
  smSession: one(smSessions, {
    fields: [graduates.sessionId],
    references: [smSessions.id],
  }),
  smStudent: one(smStudents, {
    fields: [graduates.studentId],
    references: [smStudents.id],
  }),
}));

export const smSessionsRelations = relations(smSessions, ({ one, many }) => ({
  graduates: many(graduates),
  smSchool: one(smSchools, {
    fields: [smSessions.schoolId],
    references: [smSchools.id],
  }),
}));

export const homeSlidersRelations = relations(homeSliders, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [homeSliders.schoolId],
    references: [smSchools.id],
  }),
}));

export const incidentsRelations = relations(incidents, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [incidents.schoolId],
    references: [smSchools.id],
  }),
}));

export const infixeduPagesRelations = relations(infixeduPages, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [infixeduPages.schoolId],
    references: [smSchools.id],
  }),
}));

export const infixModuleInfosRelations = relations(infixModuleInfos, ({ one }) => ({
  user_createdBy: one(users, {
    fields: [infixModuleInfos.createdBy],
    references: [users.id],
    relationName: "infixModuleInfos_createdBy_users_id",
  }),
  smSchool: one(smSchools, {
    fields: [infixModuleInfos.schoolId],
    references: [smSchools.id],
  }),
  user_updatedBy: one(users, {
    fields: [infixModuleInfos.updatedBy],
    references: [users.id],
    relationName: "infixModuleInfos_updatedBy_users_id",
  }),
}));

export const infixModuleStudentParentInfosRelations = relations(infixModuleStudentParentInfos, ({ one }) => ({
  user_createdBy: one(users, {
    fields: [infixModuleStudentParentInfos.createdBy],
    references: [users.id],
    relationName: "infixModuleStudentParentInfos_createdBy_users_id",
  }),
  smSchool: one(smSchools, {
    fields: [infixModuleStudentParentInfos.schoolId],
    references: [smSchools.id],
  }),
  user_updatedBy: one(users, {
    fields: [infixModuleStudentParentInfos.updatedBy],
    references: [users.id],
    relationName: "infixModuleStudentParentInfos_updatedBy_users_id",
  }),
}));

export const infixPermissionAssignsRelations = relations(infixPermissionAssigns, ({ one }) => ({
  infixRole: one(infixRoles, {
    fields: [infixPermissionAssigns.roleId],
    references: [infixRoles.id],
  }),
  smSchool: one(smSchools, {
    fields: [infixPermissionAssigns.schoolId],
    references: [smSchools.id],
  }),
}));

export const invoiceSettingsRelations = relations(invoiceSettings, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [invoiceSettings.academicId],
    references: [smAcademicYears.id],
  }),
  user_createdBy: one(users, {
    fields: [invoiceSettings.createdBy],
    references: [users.id],
    relationName: "invoiceSettings_createdBy_users_id",
  }),
  smSchool: one(smSchools, {
    fields: [invoiceSettings.schoolId],
    references: [smSchools.id],
  }),
  user_updatedBy: one(users, {
    fields: [invoiceSettings.updatedBy],
    references: [users.id],
    relationName: "invoiceSettings_updatedBy_users_id",
  }),
}));

export const languagesRelations = relations(languages, ({ one, many }) => ({
  smSchool: one(smSchools, {
    fields: [languages.schoolId],
    references: [smSchools.id],
  }),
  smLanguages: many(smLanguages),
}));

export const learningObjectivesRelations = relations(learningObjectives, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [learningObjectives.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [learningObjectives.classId],
    references: [smClasses.id],
  }),
  smExamType: one(smExamTypes, {
    fields: [learningObjectives.examTypeId],
    references: [smExamTypes.id],
  }),
  smSubject: one(smSubjects, {
    fields: [learningObjectives.subjectId],
    references: [smSubjects.id],
  }),
}));

export const lessonPlannersRelations = relations(lessonPlanners, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [lessonPlanners.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [lessonPlanners.classId],
    references: [smClasses.id],
  }),
  smClassTime: one(smClassTimes, {
    fields: [lessonPlanners.classPeriodId],
    references: [smClassTimes.id],
  }),
  smClassRoom: one(smClassRooms, {
    fields: [lessonPlanners.roomId],
    references: [smClassRooms.id],
  }),
  smSchool: one(smSchools, {
    fields: [lessonPlanners.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [lessonPlanners.sectionId],
    references: [smSections.id],
  }),
  smSubject: one(smSubjects, {
    fields: [lessonPlanners.subjectId],
    references: [smSubjects.id],
  }),
  smStaff: one(smStaffs, {
    fields: [lessonPlanners.teacherId],
    references: [smStaffs.id],
  }),
  lessonPlanTopics: many(lessonPlanTopics),
}));

export const smClassTimesRelations = relations(smClassTimes, ({ one, many }) => ({
  lessonPlanners: many(lessonPlanners),
  smClassRoutineUpdates: many(smClassRoutineUpdates),
  smAcademicYear: one(smAcademicYears, {
    fields: [smClassTimes.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smClassTimes.schoolId],
    references: [smSchools.id],
  }),
  smExamSchedules: many(smExamSchedules),
}));

export const smClassRoomsRelations = relations(smClassRooms, ({ one, many }) => ({
  lessonPlanners: many(lessonPlanners),
  smAcademicYear: one(smAcademicYears, {
    fields: [smClassRooms.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smClassRooms.schoolId],
    references: [smSchools.id],
  }),
  smClassRoutineUpdates: many(smClassRoutineUpdates),
}));

export const lessonPlanTopicsRelations = relations(lessonPlanTopics, ({ one }) => ({
  lessonPlanner: one(lessonPlanners, {
    fields: [lessonPlanTopics.lessonPlannerId],
    references: [lessonPlanners.id],
  }),
  smLessonTopicDetail: one(smLessonTopicDetails, {
    fields: [lessonPlanTopics.topicId],
    references: [smLessonTopicDetails.id],
  }),
}));

export const smLessonTopicDetailsRelations = relations(smLessonTopicDetails, ({ one, many }) => ({
  lessonPlanTopics: many(lessonPlanTopics),
  smAcademicYear: one(smAcademicYears, {
    fields: [smLessonTopicDetails.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smLessonTopicDetails.schoolId],
    references: [smSchools.id],
  }),
  smLessonTopic: one(smLessonTopics, {
    fields: [smLessonTopicDetails.topicId],
    references: [smLessonTopics.id],
  }),
}));

export const librarySubjectsRelations = relations(librarySubjects, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [librarySubjects.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [librarySubjects.schoolId],
    references: [smSchools.id],
  }),
}));

export const maintenanceSettingsRelations = relations(maintenanceSettings, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [maintenanceSettings.schoolId],
    references: [smSchools.id],
  }),
}));

export const newslettersRelations = relations(newsletters, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [newsletters.schoolId],
    references: [smSchools.id],
  }),
}));

export const payrollPaymentsRelations = relations(payrollPayments, ({ one }) => ({
  smHrPayrollGenerate: one(smHrPayrollGenerates, {
    fields: [payrollPayments.smHrPayrollGenerateId],
    references: [smHrPayrollGenerates.id],
  }),
}));

export const smHrPayrollGeneratesRelations = relations(smHrPayrollGenerates, ({ one, many }) => ({
  payrollPayments: many(payrollPayments),
  smHrPayrollEarnDeducs: many(smHrPayrollEarnDeducs),
  smAcademicYear: one(smAcademicYears, {
    fields: [smHrPayrollGenerates.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smHrPayrollGenerates.schoolId],
    references: [smSchools.id],
  }),
  smStaff: one(smStaffs, {
    fields: [smHrPayrollGenerates.staffId],
    references: [smStaffs.id],
  }),
}));

export const permissionsRelations = relations(permissions, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [permissions.schoolId],
    references: [smSchools.id],
  }),
}));

export const permissionSectionsRelations = relations(permissionSections, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [permissionSections.schoolId],
    references: [smSchools.id],
  }),
}));

export const pluginsRelations = relations(plugins, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [plugins.schoolId],
    references: [smSchools.id],
  }),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  smSchool: one(smSchools, {
    fields: [roles.schoolId],
    references: [smSchools.id],
  }),
  smDashboardSettings: many(smDashboardSettings),
  smItemIssues: many(smItemIssues),
  smItemSells: many(smItemSells),
  smLeaveDefines: many(smLeaveDefines),
  smLeaveRequests: many(smLeaveRequests),
  smLibraryMembers: many(smLibraryMembers),
  smModulePermissionAssigns: many(smModulePermissionAssigns),
  smRolePermissions: many(smRolePermissions),
}));

export const schoolModulesRelations = relations(schoolModules, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [schoolModules.schoolId],
    references: [smSchools.id],
  }),
}));

export const sidebarsRelations = relations(sidebars, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [sidebars.schoolId],
    references: [smSchools.id],
  }),
  user: one(users, {
    fields: [sidebars.userId],
    references: [users.id],
  }),
}));

export const smsTemplatesRelations = relations(smsTemplates, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smsTemplates.schoolId],
    references: [smSchools.id],
  }),
}));

export const smAboutPagesRelations = relations(smAboutPages, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smAboutPages.schoolId],
    references: [smSchools.id],
  }),
}));

export const smAddExpensesRelations = relations(smAddExpenses, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smAddExpenses.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smAddExpenses.schoolId],
    references: [smSchools.id],
  }),
}));

export const smAddIncomesRelations = relations(smAddIncomes, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smAddIncomes.academicId],
    references: [smAcademicYears.id],
  }),
  smBankAccount: one(smBankAccounts, {
    fields: [smAddIncomes.accountId],
    references: [smBankAccounts.id],
  }),
  smPaymentMethhod: one(smPaymentMethhods, {
    fields: [smAddIncomes.paymentMethodId],
    references: [smPaymentMethhods.id],
  }),
  smSchool: one(smSchools, {
    fields: [smAddIncomes.schoolId],
    references: [smSchools.id],
  }),
}));

export const smPaymentMethhodsRelations = relations(smPaymentMethhods, ({ one, many }) => ({
  smAddIncomes: many(smAddIncomes),
  smPaymentGatewaySetting: one(smPaymentGatewaySettings, {
    fields: [smPaymentMethhods.gatewayId],
    references: [smPaymentGatewaySettings.id],
  }),
  smSchool: one(smSchools, {
    fields: [smPaymentMethhods.schoolId],
    references: [smSchools.id],
  }),
}));

export const smAdmissionQueriesRelations = relations(smAdmissionQueries, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smAdmissionQueries.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smAdmissionQueries.class],
    references: [smClasses.id],
  }),
  smSchool: one(smSchools, {
    fields: [smAdmissionQueries.schoolId],
    references: [smSchools.id],
  }),
  smAdmissionQueryFollowups: many(smAdmissionQueryFollowups),
}));

export const smAdmissionQueryFollowupsRelations = relations(smAdmissionQueryFollowups, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smAdmissionQueryFollowups.academicId],
    references: [smAcademicYears.id],
  }),
  smAdmissionQuery: one(smAdmissionQueries, {
    fields: [smAdmissionQueryFollowups.admissionQueryId],
    references: [smAdmissionQueries.id],
  }),
  smSchool: one(smSchools, {
    fields: [smAdmissionQueryFollowups.schoolId],
    references: [smSchools.id],
  }),
}));

export const smAmountTransfersRelations = relations(smAmountTransfers, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smAmountTransfers.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smAmountTransfers.schoolId],
    references: [smSchools.id],
  }),
}));

export const smAssignClassTeachersRelations = relations(smAssignClassTeachers, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smAssignClassTeachers.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smAssignClassTeachers.classId],
    references: [smClasses.id],
  }),
  smSchool: one(smSchools, {
    fields: [smAssignClassTeachers.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smAssignClassTeachers.sectionId],
    references: [smSections.id],
  }),
  smClassTeachers: many(smClassTeachers),
}));

export const smAssignSubjectsRelations = relations(smAssignSubjects, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smAssignSubjects.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smAssignSubjects.classId],
    references: [smClasses.id],
  }),
  smSchool: one(smSchools, {
    fields: [smAssignSubjects.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smAssignSubjects.sectionId],
    references: [smSections.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smAssignSubjects.subjectId],
    references: [smSubjects.id],
  }),
  smStaff: one(smStaffs, {
    fields: [smAssignSubjects.teacherId],
    references: [smStaffs.id],
  }),
}));

export const smAssignVehiclesRelations = relations(smAssignVehicles, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smAssignVehicles.academicId],
    references: [smAcademicYears.id],
  }),
  smRoute: one(smRoutes, {
    fields: [smAssignVehicles.routeId],
    references: [smRoutes.id],
  }),
  smSchool: one(smSchools, {
    fields: [smAssignVehicles.schoolId],
    references: [smSchools.id],
  }),
  smVehicle: one(smVehicles, {
    fields: [smAssignVehicles.vehicleId],
    references: [smVehicles.id],
  }),
}));

export const smRoutesRelations = relations(smRoutes, ({ one, many }) => ({
  smAssignVehicles: many(smAssignVehicles),
  smAcademicYear: one(smAcademicYears, {
    fields: [smRoutes.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smRoutes.schoolId],
    references: [smSchools.id],
  }),
  smStudents: many(smStudents),
}));

export const smVehiclesRelations = relations(smVehicles, ({ one, many }) => ({
  smAssignVehicles: many(smAssignVehicles),
  smStudents: many(smStudents),
  smAcademicYear: one(smAcademicYears, {
    fields: [smVehicles.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smVehicles.schoolId],
    references: [smSchools.id],
  }),
}));

export const smBackgroundSettingsRelations = relations(smBackgroundSettings, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smBackgroundSettings.schoolId],
    references: [smSchools.id],
  }),
}));

export const smBackupsRelations = relations(smBackups, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smBackups.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smBackups.schoolId],
    references: [smSchools.id],
  }),
}));

export const smBankPaymentSlipsRelations = relations(smBankPaymentSlips, ({ one }) => ({
  smFeesDiscount: one(smFeesDiscounts, {
    fields: [smBankPaymentSlips.feesDiscountId],
    references: [smFeesDiscounts.id],
  }),
  smSchool: one(smSchools, {
    fields: [smBankPaymentSlips.schoolId],
    references: [smSchools.id],
  }),
  smStudent: one(smStudents, {
    fields: [smBankPaymentSlips.studentId],
    references: [smStudents.id],
  }),
}));

export const smBaseGroupsRelations = relations(smBaseGroups, ({ one, many }) => ({
  smSchool: one(smSchools, {
    fields: [smBaseGroups.schoolId],
    references: [smSchools.id],
  }),
  smBaseSetups: many(smBaseSetups),
}));

export const smBaseSetupsRelations = relations(smBaseSetups, ({ one, many }) => ({
  smBaseGroup: one(smBaseGroups, {
    fields: [smBaseSetups.baseGroupId],
    references: [smBaseGroups.id],
  }),
  smSchool: one(smSchools, {
    fields: [smBaseSetups.schoolId],
    references: [smSchools.id],
  }),
  smDonors_bloodgroupId: many(smDonors, {
    relationName: "smDonors_bloodgroupId_smBaseSetups_id",
  }),
  smDonors_genderId: many(smDonors, {
    relationName: "smDonors_genderId_smBaseSetups_id",
  }),
  smDonors_religionId: many(smDonors, {
    relationName: "smDonors_religionId_smBaseSetups_id",
  }),
  smStaffs: many(smStaffs),
  smStudents_bloodgroupId: many(smStudents, {
    relationName: "smStudents_bloodgroupId_smBaseSetups_id",
  }),
  smStudents_genderId: many(smStudents, {
    relationName: "smStudents_genderId_smBaseSetups_id",
  }),
  smStudents_religionId: many(smStudents, {
    relationName: "smStudents_religionId_smBaseSetups_id",
  }),
}));

export const smBooksRelations = relations(smBooks, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smBooks.academicId],
    references: [smAcademicYears.id],
  }),
  smBookCategory: one(smBookCategories, {
    fields: [smBooks.bookCategoryId],
    references: [smBookCategories.id],
  }),
  smSchool: one(smSchools, {
    fields: [smBooks.schoolId],
    references: [smSchools.id],
  }),
  smBookIssues: many(smBookIssues),
}));

export const smBookCategoriesRelations = relations(smBookCategories, ({ one, many }) => ({
  smBooks: many(smBooks),
  smAcademicYear: one(smAcademicYears, {
    fields: [smBookCategories.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smBookCategories.schoolId],
    references: [smSchools.id],
  }),
}));

export const smBookIssuesRelations = relations(smBookIssues, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smBookIssues.academicId],
    references: [smAcademicYears.id],
  }),
  smBook: one(smBooks, {
    fields: [smBookIssues.bookId],
    references: [smBooks.id],
  }),
  user: one(users, {
    fields: [smBookIssues.memberId],
    references: [users.id],
  }),
  smSchool: one(smSchools, {
    fields: [smBookIssues.schoolId],
    references: [smSchools.id],
  }),
}));

export const smCalendarSettingsRelations = relations(smCalendarSettings, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smCalendarSettings.schoolId],
    references: [smSchools.id],
  }),
}));

export const smChartOfAccountsRelations = relations(smChartOfAccounts, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smChartOfAccounts.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smChartOfAccounts.schoolId],
    references: [smSchools.id],
  }),
}));

export const smClassExamRoutinePagesRelations = relations(smClassExamRoutinePages, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smClassExamRoutinePages.schoolId],
    references: [smSchools.id],
  }),
}));

export const smClassOptionalSubjectRelations = relations(smClassOptionalSubject, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smClassOptionalSubject.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smClassOptionalSubject.schoolId],
    references: [smSchools.id],
  }),
}));

export const smClassRoutinesRelations = relations(smClassRoutines, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smClassRoutines.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smClassRoutines.classId],
    references: [smClasses.id],
  }),
  smSchool: one(smSchools, {
    fields: [smClassRoutines.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smClassRoutines.sectionId],
    references: [smSections.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smClassRoutines.subjectId],
    references: [smSubjects.id],
  }),
}));

export const smClassRoutineUpdatesRelations = relations(smClassRoutineUpdates, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smClassRoutineUpdates.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smClassRoutineUpdates.classId],
    references: [smClasses.id],
  }),
  smClassTime: one(smClassTimes, {
    fields: [smClassRoutineUpdates.classPeriodId],
    references: [smClassTimes.id],
  }),
  smClassRoom: one(smClassRooms, {
    fields: [smClassRoutineUpdates.roomId],
    references: [smClassRooms.id],
  }),
  smSchool: one(smSchools, {
    fields: [smClassRoutineUpdates.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smClassRoutineUpdates.sectionId],
    references: [smSections.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smClassRoutineUpdates.subjectId],
    references: [smSubjects.id],
  }),
  smStaff: one(smStaffs, {
    fields: [smClassRoutineUpdates.teacherId],
    references: [smStaffs.id],
  }),
}));

export const smClassSectionsRelations = relations(smClassSections, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smClassSections.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smClassSections.classId],
    references: [smClasses.id],
  }),
  smSchool: one(smSchools, {
    fields: [smClassSections.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smClassSections.sectionId],
    references: [smSections.id],
  }),
}));

export const smClassTeachersRelations = relations(smClassTeachers, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smClassTeachers.academicId],
    references: [smAcademicYears.id],
  }),
  smAssignClassTeacher: one(smAssignClassTeachers, {
    fields: [smClassTeachers.assignClassTeacherId],
    references: [smAssignClassTeachers.id],
  }),
  smSchool: one(smSchools, {
    fields: [smClassTeachers.schoolId],
    references: [smSchools.id],
  }),
  smStaff: one(smStaffs, {
    fields: [smClassTeachers.teacherId],
    references: [smStaffs.id],
  }),
}));

export const smComplaintsRelations = relations(smComplaints, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smComplaints.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smComplaints.schoolId],
    references: [smSchools.id],
  }),
}));

export const smContactMessagesRelations = relations(smContactMessages, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smContactMessages.schoolId],
    references: [smSchools.id],
  }),
}));

export const smContactPagesRelations = relations(smContactPages, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smContactPages.schoolId],
    references: [smSchools.id],
  }),
}));

export const smContentTypesRelations = relations(smContentTypes, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smContentTypes.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smContentTypes.schoolId],
    references: [smSchools.id],
  }),
}));

export const smCountriesRelations = relations(smCountries, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smCountries.schoolId],
    references: [smSchools.id],
  }),
}));

export const smCoursesRelations = relations(smCourses, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smCourses.schoolId],
    references: [smSchools.id],
  }),
}));

export const smCoursePagesRelations = relations(smCoursePages, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smCoursePages.schoolId],
    references: [smSchools.id],
  }),
}));

export const smCurrenciesRelations = relations(smCurrencies, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smCurrencies.schoolId],
    references: [smSchools.id],
  }),
}));

export const smCustomLinksRelations = relations(smCustomLinks, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smCustomLinks.schoolId],
    references: [smSchools.id],
  }),
}));

export const smCustomTemporaryResultsRelations = relations(smCustomTemporaryResults, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smCustomTemporaryResults.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smCustomTemporaryResults.schoolId],
    references: [smSchools.id],
  }),
}));

export const smDashboardSettingsRelations = relations(smDashboardSettings, ({ one }) => ({
  role: one(roles, {
    fields: [smDashboardSettings.roleId],
    references: [roles.id],
  }),
  smSchool: one(smSchools, {
    fields: [smDashboardSettings.schoolId],
    references: [smSchools.id],
  }),
}));

export const smDateFormatsRelations = relations(smDateFormats, ({ one, many }) => ({
  smSchool: one(smSchools, {
    fields: [smDateFormats.schoolId],
    references: [smSchools.id],
  }),
  smGeneralSettings: many(smGeneralSettings),
}));

export const smDesignationsRelations = relations(smDesignations, ({ one, many }) => ({
  smSchool: one(smSchools, {
    fields: [smDesignations.schoolId],
    references: [smSchools.id],
  }),
  smStaffs: many(smStaffs),
}));

export const smDonorsRelations = relations(smDonors, ({ one }) => ({
  smBaseSetup_bloodgroupId: one(smBaseSetups, {
    fields: [smDonors.bloodgroupId],
    references: [smBaseSetups.id],
    relationName: "smDonors_bloodgroupId_smBaseSetups_id",
  }),
  smBaseSetup_genderId: one(smBaseSetups, {
    fields: [smDonors.genderId],
    references: [smBaseSetups.id],
    relationName: "smDonors_genderId_smBaseSetups_id",
  }),
  smBaseSetup_religionId: one(smBaseSetups, {
    fields: [smDonors.religionId],
    references: [smBaseSetups.id],
    relationName: "smDonors_religionId_smBaseSetups_id",
  }),
  smSchool: one(smSchools, {
    fields: [smDonors.schoolId],
    references: [smSchools.id],
  }),
}));

export const smDormitoryListsRelations = relations(smDormitoryLists, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smDormitoryLists.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smDormitoryLists.schoolId],
    references: [smSchools.id],
  }),
  smRoomLists: many(smRoomLists),
  smStudents: many(smStudents),
}));

export const smEmailSettingsRelations = relations(smEmailSettings, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smEmailSettings.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smEmailSettings.schoolId],
    references: [smSchools.id],
  }),
}));

export const smEmailSmsLogsRelations = relations(smEmailSmsLogs, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smEmailSmsLogs.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smEmailSmsLogs.schoolId],
    references: [smSchools.id],
  }),
}));

export const smEventsRelations = relations(smEvents, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smEvents.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smEvents.schoolId],
    references: [smSchools.id],
  }),
}));

export const smExamsRelations = relations(smExams, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smExams.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smExams.classId],
    references: [smClasses.id],
  }),
  smExamType: one(smExamTypes, {
    fields: [smExams.examTypeId],
    references: [smExamTypes.id],
  }),
  smSchool: one(smSchools, {
    fields: [smExams.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smExams.sectionId],
    references: [smSections.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smExams.subjectId],
    references: [smSubjects.id],
  }),
  smExamAttendances: many(smExamAttendances),
  smExamMarksRegisters: many(smExamMarksRegisters),
  smExamSchedules: many(smExamSchedules),
  smExamSetups: many(smExamSetups),
  smMarksRegisters: many(smMarksRegisters),
  smMarksSendSms: many(smMarksSendSms),
  smOnlineExamMarks: many(smOnlineExamMarks),
  smSeatPlans: many(smSeatPlans),
  smTemporaryMeritlists: many(smTemporaryMeritlists),
}));

export const smExamAttendancesRelations = relations(smExamAttendances, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smExamAttendances.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smExamAttendances.classId],
    references: [smClasses.id],
  }),
  smExam: one(smExams, {
    fields: [smExamAttendances.examId],
    references: [smExams.id],
  }),
  smSchool: one(smSchools, {
    fields: [smExamAttendances.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smExamAttendances.sectionId],
    references: [smSections.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smExamAttendances.subjectId],
    references: [smSubjects.id],
  }),
  smExamAttendanceChildren: many(smExamAttendanceChildren),
}));

export const smExamAttendanceChildrenRelations = relations(smExamAttendanceChildren, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smExamAttendanceChildren.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smExamAttendanceChildren.classId],
    references: [smClasses.id],
  }),
  smExamAttendance: one(smExamAttendances, {
    fields: [smExamAttendanceChildren.examAttendanceId],
    references: [smExamAttendances.id],
  }),
  smSchool: one(smSchools, {
    fields: [smExamAttendanceChildren.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smExamAttendanceChildren.sectionId],
    references: [smSections.id],
  }),
  smStudent: one(smStudents, {
    fields: [smExamAttendanceChildren.studentId],
    references: [smStudents.id],
  }),
  studentRecord: one(studentRecords, {
    fields: [smExamAttendanceChildren.studentRecordId],
    references: [studentRecords.id],
  }),
}));

export const studentRecordsRelations = relations(studentRecords, ({ one, many }) => ({
  smExamAttendanceChildren: many(smExamAttendanceChildren),
  smMarkStores: many(smMarkStores),
  smResultStores: many(smResultStores),
  smSubjectAttendances: many(smSubjectAttendances),
  smAcademicYear_academicId: one(smAcademicYears, {
    fields: [studentRecords.academicId],
    references: [smAcademicYears.id],
    relationName: "studentRecords_academicId_smAcademicYears_id",
  }),
  smClass: one(smClasses, {
    fields: [studentRecords.classId],
    references: [smClasses.id],
  }),
  smSchool: one(smSchools, {
    fields: [studentRecords.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [studentRecords.sectionId],
    references: [smSections.id],
  }),
  smAcademicYear_sessionId: one(smAcademicYears, {
    fields: [studentRecords.sessionId],
    references: [smAcademicYears.id],
    relationName: "studentRecords_sessionId_smAcademicYears_id",
  }),
  smStudent: one(smStudents, {
    fields: [studentRecords.studentId],
    references: [smStudents.id],
  }),
  studentRecordTemporaries: many(studentRecordTemporaries),
}));

export const smExamMarksRegistersRelations = relations(smExamMarksRegisters, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smExamMarksRegisters.academicId],
    references: [smAcademicYears.id],
  }),
  smExam: one(smExams, {
    fields: [smExamMarksRegisters.examId],
    references: [smExams.id],
  }),
  smSchool: one(smSchools, {
    fields: [smExamMarksRegisters.schoolId],
    references: [smSchools.id],
  }),
  smStudent: one(smStudents, {
    fields: [smExamMarksRegisters.studentId],
    references: [smStudents.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smExamMarksRegisters.subjectId],
    references: [smSubjects.id],
  }),
}));

export const smExamSchedulesRelations = relations(smExamSchedules, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smExamSchedules.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smExamSchedules.classId],
    references: [smClasses.id],
  }),
  smExam: one(smExams, {
    fields: [smExamSchedules.examId],
    references: [smExams.id],
  }),
  smClassTime: one(smClassTimes, {
    fields: [smExamSchedules.examPeriodId],
    references: [smClassTimes.id],
  }),
  smExamType: one(smExamTypes, {
    fields: [smExamSchedules.examTermId],
    references: [smExamTypes.id],
  }),
  smSchool: one(smSchools, {
    fields: [smExamSchedules.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smExamSchedules.sectionId],
    references: [smSections.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smExamSchedules.subjectId],
    references: [smSubjects.id],
  }),
  smStaff: one(smStaffs, {
    fields: [smExamSchedules.teacherId],
    references: [smStaffs.id],
  }),
  smExamScheduleSubjects: many(smExamScheduleSubjects),
}));

export const smExamScheduleSubjectsRelations = relations(smExamScheduleSubjects, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smExamScheduleSubjects.academicId],
    references: [smAcademicYears.id],
  }),
  smExamSchedule: one(smExamSchedules, {
    fields: [smExamScheduleSubjects.examScheduleId],
    references: [smExamSchedules.id],
  }),
  smSchool: one(smSchools, {
    fields: [smExamScheduleSubjects.schoolId],
    references: [smSchools.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smExamScheduleSubjects.subjectId],
    references: [smSubjects.id],
  }),
}));

export const smExamSettingsRelations = relations(smExamSettings, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smExamSettings.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smExamSettings.schoolId],
    references: [smSchools.id],
  }),
}));

export const smExamSetupsRelations = relations(smExamSetups, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smExamSetups.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smExamSetups.classId],
    references: [smClasses.id],
  }),
  smExam: one(smExams, {
    fields: [smExamSetups.examId],
    references: [smExams.id],
  }),
  smExamType: one(smExamTypes, {
    fields: [smExamSetups.examTermId],
    references: [smExamTypes.id],
  }),
  smSchool: one(smSchools, {
    fields: [smExamSetups.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smExamSetups.sectionId],
    references: [smSections.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smExamSetups.subjectId],
    references: [smSubjects.id],
  }),
  smMarkStores: many(smMarkStores),
  smResultStores: many(smResultStores),
}));

export const smExamSignaturesRelations = relations(smExamSignatures, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smExamSignatures.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smExamSignatures.schoolId],
    references: [smSchools.id],
  }),
}));

export const smExpenseHeadsRelations = relations(smExpenseHeads, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smExpenseHeads.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smExpenseHeads.schoolId],
    references: [smSchools.id],
  }),
}));

export const smExpertTeachersRelations = relations(smExpertTeachers, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smExpertTeachers.schoolId],
    references: [smSchools.id],
  }),
}));

export const smFeesAssignsRelations = relations(smFeesAssigns, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smFeesAssigns.academicId],
    references: [smAcademicYears.id],
  }),
  smFeesDiscount: one(smFeesDiscounts, {
    fields: [smFeesAssigns.feesDiscountId],
    references: [smFeesDiscounts.id],
  }),
  smFeesMaster: one(smFeesMasters, {
    fields: [smFeesAssigns.feesMasterId],
    references: [smFeesMasters.id],
  }),
  smSchool: one(smSchools, {
    fields: [smFeesAssigns.schoolId],
    references: [smSchools.id],
  }),
  smStudent: one(smStudents, {
    fields: [smFeesAssigns.studentId],
    references: [smStudents.id],
  }),
  smFeesPayments: many(smFeesPayments),
}));

export const smFeesMastersRelations = relations(smFeesMasters, ({ one, many }) => ({
  smFeesAssigns: many(smFeesAssigns),
  smAcademicYear: one(smAcademicYears, {
    fields: [smFeesMasters.academicId],
    references: [smAcademicYears.id],
  }),
  smFeesGroup: one(smFeesGroups, {
    fields: [smFeesMasters.feesGroupId],
    references: [smFeesGroups.id],
  }),
  smFeesType: one(smFeesTypes, {
    fields: [smFeesMasters.feesTypeId],
    references: [smFeesTypes.id],
  }),
  smSchool: one(smSchools, {
    fields: [smFeesMasters.schoolId],
    references: [smSchools.id],
  }),
}));

export const smFeesAssignDiscountsRelations = relations(smFeesAssignDiscounts, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smFeesAssignDiscounts.academicId],
    references: [smAcademicYears.id],
  }),
  smFeesDiscount: one(smFeesDiscounts, {
    fields: [smFeesAssignDiscounts.feesDiscountId],
    references: [smFeesDiscounts.id],
  }),
  smSchool: one(smSchools, {
    fields: [smFeesAssignDiscounts.schoolId],
    references: [smSchools.id],
  }),
  smStudent: one(smStudents, {
    fields: [smFeesAssignDiscounts.studentId],
    references: [smStudents.id],
  }),
}));

export const smFeesCarryForwardsRelations = relations(smFeesCarryForwards, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smFeesCarryForwards.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smFeesCarryForwards.schoolId],
    references: [smSchools.id],
  }),
  smStudent: one(smStudents, {
    fields: [smFeesCarryForwards.studentId],
    references: [smStudents.id],
  }),
}));

export const smFeesGroupsRelations = relations(smFeesGroups, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smFeesGroups.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smFeesGroups.schoolId],
    references: [smSchools.id],
  }),
  smFeesMasters: many(smFeesMasters),
  smFeesTypes: many(smFeesTypes),
}));

export const smFeesPaymentsRelations = relations(smFeesPayments, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smFeesPayments.academicId],
    references: [smAcademicYears.id],
  }),
  smFeesAssign: one(smFeesAssigns, {
    fields: [smFeesPayments.assignId],
    references: [smFeesAssigns.id],
  }),
  smBankAccount: one(smBankAccounts, {
    fields: [smFeesPayments.bankId],
    references: [smBankAccounts.id],
  }),
  smFeesDiscount: one(smFeesDiscounts, {
    fields: [smFeesPayments.feesDiscountId],
    references: [smFeesDiscounts.id],
  }),
  smFeesType: one(smFeesTypes, {
    fields: [smFeesPayments.feesTypeId],
    references: [smFeesTypes.id],
  }),
  smSchool: one(smSchools, {
    fields: [smFeesPayments.schoolId],
    references: [smSchools.id],
  }),
  smStudent: one(smStudents, {
    fields: [smFeesPayments.studentId],
    references: [smStudents.id],
  }),
}));

export const smFormDownloadsRelations = relations(smFormDownloads, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smFormDownloads.schoolId],
    references: [smSchools.id],
  }),
}));

export const smFrontendPersmissionsRelations = relations(smFrontendPersmissions, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smFrontendPersmissions.schoolId],
    references: [smSchools.id],
  }),
}));

export const smGeneralSettingsRelations = relations(smGeneralSettings, ({ one }) => ({
  smAcademicYear_academicId: one(smAcademicYears, {
    fields: [smGeneralSettings.academicId],
    references: [smAcademicYears.id],
    relationName: "smGeneralSettings_academicId_smAcademicYears_id",
  }),
  smDateFormat: one(smDateFormats, {
    fields: [smGeneralSettings.dateFormatId],
    references: [smDateFormats.id],
  }),
  smLanguage: one(smLanguages, {
    fields: [smGeneralSettings.languageId],
    references: [smLanguages.id],
  }),
  smSchool: one(smSchools, {
    fields: [smGeneralSettings.schoolId],
    references: [smSchools.id],
  }),
  smAcademicYear_sessionId: one(smAcademicYears, {
    fields: [smGeneralSettings.sessionId],
    references: [smAcademicYears.id],
    relationName: "smGeneralSettings_sessionId_smAcademicYears_id",
  }),
}));

export const smLanguagesRelations = relations(smLanguages, ({ one, many }) => ({
  smGeneralSettings: many(smGeneralSettings),
  language: one(languages, {
    fields: [smLanguages.langId],
    references: [languages.id],
  }),
  smSchool: one(smSchools, {
    fields: [smLanguages.schoolId],
    references: [smSchools.id],
  }),
}));

export const smHeaderMenuManagersRelations = relations(smHeaderMenuManagers, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smHeaderMenuManagers.schoolId],
    references: [smSchools.id],
  }),
}));

export const smHolidaysRelations = relations(smHolidays, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smHolidays.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smHolidays.schoolId],
    references: [smSchools.id],
  }),
}));

export const smHomeworksRelations = relations(smHomeworks, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smHomeworks.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smHomeworks.classId],
    references: [smClasses.id],
  }),
  user: one(users, {
    fields: [smHomeworks.evaluatedBy],
    references: [users.id],
  }),
  smSchool: one(smSchools, {
    fields: [smHomeworks.schoolId],
    references: [smSchools.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smHomeworks.subjectId],
    references: [smSubjects.id],
  }),
  smHomeworkStudents: many(smHomeworkStudents),
  smUploadHomeworkContents: many(smUploadHomeworkContents),
}));

export const smHomeworkStudentsRelations = relations(smHomeworkStudents, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smHomeworkStudents.academicId],
    references: [smAcademicYears.id],
  }),
  smHomework: one(smHomeworks, {
    fields: [smHomeworkStudents.homeworkId],
    references: [smHomeworks.id],
  }),
  smSchool: one(smSchools, {
    fields: [smHomeworkStudents.schoolId],
    references: [smSchools.id],
  }),
  smStudent: one(smStudents, {
    fields: [smHomeworkStudents.studentId],
    references: [smStudents.id],
  }),
}));

export const smHomePageSettingsRelations = relations(smHomePageSettings, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smHomePageSettings.schoolId],
    references: [smSchools.id],
  }),
}));

export const smHourlyRatesRelations = relations(smHourlyRates, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smHourlyRates.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smHourlyRates.schoolId],
    references: [smSchools.id],
  }),
}));

export const smHrPayrollEarnDeducsRelations = relations(smHrPayrollEarnDeducs, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smHrPayrollEarnDeducs.academicId],
    references: [smAcademicYears.id],
  }),
  smHrPayrollGenerate: one(smHrPayrollGenerates, {
    fields: [smHrPayrollEarnDeducs.payrollGenerateId],
    references: [smHrPayrollGenerates.id],
  }),
  smSchool: one(smSchools, {
    fields: [smHrPayrollEarnDeducs.schoolId],
    references: [smSchools.id],
  }),
}));

export const smHrSalaryTemplatesRelations = relations(smHrSalaryTemplates, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smHrSalaryTemplates.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smHrSalaryTemplates.schoolId],
    references: [smSchools.id],
  }),
}));

export const smHumanDepartmentsRelations = relations(smHumanDepartments, ({ one, many }) => ({
  user_createdBy: one(users, {
    fields: [smHumanDepartments.createdBy],
    references: [users.id],
    relationName: "smHumanDepartments_createdBy_users_id",
  }),
  smSchool: one(smSchools, {
    fields: [smHumanDepartments.schoolId],
    references: [smSchools.id],
  }),
  user_updatedBy: one(users, {
    fields: [smHumanDepartments.updatedBy],
    references: [users.id],
    relationName: "smHumanDepartments_updatedBy_users_id",
  }),
  smStaffs: many(smStaffs),
}));

export const smIncomeHeadsRelations = relations(smIncomeHeads, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smIncomeHeads.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smIncomeHeads.schoolId],
    references: [smSchools.id],
  }),
}));

export const smInstructionsRelations = relations(smInstructions, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smInstructions.schoolId],
    references: [smSchools.id],
  }),
}));

export const smInventoryPaymentsRelations = relations(smInventoryPayments, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smInventoryPayments.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smInventoryPayments.schoolId],
    references: [smSchools.id],
  }),
}));

export const smItemsRelations = relations(smItems, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smItems.academicId],
    references: [smAcademicYears.id],
  }),
  smItemCategory: one(smItemCategories, {
    fields: [smItems.itemCategoryId],
    references: [smItemCategories.id],
  }),
  smSchool: one(smSchools, {
    fields: [smItems.schoolId],
    references: [smSchools.id],
  }),
  smItemIssues: many(smItemIssues),
  smItemReceiveChildren: many(smItemReceiveChildren),
}));

export const smItemCategoriesRelations = relations(smItemCategories, ({ one, many }) => ({
  smItems: many(smItems),
  smAcademicYear: one(smAcademicYears, {
    fields: [smItemCategories.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smItemCategories.schoolId],
    references: [smSchools.id],
  }),
  smItemIssues: many(smItemIssues),
}));

export const smItemIssuesRelations = relations(smItemIssues, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smItemIssues.academicId],
    references: [smAcademicYears.id],
  }),
  smItemCategory: one(smItemCategories, {
    fields: [smItemIssues.itemCategoryId],
    references: [smItemCategories.id],
  }),
  smItem: one(smItems, {
    fields: [smItemIssues.itemId],
    references: [smItems.id],
  }),
  role: one(roles, {
    fields: [smItemIssues.roleId],
    references: [roles.id],
  }),
  smSchool: one(smSchools, {
    fields: [smItemIssues.schoolId],
    references: [smSchools.id],
  }),
}));

export const smItemReceivesRelations = relations(smItemReceives, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smItemReceives.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smItemReceives.schoolId],
    references: [smSchools.id],
  }),
  smItemStore: one(smItemStores, {
    fields: [smItemReceives.storeId],
    references: [smItemStores.id],
  }),
  smSupplier: one(smSuppliers, {
    fields: [smItemReceives.supplierId],
    references: [smSuppliers.id],
  }),
  smItemReceiveChildren: many(smItemReceiveChildren),
}));

export const smItemStoresRelations = relations(smItemStores, ({ one, many }) => ({
  smItemReceives: many(smItemReceives),
  smAcademicYear: one(smAcademicYears, {
    fields: [smItemStores.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smItemStores.schoolId],
    references: [smSchools.id],
  }),
}));

export const smSuppliersRelations = relations(smSuppliers, ({ one, many }) => ({
  smItemReceives: many(smItemReceives),
  smAcademicYear: one(smAcademicYears, {
    fields: [smSuppliers.academicId],
    references: [smAcademicYears.id],
  }),
}));

export const smItemReceiveChildrenRelations = relations(smItemReceiveChildren, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smItemReceiveChildren.academicId],
    references: [smAcademicYears.id],
  }),
  smItem: one(smItems, {
    fields: [smItemReceiveChildren.itemId],
    references: [smItems.id],
  }),
  smItemReceive: one(smItemReceives, {
    fields: [smItemReceiveChildren.itemReceiveId],
    references: [smItemReceives.id],
  }),
  smSchool: one(smSchools, {
    fields: [smItemReceiveChildren.schoolId],
    references: [smSchools.id],
  }),
}));

export const smItemSellsRelations = relations(smItemSells, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smItemSells.academicId],
    references: [smAcademicYears.id],
  }),
  role: one(roles, {
    fields: [smItemSells.roleId],
    references: [roles.id],
  }),
  smSchool: one(smSchools, {
    fields: [smItemSells.schoolId],
    references: [smSchools.id],
  }),
}));

export const smItemSellChildrenRelations = relations(smItemSellChildren, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smItemSellChildren.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smItemSellChildren.schoolId],
    references: [smSchools.id],
  }),
}));

export const smLanguagePhrasesRelations = relations(smLanguagePhrases, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smLanguagePhrases.schoolId],
    references: [smSchools.id],
  }),
}));

export const smLeaveDeductionInfosRelations = relations(smLeaveDeductionInfos, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smLeaveDeductionInfos.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smLeaveDeductionInfos.schoolId],
    references: [smSchools.id],
  }),
}));

export const smLeaveDefinesRelations = relations(smLeaveDefines, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smLeaveDefines.academicId],
    references: [smAcademicYears.id],
  }),
  role: one(roles, {
    fields: [smLeaveDefines.roleId],
    references: [roles.id],
  }),
  smSchool: one(smSchools, {
    fields: [smLeaveDefines.schoolId],
    references: [smSchools.id],
  }),
  smLeaveType: one(smLeaveTypes, {
    fields: [smLeaveDefines.typeId],
    references: [smLeaveTypes.id],
  }),
  user: one(users, {
    fields: [smLeaveDefines.userId],
    references: [users.id],
  }),
  smLeaveRequests: many(smLeaveRequests),
}));

export const smLeaveTypesRelations = relations(smLeaveTypes, ({ one, many }) => ({
  smLeaveDefines: many(smLeaveDefines),
  smLeaveRequests: many(smLeaveRequests),
  smAcademicYear: one(smAcademicYears, {
    fields: [smLeaveTypes.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smLeaveTypes.schoolId],
    references: [smSchools.id],
  }),
}));

export const smLeaveRequestsRelations = relations(smLeaveRequests, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smLeaveRequests.academicId],
    references: [smAcademicYears.id],
  }),
  smLeaveDefine: one(smLeaveDefines, {
    fields: [smLeaveRequests.leaveDefineId],
    references: [smLeaveDefines.id],
  }),
  role: one(roles, {
    fields: [smLeaveRequests.roleId],
    references: [roles.id],
  }),
  smSchool: one(smSchools, {
    fields: [smLeaveRequests.schoolId],
    references: [smSchools.id],
  }),
  user: one(users, {
    fields: [smLeaveRequests.staffId],
    references: [users.id],
  }),
  smLeaveType: one(smLeaveTypes, {
    fields: [smLeaveRequests.typeId],
    references: [smLeaveTypes.id],
  }),
}));

export const smLessonsRelations = relations(smLessons, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smLessons.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smLessons.classId],
    references: [smClasses.id],
  }),
  smSchool: one(smSchools, {
    fields: [smLessons.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smLessons.sectionId],
    references: [smSections.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smLessons.subjectId],
    references: [smSubjects.id],
  }),
}));

export const smLessonDetailsRelations = relations(smLessonDetails, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smLessonDetails.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smLessonDetails.classId],
    references: [smClasses.id],
  }),
  smSchool: one(smSchools, {
    fields: [smLessonDetails.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smLessonDetails.sectionId],
    references: [smSections.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smLessonDetails.subjectId],
    references: [smSubjects.id],
  }),
}));

export const smLessonTopicsRelations = relations(smLessonTopics, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smLessonTopics.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smLessonTopics.classId],
    references: [smClasses.id],
  }),
  smSchool: one(smSchools, {
    fields: [smLessonTopics.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smLessonTopics.sectionId],
    references: [smSections.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smLessonTopics.subjectId],
    references: [smSubjects.id],
  }),
  smLessonTopicDetails: many(smLessonTopicDetails),
}));

export const smLibraryMembersRelations = relations(smLibraryMembers, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smLibraryMembers.academicId],
    references: [smAcademicYears.id],
  }),
  role: one(roles, {
    fields: [smLibraryMembers.memberType],
    references: [roles.id],
  }),
  smSchool: one(smSchools, {
    fields: [smLibraryMembers.schoolId],
    references: [smSchools.id],
  }),
  user: one(users, {
    fields: [smLibraryMembers.studentStaffId],
    references: [users.id],
  }),
}));

export const smMarksGradesRelations = relations(smMarksGrades, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smMarksGrades.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smMarksGrades.schoolId],
    references: [smSchools.id],
  }),
}));

export const smMarksRegistersRelations = relations(smMarksRegisters, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smMarksRegisters.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smMarksRegisters.classId],
    references: [smClasses.id],
  }),
  smExam: one(smExams, {
    fields: [smMarksRegisters.examId],
    references: [smExams.id],
  }),
  smSchool: one(smSchools, {
    fields: [smMarksRegisters.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smMarksRegisters.sectionId],
    references: [smSections.id],
  }),
  smStudent: one(smStudents, {
    fields: [smMarksRegisters.studentId],
    references: [smStudents.id],
  }),
  smMarksRegisterChildren: many(smMarksRegisterChildren),
}));

export const smMarksRegisterChildrenRelations = relations(smMarksRegisterChildren, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smMarksRegisterChildren.academicId],
    references: [smAcademicYears.id],
  }),
  smMarksRegister: one(smMarksRegisters, {
    fields: [smMarksRegisterChildren.marksRegisterId],
    references: [smMarksRegisters.id],
  }),
  smSchool: one(smSchools, {
    fields: [smMarksRegisterChildren.schoolId],
    references: [smSchools.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smMarksRegisterChildren.subjectId],
    references: [smSubjects.id],
  }),
}));

export const smMarksSendSmsRelations = relations(smMarksSendSms, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smMarksSendSms.academicId],
    references: [smAcademicYears.id],
  }),
  smExam: one(smExams, {
    fields: [smMarksSendSms.examId],
    references: [smExams.id],
  }),
  smSchool: one(smSchools, {
    fields: [smMarksSendSms.schoolId],
    references: [smSchools.id],
  }),
  smStudent: one(smStudents, {
    fields: [smMarksSendSms.studentId],
    references: [smStudents.id],
  }),
}));

export const smMarkStoresRelations = relations(smMarkStores, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smMarkStores.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smMarkStores.classId],
    references: [smClasses.id],
  }),
  smExamSetup: one(smExamSetups, {
    fields: [smMarkStores.examSetupId],
    references: [smExamSetups.id],
  }),
  smExamType: one(smExamTypes, {
    fields: [smMarkStores.examTermId],
    references: [smExamTypes.id],
  }),
  smSchool: one(smSchools, {
    fields: [smMarkStores.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smMarkStores.sectionId],
    references: [smSections.id],
  }),
  smStudent: one(smStudents, {
    fields: [smMarkStores.studentId],
    references: [smStudents.id],
  }),
  studentRecord: one(studentRecords, {
    fields: [smMarkStores.studentRecordId],
    references: [studentRecords.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smMarkStores.subjectId],
    references: [smSubjects.id],
  }),
}));

export const smModulesRelations = relations(smModules, ({ one, many }) => ({
  smSchool: one(smSchools, {
    fields: [smModules.schoolId],
    references: [smSchools.id],
  }),
  smModuleLinks: many(smModuleLinks),
}));

export const smModuleLinksRelations = relations(smModuleLinks, ({ one, many }) => ({
  user_createdBy: one(users, {
    fields: [smModuleLinks.createdBy],
    references: [users.id],
    relationName: "smModuleLinks_createdBy_users_id",
  }),
  smModule: one(smModules, {
    fields: [smModuleLinks.moduleId],
    references: [smModules.id],
  }),
  smSchool: one(smSchools, {
    fields: [smModuleLinks.schoolId],
    references: [smSchools.id],
  }),
  user_updatedBy: one(users, {
    fields: [smModuleLinks.updatedBy],
    references: [users.id],
    relationName: "smModuleLinks_updatedBy_users_id",
  }),
  smRolePermissions: many(smRolePermissions),
}));

export const smModulePermissionsRelations = relations(smModulePermissions, ({ one, many }) => ({
  smSchool: one(smSchools, {
    fields: [smModulePermissions.schoolId],
    references: [smSchools.id],
  }),
  smModulePermissionAssigns: many(smModulePermissionAssigns),
}));

export const smModulePermissionAssignsRelations = relations(smModulePermissionAssigns, ({ one }) => ({
  smModulePermission: one(smModulePermissions, {
    fields: [smModulePermissionAssigns.moduleId],
    references: [smModulePermissions.id],
  }),
  role: one(roles, {
    fields: [smModulePermissionAssigns.roleId],
    references: [roles.id],
  }),
  smSchool: one(smSchools, {
    fields: [smModulePermissionAssigns.schoolId],
    references: [smSchools.id],
  }),
}));

export const smNewsRelations = relations(smNews, ({ one, many }) => ({
  smNewsCategory: one(smNewsCategories, {
    fields: [smNews.categoryId],
    references: [smNewsCategories.id],
  }),
  smNewsComments: many(smNewsComments),
}));

export const smNewsCategoriesRelations = relations(smNewsCategories, ({ many }) => ({
  smNews: many(smNews),
}));

export const smNewsCommentsRelations = relations(smNewsComments, ({ one }) => ({
  smNew: one(smNews, {
    fields: [smNewsComments.newsId],
    references: [smNews.id],
  }),
  user: one(users, {
    fields: [smNewsComments.userId],
    references: [users.id],
  }),
}));

export const smNewsPagesRelations = relations(smNewsPages, ({ one }) => ({
  user_createdBy: one(users, {
    fields: [smNewsPages.createdBy],
    references: [users.id],
    relationName: "smNewsPages_createdBy_users_id",
  }),
  smSchool: one(smSchools, {
    fields: [smNewsPages.schoolId],
    references: [smSchools.id],
  }),
  user_updatedBy: one(users, {
    fields: [smNewsPages.updatedBy],
    references: [users.id],
    relationName: "smNewsPages_updatedBy_users_id",
  }),
}));

export const smNoticeBoardsRelations = relations(smNoticeBoards, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smNoticeBoards.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smNoticeBoards.schoolId],
    references: [smSchools.id],
  }),
}));

export const smNotificationsRelations = relations(smNotifications, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smNotifications.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smNotifications.schoolId],
    references: [smSchools.id],
  }),
}));

export const smNotificationSettingsRelations = relations(smNotificationSettings, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smNotificationSettings.schoolId],
    references: [smSchools.id],
  }),
}));

export const smOnlineExamsRelations = relations(smOnlineExams, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smOnlineExams.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smOnlineExams.classId],
    references: [smClasses.id],
  }),
  smSchool: one(smSchools, {
    fields: [smOnlineExams.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smOnlineExams.sectionId],
    references: [smSections.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smOnlineExams.subjectId],
    references: [smSubjects.id],
  }),
  smOnlineExamQuestions: many(smOnlineExamQuestions),
  smOnlineExamQuestionAssigns: many(smOnlineExamQuestionAssigns),
  smStudentTakeOnlineExams: many(smStudentTakeOnlineExams),
}));

export const smOnlineExamMarksRelations = relations(smOnlineExamMarks, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smOnlineExamMarks.academicId],
    references: [smAcademicYears.id],
  }),
  smExam: one(smExams, {
    fields: [smOnlineExamMarks.examId],
    references: [smExams.id],
  }),
  smSchool: one(smSchools, {
    fields: [smOnlineExamMarks.schoolId],
    references: [smSchools.id],
  }),
  smStudent: one(smStudents, {
    fields: [smOnlineExamMarks.studentId],
    references: [smStudents.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smOnlineExamMarks.subjectId],
    references: [smSubjects.id],
  }),
}));

export const smOnlineExamQuestionsRelations = relations(smOnlineExamQuestions, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smOnlineExamQuestions.academicId],
    references: [smAcademicYears.id],
  }),
  smOnlineExam: one(smOnlineExams, {
    fields: [smOnlineExamQuestions.onlineExamId],
    references: [smOnlineExams.id],
  }),
  smSchool: one(smSchools, {
    fields: [smOnlineExamQuestions.schoolId],
    references: [smSchools.id],
  }),
  smOnlineExamQuestionMuOptions: many(smOnlineExamQuestionMuOptions),
}));

export const smOnlineExamQuestionAssignsRelations = relations(smOnlineExamQuestionAssigns, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smOnlineExamQuestionAssigns.academicId],
    references: [smAcademicYears.id],
  }),
  smOnlineExam: one(smOnlineExams, {
    fields: [smOnlineExamQuestionAssigns.onlineExamId],
    references: [smOnlineExams.id],
  }),
  smQuestionBank: one(smQuestionBanks, {
    fields: [smOnlineExamQuestionAssigns.questionBankId],
    references: [smQuestionBanks.id],
  }),
  smSchool: one(smSchools, {
    fields: [smOnlineExamQuestionAssigns.schoolId],
    references: [smSchools.id],
  }),
}));

export const smQuestionBanksRelations = relations(smQuestionBanks, ({ one, many }) => ({
  smOnlineExamQuestionAssigns: many(smOnlineExamQuestionAssigns),
  smAcademicYear: one(smAcademicYears, {
    fields: [smQuestionBanks.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smQuestionBanks.classId],
    references: [smClasses.id],
  }),
  smQuestionGroup: one(smQuestionGroups, {
    fields: [smQuestionBanks.qGroupId],
    references: [smQuestionGroups.id],
  }),
  smSchool: one(smSchools, {
    fields: [smQuestionBanks.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smQuestionBanks.sectionId],
    references: [smSections.id],
  }),
  smQuestionBankMuOptions: many(smQuestionBankMuOptions),
  smStudentTakeOnlineExamQuestions: many(smStudentTakeOnlineExamQuestions),
}));

export const smOnlineExamQuestionMuOptionsRelations = relations(smOnlineExamQuestionMuOptions, ({ one }) => ({
  smOnlineExamQuestion: one(smOnlineExamQuestions, {
    fields: [smOnlineExamQuestionMuOptions.onlineExamQuestionId],
    references: [smOnlineExamQuestions.id],
  }),
  smAcademicYear: one(smAcademicYears, {
    fields: [smOnlineExamQuestionMuOptions.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smOnlineExamQuestionMuOptions.schoolId],
    references: [smSchools.id],
  }),
}));

export const smOptionalSubjectAssignsRelations = relations(smOptionalSubjectAssigns, ({ one }) => ({
  smAcademicYear_academicId: one(smAcademicYears, {
    fields: [smOptionalSubjectAssigns.academicId],
    references: [smAcademicYears.id],
    relationName: "smOptionalSubjectAssigns_academicId_smAcademicYears_id",
  }),
  smSchool: one(smSchools, {
    fields: [smOptionalSubjectAssigns.schoolId],
    references: [smSchools.id],
  }),
  smAcademicYear_sessionId: one(smAcademicYears, {
    fields: [smOptionalSubjectAssigns.sessionId],
    references: [smAcademicYears.id],
    relationName: "smOptionalSubjectAssigns_sessionId_smAcademicYears_id",
  }),
  smStudent: one(smStudents, {
    fields: [smOptionalSubjectAssigns.studentId],
    references: [smStudents.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smOptionalSubjectAssigns.subjectId],
    references: [smSubjects.id],
  }),
}));

export const smPagesRelations = relations(smPages, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smPages.schoolId],
    references: [smSchools.id],
  }),
}));

export const smParentsRelations = relations(smParents, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smParents.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smParents.schoolId],
    references: [smSchools.id],
  }),
  user: one(users, {
    fields: [smParents.userId],
    references: [users.id],
  }),
  smStudents: many(smStudents),
}));

export const smPaymentGatewaySettingsRelations = relations(smPaymentGatewaySettings, ({ one, many }) => ({
  smSchool: one(smSchools, {
    fields: [smPaymentGatewaySettings.schoolId],
    references: [smSchools.id],
  }),
  smPaymentMethhods: many(smPaymentMethhods),
}));

export const smPhoneCallLogsRelations = relations(smPhoneCallLogs, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smPhoneCallLogs.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smPhoneCallLogs.schoolId],
    references: [smSchools.id],
  }),
}));

export const smPhotoGalleriesRelations = relations(smPhotoGalleries, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smPhotoGalleries.schoolId],
    references: [smSchools.id],
  }),
}));

export const smPostalDispatchesRelations = relations(smPostalDispatches, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smPostalDispatches.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smPostalDispatches.schoolId],
    references: [smSchools.id],
  }),
}));

export const smPostalReceivesRelations = relations(smPostalReceives, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smPostalReceives.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smPostalReceives.schoolId],
    references: [smSchools.id],
  }),
}));

export const smProductPurchasesRelations = relations(smProductPurchases, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smProductPurchases.schoolId],
    references: [smSchools.id],
  }),
  smStaff: one(smStaffs, {
    fields: [smProductPurchases.staffId],
    references: [smStaffs.id],
  }),
  user: one(users, {
    fields: [smProductPurchases.userId],
    references: [users.id],
  }),
}));

export const smQuestionGroupsRelations = relations(smQuestionGroups, ({ one, many }) => ({
  smQuestionBanks: many(smQuestionBanks),
  smAcademicYear: one(smAcademicYears, {
    fields: [smQuestionGroups.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smQuestionGroups.schoolId],
    references: [smSchools.id],
  }),
}));

export const smQuestionBankMuOptionsRelations = relations(smQuestionBankMuOptions, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smQuestionBankMuOptions.academicId],
    references: [smAcademicYears.id],
  }),
  smQuestionBank: one(smQuestionBanks, {
    fields: [smQuestionBankMuOptions.questionBankId],
    references: [smQuestionBanks.id],
  }),
  smSchool: one(smSchools, {
    fields: [smQuestionBankMuOptions.schoolId],
    references: [smSchools.id],
  }),
}));

export const smQuestionLevelsRelations = relations(smQuestionLevels, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smQuestionLevels.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smQuestionLevels.schoolId],
    references: [smSchools.id],
  }),
}));

export const smResultStoresRelations = relations(smResultStores, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smResultStores.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smResultStores.classId],
    references: [smClasses.id],
  }),
  smExamSetup: one(smExamSetups, {
    fields: [smResultStores.examSetupId],
    references: [smExamSetups.id],
  }),
  smExamType: one(smExamTypes, {
    fields: [smResultStores.examTypeId],
    references: [smExamTypes.id],
  }),
  smSchool: one(smSchools, {
    fields: [smResultStores.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smResultStores.sectionId],
    references: [smSections.id],
  }),
  smStudent: one(smStudents, {
    fields: [smResultStores.studentId],
    references: [smStudents.id],
  }),
  studentRecord: one(studentRecords, {
    fields: [smResultStores.studentRecordId],
    references: [studentRecords.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smResultStores.subjectId],
    references: [smSubjects.id],
  }),
}));

export const smRolePermissionsRelations = relations(smRolePermissions, ({ one }) => ({
  smModuleLink: one(smModuleLinks, {
    fields: [smRolePermissions.moduleLinkId],
    references: [smModuleLinks.id],
  }),
  role: one(roles, {
    fields: [smRolePermissions.roleId],
    references: [roles.id],
  }),
  smSchool: one(smSchools, {
    fields: [smRolePermissions.schoolId],
    references: [smSchools.id],
  }),
}));

export const smRoomListsRelations = relations(smRoomLists, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smRoomLists.academicId],
    references: [smAcademicYears.id],
  }),
  smDormitoryList: one(smDormitoryLists, {
    fields: [smRoomLists.dormitoryId],
    references: [smDormitoryLists.id],
  }),
  smRoomType: one(smRoomTypes, {
    fields: [smRoomLists.roomTypeId],
    references: [smRoomTypes.id],
  }),
  smSchool: one(smSchools, {
    fields: [smRoomLists.schoolId],
    references: [smSchools.id],
  }),
  smStudents: many(smStudents),
}));

export const smRoomTypesRelations = relations(smRoomTypes, ({ one, many }) => ({
  smRoomLists: many(smRoomLists),
  smAcademicYear: one(smAcademicYears, {
    fields: [smRoomTypes.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smRoomTypes.schoolId],
    references: [smSchools.id],
  }),
}));

export const smSeatPlansRelations = relations(smSeatPlans, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smSeatPlans.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smSeatPlans.classId],
    references: [smClasses.id],
  }),
  smExam: one(smExams, {
    fields: [smSeatPlans.examId],
    references: [smExams.id],
  }),
  smSchool: one(smSchools, {
    fields: [smSeatPlans.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smSeatPlans.sectionId],
    references: [smSections.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smSeatPlans.subjectId],
    references: [smSubjects.id],
  }),
  smSeatPlanChildren: many(smSeatPlanChildren),
}));

export const smSeatPlanChildrenRelations = relations(smSeatPlanChildren, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smSeatPlanChildren.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smSeatPlanChildren.schoolId],
    references: [smSchools.id],
  }),
  smSeatPlan: one(smSeatPlans, {
    fields: [smSeatPlanChildren.seatPlanId],
    references: [smSeatPlans.id],
  }),
}));

export const smSendMessagesRelations = relations(smSendMessages, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smSendMessages.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smSendMessages.schoolId],
    references: [smSchools.id],
  }),
}));

export const smSetupAdminsRelations = relations(smSetupAdmins, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smSetupAdmins.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smSetupAdmins.schoolId],
    references: [smSchools.id],
  }),
}));

export const smSmsGatewaysRelations = relations(smSmsGateways, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smSmsGateways.schoolId],
    references: [smSchools.id],
  }),
}));

export const smSocialMediaIconsRelations = relations(smSocialMediaIcons, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smSocialMediaIcons.schoolId],
    references: [smSchools.id],
  }),
}));

export const smStaffAttendanceImportsRelations = relations(smStaffAttendanceImports, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smStaffAttendanceImports.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smStaffAttendanceImports.schoolId],
    references: [smSchools.id],
  }),
  smStaff: one(smStaffs, {
    fields: [smStaffAttendanceImports.staffId],
    references: [smStaffs.id],
  }),
}));

export const smStaffAttendencesRelations = relations(smStaffAttendences, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smStaffAttendences.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smStaffAttendences.schoolId],
    references: [smSchools.id],
  }),
  smStaff: one(smStaffs, {
    fields: [smStaffAttendences.staffId],
    references: [smStaffs.id],
  }),
}));

export const smStaffRegistrationFieldsRelations = relations(smStaffRegistrationFields, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smStaffRegistrationFields.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smStaffRegistrationFields.schoolId],
    references: [smSchools.id],
  }),
}));

export const smStudentCategoriesRelations = relations(smStudentCategories, ({ one, many }) => ({
  smStudents: many(smStudents),
  smAcademicYear: one(smAcademicYears, {
    fields: [smStudentCategories.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smStudentCategories.schoolId],
    references: [smSchools.id],
  }),
}));

export const smStudentGroupsRelations = relations(smStudentGroups, ({ one, many }) => ({
  smStudents: many(smStudents),
  smAcademicYear: one(smAcademicYears, {
    fields: [smStudentGroups.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smStudentGroups.schoolId],
    references: [smSchools.id],
  }),
}));

export const smStudentAttendancesRelations = relations(smStudentAttendances, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smStudentAttendances.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smStudentAttendances.classId],
    references: [smClasses.id],
  }),
  smSchool: one(smSchools, {
    fields: [smStudentAttendances.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smStudentAttendances.sectionId],
    references: [smSections.id],
  }),
  smStudent: one(smStudents, {
    fields: [smStudentAttendances.studentId],
    references: [smStudents.id],
  }),
}));

export const smStudentAttendanceImportsRelations = relations(smStudentAttendanceImports, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smStudentAttendanceImports.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smStudentAttendanceImports.schoolId],
    references: [smSchools.id],
  }),
  smStudent: one(smStudents, {
    fields: [smStudentAttendanceImports.studentId],
    references: [smStudents.id],
  }),
}));

export const smStudentCertificatesRelations = relations(smStudentCertificates, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smStudentCertificates.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smStudentCertificates.schoolId],
    references: [smSchools.id],
  }),
}));

export const smStudentDocumentsRelations = relations(smStudentDocuments, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smStudentDocuments.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smStudentDocuments.schoolId],
    references: [smSchools.id],
  }),
}));

export const smStudentExcelFormatsRelations = relations(smStudentExcelFormats, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smStudentExcelFormats.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smStudentExcelFormats.schoolId],
    references: [smSchools.id],
  }),
}));

export const smStudentHomeworksRelations = relations(smStudentHomeworks, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smStudentHomeworks.academicId],
    references: [smAcademicYears.id],
  }),
  user: one(users, {
    fields: [smStudentHomeworks.evaluatedBy],
    references: [users.id],
  }),
  smSchool: one(smSchools, {
    fields: [smStudentHomeworks.schoolId],
    references: [smSchools.id],
  }),
  smStudent: one(smStudents, {
    fields: [smStudentHomeworks.studentId],
    references: [smStudents.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smStudentHomeworks.subjectId],
    references: [smSubjects.id],
  }),
}));

export const smStudentIdCardsRelations = relations(smStudentIdCards, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smStudentIdCards.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smStudentIdCards.schoolId],
    references: [smSchools.id],
  }),
}));

export const smStudentPromotionsRelations = relations(smStudentPromotions, ({ one }) => ({
  smAcademicYear_academicId: one(smAcademicYears, {
    fields: [smStudentPromotions.academicId],
    references: [smAcademicYears.id],
    relationName: "smStudentPromotions_academicId_smAcademicYears_id",
  }),
  smClass_currentClassId: one(smClasses, {
    fields: [smStudentPromotions.currentClassId],
    references: [smClasses.id],
    relationName: "smStudentPromotions_currentClassId_smClasses_id",
  }),
  smSection_currentSectionId: one(smSections, {
    fields: [smStudentPromotions.currentSectionId],
    references: [smSections.id],
    relationName: "smStudentPromotions_currentSectionId_smSections_id",
  }),
  smAcademicYear_currentSessionId: one(smAcademicYears, {
    fields: [smStudentPromotions.currentSessionId],
    references: [smAcademicYears.id],
    relationName: "smStudentPromotions_currentSessionId_smAcademicYears_id",
  }),
  smClass_previousClassId: one(smClasses, {
    fields: [smStudentPromotions.previousClassId],
    references: [smClasses.id],
    relationName: "smStudentPromotions_previousClassId_smClasses_id",
  }),
  smSection_previousSectionId: one(smSections, {
    fields: [smStudentPromotions.previousSectionId],
    references: [smSections.id],
    relationName: "smStudentPromotions_previousSectionId_smSections_id",
  }),
  smAcademicYear_previousSessionId: one(smAcademicYears, {
    fields: [smStudentPromotions.previousSessionId],
    references: [smAcademicYears.id],
    relationName: "smStudentPromotions_previousSessionId_smAcademicYears_id",
  }),
  smSchool: one(smSchools, {
    fields: [smStudentPromotions.schoolId],
    references: [smSchools.id],
  }),
  smStudent: one(smStudents, {
    fields: [smStudentPromotions.studentId],
    references: [smStudents.id],
  }),
}));

export const smStudentRegistrationFieldsRelations = relations(smStudentRegistrationFields, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smStudentRegistrationFields.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smStudentRegistrationFields.schoolId],
    references: [smSchools.id],
  }),
}));

export const smStudentTakeOnlineExamsRelations = relations(smStudentTakeOnlineExams, ({ one, many }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smStudentTakeOnlineExams.academicId],
    references: [smAcademicYears.id],
  }),
  smOnlineExam: one(smOnlineExams, {
    fields: [smStudentTakeOnlineExams.onlineExamId],
    references: [smOnlineExams.id],
  }),
  smSchool: one(smSchools, {
    fields: [smStudentTakeOnlineExams.schoolId],
    references: [smSchools.id],
  }),
  smStudent: one(smStudents, {
    fields: [smStudentTakeOnlineExams.studentId],
    references: [smStudents.id],
  }),
  smStudentTakeOnlineExamQuestions: many(smStudentTakeOnlineExamQuestions),
}));

export const smStudentTakeOnlineExamQuestionsRelations = relations(
  smStudentTakeOnlineExamQuestions,
  ({ one, many }) => ({
    smAcademicYear: one(smAcademicYears, {
      fields: [smStudentTakeOnlineExamQuestions.academicId],
      references: [smAcademicYears.id],
    }),
    smQuestionBank: one(smQuestionBanks, {
      fields: [smStudentTakeOnlineExamQuestions.questionBankId],
      references: [smQuestionBanks.id],
    }),
    smSchool: one(smSchools, {
      fields: [smStudentTakeOnlineExamQuestions.schoolId],
      references: [smSchools.id],
    }),
    smStudentTakeOnlineExam: one(smStudentTakeOnlineExams, {
      fields: [smStudentTakeOnlineExamQuestions.takeOnlineExamId],
      references: [smStudentTakeOnlineExams.id],
    }),
    smStudentTakeOnlnExQuesOptions: many(smStudentTakeOnlnExQuesOptions),
  })
);

export const smStudentTakeOnlnExQuesOptionsRelations = relations(
  smStudentTakeOnlnExQuesOptions,
  ({ one }) => ({
    smAcademicYear: one(smAcademicYears, {
      fields: [smStudentTakeOnlnExQuesOptions.academicId],
      references: [smAcademicYears.id],
    }),
    smSchool: one(smSchools, {
      fields: [smStudentTakeOnlnExQuesOptions.schoolId],
      references: [smSchools.id],
    }),
    smStudentTakeOnlineExamQuestion: one(smStudentTakeOnlineExamQuestions, {
      fields: [smStudentTakeOnlnExQuesOptions.takeOnlineExamQuestionId],
      references: [smStudentTakeOnlineExamQuestions.id],
    }),
  })
);

export const smStudentTimelinesRelations = relations(smStudentTimelines, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smStudentTimelines.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smStudentTimelines.schoolId],
    references: [smSchools.id],
  }),
}));

export const smStylesRelations = relations(smStyles, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smStyles.schoolId],
    references: [smSchools.id],
  }),
}));

export const smSubjectAttendancesRelations = relations(smSubjectAttendances, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smSubjectAttendances.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smSubjectAttendances.classId],
    references: [smClasses.id],
  }),
  smSchool: one(smSchools, {
    fields: [smSubjectAttendances.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smSubjectAttendances.sectionId],
    references: [smSections.id],
  }),
  smStudent: one(smStudents, {
    fields: [smSubjectAttendances.studentId],
    references: [smStudents.id],
  }),
  studentRecord: one(studentRecords, {
    fields: [smSubjectAttendances.studentRecordId],
    references: [studentRecords.id],
  }),
  smSubject: one(smSubjects, {
    fields: [smSubjectAttendances.subjectId],
    references: [smSubjects.id],
  }),
}));

export const smTeacherUploadContentsRelations = relations(smTeacherUploadContents, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smTeacherUploadContents.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smTeacherUploadContents.class],
    references: [smClasses.id],
  }),
  smSchool: one(smSchools, {
    fields: [smTeacherUploadContents.schoolId],
    references: [smSchools.id],
  }),
}));

export const smTemporaryMeritlistsRelations = relations(smTemporaryMeritlists, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smTemporaryMeritlists.academicId],
    references: [smAcademicYears.id],
  }),
  smClass: one(smClasses, {
    fields: [smTemporaryMeritlists.classId],
    references: [smClasses.id],
  }),
  smExam: one(smExams, {
    fields: [smTemporaryMeritlists.examId],
    references: [smExams.id],
  }),
  smSchool: one(smSchools, {
    fields: [smTemporaryMeritlists.schoolId],
    references: [smSchools.id],
  }),
  smSection: one(smSections, {
    fields: [smTemporaryMeritlists.sectionId],
    references: [smSections.id],
  }),
}));

export const smTestimonialsRelations = relations(smTestimonials, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smTestimonials.schoolId],
    references: [smSchools.id],
  }),
}));

export const smToDosRelations = relations(smToDos, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smToDos.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smToDos.schoolId],
    references: [smSchools.id],
  }),
}));

export const smUploadContentsRelations = relations(smUploadContents, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smUploadContents.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smUploadContents.schoolId],
    references: [smSchools.id],
  }),
}));

export const smUploadHomeworkContentsRelations = relations(smUploadHomeworkContents, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smUploadHomeworkContents.academicId],
    references: [smAcademicYears.id],
  }),
  smHomework: one(smHomeworks, {
    fields: [smUploadHomeworkContents.homeworkId],
    references: [smHomeworks.id],
  }),
  smSchool: one(smSchools, {
    fields: [smUploadHomeworkContents.schoolId],
    references: [smSchools.id],
  }),
  smStudent: one(smStudents, {
    fields: [smUploadHomeworkContents.studentId],
    references: [smStudents.id],
  }),
}));

export const smUserLogsRelations = relations(smUserLogs, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smUserLogs.academicId],
    references: [smAcademicYears.id],
  }),
  infixRole: one(infixRoles, {
    fields: [smUserLogs.roleId],
    references: [infixRoles.id],
  }),
  smSchool: one(smSchools, {
    fields: [smUserLogs.schoolId],
    references: [smSchools.id],
  }),
  user: one(users, {
    fields: [smUserLogs.userId],
    references: [users.id],
  }),
}));

export const smVideoGalleriesRelations = relations(smVideoGalleries, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [smVideoGalleries.schoolId],
    references: [smSchools.id],
  }),
}));

export const smVisitorsRelations = relations(smVisitors, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smVisitors.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smVisitors.schoolId],
    references: [smSchools.id],
  }),
}));

export const smWeekendsRelations = relations(smWeekends, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [smWeekends.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [smWeekends.schoolId],
    references: [smSchools.id],
  }),
}));

export const speechSlidersRelations = relations(speechSliders, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [speechSliders.schoolId],
    references: [smSchools.id],
  }),
}));

export const staffImportBulkTemporariesRelations = relations(staffImportBulkTemporaries, ({ one }) => ({
  user: one(users, {
    fields: [staffImportBulkTemporaries.userId],
    references: [users.id],
  }),
}));

export const studentAcademicHistoriesRelations = relations(studentAcademicHistories, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [studentAcademicHistories.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [studentAcademicHistories.schoolId],
    references: [smSchools.id],
  }),
  smStudent: one(smStudents, {
    fields: [studentAcademicHistories.studentId],
    references: [smStudents.id],
  }),
}));

export const studentRatingsRelations = relations(studentRatings, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [studentRatings.academicId],
    references: [smAcademicYears.id],
  }),
  smExamType: one(smExamTypes, {
    fields: [studentRatings.examTypeId],
    references: [smExamTypes.id],
  }),
  smStudent: one(smStudents, {
    fields: [studentRatings.studentId],
    references: [smStudents.id],
  }),
}));

export const studentRecordTemporariesRelations = relations(studentRecordTemporaries, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [studentRecordTemporaries.schoolId],
    references: [smSchools.id],
  }),
  smStudent: one(smStudents, {
    fields: [studentRecordTemporaries.smStudentId],
    references: [smStudents.id],
  }),
  studentRecord: one(studentRecords, {
    fields: [studentRecordTemporaries.studentRecordId],
    references: [studentRecords.id],
  }),
}));

export const teacherRemarksRelations = relations(teacherRemarks, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [teacherRemarks.academicId],
    references: [smAcademicYears.id],
  }),
  smExamType: one(smExamTypes, {
    fields: [teacherRemarks.examTypeId],
    references: [smExamTypes.id],
  }),
  smStudent: one(smStudents, {
    fields: [teacherRemarks.studentId],
    references: [smStudents.id],
  }),
  smStaff: one(smStaffs, {
    fields: [teacherRemarks.teacherId],
    references: [smStaffs.id],
  }),
}));

export const transcationsRelations = relations(transcations, ({ one }) => ({
  user: one(users, {
    fields: [transcations.userId],
    references: [users.id],
  }),
}));

export const twoFactorSettingsRelations = relations(twoFactorSettings, ({ one }) => ({
  smSchool: one(smSchools, {
    fields: [twoFactorSettings.schoolId],
    references: [smSchools.id],
  }),
}));

export const userOtpCodesRelations = relations(userOtpCodes, ({ one }) => ({
  user: one(users, {
    fields: [userOtpCodes.userId],
    references: [users.id],
  }),
}));

export const videoUploadsRelations = relations(videoUploads, ({ one }) => ({
  smAcademicYear: one(smAcademicYears, {
    fields: [videoUploads.academicId],
    references: [smAcademicYears.id],
  }),
  smSchool: one(smSchools, {
    fields: [videoUploads.schoolId],
    references: [smSchools.id],
  }),
}));

export const walletTransactionsRelations = relations(walletTransactions, ({ one }) => ({
  user: one(users, {
    fields: [walletTransactions.userId],
    references: [users.id],
  }),
}));
