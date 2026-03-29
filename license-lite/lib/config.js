const path = require("path");
const dotenv = require("dotenv");

const ROOT_DIR = path.resolve(__dirname, "..");

const SKU_CATALOG = Object.freeze({
  cn_1d: { label: "1-day", durationDays: 1, defaultActivationLimit: 1 },
  cn_1d_promo: {
    label: "promo trial",
    durationDays: 1,
    defaultActivationLimit: 0,
    minDurationDays: 1,
    maxDurationDays: 7,
  },
  cn_7d: { label: "7-day", durationDays: 7, defaultActivationLimit: 1 },
  cn_30d: { label: "30-day", durationDays: 30, defaultActivationLimit: 1 },
  cn_365d: { label: "365-day", durationDays: 365, defaultActivationLimit: 1 },
  cn_lifetime: { label: "lifetime", durationDays: null, defaultActivationLimit: 1 },
});

function loadEnvironment(envPath = path.join(ROOT_DIR, ".env")) {
  dotenv.config({ path: envPath, quiet: true });
  return envPath;
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function trimTrailingSlash(value) {
  const text = `${value || ""}`.trim();
  if (!text) {
    return text;
  }

  return text.endsWith("/") ? text.slice(0, -1) : text;
}

function readConfig(env = process.env) {
  const host = `${env.HOST || "127.0.0.1"}`.trim() || "127.0.0.1";
  const port = clampNumber(env.PORT || env.COMMERCE_SERVER_PORT, 8787, 1, 65535);
  const dataDir = path.resolve(env.DATA_DIR || path.join(ROOT_DIR, "data"));
  const dbPath = path.resolve(env.DB_PATH || path.join(dataDir, "licenses.db"));
  const defaultPublicBaseUrl = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}${port === 80 ? "" : `:${port}`}`;

  return {
    rootDir: ROOT_DIR,
    host,
    port,
    dataDir,
    dbPath,
    publicBaseUrl: trimTrailingSlash(env.PUBLIC_BASE_URL || defaultPublicBaseUrl),
    licenseSigningSecret: `${env.LICENSE_SIGNING_SECRET || ""}`.trim(),
    offlineGraceDays: clampNumber(env.LICENSE_OFFLINE_GRACE_DAYS, 5, 1, 30),
    activationLimit: clampNumber(env.LICENSE_MAX_ACTIVATIONS, 1, 1, 20),
    adminUsername: `${env.ADMIN_USERNAME || "admin"}`.trim() || "admin",
    adminPassword: `${env.ADMIN_PASSWORD || ""}`.trim(),
    adminSessionSecret: `${env.ADMIN_SESSION_SECRET || env.LICENSE_SIGNING_SECRET || ""}`.trim(),
    adminSessionHours: clampNumber(env.ADMIN_SESSION_HOURS, 168, 1, 720),
    skuCatalog: SKU_CATALOG,
  };
}

module.exports = {
  ROOT_DIR,
  SKU_CATALOG,
  clampNumber,
  loadEnvironment,
  readConfig,
  trimTrailingSlash,
};
