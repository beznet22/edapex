// /src/lib/server/repository/job.repo.ts

import { eq, sql, desc, and } from "drizzle-orm";
import { jobs, failedJobs } from "$lib/server/db/domain-core";
import { BaseRepository, type MySQLDrizzleClient } from "./base.repo";

export type ClaimedJob = {
  id: number;
  queue: string;
  payload: string;
  attempts: number;
  reservedAt: number | null;
  availableAt: number;
  createdAt: number;
};

export class JobRepository extends BaseRepository {
  async enqueueJob(queue: string, payloadObj: unknown, delaySeconds = 0) {
    const payload = typeof payloadObj === "string" ? payloadObj : JSON.stringify(payloadObj);
    const now = Math.floor(Date.now() / 1000);
    const availableAt = now + delaySeconds;

    const [result] = await this.db
      .insert(jobs)
      .values({
        queue,
        payload,
        attempts: 0,
        reservedAt: null,
        availableAt,
        createdAt: now,
      });

    return (result as any).insertId || null;
  }

  async deleteJob(id: number) {
    await this.db.delete(jobs).where(eq(jobs.id, id));
  }

  async requeueJob(id: number, backoffSeconds = 60) {
    const nextAvailable = Math.floor(Date.now() / 1000) + backoffSeconds;
    await this.db
      .update(jobs)
      .set({
        reservedAt: null,
        availableAt: nextAvailable,
      })
      .where(eq(jobs.id, id));
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
    await this.db.insert(failedJobs).values(values);
  }

  async pickAndClaimJob(staleSeconds = 60): Promise<ClaimedJob | null> {
    const now = Math.floor(Date.now() / 1000);
    const staleBefore = now - staleSeconds;

    return await this.db.transaction(async (tx) => {
      const candidates = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          sql`${jobs.availableAt} <= ${now} AND (${jobs.reservedAt} IS NULL OR ${jobs.reservedAt} <= ${staleBefore})`
        )
        .orderBy(jobs.createdAt)
        .limit(1);
      
      if (candidates.length === 0) return null;

      const jobId = candidates[0].id;

      await tx
        .update(jobs)
        .set({
          reservedAt: now,
          attempts: sql`${jobs.attempts} + 1`,
        })
        .where(eq(jobs.id, jobId));

      const [row] = await tx.select().from(jobs).where(eq(jobs.id, jobId));
      return row || null;
    }) as any;
  }

  async getJobCount() {
    const [row] = await this.db.select({ count: sql`COUNT(*)` }).from(jobs);
    return Number(row?.count) || 0;
  }

  async getFailedJobs() {
    return await this.db.select().from(failedJobs).orderBy(desc(failedJobs.failedAt));
  }

  async getFailedJobCount() {
    const [row] = await this.db.select({ count: sql`COUNT(*)` }).from(failedJobs);
    return Number(row?.count) || 0;
  }

  async deleteFailedJob(id: number) {
    await this.db.delete(failedJobs).where(eq(failedJobs.id, id));
  }

  async deleteAllFailedJobs() {
    await this.db.delete(failedJobs);
  }

  async getJobById(id: number) {
    const [row] = await this.db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    return row || null;
  }
}
