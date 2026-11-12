import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const publicRoot = join(root, "apps/web/public");
const tmpRoot = join(root, ".tmp/xcodex-release");

const artifacts = [
  {
    name: "xcodex-wasm",
    url: "https://github.com/olegische/xcodex/releases/download/xcodex-wasm/xcodex-wasm.tar.gz",
    sha256: "42b5a7fa6f05e101775c85bef1b02c9155a5561c5e86414645e8a1593a45fe16",
    dest: join(publicRoot, "xcodex")
  },
  {
    name: "xrouter-browser",
    url: "https://github.com/olegische/xrouter/releases/download/xrouter-browser-main/xrouter-browser-main.tar.gz",
    sha256: "d362805974ea5b74b980e81710bddc794c977e511cf0e68e209ffd007f17a979",
    dest: join(publicRoot, "xrouter-browser")
  }
];

async function download(url, target) {
  const response = await fetch(url);
  if (!response.ok || response.body === null) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  const file = createWriteStream(target);
  for await (const chunk of response.body) {
    file.write(chunk);
  }
  await new Promise((resolve, reject) => {
    file.end(resolve);
    file.on("error", reject);
  });
}

function checksum(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function main() {
  if (process.argv.includes("--dry-run")) {
    for (const artifact of artifacts) {
      console.log(`${artifact.name}: ${artifact.url} sha256=${artifact.sha256}`);
    }
    return;
  }

  rmSync(tmpRoot, { recursive: true, force: true });
  mkdirSync(tmpRoot, { recursive: true });
  for (const artifact of artifacts) {
    const archive = join(tmpRoot, `${artifact.name}.tar.gz`);
    await download(artifact.url, archive);
    const actual = checksum(archive);
    if (actual !== artifact.sha256) {
      throw new Error(`${artifact.name} checksum mismatch: ${actual}`);
    }
    const extract = join(tmpRoot, artifact.name);
    mkdirSync(extract, { recursive: true });
    execFileSync("tar", ["-xzf", archive, "-C", extract], { stdio: "inherit" });
    const unpacked = join(extract, artifact.name === "xcodex-wasm" ? "xcodex-wasm" : "xrouter-browser");
    if (!existsSync(unpacked)) {
      throw new Error(`Unexpected archive layout: ${unpacked}`);
    }
    rmSync(join(artifact.dest, "current"), { recursive: true, force: true });
    mkdirSync(join(artifact.dest, "current"), { recursive: true });
    const current = artifact.name === "xcodex-wasm" ? join(unpacked, "current") : unpacked;
    execFileSync("cp", ["-R", `${current}/.`, join(artifact.dest, "current")], { stdio: "inherit" });
    if (artifact.name === "xcodex-wasm") {
      writeFileSync(
        join(artifact.dest, "manifest.json"),
        `${JSON.stringify(
          {
            buildId: "a8f84b2f1ff25d6fb3356186fa6361552945ee52",
            entry: "/xcodex/current/xcodex.js",
            wasm: "/xcodex/current/xcodex_bg.wasm",
            runtime: "/xcodex/current/xcodex-runtime.js"
          },
          null,
          2
        )}\n`
      );
    } else {
      writeFileSync(
        join(artifact.dest, "manifest.json"),
        `${JSON.stringify(
          {
            buildId: "75347091cb821a30fb8791e2113babe0cdfaccf8",
            entry: "/xrouter-browser/current/xrouter_browser.js",
            wasm: "/xrouter-browser/current/xrouter_browser_bg.wasm"
          },
          null,
          2
        )}\n`
      );
    }
  }
  console.log("xcodex browser runtime assets fetched");
}

await main();
