export interface IFacilitiesRepository {
  // --- Dormitories & Rooms ---
  getDormitories(tenantId: string): Promise<IDormitory[]>;
  getRoomsByDormitory(dormitoryId: string): Promise<IRoom[]>;
  createRoom(data: Partial<IRoom>): Promise<IRoom>;

  // --- Transport ---
  getRoutes(tenantId: string): Promise<IRoute[]>;
  getVehicles(tenantId: string): Promise<IVehicle[]>;
  assignVehicleToRoute(routeId: string, vehicleId: string, tenantId: string): Promise<void>;

  // --- Allocations ---
  getAllocationsByUser(userId: string): Promise<IFacilityAllocation[]>;
  allocateFacility(data: Partial<IFacilityAllocation>): Promise<IFacilityAllocation>;
  releaseAllocation(tenantId: string, id: string): Promise<void>;

  // --- Operations ---
  getComplaints(tenantId: string, filter?: { status?: string; userId?: string }): Promise<IComplaint[]>;
  createComplaint(data: Partial<IComplaint>): Promise<IComplaint>;
  getVisitors(tenantId: string): Promise<IVisitor[]>;
  logVisitor(data: Partial<IVisitor>): Promise<IVisitor>;
}

export interface IDormitory {
  id: string;
  tenantId: string;
  name: string;
  type: "boys" | "girls" | "mixed";
  address?: string | null;
  intake?: number | null;
}

export interface IRoom {
  id: string;
  tenantId: string;
  dormitoryId: string;
  roomNumber: string;
  roomType: "standard" | "deluxe" | "suite";
  capacity: number;
  costPerTerm?: string | number | null;
}

export interface IRoute {
  id: string;
  tenantId: string;
  name: string;
  cost?: string | number | null;
}

export interface IVehicle {
  id: string;
  tenantId: string;
  vehicleNo: string;
  vehicleModel?: string | null;
  driverId?: string | null;
  capacity: number;
}

export interface IFacilityAllocation {
  id: string;
  tenantId: string;
  userId: string;
  facilityType: "transport" | "dormitory";
  facilityRefId: string;
  status: "active" | "released" | "transferred";
  academicId: string;
}

export interface IComplaint {
  id: string;
  tenantId: string;
  complaintBy: string;
  complaintType: string;
  complaintSource: "parent" | "student" | "staff" | "external";
  description: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  assignedTo?: string | null;
  complaintDate: string;
}

export interface IVisitor {
  id: string;
  tenantId: string;
  name: string;
  phone?: string | null;
  purpose: string;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
}
