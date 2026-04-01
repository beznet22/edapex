import { db } from "../../../db/index.js";
import { 
  dormitories, 
  rooms, 
  routes, 
  vehicles, 
  routeAssignments, 
  facilityAllocations, 
  complaints, 
  visitors 
} from "../../../db/sqlite/domain-facilities.js";
import { 
  IFacilitiesRepository, 
  IDormitory, 
  IRoom, 
  IRoute, 
  IVehicle, 
  IFacilityAllocation, 
  IComplaint, 
  IVisitor 
} from "../../interfaces/facilities.interface.js";
import { eq, and } from "drizzle-orm";

export class SqliteFacilitiesRepository implements IFacilitiesRepository {
  // --- Dormitories ---
  async getDormitories(tenantId: string): Promise<IDormitory[]> {
    const results = await db.select().from(dormitories).where(eq(dormitories.tenantId, tenantId));
    return results.map((row: any) => ({ ...row }));
  }

  async getRoomsByDormitory(dormitoryId: string): Promise<IRoom[]> {
    const results = await db.select().from(rooms).where(eq(rooms.dormitoryId, dormitoryId));
    return results.map((row: any) => ({
      ...row,
      costPerTerm: row.costPerTerm ? row.costPerTerm.toString() : null,
    }));
  }

  async createRoom(data: Partial<IRoom>): Promise<IRoom> {
    const [result] = await db.insert(rooms).values(data as any).returning();
    if (!result) throw new Error("Failed to create room");
    return {
      ...result,
      costPerTerm: result.costPerTerm ? result.costPerTerm.toString() : null,
    };
  }

  // --- Transport ---
  async getRoutes(tenantId: string): Promise<IRoute[]> {
    const results = await db.select().from(routes).where(eq(routes.tenantId, tenantId));
    return results.map((row: any) => ({
      ...row,
      cost: row.cost ? row.cost.toString() : null,
    }));
  }

  async getVehicles(tenantId: string): Promise<IVehicle[]> {
    const results = await db.select().from(vehicles).where(eq(vehicles.tenantId, tenantId));
    return results.map((row: any) => ({ ...row }));
  }

  async assignVehicleToRoute(routeId: string, vehicleId: string, tenantId: string): Promise<void> {
    await db.insert(routeAssignments).values({ routeId, vehicleId, tenantId });
  }

  // --- Allocations ---
  async getAllocationsByUser(userId: string): Promise<IFacilityAllocation[]> {
    const results = await db.select().from(facilityAllocations).where(eq(facilityAllocations.userId, userId));
    return results.map((row: any) => ({ ...row }));
  }

  async allocateFacility(data: Partial<IFacilityAllocation>): Promise<IFacilityAllocation> {
    const [result] = await db.insert(facilityAllocations).values(data as any).returning();
    if (!result) throw new Error("Failed to allocate facility");
    return { ...result };
  }

  async releaseAllocation(tenantId: string, id: string): Promise<void> {
    await db.update(facilityAllocations).set({ status: "released" }).where(and(eq(facilityAllocations.id, id), eq(facilityAllocations.tenantId, tenantId)));
  }

  // --- Operations ---
  async getComplaints(tenantId: string): Promise<IComplaint[]> {
    const results = await db.select().from(complaints).where(eq(complaints.tenantId, tenantId));
    return results.map((row: any) => ({ ...row }));
  }

  async createComplaint(data: Partial<IComplaint>): Promise<IComplaint> {
    const [result] = await db.insert(complaints).values(data as any).returning();
    if (!result) throw new Error("Failed to create complaint");
    return { ...result } as any;
  }

  async getVisitors(tenantId: string): Promise<IVisitor[]> {
    const results = await db.select().from(visitors).where(eq(visitors.tenantId, tenantId));
    return results.map((row: any) => ({
      ...row,
      checkInAt: row.checkInAt ? new Date(row.checkInAt) : null,
      checkOutAt: row.checkOutAt ? new Date(row.checkOutAt) : null,
    }));
  }

  async logVisitor(data: Partial<IVisitor>): Promise<IVisitor> {
    const [result] = await db.insert(visitors).values(data as any).returning();
    if (!result) throw new Error("Failed to log visitor");
    return {
      ...result,
      checkInAt: result.checkInAt ? new Date(result.checkInAt) : null,
      checkOutAt: result.checkOutAt ? new Date(result.checkOutAt) : null,
    };
  }
}
