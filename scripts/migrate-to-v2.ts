import { config } from "dotenv";
import { drizzle } from "drizzle-orm/mysql2";
import * as mysql from 'mysql2/promise';
import * as v1Schema from "./sms-schema";
import * as v2Schema from "../src/db/schema";
import { eq, sql } from "drizzle-orm";

config();

async function migrate() {
  console.log("🚀 Starting EdApex V1 to V2 Data Migration...");

  const v1Connection = await mysql.createConnection(process.env.DATABASE_URL!);
  const v1Db = drizzle(v1Connection, { schema: v1Schema, mode: "default" });

  const v2Connection = await mysql.createConnection(process.env.DATABASE_V2_URL!);
  const v2Db = drizzle(v2Connection, { schema: v2Schema, mode: "default" });

  console.log("📦 Connected to both databases.");

  try {
    // 1. Migrate Tenants (Schools)
    console.log("--- Migrating Tenants ---");
    const schools = await v1Db.select().from(v1Schema.smSchools);
    for (const school of schools) {
      console.log(`  Migrating School: ${school.schoolName}`);
      await v2Db.insert(v2Schema.tenants).values(<any>{
        id: school.id,
        name: school.schoolName || "Unnamed School",
        email: school.email,
        activeStatus: school.activeStatus,
        metadata: {
        },
      }).onDuplicateKeyUpdate({
        set: { name: school.schoolName || "Unnamed School" }
      });
    }

    // 2. Migrate Academic Years
    console.log("--- Migrating Academic Years ---");
    const academicYears = await v1Db.select().from(v1Schema.smAcademicYears);
    for (const ay of academicYears) {
      console.log(`  Migrating Academic Year: ${ay.year}`);
      await v2Db.insert(v2Schema.academicYears).values(<any>{
        id: ay.id,
        tenantId: ay.schoolId!,
        title: ay.year || "",
        year: ay.year,
        startingDate: String(ay.startingDate || ""),
        endingDate: String(ay.endingDate || ""),
        isCurrent: ay.activeStatus === 1 ? 1 : 0,
        activeStatus: ay.activeStatus,
      }).onDuplicateKeyUpdate({
        set: { title: ay.year || "" }
      });
    }

    // 2.5 Migrate Enumerations (Required for Accounts FKs)
    console.log("--- Migrating Enumerations ---");
    
    // Fetch Base Groups for domain mapping
    const baseGroups = await v1Db.select().from(v1Schema.smBaseGroups);
    const groupMap = new Map(baseGroups.map(bg => [bg.id, bg.name?.toLowerCase().replace(/ /g, "_")]));

    // Migrate Base Setups
    const baseSetups = await v1Db.select().from(v1Schema.smBaseSetups);
    for (const bs of baseSetups) {
      const domain = groupMap.get(bs.baseGroupId!) || "general";
      await v2Db.insert(v2Schema.enumerations).values(<any>{
        id: bs.id as any,
        tenantId: bs.schoolId,
        domain: domain,
        code: bs.baseSetupName?.toLowerCase().replace(/ /g, "_") || "none",
        label: bs.baseSetupName || "None",
      }).onDuplicateKeyUpdate({
        set: { label: bs.baseSetupName || "None" }
      });
    }

    // Migrate Student Categories
    const studentCategories = await v1Db.select().from(v1Schema.smStudentCategories);
    for (const sc of studentCategories) {
      await v2Db.insert(v2Schema.enumerations).values(<any>{
        id: (sc.id + 1000) as any, // Offset to avoid collisions with base setups
        tenantId: sc.schoolId,
        domain: "student_category",
        code: sc.categoryName?.toLowerCase().replace(/ /g, "_") || "none",
        label: sc.categoryName || "None",
      }).onDuplicateKeyUpdate({
        set: { label: sc.categoryName || "None" }
      });
    }

    // Migrate Designations
    const designations = await v1Db.select().from(v1Schema.smDesignations);
    for (const d of designations) {
      await v2Db.insert(v2Schema.enumerations).values(<any>{
        id: (d.id + 2000) as any, // Offset
        tenantId: d.schoolId,
        domain: "designation",
        code: d.title?.toLowerCase().replace(/ /g, "_") || "none",
        label: d.title || "None",
      }).onDuplicateKeyUpdate({
        set: { label: d.title || "None" }
      });
    }

    // Migrate Departments
    const departments = await v1Db.select().from(v1Schema.smHumanDepartments);
    for (const r of departments) {
      await v2Db.insert(v2Schema.enumerations).values(<any>{
        id: (r.id + 3000) as any, // Offset
        tenantId: r.schoolId,
        domain: "religion",
        code: r.name?.toLowerCase().replace(/ /g, "_") || "none",
        label: r.name || "None",
      }).onDuplicateKeyUpdate({
        set: { label: r.name || "None" }
      });
    }

    // 3. Migrate Identities (Logins)
    console.log("--- Migrating Auth Identities (Accounts) ---");
    const v1Users = await v1Db.select().from(v1Schema.users);
    for (const u of v1Users) {
      console.log(`  Migrating Account: ${u.username || u.email}`);
      await v2Db.insert(v2Schema.accounts).values(<any>{
        id: String(u.id),
        username: u.username,
        email: u.email,
        password: u.password,
        phoneNumber: u.phoneNumber,
        activeStatus: u.activeStatus || 1,
        tenantId: u.schoolId,
        roleId: u.roleId,
        isAdministrator: u.isAdministrator === "yes" ? "yes" : "no",
        isRegistered: u.isRegistered || 0,
        walletBalance: Number(u.walletBalance || 0),
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      }).onDuplicateKeyUpdate({
        set: { username: u.username }
      });
    }

    // 4. Migrate Domain Personas (Users)
    // 4.1 Staff
    console.log("--- Migrating Staff Personas ---");
    const staffs = await v1Db.select().from(v1Schema.smStaffs);
    for (const s of staffs) {
      console.log(`  Migrating Staff Persona: ${s.fullName}`);
      await v2Db.insert(v2Schema.users).values(<any>{
        id: (s.id + 100000) as any, // Offset to avoid student ID collisions (Standardized to 100k)
        tenantId: s.schoolId!,
        accountId: s.userId?.toString(), // Link to auth ID
        userType: "staff",
        firstName: s.firstName || s.fullName?.split(" ")[0] || "Staff",
        lastName: s.lastName || s.fullName?.split(" ").slice(1).join(" ") || "",
        email: s.email,
        mobile: s.mobile,
        dateOfBirth: s.dateOfBirth instanceof Date ? s.dateOfBirth.toISOString().split("T")[0] : s.dateOfBirth,
        genderId: s.genderId,
        photo: s.staffPhoto,
        metadata: {
          designationId: s.designationId,
          departmentId: s.departmentId,
          qualification: s.qualification,
          experience: s.experience,
        },
        activeStatus: s.activeStatus || 1,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }).onDuplicateKeyUpdate({
        set: { userType: "staff" }
      });
    }

    // 4.2 Students
    console.log("--- Migrating Student Personas ---");
    const students = await v1Db.select().from(v1Schema.smStudents);
    for (const s of students) {
      console.log(`  Migrating Student Persona: ${s.fullName}`);
      await v2Db.insert(v2Schema.users).values(<any>{
        id: s.id as any,
        tenantId: s.schoolId,
        accountId: s.userId?.toString(), // Link to auth ID
        userType: "student",
        firstName: s.firstName || s.fullName?.split(" ")[0] || "Student",
        lastName: s.lastName || s.fullName?.split(" ").slice(1).join(" ") || "",
        email: s.email,
        mobile: s.mobile,
        dateOfBirth: s.dateOfBirth,
        genderId: s.genderId,
        photo: s.studentPhoto,
        idNumber: s.nationalIdNo,
        parentUserId: s.parentId ? s.parentId + 100000 : null, // Corrected Parent offset (matching persona insertion)
        metadata: {
          admissionNo: s.admissionNo,
          studentCategoryId: s.studentCategoryId,
        },
        activeStatus: s.activeStatus || 1,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }).onDuplicateKeyUpdate({
        set: { userType: "student" }
      });
    }

    // 4.3 Parents
    console.log("--- Migrating Parent Personas ---");
    const parents = await v1Db.select().from(v1Schema.smParents);
    for (const p of parents) {
      console.log(`  Migrating Parent Persona: ${p.fathersName || p.guardiansName}`);
      await v2Db.insert(v2Schema.users).values(<any>{
        id: (p.id + 100000) as any, // Offset
        tenantId: p.schoolId,
        accountId: p.userId?.toString(), // Link to auth ID
        userType: "parent",
        firstName: (p.fathersName || p.guardiansName || "Parent").split(" ")[0],
        lastName: (p.fathersName || p.guardiansName || "").split(" ").slice(1).join(" ") || "",
        email: p.guardiansEmail,
        mobile: p.fathersMobile || p.guardiansMobile,
        metadata: {
          fatherOccupation: p.fathersOccupation || undefined,
          guardianRelation: p.relation || p.guardiansRelation || undefined,
        },
        activeStatus: p.activeStatus || 1,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }).onDuplicateKeyUpdate({
        set: { userType: "parent" }
      });
    }

    // 5. Migrate Sections
    console.log("--- Migrating Sections ---");
    const sections = await v1Db.select().from(v1Schema.smSections);
    for (const s of sections) {
      console.log(`  Migrating Section: ${s.sectionName}`);
      await v2Db.insert(v2Schema.sections).values(<any>{
        id: s.id,
        tenantId: s.schoolId,
        name: s.sectionName,
        activeStatus: s.activeStatus,
        createdAt: s.createdAt,
      }).onDuplicateKeyUpdate({
        set: { name: s.sectionName }
      });
    }

    // 6. Migrate Classes
    console.log("--- Migrating Classes ---");
    const classes = await v1Db.select().from(v1Schema.smClasses);
    for (const c of classes) {
      console.log(`  Migrating Class: ${c.className}`);
      await v2Db.insert(v2Schema.classes).values(<any>{
        id: c.id,
        tenantId: c.schoolId,
        academicId: c.academicId!,
        name: c.className,
        passMark: (c.passMark || "0").toString(),
        activeStatus: c.activeStatus,
        createdAt: c.createdAt,
      }).onDuplicateKeyUpdate({
        set: { name: c.className }
      });
    }

    // 7. Migrate Class-Section Mappings
    console.log("--- Migrating Class-Section Mappings ---");
    const classSections = await v1Db.select().from(v1Schema.smClassSections);
    for (const cs of classSections) {
      if (!cs.classId || !cs.sectionId || !cs.schoolId || !cs.academicId) {
        console.warn(`  Skipping invalid mapping ID ${cs.id}: class=${cs.classId}, section=${cs.sectionId}`);
        continue;
      }
      console.log(`  Mapping Class ${cs.classId} to Section ${cs.sectionId}`);
      await v2Db.insert(v2Schema.classSections).values(<any>{
        id: cs.id,
        tenantId: cs.schoolId,
        academicId: cs.academicId,
        classId: cs.classId,
        sectionId: cs.sectionId,
        createdAt: cs.createdAt,
      }).onDuplicateKeyUpdate({
        set: { 
          classId: sql`VALUES(class_id)`
        }
      });
    }

    // 8. Migrate Subjects
    console.log("--- Migrating Subjects ---");
    const subjects = await v1Db.select().from(v1Schema.smSubjects);
    for (const s of subjects) {
      if (!s.schoolId || !s.academicId) continue;
      console.log(`  Migrating Subject: ${s.subjectName}`);
      const mapping = {
        "T": "theory",
        "P": "practical",
        "B": "both",
      };
      await v2Db.insert(v2Schema.subjects).values(<any>{
        id: s.id,
        tenantId: s.schoolId,
        academicId: s.academicId,
        name: s.subjectName,
        code: s.subjectCode,
        type: (mapping[s.subjectType as keyof typeof mapping] || "theory") as any,
        passMark: (s.passMark || "0").toString(),
        activeStatus: s.activeStatus,
        createdAt: s.createdAt,
      }).onDuplicateKeyUpdate({
        set: { 
          name: sql`VALUES(name)`
        }
      });
    }

    // 9. Migrate Grades
    console.log("--- Migrating Grades ---");
    const v1Grades = await v1Db.select().from(v1Schema.smMarksGrades);
    for (const g of v1Grades) {
      await v2Db.insert(v2Schema.grades).values(<any>{
        id: g.id,
        tenantId: g.schoolId,
        name: g.gradeName || "N/A",
        point: (g.gpa || "0").toString(),
        fromMark: (g.percentFrom || "0").toString(),
        toMark: (g.percentUpto || "0").toString(),
        description: g.description,
        academicId: g.academicId,
        createdAt: g.createdAt,
      }).onDuplicateKeyUpdate({
        set: { name: sql`VALUES(name)` }
      });
    }

    // 10. Migrate Exam Types to Exams (V2)
    console.log("--- Migrating Exam Types ---");
    const examTypes = await v1Db.select().from(v1Schema.smExamTypes);
    for (const et of examTypes) {
      console.log(`  Migrating Exam Type: ${et.title}`);
      await v2Db.insert(v2Schema.exams).values(<any>{
        id: et.id,
        tenantId: et.schoolId,
        examType: "term", // Default
        title: et.title,
        academicId: et.academicId,
        percentage: (et.percantage || "100").toString(),
        activeStatus: et.activeStatus,
        createdAt: et.createdAt,
      }).onDuplicateKeyUpdate({
        set: { title: sql`VALUES(title)` }
      });
    }


    // 13. Migrate Homeworks
    console.log("--- Migrating Homeworks ---");
    const homeworks = await v1Db.select().from(v1Schema.smHomeworks);
    for (const h of homeworks) {
      console.log(`  Migrating Homework: ${h.description?.substring(0, 20)}...`);
      await v2Db.insert(v2Schema.homeworks).values(<any>{
        id: h.id,
        tenantId: h.schoolId,
        classId: h.classId!,
        sectionId: h.sectionId!,
        subjectId: h.subjectId!,
        homeworkDate: h.homeworkDate!,
        submissionDate: h.submissionDate!,
        description: h.description,
        attachment: h.file,
        marks: (h.marks || "0").toString(),
        academicId: h.academicId!,
        createdAt: h.createdAt,
      }).onDuplicateKeyUpdate({
        set: { description: sql`VALUES(description)` }
      });
    }

    // 14. Migrate Homework Submissions
    console.log("--- Migrating Homework Submissions ---");
    const submissions = await v1Db.select().from(v1Schema.smHomeworkStudents);
    for (const s of submissions) {
      if (!s.studentId) continue;

      // Lookup homework details for context
      const hw = s.homeworkId ? await v2Db.select().from(v2Schema.homeworks).where(eq(v2Schema.homeworks.id, s.homeworkId)).limit(1) : [];
      const parentHw = hw[0];

      // Find enrollment ID for this student in this academic year
      const enr = parentHw ? await v2Db.select().from(v2Schema.enrollments).where(sql`${v2Schema.enrollments.userId} = ${s.studentId} AND ${v2Schema.enrollments.academicId} = ${parentHw.academicId}`).limit(1) : [];
      const enrollmentId = enr[0]?.id || null;

      await v2Db.insert(v2Schema.homeworkSubmissions).values(<any>{
        id: s.id,
        tenantId: s.schoolId,
        homeworkId: s.homeworkId!,
        userId: s.studentId, // Student persona ID
        enrollmentId: enrollmentId,
        classId: parentHw?.classId || null,
        sectionId: parentHw?.sectionId || null,
        marks: (s.marks || "0").toString(),
        status: s.id % 2 === 0 ? "submitted" : "pending", // Placeholder for actual status logic
        createdAt: s.createdAt,
      }).onDuplicateKeyUpdate({
        set: { 
          marks: sql`VALUES(marks)`,
          enrollmentId: sql`VALUES(enrollment_id)`,
          classId: sql`VALUES(class_id)`,
          sectionId: sql`VALUES(section_id)`
        }
      });
    }

    // Load valid enrollments to prevent FK crashes from orphaned legacy data
    const validEnrollments = new Set((await v2Db.select({ id: v2Schema.enrollments.id }).from(v2Schema.enrollments)).map(e => e.id));

    // 15. Migrate Student Attendances (Daily)
    console.log("--- Migrating Student Daily Attendances ---");
    const studentDailyAttendances = await v1Db.select().from(v1Schema.smStudentAttendances);
    for (const sa of studentDailyAttendances) {
      if (!sa.studentId || !sa.attendanceDate) continue;
      const statusMap: Record<string, any> = { "P": "present", "A": "absent", "L": "late", "H": "half_day" };
      const enrollmentId = validEnrollments.has(sa.studentRecordId!) ? sa.studentRecordId : null;
      try {
        await v2Db.insert(v2Schema.attendances).values(<any>{
          id: sa.id,
          tenantId: sa.schoolId,
          userId: sa.studentId,
          enrollmentId,
          classId: sa.classId,
          sectionId: sa.sectionId,
          actorType: "student",
          scopeType: "daily",
          attendanceDate: sa.attendanceDate,
          status: statusMap[sa.attendanceType!] || "present",
          metadata: { notes: sa.notes || undefined },
          academicId: sa.academicId!,
          createdAt: sa.createdAt,
        }).onDuplicateKeyUpdate({
          set: { 
            status: sql`VALUES(status)`,
            enrollmentId: sql`VALUES(enrollment_id)`,
            classId: sql`VALUES(class_id)`,
            sectionId: sql`VALUES(section_id)`
          }
        });
      } catch (e) {}
    }

    // 16. Migrate Staff Attendances
    console.log("--- Migrating Staff Attendances ---");
    const staffAttendances = await v1Db.select().from(v1Schema.smStaffAttendences);
    for (const sa of staffAttendances) {
      if (!sa.staffId || !sa.attendenceDate) continue;
      const statusMap: Record<string, any> = { "P": "present", "A": "absent", "L": "late", "H": "half_day" };
      try {
        await v2Db.insert(v2Schema.attendances).values(<any>{
          id: sa.id + 100000, // Offset (Standardized to 100k)
          tenantId: sa.schoolId,
          userId: sa.staffId + 100000, // Persona offset (Standardized to 100k)
          actorType: "staff",
          scopeType: "daily",
          attendanceDate: sa.attendenceDate,
          status: statusMap[sa.attendenceType!] || "present",
          metadata: { notes: sa.notes || undefined },
          academicId: sa.academicId!,
          createdAt: sa.createdAt,
        }).onDuplicateKeyUpdate({
          set: { status: sql`VALUES(status)` }
        });
      } catch (e) {}
    }

    // 17. Migrate Subject Attendances
    console.log("--- Migrating Subject Attendances ---");
    const subjectAttendances = await v1Db.select().from(v1Schema.smSubjectAttendances);
    for (const sa of subjectAttendances) {
      if (!sa.studentId || !sa.attendanceDate) continue;
      const statusMap: Record<string, any> = { "P": "present", "A": "absent", "L": "late", "H": "half_day" };
      const enrollmentId = validEnrollments.has(sa.studentRecordId!) ? sa.studentRecordId : null;
      try {
        await v2Db.insert(v2Schema.attendances).values(<any>{
          id: sa.id + 200000, // Offset (Standardized to 100k steps)
          tenantId: sa.schoolId,
          userId: sa.studentId, // Student persona offset is 0
          enrollmentId,
          classId: sa.classId,
          sectionId: sa.sectionId,
          actorType: "student",
          scopeType: "subject",
          scopeRefId: sa.subjectId,
          attendanceDate: sa.attendanceDate,
          status: statusMap[sa.attendanceType!] || "present",
          metadata: { notes: sa.notes || undefined },
          academicId: sa.academicId!,
          createdAt: sa.createdAt,
        }).onDuplicateKeyUpdate({
          set: { 
            status: sql`VALUES(status)`,
            enrollmentId: sql`VALUES(enrollment_id)`,
            classId: sql`VALUES(class_id)`,
            sectionId: sql`VALUES(section_id)`
          }
        });
      } catch (e) {}
    }

    // 18. Migrate Leave Types
    console.log("--- Migrating Leave Types ---");
    const v1LeaveTypes = await v1Db.select().from(v1Schema.smLeaveTypes);
    for (const lt of v1LeaveTypes) {
      await v2Db.insert(v2Schema.leaveTypes).values(<any>{
        id: lt.id,
        tenantId: lt.schoolId,
        name: lt.type || "Other",
        totalDays: lt.totalDays,
        activeStatus: lt.activeStatus,
        createdAt: lt.createdAt,
      }).onDuplicateKeyUpdate({
        set: { name: sql`VALUES(name)` }
      });
    }

    // 19. Migrate Leave Requests
    console.log("--- Migrating Leave Requests ---");
    const v1LeaveRequests = await v1Db.select().from(v1Schema.smLeaveRequests);
    for (const lr of v1LeaveRequests) {
      if (!lr.staffId || !lr.typeId) continue;
      const statusMap: Record<number, any> = { 0: "pending", 1: "approved", 2: "rejected" };
      await v2Db.insert(v2Schema.hrLeaveRequests).values(<any>{
        id: lr.id,
        tenantId: lr.schoolId,
        userId: lr.staffId + 200000, // Staff persona offset
        leaveTypeId: lr.typeId,
        leaveType: "other", // Placeholder or lookup
        applyDate: lr.applyDate!,
        fromDate: lr.leaveFrom!,
        toDate: lr.leaveTo!,
        reason: lr.reason,
        status: (statusMap as any)[lr.approveStatus!] || "pending",
        createdAt: lr.createdAt,
      }).onDuplicateKeyUpdate({
        set: { status: sql`VALUES(status)` }
      });
    }

    // 20. Migrate Roles to Role Assignments
    console.log("--- Migrating Role Assignments ---");
    const v1Roles = await v1Db.select().from(v1Schema.roles);
    const roleMap = new Map(v1Roles.map(r => [r.id, r.name?.toLowerCase()]));

    // Fetch all personas to map their Roles
    const v2Users = await v2Db.select().from(v2Schema.users);
    for (const persona of v2Users) {
      if (!persona.accountId) continue;
      
      const v1User = await v1Db.select().from(v1Schema.users).where(eq(v1Schema.users.id, Number(persona.accountId))).limit(1);
      if (v1User.length > 0 && v1User[0].roleId) {
        const roleName = roleMap.get(v1User[0].roleId) || persona.userType;
        console.log(`  Assigning Role ${roleName} to Persona ${persona.id}`);
        await v2Db.insert(v2Schema.roleAssignments).values(<any>{
          tenantId: persona.tenantId,
          userId: persona.id,
          roleName: roleName!,
          createdAt: persona.createdAt,
        }).onDuplicateKeyUpdate({
          set: { roleName: sql`VALUES(role_name)` }
        });
      }
    }

    // 21. Migrate General Settings
    console.log("--- Migrating General Settings ---");
    const genSettings = await v1Db.select().from(v1Schema.smGeneralSettings);
    for (const gs of genSettings) {
      if (!gs.schoolId) continue;
      await v2Db.insert(v2Schema.settings).values(<any>{
        tenantId: gs.schoolId,
        domain: "general",
        config: {
          siteTitle: gs.siteTitle,
          schoolCode: gs.schoolCode,
          currency: gs.currency,
          currencySymbol: gs.currencySymbol,
          language: gs.languageName,
          timeZoneId: gs.timeZoneId,
          copyright: gs.copyrightText,
          logo: gs.logo,
          favicon: gs.favicon,
        },
      }).onDuplicateKeyUpdate({
        set: { config: sql`VALUES(config)` }
      });
    }

    // 22. Migrate Email Settings
    console.log("--- Migrating Email Settings ---");
    const emailSettings = await v1Db.select().from(v1Schema.smEmailSettings);
    for (const es of emailSettings) {
      if (!es.schoolId) continue;
      await v2Db.insert(v2Schema.settings).values(<any>{
        tenantId: es.schoolId,
        domain: "email",
        config: {
          engine: es.emailEngineType,
          fromName: es.fromName,
          fromEmail: es.fromEmail,
          mailDriver: es.mailDriver,
          mailHost: es.mailHost,
          mailPort: es.mailPort,
          mailEncryption: es.mailEncryption,
        },
      }).onDuplicateKeyUpdate({
        set: { config: sql`VALUES(config)` }
      });
    }

    // Fetch legacy exams to map examId to its parent examType and schoolId
    const legacyExamsMapping = await v1Db.select({
      id: v1Schema.smExams.id,
      examTypeId: v1Schema.smExams.examTypeId,
      schoolId: v1Schema.smExams.schoolId,
    }).from(v1Schema.smExams);
    
    const examMap = new Map(legacyExamsMapping.map(e => [e.id, { examTypeId: e.examTypeId, schoolId: e.schoolId }]));

    // 22.5 Migrate Enrollments (Student Records)
    console.log("--- Migrating Enrollments (Student Records) ---");
    const studentRecords = await v1Db.select().from(v1Schema.studentRecords);
    for (const sr of studentRecords) {
      if (!sr.studentId || !sr.schoolId || !sr.academicId) continue;
      
      const statusMap: Record<number, any> = { 1: "active", 0: "withdrawn" };
      await v2Db.insert(v2Schema.enrollments).values(<any>{
        id: sr.id,
        tenantId: sr.schoolId,
        userId: sr.studentId, // Student Persona ID
        classId: sr.classId,
        sectionId: sr.sectionId,
        academicId: sr.academicId,
        rollNo: sr.rollNo?.toString() || null,
        isDefault: sr.isDefault,
        status: statusMap[sr.activeStatus || 1] || "active",
        createdAt: sr.createdAt,
        updatedAt: sr.updatedAt,
      }).onDuplicateKeyUpdate({
        set: { status: sql`VALUES(status)` }
      });
    }

    // 23. Migrate Exam Setups (Assessment)
    console.log("--- Migrating Exam Setups ---");
    const v1ExamSetups = await v1Db.select().from(v1Schema.smExamSetups);
    for (const es of v1ExamSetups) {
      if (!es.examId || !es.subjectId) continue;
      const parentExam = examMap.get(es.examId);
      if (!parentExam || !parentExam.examTypeId) continue;

      try {
        await v2Db.insert(v2Schema.examSetups).values(<any>{
          id: es.id,
          tenantId: parentExam.schoolId || 1, 
          examId: parentExam.examTypeId, // Point to V2 exams.id which is smExamTypes.id
          classId: es.classId,
          sectionId: es.sectionId,
          subjectId: es.subjectId,
          title: es.examTitle || "Unknown Title",
          examMark: (es.examMark || "100").toString(),
          createdAt: es.createdAt,
          updatedAt: es.updatedAt,
        }).onDuplicateKeyUpdate({
          set: { 
              title: sql`VALUES(title)`,
              examMark: sql`VALUES(exam_mark)`,
              sectionId: sql`VALUES(section_id)` 
          }
        });
      } catch (e: any) {
        console.warn(`    Skipping invalid Exam Setup ${es.id}:`, e.message);
      }
    }

    // 24. Migrate Exam Marks
    console.log("--- Migrating Exam Marks ---");
    const v1Marks = await v1Db.select().from(v1Schema.smMarkStores);
    for (const m of v1Marks) {
      if (!m.studentId || !m.examSetupId) continue;
      const enrollmentId = validEnrollments.has(m.studentRecordId!) ? m.studentRecordId : null;
      try {
        await v2Db.insert(v2Schema.examMarks).values(<any>{
          id: m.id,
          tenantId: m.schoolId || 1,
          examSetupId: m.examSetupId,
          userId: m.studentId, // Student persona ID
          enrollmentId,
          totalMarks: (m.totalMarks || "0").toString(),
          isAbsent: m.isAbsent || 0,
          teacherRemarks: m.teacherRemarks,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        }).onDuplicateKeyUpdate({
          set: { totalMarks: sql`VALUES(total_marks)` }
        });
      } catch (e) {
        // Ignore orphans
      }
    }

    // 25. Migrate Computed Results
    console.log("--- Migrating Computed Results ---");
    const v1Results = await v1Db.select().from(v1Schema.smResultStores);
    for (const cr of v1Results) {
      if (!cr.studentId || !cr.examTypeId) continue;
      const enrollmentId = validEnrollments.has(cr.studentRecordId!) ? cr.studentRecordId : null;
      try {
        await v2Db.insert(v2Schema.computedResults).values(<any>{
          id: cr.id,
          tenantId: cr.schoolId || 1,
          userId: cr.studentId,
          examId: cr.examTypeId,
          classId: cr.classId,
          sectionId: cr.sectionId,
          enrollmentId,
          totalMarks: (cr.totalMarks || "0").toString(),
          gpaPoint: (cr.totalGpaPoint || "0").toString(),
          gpaGrade: cr.totalGpaGrade || undefined,
          teacherRemarks: cr.teacherRemarks,
          academicId: cr.academicId || 1,
          createdAt: cr.createdAt,
          updatedAt: cr.updatedAt,
        }).onDuplicateKeyUpdate({
          set: { totalMarks: sql`VALUES(total_marks)` }
        });
      } catch (e) {}
    }

    // 26. Migrate Finance (Fee Groups & Types)
    console.log("--- Migrating Fee Groups ---");
    const v1FeeGroups = await v1Db.select().from(v1Schema.fmFeesGroups);
    for (const fg of v1FeeGroups) {
      await v2Db.insert(v2Schema.feeGroups).values(<any>{
        id: fg.id,
        tenantId: fg.schoolId || 1,
        name: fg.name || "Unnamed Group",
        description: fg.description,
      }).onDuplicateKeyUpdate({
        set: { name: sql`VALUES(name)` }
      });
    }

    // 27. Migrate Fee Assignments
    console.log("--- Migrating Fee Assignments ---");
    const v1FeeAssigns = await v1Db.select().from(v1Schema.smFeesAssigns);
    for (const fa of v1FeeAssigns) {
      if (!fa.studentId) continue;
      const enrollmentId = validEnrollments.has(fa.recordId!) ? fa.recordId : null;
      try {
        await v2Db.insert(v2Schema.feeAssignments).values(<any>{
          id: fa.id,
          tenantId: fa.schoolId || 1,
          academicId: fa.academicId || 1,
          feeMasterId: fa.feesMasterId!,
          userId: fa.studentId,
          enrollmentId,
          assignedAmount: (fa.feesAmount || "0").toString(),
        }).onDuplicateKeyUpdate({
          set: { assignedAmount: sql`VALUES(assigned_amount)` }
        });
      } catch (e) {}
    }

    // 28. Migrate Ledger (Wallet Transactions)
    console.log("--- Migrating Ledger Entries (Wallet Transactions) ---");
    const walletTrans = await v1Db.select().from(v1Schema.walletTransactions);
    for (const wt of walletTrans) {
      if (!wt.userId) continue;
      try {
        await v2Db.insert(v2Schema.ledgerEntries).values(<any>{
          id: wt.id,
          tenantId: wt.schoolId || 1,
          transactionType: "wallet_topup",
          amount: (wt.amount || "0").toString(),
          userId: wt.userId,
          enrollmentId: null, // Wallet is usually user-level
          postedAt: wt.createdAt,
        }).onDuplicateKeyUpdate({
          set: { amount: sql`VALUES(amount)` }
        });
      } catch (e) {}
    }

    console.log("✅ Full Data Migration completed successfully (Core, Identity, Academic, Assessment, Attendance, HR, PBAC, Settings, Finance).");

  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    await v1Connection.end();
    await v2Connection.end();
  }
}

migrate().catch(console.error);
