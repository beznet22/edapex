import { db } from "../../../db/index.js";
import { 
  books, 
  bookCategories, 
  bookIssues, 
  libraryProfiles 
} from "../../../db/mysql/domain-library.js";
import { 
  ILibraryRepository, 
  IBook, 
  IBookCategory, 
  IBookIssue, 
  ILibraryProfile 
} from "../../interfaces/library.interface.js";
import { eq, and } from "drizzle-orm";

export class MySqlLibraryRepository implements ILibraryRepository {
  // --- Catalog ---
  async getBooks(tenantId: string): Promise<IBook[]> {
    const results = await db.select().from(books).where(eq(books.tenantId, tenantId));
    return results.map((row: any) => ({
      ...row,
      price: row.price ? row.price.toString() : null,
    }));
  }

  async getBookById(tenantId: string, id: string): Promise<IBook | null> {
    const [result] = await db
      .select()
      .from(books)
      .where(and(eq(books.id, id), eq(books.tenantId, tenantId)));
    return result ? { ...result, price: result.price ? result.price.toString() : null } : null;
  }

  async createBook(data: Partial<IBook>): Promise<IBook> {
    await db.insert(books).values(data as any);
    const book = await this.getBookById(data.tenantId!, data.id!);
    if (!book) throw new Error("Failed to create book");
    return book;
  }

  async getCategories(tenantId: string): Promise<IBookCategory[]> {
    const results = await db.select().from(bookCategories).where(eq(bookCategories.tenantId, tenantId));
    return results.map((row: any) => ({ ...row }));
  }

  // --- Circulation ---
  async issueBook(data: Partial<IBookIssue>): Promise<IBookIssue> {
    await db.insert(bookIssues).values(data as any);
    const [row] = await db.select().from(bookIssues).where(eq(bookIssues.id, data.id!));
    if (!row) throw new Error("Failed to issue book");
    return {
      ...row,
      issueDate: new Date(row.issueDate),
      dueDate: new Date(row.dueDate),
      returnDate: row.returnDate ? new Date(row.returnDate) : null,
      fineAmount: row.fineAmount ? row.fineAmount.toString() : "0.00",
    };
  }

  async returnBook(tenantId: string, issueId: string, returnDate: Date, fineAmount: number = 0): Promise<void> {
    await db.update(bookIssues)
      .set({ 
        status: "returned", 
        returnDate, 
        fineAmount: fineAmount.toString() 
      })
      .where(and(eq(bookIssues.id, issueId), eq(bookIssues.tenantId, tenantId)));
  }

  async getUserIssues(tenantId: string, userId: string): Promise<IBookIssue[]> {
    const results = await db
      .select()
      .from(bookIssues)
      .where(and(eq(bookIssues.tenantId, tenantId), eq(bookIssues.userId, userId)));
    return results.map((row: any) => ({
      ...row,
      issueDate: new Date(row.issueDate),
      dueDate: new Date(row.dueDate),
      returnDate: row.returnDate ? new Date(row.returnDate) : null,
      fineAmount: row.fineAmount ? row.fineAmount.toString() : "0.00",
    }));
  }

  // --- Membership ---
  async getLibraryProfile(userId: string, tenantId: string): Promise<ILibraryProfile | null> {
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
    await db.insert(libraryProfiles).values(data as any);
    const profile = await this.getLibraryProfile(data.userId!, data.tenantId!);
    if (!profile) throw new Error("Failed to create library profile");
    return profile;
  }
}
