/**
 * Apply the Cloudflare token policy.
 *
 * Cloudflare has no schema upload for token scopes. What it does have is
 * `POST /accounts/{id}/tokens`, which takes the policy as JSON — so the checked-in
 * `docs/cloudflare-port/token-policy.json` is that schema, and this is the applier.
 *
 * Permission groups are named in the file because their ids are account-specific and
 * opaque; this resolves names to ids before creating the token.
 *
 * Dry run by default. `--apply` creates the token, writes the secret to `--out` with 0600
 * and prints the path, never the secret.
 *
 * Needs CLOUDFLARE_API_TOKEN (a bootstrap token with Account API Tokens:Edit and Zone:Read)
 * and CLOUDFLARE_ACCOUNT_ID.
 */
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const API = "https://api.cloudflare.com/client/v4";
const POLICY_PATH = new URL("../docs/cloudflare-port/token-policy.json", import.meta.url);

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const outFlag = args.indexOf("--out");
const out = outFlag === -1 ? join(homedir(), ".config/edapex/cloudflare/deploy-token") : args[outFlag + 1];

const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
if (token === undefined || accountId === undefined) {
  console.error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set.");
  process.exit(2);
}

async function call(path, init) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const body = await response.json();
  if (body.success !== true) {
    const detail = body.errors?.map((error) => `${error.code} ${error.message}`).join("; ") ?? response.status;
    throw new Error(`${init?.method ?? "GET"} ${path}: ${detail}`);
  }
  return body.result;
}

async function allPermissionGroups(scope) {
  const groups = [];
  for (let page = 1; ; page += 1) {
    const batch = await call(`/${scope}/tokens/permission_groups?per_page=100&page=${page}`);
    groups.push(...batch);
    if (batch.length < 100) return groups;
  }
}

function pick(groups, name, scope) {
  const found = groups.find((group) => group.name === name);
  if (found === undefined) {
    const close = groups.map((group) => group.name).filter((candidate) => candidate.includes(name.split(":")[0]));
    throw new Error(`${scope}: no permission group named "${name}". Similar: ${close.join(", ") || "none"}`);
  }
  return { id: found.id, name: found.name };
}

const policy = JSON.parse(await readFile(POLICY_PATH, "utf8"));
const accountGroups = await allPermissionGroups("accounts/" + accountId);

const zones = await call(`/zones?name=${encodeURIComponent(policy.zone)}`);
const zone = zones[0];
if (zone === undefined) throw new Error(`zone ${policy.zone} is not visible to this token`);
const zoneGroups = await allPermissionGroups("zones/" + zone.id);

const permissions = {
  account: policy.accountPermissionGroups.map((name) => pick(accountGroups, name, "account")),
  zone: policy.zonePermissionGroups.map((name) => pick(zoneGroups, name, "zone"))
};

console.log(`account groups: ${permissions.account.map((group) => group.name).join(", ")}`);
console.log(`zone groups:    ${permissions.zone.map((group) => group.name).join(", ")}`);

if (!apply) {
  console.log("dry run — pass --apply to create the token");
  process.exit(0);
}

const created = await call(`/accounts/${accountId}/tokens`, {
  method: "POST",
  body: JSON.stringify({
    name: policy.name,
    policies: [
      {
        effect: "allow",
        resources: {
          [`com.cloudflare.api.account.${accountId}`]: "*",
          [`com.cloudflare.api.account.zone.${zone.id}`]: "*"
        },
        permission_groups: [...permissions.account, ...permissions.zone]
      }
    ]
  })
});

await mkdir(dirname(out), { recursive: true, mode: 0o700 });
await writeFile(out, `${created.value}\n`, { mode: 0o600 });
await chmod(out, 0o600);
console.log(`created "${created.name}" (${created.id}); secret written to ${out}`);
