import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

const assetCopy = spawnSync(
  process.execPath,
  ["scripts/copy-pdfjs-assets.mjs"],
  { cwd: root, stdio: "inherit" },
);

if (assetCopy.error) throw assetCopy.error;
if (assetCopy.status !== 0) process.exit(assetCopy.status ?? 1);

const children = [];
let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
}

function start(name, args) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
  });
  children.push(child);

  child.on("error", (error) => {
    console.error(`[${name}] 启动失败：${error.message}`);
    stop(1);
  });

  child.on("exit", (code, signal) => {
    if (!stopping) stop(code ?? (signal ? 1 : 0));
  });
}

process.on("SIGINT", () => stop(130));
process.on("SIGTERM", () => stop(143));

start("Express", [
  "--env-file=.env.local",
  "--import",
  "tsx",
  "server/src/services/index.ts",
]);
start("Next.js", [
  resolve(root, "node_modules/next/dist/bin/next"),
  "dev",
]);
