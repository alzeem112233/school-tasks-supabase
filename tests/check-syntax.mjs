import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(path);
    return /\.(?:js|mjs)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

const files = [...await javascriptFiles(resolve("src")), ...await javascriptFiles(resolve("tests"))]
  .filter((path) => !path.endsWith("check-syntax.mjs"));

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

console.log(`Syntax check passed (${files.length} files)`);
