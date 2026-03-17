import { Lucia } from "lucia";
import { DrizzleMySQLAdapter } from "@lucia-auth/adapter-drizzle";
import { getDatabaseV2 } from "./db";
import { accounts, sessions } from "./db/domain-core";
import { dev } from "$app/environment";

// Get the Drizzle client for V2
const db = await getDatabaseV2();

// Initialize the Drizzle Adapter for Lucia
const adapter = new DrizzleMySQLAdapter(db, sessions, accounts);

export const lucia = new Lucia(adapter, {
	sessionCookie: {
		attributes: {
			secure: !dev
		}
	},
	getUserAttributes: (attributes) => {
		return {
			email: attributes.email,
			tenantId: attributes.tenantId,
			isAdministrator: attributes.isAdministrator
		};
	}
});

declare module "lucia" {
	interface Register {
		Lucia: typeof lucia;
		DatabaseUserAttributes: DatabaseUserAttributes;
	}
}

interface DatabaseUserAttributes {
	email: string;
	tenantId: number;
	isAdministrator: "yes" | "no";
}
