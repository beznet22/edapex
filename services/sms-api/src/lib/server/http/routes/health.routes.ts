import { Hono } from "hono";

const HEALTHY = { status: "ok" } as const;

export const health = new Hono().get("/health", (c) => c.json(HEALTHY));
