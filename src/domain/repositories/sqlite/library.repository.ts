import { db } from "../../../db/index.js";
import { 
  books, 
  bookCategories, 
  bookIssues, 
  libraryProfiles 
} from "../../../db/sqlite/domain-library.js";
import { 
  ILibraryRepository, 
  IBook, 
  IBookCategory, 
  IBookIssue, 
  ILibraryProfile 
} from "../../interfaces/library.interface.js";
import { eq, and } from "drizzle-orm";

export class SqliteLibraryRepository implements ILibraryRepository {
  // --- Catalog ---
  async getBooks(tenantId: number): Promise<IBook[]> {
    const results = await db.select().from(books).where(eq(books.tenantId, tenantId));
    return results.map((row: any) => ({
      ...row,
      price: row.price ? row.price.toString() : null,
    }));
  }

  async getBookById(id: number): Promise<IBook | null> {
    const [result] = await db.select().from(books).where(eq(books.id, id));
    return result ? { ...result, price: result.price ? result.price.toString() : null } : null;
  }

  async createBook(data: Partial<IBook>): Promise<IBook> {
    const [result] = await db.insert(books).values(data as any).returning();
    if (!result) throw new Error("Failed to create book");
    return { ...result, price: result.price ? result.price.toString() : null } as any;
  }

  async getCategories(tenantId: number): Promise<IBookCategory[]> {
    const results = await db.select().from(bookCategories).where(eq(bookCategories.tenantId, tenantId));
    return results.map((row: any) => ({ ...row }));
  }

  // --- Circulation ---
  async issueBook(data: Partial<IBookIssue>): Promise<IBookIssue> {
    const [result] = await db.insert(bookIssues).values(data as any).returning();
    if (!result) throw new Error("Failed to issue book");
    return {
      ...result,
      issueDate: new Date(result.issueDate),
      dueDate: new Date(result.dueDate),
      returnDate: result.returnDate ? new Date(result.returnDate) : null,
      fineAmount: result.fineAmount ? result.fineAmount.toString() : "0.00",
    } as any;
  }

  async returnBook(issueId: number, returnDate: Date, fineAmount: number = 0): Promise<void> {
    await db.update(bookIssues)
      .set({ 
        status: "returned", 
        returnDate, 
        fineAmount: fineAmount.toString() 
      })
      .where(eq(bookIssues.id, issueId));
  }

  async getUserIssues(userId: number): Promise<IBookIssue[]> {
    const results = await db.select().from(bookIssues).where(eq(bookIssues.userId, userId));
    return results.map((row: any) => ({
      ...row,
      issueDate: new Date(row.issueDate),
      dueDate: new Date(row.dueDate),
      returnDate: row.returnDate ? new Date(row.returnDate) : null,
      fineAmount: row.fineAmount ? row.fineAmount.toString() : "0.00",
    }));
  }

  // --- Membership ---
  async getLibraryProfile(userId: number, tenantId: number): Promise<ILibraryProfile | null> {
    const [result] = await db
      .select()
      .from(libraryProfiles)
      .where(and(
        eq(libraryProfiles.userId, userId),
        eq(libraryProfiles.tenantId, tenantId)
      ));
    return result ? { ...result, totalFinesAccrued: result.totalFinesAccrued.toString() } : null;
  }

  async createLibraryProfile(data: Partial<ILibraryProfile>): Promise<ILibraryProfile> {
    const [result] = await db.insert(libraryProfiles).values(data as any).returning();
    if (!result) throw new Error("Failed to create library profile");
    return { ...result, totalFinesAccrued: result.totalFinesAccrued.toString() } as any;
  }
}
