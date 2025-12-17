import { eq, sql, desc } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { jobs, failedJobs } from "$lib/server/db/sms-schema";
import { BaseRepository } from "./base.repo";

export type ClaimedJob = {
  id: number;
  queue: string;
  payload: string;
  attempts: number;
  reservedAt: number | null;
  availableAt: number;
  createdAt: number;
};

class JobRepository extends BaseRepository {
  async enqueueJob(queue: string, payloadObj: unknown, delaySeconds = 0) {
    // Enqueue a new job with optional delay (seconds)
    const payload = typeof payloadObj === "string" ? payloadObj : JSON.stringify(payloadObj);
    const now = Math.floor(Date.now() / 1000);
    const availableAt = now + delaySeconds;

    const result = await this.db
      .insert(jobs)
      .values({
        queue,
        payload,
        attempts: 0,
        reservedAt: null,
        availableAt,
        createdAt: now,
      })
      .$returningId();

    return result[0]?.id || null;
  }

  async deleteJob(id: number) {
    await this.db.delete(jobs).where(eq(jobs.id, id)).execute();
  }

  async requeueJob(id: number, backoffSeconds = 60) {
    // Requeue a failed job with exponential backoff
    const nextAvailable = Math.floor(Date.now() / 1000) + backoffSeconds;
    await this.db
      .update(jobs)
      .set({
        reservedAt: null,
        availableAt: nextAvailable,
      })
      .where(eq(jobs.id, id))
      .execute();
  }

  async insertFailedJob(
    connection: string,
    queue: string,
    payload: string,
    exception: string,
    uuid?: string
  ) {
    const values: any = {
      connection,
      queue,
      payload,
      exception,
      failedAt: new Date(),
    };
    if (uuid) values.uuid = uuid;
    await this.db.insert(failedJobs).values(values).execute();
  }

  async pickAndClaimJob(staleSeconds = 60): Promise<ClaimedJob | null> {
    // Claim an available or stale job atomically
    const now = Math.floor(Date.now() / 1000);
    const staleBefore = now - staleSeconds;

    // Use a transaction to ensure atomicity
    const result = await this.db.transaction(async (tx) => {
      // First, select a job to claim
      const candidates = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          sql`${jobs.availableAt} <= ${now} AND (${jobs.reservedAt} IS NULL OR ${jobs.reservedAt} <= ${staleBefore})`
        )
        .orderBy(jobs.createdAt)
        .limit(1);
      if (candidates.length === 0) {
        return null;
      }

      const jobId = candidates[0].id;

      // Then update the selected job to claim it
      const updateResult = await tx
        .update(jobs)
        .set({
          reservedAt: now,
          attempts: sql`${jobs.attempts} + 1`,
        })
        .where(eq(jobs.id, jobId))
        .execute();

      if ((updateResult as any).rowsAffected === 0) {
        return null;
      }

      // Finally, fetch the claimed job
      const [row] = await tx.select().from(jobs).where(eq(jobs.id, jobId));

      if (!row) {
        return null;
      }

      return row;
    });

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      queue: result.queue,
      payload: result.payload,
      attempts: result.attempts,
      reservedAt: result.reservedAt,
      availableAt: result.availableAt,
      createdAt: result.createdAt,
    };
  }

  async getJobCount() {
    const [row] = await this.db.select({ count: sql`COUNT(*)` }).from(jobs);
    return (row?.count as number) ?? 0;
  }

  async getFailedJobs() {
    return await this.db.select().from(failedJobs).orderBy(desc(failedJobs.failedAt));
  }

  async getFailedJobCount() {
    const [row] = await this.db.select({ count: sql`COUNT(*)` }).from(failedJobs);
    return (row?.count as number) ?? 0;
  }

  async deleteFailedJob(id: number) {
    await this.db.delete(failedJobs).where(eq(failedJobs.id, id)).execute();
  }

  async deleteAllFailedJobs() {
    await this.db.delete(failedJobs).execute();
  }

  async getJobById(id: number) {
    const [row] = await this.db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    return row || null;
  }
}
export const jobRepo = await JobRepository.build();
