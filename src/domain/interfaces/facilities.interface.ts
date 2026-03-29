export interface IFacilitiesRepository {
  // --- Dormitories & Rooms ---
  getDormitories(tenantId: number): Promise<IDormitory[]>;
  getRoomsByDormitory(dormitoryId: number): Promise<IRoom[]>;
  createRoom(data: Partial<IRoom>): Promise<IRoom>;

  // --- Transport ---
  getRoutes(tenantId: number): Promise<IRoute[]>;
  getVehicles(tenantId: number): Promise<IVehicle[]>;
  assignVehicleToRoute(routeId: number, vehicleId: number, tenantId: number): Promise<void>;

  // --- Allocations ---
  getAllocationsByUser(userId: number): Promise<IFacilityAllocation[]>;
  allocateFacility(data: Partial<IFacilityAllocation>): Promise<IFacilityAllocation>;
  releaseAllocation(id: number): Promise<void>;

  // --- Operations ---
  getComplaints(tenantId: number, filter?: { status?: string; userId?: number }): Promise<IComplaint[]>;
  createComplaint(data: Partial<IComplaint>): Promise<IComplaint>;
  getVisitors(tenantId: number): Promise<IVisitor[]>;
  logVisitor(data: Partial<IVisitor>): Promise<IVisitor>;
}

export interface IDormitory {
  id: number;
  tenantId: number;
  name: string;
  type: "boys" | "girls" | "mixed";
  address?: string | null;
  intake?: number | null;
}

export interface IRoom {
  id: number;
  tenantId: number;
  dormitoryId: number;
  roomNumber: string;
  roomType: "standard" | "deluxe" | "suite";
  capacity: number;
  costPerTerm?: string | number | null;
}

export interface IRoute {
  id: number;
  tenantId: number;
  name: string;
  cost?: string | number | null;
}

export interface IVehicle {
  id: number;
  tenantId: number;
  vehicleNo: string;
  vehicleModel?: string | null;
  driverId?: number | null;
  capacity: number;
}

export interface IFacilityAllocation {
  id: number;
  tenantId: number;
  userId: number;
  facilityType: "transport" | "dormitory";
  facilityRefId: number;
  status: "active" | "released" | "transferred";
  academicId: number;
}

export interface IComplaint {
  id: number;
  tenantId: number;
  complaintBy: number;
  complaintType: string;
  complaintSource: "parent" | "student" | "staff" | "external";
  description: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  assignedTo?: number | null;
  complaintDate: string;
}

export interface IVisitor {
  id: number;
  tenantId: number;
  name: string;
  phone?: string | null;
  purpose: string;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
}
