import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..", "..");

/**
 * Load root .env then apps/api/.env (api wins on duplicate keys).
 * Allows running prisma/bootstrap from repo root while keeping DATABASE_URL in root .env only.
 */
export function loadMonorepoEnv() {
  config({ path: path.join(repoRoot, ".env") });
  config({ path: path.join(apiRoot, ".env"), override: true });
}
