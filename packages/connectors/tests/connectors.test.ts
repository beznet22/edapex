import { describe, expect, it } from "vitest";

import { checkConnectorGrant, classifyAccess, type ConnectorGrant, type ConnectorView } from "@edapex/contracts";
import {
  accessFor,
  callTool,
  catalogue,
  toConnectorTools,
  validateServerUrl,
  type McpServerConfig
} from "../src/mcp";
import {
  authorisationUrl,
  callGoogle,
  classifyGoogleTool,
  GOOGLE_SCOPES,
  redactGoogleError,
  requiredScope,
  scopeCovers
} from "../src/google";
import { CATALOGUE, isOffered } from "../src/catalogue";

const server: McpServerConfig = {
  id: "crm",
  name: "School CRM",
  url: "https://mcp.example.com/rpc",
  allowTools: ["search_contacts", "create_note"],
  readTools: ["search_contacts"]
};

describe("validateServerUrl", () => {
  it("accepts a public https URL", () => {
    expect(validateServerUrl("https://mcp.example.com/rpc")).toEqual({
      ok: true,
      url: "https://mcp.example.com/rpc"
    });
  });

  it("rejects plain http", () => {
    expect(validateServerUrl("http://mcp.example.com").ok).toBe(false);
  });

  it("rejects localhost and loopback", () => {
    for (const url of ["https://localhost/rpc", "https://127.0.0.1/rpc", "https://[::1]/rpc"]) {
      expect(validateServerUrl(url).ok, url).toBe(false);
    }
  });

  it("rejects private and link-local ranges", () => {
    for (const url of [
      "https://10.0.0.5/rpc",
      "https://192.168.1.10/rpc",
      "https://172.16.0.1/rpc",
      "https://169.254.169.254/latest/meta-data"
    ]) {
      expect(validateServerUrl(url).ok, url).toBe(false);
    }
  });

  it("rejects credentials embedded in the URL", () => {
    expect(validateServerUrl("https://user:pass@mcp.example.com").ok).toBe(false);
  });

  it("rejects a non-URL", () => {
    expect(validateServerUrl("not a url").ok).toBe(false);
  });
});

describe("tool classification", () => {
  it("treats a configured read as a read", () => {
    expect(accessFor(server, "search_contacts")).toBe("read");
  });

  it("treats anything unknown as a write", () => {
    // The safe direction: an unclassified tool must not act without a decision.
    expect(accessFor(server, "create_note")).toBe("write");
    expect(classifyAccess("brand_new_tool")).toBe("read");
    expect(classifyAccess("delete_everything")).toBe("write");
  });

  it("only surfaces allowlisted tools", () => {
    const tools = toConnectorTools(server, [
      { name: "search_contacts", description: "find" },
      { name: "delete_everything" }
    ]);
    // A compromised server cannot make an unlisted tool reachable.
    expect(tools.map((tool) => tool.name)).toEqual(["search_contacts"]);
  });
});

