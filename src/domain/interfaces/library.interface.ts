export interface ILibraryRepository {
  // --- Catalog ---
  getBooks(tenantId: string, filter?: { categoryId?: string; search?: string }): Promise<IBook[]>;
  getBookById(tenantId: string, id: string): Promise<IBook | null>;
  createBook(data: Partial<IBook>): Promise<IBook>;
  getCategories(tenantId: string): Promise<IBookCategory[]>;

  // --- Circulation ---
  issueBook(data: Partial<IBookIssue>): Promise<IBookIssue>;
  returnBook(tenantId: string, issueId: string, returnDate: Date, fineAmount?: number): Promise<void>;
  getUserIssues(tenantId: string, userId: string): Promise<IBookIssue[]>;

  // --- Membership ---
  getLibraryProfile(userId: string, tenantId: string): Promise<ILibraryProfile | null>;
  createLibraryProfile(data: Partial<ILibraryProfile>): Promise<ILibraryProfile>;
}

export interface IBook {
  id: string;
  tenantId: string;
  title: string;
  isbn?: string | null;
  author?: string | null;
  categoryId?: string | null;
  quantity: number;
  price?: string | number | null;
  rackNo?: string | null;
}

export interface IBookCategory {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
}

export interface IBookIssue {
  id: string;
  tenantId: string;
  bookId: string;
  userId: string;
  issueDate: Date;
  dueDate: Date;
  returnDate?: Date | null;
  status: "issued" | "returned" | "lost" | "damaged";
  fineAmount?: string | number | null;
  isFinePaid?: string | null;
  academicId?: string | null;
}

export interface ILibraryProfile {
  id: string;
  tenantId: string;
  userId: string;
  maxBooksAllowed: number;
  currentBorrowed: number;
  totalFinesAccrued: string | number | null;
  membershipStatus: "active" | "suspended" | "expired";
}
