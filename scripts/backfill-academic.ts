import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { classes, sections, classSections, subjects } from "../src/lib/server/db/domain-academic";
import { smClasses, smSections, smClassSections, smSubjects } from "../src/lib/server/db/sms-schema";
import { eq, and } from "drizzle-orm";

// Isolation: Requires both DATABASE_URL (legacy) and DATABASE_V2_URL (target)
const legacyUri = process.env.DATABASE_URL;
const targetUri = process.env.DATABASE_V2_URL;

if (!legacyUri || !targetUri) {
  console.error("Missing environment variables: DATABASE_URL and DATABASE_V2_URL are required.");
  process.exit(1);
}

async function backfillAcademic() {
  console.log("Initializing dual-database connections for Academic Layer...");
  
  const poolLegacy = mysql.createPool({ uri: legacyUri });
  const dbLegacy = drizzle(poolLegacy);

  const poolTarget = mysql.createPool({ uri: targetUri });
  const dbTarget = drizzle(poolTarget);
  
  console.log(" Starting isolated academic backfill...");

  // 1. Backfill Classes
  console.log(" Backfilling Classes...");
  const legacyClasses = await dbLegacy.select().from(smClasses);
  let classCount = 0;
  for (const c of legacyClasses) {
    const existing = await dbTarget.select().from(classes).where(eq(classes.id, c.id)).limit(1);
    if (existing.length === 0) {
      await dbTarget.insert(classes).values({
        id: c.id,
        tenantId: c.schoolId || 1,
        academicId: c.academicId || 1,
        name: c.className,
        activeStatus: c.activeStatus,
      });


      classCount++;
    }
  }
  console.log(` Migrated ${classCount} classes.`);

  // 2. Backfill Sections
  console.log(" Backfilling Sections...");
  const legacySections = await dbLegacy.select().from(smSections);
  let sectionCount = 0;
  for (const s of legacySections) {
    const existing = await dbTarget.select().from(sections).where(eq(sections.id, s.id)).limit(1);
    if (existing.length === 0) {
      await dbTarget.insert(sections).values({
        id: s.id,
        tenantId: s.schoolId || 1,
        name: s.sectionName,
        activeStatus: s.activeStatus,
      });
      sectionCount++;
    }
  }
  console.log(` Migrated ${sectionCount} sections.`);

  // 3. Backfill Class-Section Mapping
  console.log(" Backfilling Class-Section mappings...");
  const legacyCS = await dbLegacy.select().from(smClassSections);
  let csCount = 0;
  for (const cs of legacyCS) {
    if (!cs.classId || !cs.sectionId) continue;
    
    const existing = await dbTarget.select().from(classSections)
      .where(and(eq(classSections.classId, cs.classId), eq(classSections.sectionId, cs.sectionId)))
      .limit(1);
      
    if (existing.length === 0) {
      await dbTarget.insert(classSections).values({
        classId: cs.classId,
        sectionId: cs.sectionId,
        tenantId: cs.schoolId || 1,
        academicId: cs.academicId || 1,
      });
      csCount++;
    }
  }
  console.log(` Migrated ${csCount} class-section associations.`);

  // 4. Backfill Subjects
  console.log(" Backfilling Subjects...");
  const legacySubjects = await dbLegacy.select().from(smSubjects);
  let subCount = 0;
  for (const sub of legacySubjects) {
     const existing = await dbTarget.select().from(subjects).where(eq(subjects.id, sub.id)).limit(1);
     if (existing.length === 0) {
        await dbTarget.insert(subjects).values({
            id: sub.id,
            tenantId: sub.schoolId || 1,
            academicId: sub.academicId || 1,
            name: sub.subjectName,
            code: sub.subjectCode,
            type: sub.subjectType === "T" ? "theory" : "practical",
            activeStatus: sub.activeStatus,
        });
        subCount++;
     }
  }
  console.log(` Migrated ${subCount} subjects.`);

  console.log(" Academic backfill complete.");
  await poolLegacy.end();
  await poolTarget.end();
  process.exit(0);
}

backfillAcademic().catch((err) => {
  console.error(" Academic backfill failed:", err);
  process.exit(1);
});
