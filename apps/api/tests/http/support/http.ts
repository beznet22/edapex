import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { expect } from "vitest";

import { users } from "../../../src/lib/server/db/schema";
import { createApp } from "../../../src/lib/server/http/app";
import type { AppContext } from "../../../src/lib/server/http/env";
import { sha256Hex } from "../../../src/lib/server/services";
import { createServiceContext } from "../../../src/lib/server/services/context";
import type { ServicePorts } from "../../../src/lib/server/services/ports";
import { database } from "../../support/seed";
import type { SeededSchool } from "../../support/seed";

export const workerEnv = env;

export const testApp = (ports: Partial<ServicePorts> = {}): Hono<AppContext> =>
  createApp({
    createContext: (appEnv, tenant, overrides) =>
      createServiceContext(appEnv, tenant, {
        ...overrides,
        ports: { ...(overrides?.ports ?? {}), ...ports }
      })
  });

let ipCounter = 0;

const nextIp = (): string => {
  ipCounter += 1;
  return `10.20.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
};

export const request = async (
  app: Hono<AppContext>,
  path: string,
  init?: RequestInit
): Promise<Response> => {
  const headers = new Headers(init?.headers);
  if (!headers.has("cf-connecting-ip")) headers.set("cf-connecting-ip", nextIp());
  return app.request(path, { ...init, headers }, workerEnv);
};

export const setPassword = async (
  school: SeededSchool,
  password: string
): Promise<void> => {
  await database(workerEnv)
    .update(users)
    .set({ password: await sha256Hex(password) })
    .where(eq(users.id, school.userId));
};

export const makeAdmin = async (school: SeededSchool): Promise<void> => {
  await database(workerEnv)
    .update(users)
    .set({ isAdministrator: "yes" })
    .where(eq(users.id, school.userId));
};

export const login = async (
  app: Hono<AppContext>,
  identifier: string,
  password: string
): Promise<string> => {
  const response = await request(app, "/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password })
  });
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  if (cookie === undefined || cookie.length === 0) {
    throw new Error("login did not set a session cookie");
  }
  return cookie;
};

export const tenantHeaders = (
  school: SeededSchool,
  cookie?: string
): Record<string, string> => ({
  ...(cookie === undefined ? {} : { cookie }),
  "X-Academic-Id": String(school.academicId),
  "X-Class-Id": String(school.classId),
  "X-Section-Id": String(school.sectionId)
});

export const jsonHeaders = (cookie?: string): Record<string, string> => ({
  ...(cookie === undefined ? {} : { cookie }),
  "content-type": "application/json"
});

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const stringField = (value: unknown, field: string): string | null => {
  if (!isRecord(value)) return null;
  const candidate = value[field];
  return typeof candidate === "string" ? candidate : null;
};

export const numberField = (value: unknown, field: string): number | null => {
  if (!isRecord(value)) return null;
  const candidate = value[field];
  return typeof candidate === "number" ? candidate : null;
};

export const arrayField = (value: unknown, field: string): readonly unknown[] => {
  if (!isRecord(value)) return [];
  const candidate = value[field];
  return Array.isArray(candidate) ? candidate : [];
};
