#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(process.cwd(), "src");
const TEST_RE = /\.test\.tsx?$/;

function collect(dir, out) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) collect(abs, out);
    else if (TEST_RE.test(ent.name)) out.push(relative(process.cwd(), abs));
  }
}

const files = [];
collect(SRC, files);
files.sort((a, b) => a.localeCompare(b));

if (!files.length) {
  console.error("No test files found under src/");
  process.exit(1);
}

if (process.argv.includes("--list")) {
  process.stdout.write(`${files.join("\n")}\n`);
  process.exit(0);
}

const run = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...files],
  {
    stdio: "inherit",
    env: { ...process.env, TZ: "America/Los_Angeles" },
  },
);

if (run.error) {
  console.error(run.error);
  process.exit(1);
}
if (run.signal) process.kill(process.pid, run.signal);
process.exit(run.status ?? 1);
