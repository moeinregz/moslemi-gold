import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") process.loadEnvFile(envFile);

export const PORT = Number(process.env.PORT || 4000);
export const IS_PROD = process.env.NODE_ENV === "production";
export const siteUrl = () => (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
