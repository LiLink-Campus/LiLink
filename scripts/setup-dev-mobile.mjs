#!/usr/bin/env node
/**
 * Configure LiLink local dev for phone access over LAN (WSL2 mirrored networking).
 * Updates ignored local env files and prints the URLs to open on your phone.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiEnvPath = join(repoRoot, "apps/api/.env");
const webEnvLocalPath = join(repoRoot, "apps/web/.env.local");
const windowsScriptPath = join(repoRoot, "scripts/setup-dev-mobile-windows.ps1");

function run(command) {
  return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function detectLanIp() {
  const candidates = [];

  try {
    const eth2 = run("ip -4 -o addr show eth2 2>/dev/null | awk '{print $4}'");
    if (eth2) {
      candidates.push(eth2.split("/")[0]);
    }
  } catch {
    // ignore
  }

  try {
    const ps = run(
      'powershell.exe -NoProfile -Command "Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.InterfaceAlias -eq \'WLAN\' } | Select-Object -ExpandProperty IPv4Address | Select-Object -ExpandProperty IPAddress"',
    );
    if (ps) {
      candidates.push(ps.split(/\r?\n/)[0].trim());
    }
  } catch {
    // ignore
  }

  const ip = candidates.find((value) => /^\d+\.\d+\.\d+\.\d+$/.test(value));
  if (!ip) {
    throw new Error(
      "Could not detect LAN IP. Connect to Wi-Fi, then re-run npm run setup:dev-mobile.",
    );
  }

  return ip;
}

function upsertEnvLine(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  return `${content.replace(/\s*$/, "")}\n${line}\n`;
}

function updateClientOrigin(content, lanOrigin) {
  const match = content.match(/^CLIENT_ORIGIN=(.*)$/m);
  const current = match?.[1]?.trim() ?? "http://localhost:3000";
  const origins = current
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!origins.includes("http://localhost:3000")) {
    origins.unshift("http://localhost:3000");
  }
  if (!origins.includes(lanOrigin)) {
    origins.push(lanOrigin);
  }

  return upsertEnvLine(content, "CLIENT_ORIGIN", origins.join(","));
}

function ensureApiEnv(lanOrigin) {
  if (!existsSync(apiEnvPath)) {
    throw new Error(`Missing ${apiEnvPath}. Copy apps/api/.env.example first.`);
  }

  const updated = updateClientOrigin(readFileSync(apiEnvPath, "utf8"), lanOrigin);
  writeFileSync(apiEnvPath, updated, "utf8");
}

function ensureWebEnvLocal(lanApiBaseUrl) {
  let content = "";
  if (existsSync(webEnvLocalPath)) {
    content = readFileSync(webEnvLocalPath, "utf8");
  }
  writeFileSync(
    webEnvLocalPath,
    upsertEnvLine(content, "NEXT_PUBLIC_API_BASE_URL", lanApiBaseUrl),
    "utf8",
  );
}

function toWindowsPath(unixPath) {
  return run(`wslpath -w ${JSON.stringify(unixPath)}`);
}

function tryLaunchWindowsFirewallSetup() {
  if (process.platform !== "linux" || !existsSync("/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe")) {
    return false;
  }

  try {
    const windowsScript = toWindowsPath(windowsScriptPath);
    run(
      `powershell.exe -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${windowsScript.replace(/\\/g, "\\\\")}'"`,
    );
    return true;
  } catch {
    return false;
  }
}

function main() {
  const lanIp = detectLanIp();
  const webOrigin = `http://${lanIp}:3000`;
  const apiBaseUrl = `http://${lanIp}:4000/v1`;

  ensureApiEnv(webOrigin);
  ensureWebEnvLocal(apiBaseUrl);

  const launched = tryLaunchWindowsFirewallSetup();

  console.log("");
  console.log("LiLink mobile dev setup");
  console.log("=======================");
  console.log(`LAN IP:        ${lanIp}`);
  console.log(`Phone Web URL: ${webOrigin}`);
  console.log(`Phone API URL: ${apiBaseUrl}`);
  console.log("");
  console.log("Updated local files (gitignored):");
  console.log(`  - ${apiEnvPath}  (CLIENT_ORIGIN includes ${webOrigin})`);
  console.log(`  - ${webEnvLocalPath}  (NEXT_PUBLIC_API_BASE_URL=${apiBaseUrl})`);
  console.log("");
  if (launched) {
    console.log("Requested Windows Administrator approval for firewall rules.");
    console.log("If a UAC prompt appeared, click Yes.");
  } else {
    console.log("Run this once in Windows PowerShell as Administrator:");
    console.log(`  ${windowsScriptPath}`);
  }
  console.log("");
  console.log("Next steps:");
  console.log("  1. Phone connects to the same Wi-Fi as this PC.");
  console.log(`  2. Restart dev: npm run dev  (or npm run dev:mobile)`);
  console.log(`  3. On phone, open ${webOrigin}`);
  console.log("  4. PC merchant browser should also use the same LAN URL, not localhost.");
  console.log("");
}

main();
