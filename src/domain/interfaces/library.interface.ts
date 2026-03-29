export interface ILibraryRepository {
  // --- Catalog ---
  getBooks(tenantId: number, filter?: { categoryId?: number; search?: string }): Promise<IBook[]>;
  getBookById(id: number): Promise<IBook | null>;
  createBook(data: Partial<IBook>): Promise<IBook>;
  getCategories(tenantId: number): Promise<IBookCategory[]>;

  // --- Circulation ---
  issueBook(data: Partial<IBookIssue>): Promise<IBookIssue>;
  returnBook(issueId: number, returnDate: Date, fineAmount?: number): Promise<void>;
  getUserIssues(userId: number): Promise<IBookIssue[]>;

  // --- Membership ---
  getLibraryProfile(userId: number, tenantId: number): Promise<ILibraryProfile | null>;
  createLibraryProfile(data: Partial<ILibraryProfile>): Promise<ILibraryProfile>;
}

export interface IBook {
  id: number;
  tenantId: number;
  title: string;
  isbn?: string | null;
  author?: string | null;
  categoryId?: number | null;
  quantity: number;
  price?: string | number | null;
  rackNo?: string | null;
}

export interface IBookCategory {
  id: number;
  tenantId: number;
  name: string;
  description?: string | null;
}

export interface IBookIssue {
  id: number;
  tenantId: number;
  bookId: number;
  userId: number;
  issueDate: Date;
  dueDate: Date;
  returnDate?: Date | null;
  status: "issued" | "returned" | "lost" | "damaged";
  fineAmount?: string | number | null;
  isFinePaid?: number | null;
  academicId?: number | null;
}

export interface ILibraryProfile {
  id: number;
  tenantId: number;
  userId: number;
  maxBooksAllowed: number;
  currentBorrowed: number;
  totalFinesAccrued: string | number | null;
  membershipStatus: "active" | "suspended" | "expired";
}