describe("callTool", () => {
  it("refuses an unlisted tool without making a request", async () => {
    let called = false;
    const result = await callTool(
      async () => {
        called = true;
        return new Response("{}");
      },
      server,
      { toolName: "delete_everything", arguments: {} }
    );
    expect(result.ok).toBe(false);
    expect(called).toBe(false);
  });

  it("refuses a server whose URL fails validation", async () => {
    const result = await callTool(async () => new Response("{}"), { ...server, url: "http://10.0.0.1/rpc" }, {
      toolName: "search_contacts",
      arguments: {}
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("rejected");
  });

  it("returns the result as data and reports its size", async () => {
    const result = await callTool(
      async () =>
        new Response(JSON.stringify({ result: { contacts: ["a"] } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        }),
      server,
      { toolName: "search_contacts", arguments: { q: "smith" } }
    );
    expect(result.ok).toBe(true);
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.value).toEqual({ contacts: ["a"] });
  });

  it("surfaces a JSON-RPC error without throwing", async () => {
    const result = await callTool(
      async () =>
        new Response(JSON.stringify({ error: { message: "nope" } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        }),
      server,
      { toolName: "search_contacts", arguments: {} }
    );
    expect(result).toMatchObject({ ok: false, error: "nope" });
  });
});

describe("connector grants", () => {
  const connector: ConnectorView = {
    id: "crm",
    kind: "mcp",
    name: "School CRM",
    status: "connected",
    account: null,
    tools: toConnectorTools(server, [
      { name: "search_contacts" },
      { name: "create_note" }
    ]),
    lastError: null
  };

  const grant = (overrides: Partial<ConnectorGrant> = {}): ConnectorGrant => ({
    connectorId: "crm",
    agentId: "agent-1",
    toolName: "create_note",
    access: "write",
    grantedBy: "user-1",
    grantedAt: 1,
    revokedAt: null,
    ...overrides
  });

  it("allows a granted call", () => {
    expect(
      checkConnectorGrant({
        connector,
        grants: [grant()],
        agentId: "agent-1",
        toolName: "create_note",
        requestedAccess: "write"
      })
    ).toEqual({ allowed: true, reason: "granted" });
  });

  it("denies without a grant", () => {
    expect(
      checkConnectorGrant({
        connector,
        grants: [],
        agentId: "agent-1",
        toolName: "create_note",
        requestedAccess: "write"
      })
    ).toMatchObject({ allowed: false, reason: "no_grant" });
  });

  it("denies another agent's grant", () => {
    expect(
      checkConnectorGrant({
        connector,
        grants: [grant()],
        agentId: "agent-2",
        toolName: "create_note",
        requestedAccess: "write"
      })
    ).toMatchObject({ allowed: false, reason: "no_grant" });
  });

  it("denies a revoked grant", () => {
    expect(
      checkConnectorGrant({
        connector,
        grants: [grant({ revokedAt: 5 })],
        agentId: "agent-1",
        toolName: "create_note",
        requestedAccess: "write"
      })
    ).toMatchObject({ allowed: false, reason: "revoked" });
  });

  it("denies a write on a read-only grant", () => {
    expect(
      checkConnectorGrant({
        connector,
        grants: [grant({ access: "read" })],
        agentId: "agent-1",
        toolName: "create_note",
        requestedAccess: "write"
      })
    ).toMatchObject({ allowed: false, reason: "access_mismatch" });
  });

  it("denies when the connector is disconnected", () => {
    expect(
      checkConnectorGrant({
        connector: { ...connector, status: "revoked" },
        grants: [grant()],
        agentId: "agent-1",
        toolName: "create_note",
        requestedAccess: "write"
      })
    ).toMatchObject({ allowed: false, reason: "connector_disconnected" });
  });

  it("denies a tool the connector does not offer", () => {
    expect(
      checkConnectorGrant({
        connector,
        grants: [grant({ toolName: "ghost" })],
        agentId: "agent-1",
        toolName: "ghost",
        requestedAccess: "write"
      })
    ).toMatchObject({ allowed: false, reason: "not_a_tool" });
  });
});

describe("google", () => {
  it("requests offline access so the connection survives an hour", () => {
    const url = new URL(
      authorisationUrl({
        clientId: "client",
        redirectUri: "https://api.example/cb",
        access: "read",
        state: "s"
      })
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toContain("gmail.readonly");
  });

  it("never requests send scope for a read connection", () => {
    const url = new URL(
      authorisationUrl({
        clientId: "client",
        redirectUri: "https://api.example/cb",
        access: "read",
        state: "s"
      })
    );
    expect(url.searchParams.get("scope")).not.toContain("gmail.send");
    expect(GOOGLE_SCOPES.read.join(" ")).not.toContain("gmail.send");
  });

  it("classifies sending as a write", () => {
    expect(classifyGoogleTool("gmail_send")).toBe("write");
    expect(classifyGoogleTool("gmail_search")).toBe("read");
    expect(requiredScope("gmail_send_message")).toBe(
      "https://www.googleapis.com/auth/gmail.send"
    );
  });

  it("checks scopes at use time", () => {
    // A connection granted read-only months ago must not send today.
    expect(scopeCovers(GOOGLE_SCOPES.read, "gmail_send")).toBe(false);
    expect(scopeCovers(GOOGLE_SCOPES.write, "gmail_send")).toBe(true);
    expect(scopeCovers([], "gmail_list")).toBe(true);
  });

  it("refuses an absolute endpoint so the token cannot be redirected", async () => {
    const result = await callGoogle(async () => new Response("{}"), {
      accessToken: "t",
      endpoint: "https://evil.example/steal",
      method: "GET"
    });
    expect(result.ok).toBe(false);
  });

  it("does not read the error body, which may echo the token", async () => {
    const result = await callGoogle(
      async () =>
        new Response(JSON.stringify({ error: "token ya29.secret rejected" }), { status: 401 }),
      { accessToken: "ya29.secret", endpoint: "/gmail/v1/users/me/messages", method: "GET" }
    );
    expect(result.error).toBe("Google returned 401.");
  });

  it("redacts a google token from a message", () => {
    expect(redactGoogleError("bad ya29.a0AfH6SMBxyz")).not.toContain("ya29.");
  });
});

describe("catalogue", () => {
  it("offers only the two supported kinds", () => {
    expect(CATALOGUE.map((entry) => entry.kind).sort()).toEqual(["google", "mcp"]);
  });

  it("excludes brokered connectors", () => {
    expect(isOffered("composio")).toBe(false);
    expect(isOffered("arcade")).toBe(false);
    expect(isOffered("google")).toBe(true);
  });

  it("carries no credential", () => {
    const serialised = JSON.stringify(CATALOGUE);
    expect(serialised).not.toMatch(/token|secret|api[_-]?key/i);
  });

  it("lists no server URLs", () => {
    // The catalogue is display data; a configured URL lives in server config.
    expect(catalogue([server])).toEqual([{ id: "crm", name: "School CRM", tools: ["search_contacts", "create_note"] }]);
  });
});
