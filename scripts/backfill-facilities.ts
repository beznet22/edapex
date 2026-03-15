import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { dormitories, rooms, routes, vehicles, routeAssignments } from "../src/lib/server/db/domain-facilities";
import { smDormitoryLists, smRoomLists, smRoutes, smVehicles, smAssignVehicles } from "../src/lib/server/db/sms-schema";

const legacyUri = process.env.DATABASE_URL;
const targetUri = process.env.DATABASE_V2_URL;

if (!legacyUri || !targetUri) {
  process.exit(1);
}

async function backfillFacilities() {
  const poolLegacy = mysql.createPool({ uri: legacyUri });
  const dbLegacy = drizzle(poolLegacy);

  const poolTarget = mysql.createPool({ uri: targetUri });
  const dbTarget = drizzle(poolTarget);

  console.log("🚀 Starting Facilities backfill...");

  // 1. Dormitories
  console.log("➡️ Backfilling Dormitories...");
  const legacyDorms = await dbLegacy.select().from(smDormitoryLists);
  for (const d of legacyDorms) {
    const type = (d.type || "mixed").toLowerCase() as any;
    await dbTarget.insert(dormitories).values({
      id: d.id,
      tenantId: d.schoolId || 1,
      name: d.dormitoryName!,
      type: ["boys", "girls", "mixed"].includes(type) ? type : "mixed",
      address: d.description, // Reusing description as address if sparse
    });
  }

  // 2. Rooms
  console.log("➡️ Backfilling Rooms...");
  const legacyRooms = await dbLegacy.select().from(smRoomLists);
  for (const r of legacyRooms) {
    await dbTarget.insert(rooms).values({
      id: r.id,
      tenantId: r.schoolId || 1,
      dormitoryId: r.dormitoryId || 1,
      roomNumber: r.name!,
      roomType: "standard", // default mapping
      capacity: r.numberOfBed || 0,
    });
  }

  // 3. Routes
  console.log("➡️ Backfilling Routes...");
  const legacyRoutes = await dbLegacy.select().from(smRoutes);
  for (const r of legacyRoutes) {
    await dbTarget.insert(routes).values({
      id: r.id,
      tenantId: r.schoolId || 1,
      name: r.title!,
      cost: (r.far || 0).toString(),
    });
  }

  // 4. Vehicles
  console.log("➡️ Backfilling Vehicles...");
  const legacyVehicles = await dbLegacy.select().from(smVehicles);
  for (const v of legacyVehicles) {
    await dbTarget.insert(vehicles).values({
      id: v.id,
      tenantId: v.schoolId || 1,
      vehicleNo: v.vehicleNo!,
      vehicleModel: v.vehicleModel,
      driverId: v.driverId,
      capacity: 0, // Legacy vehicle table doesn't have capacity usually, or it depends on the setup
    });
  }

  // 5. Assignments
  console.log("➡️ Backfilling Route Assignments...");
  const legacyAssign = await dbLegacy.select().from(smAssignVehicles);
  for (const a of legacyAssign) {
    if (!a.routeId || !a.vehicleId) continue;
    await dbTarget.insert(routeAssignments).values({
      tenantId: a.schoolId || 1,
      routeId: a.routeId,
      vehicleId: a.vehicleId,
    });
  }

  console.log("🎉 Facilities backfill complete.");
  await poolLegacy.end();
  await poolTarget.end();
  process.exit(0);
}

backfillFacilities().catch(console.error);
