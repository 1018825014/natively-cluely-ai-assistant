const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

const { loadEnvironment, readConfig } = require("./lib/config");
const { openDatabase } = require("./lib/database");
const { createLicenseService } = require("./lib/license-service");

const ADMIN_PUBLIC_DIR = path.join(__dirname, "public", "admin");
const ADMIN_COOKIE_NAME = "natively_admin_session";
const ONE_HOUR_MS = 60 * 60 * 1000;
const STATIC_CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function createServer({ service, config }) {
  const sessions = new Map();

  return http.createServer(async (req, res) => {
    try {
      cleanupExpiredSessions(sessions);
      const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `${config.host}:${config.port}`}`);
      const pathname = decodePathname(requestUrl.pathname);

      if (req.method === "GET" && pathname === "/") {
        return writeRedirect(res, "/admin/");
      }

      if (req.method === "GET" && pathname === "/favicon.ico") {
        return writeEmpty(res, 204);
      }

      if (req.method === "GET" && pathname === "/healthz") {
        return writeJson(res, 200, {
          ok: true,
          service: "natively-license-lite",
          public_base_url: config.publicBaseUrl,
          admin_enabled: Boolean(config.adminPassword),
        });
      }

      if (req.method === "POST" && pathname === "/licenses/activate") {
        const body = await readJsonBody(req);
        return writeJson(res, 200, service.activateLicense(body));
      }

      if (req.method === "POST" && pathname === "/licenses/deactivate") {
        const body = await readJsonBody(req);
        return writeJson(res, 200, service.deactivateLicense(body));
      }

      if (req.method === "GET" && pathname === "/licenses/status") {
        return writeJson(res, 200, service.getLicenseStatus(Object.fromEntries(requestUrl.searchParams.entries())));
      }

      if (pathname === "/admin/api/session" && req.method === "GET") {
        return handleAdminSession(req, res, config, sessions);
      }

      if (pathname === "/admin/api/login" && req.method === "POST") {
        const body = await readJsonBody(req);
        return handleAdminLogin(req, res, config, sessions, body);
      }

      if (pathname === "/admin/api/logout" && req.method === "POST") {
        return handleAdminLogout(req, res, config, sessions);
      }

      if (pathname.startsWith("/admin/api/")) {
        const session = getAdminSession(req, config, sessions);
        if (!session) {
          return writeJson(res, 401, {
            success: false,
            error: "请先登录后台。",
          });
        }

        return handleAdminApi(req, res, requestUrl, pathname, service, config);
      }

      if (pathname === "/admin" || pathname.startsWith("/admin/")) {
        return serveAdminAsset(res, pathname);
      }

      return writeJson(res, 404, {
        success: false,
        error: "Not found",
      });
    } catch (error) {
      console.error("[license-lite] Request failed:", error);
      return writeJson(res, 500, {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });
}

async function handleAdminApi(req, res, requestUrl, pathname, service) {
  if (req.method === "GET" && pathname === "/admin/api/licenses") {
    const limit = Number(requestUrl.searchParams.get("limit") || 20);
    const query = `${requestUrl.searchParams.get("q") || ""}`.trim();
    return writeJson(res, 200, {
      success: true,
      query,
      licenses: service.listLicenses(limit, query),
    });
  }

  if (req.method === "POST" && pathname === "/admin/api/licenses") {
    const body = await readJsonBody(req);
    const created = service.createLicense({
      sku: body.sku,
      durationDays: body.durationDays,
      buyerId: body.buyerId,
      orderId: body.orderId,
      wechatNote: body.wechatNote,
      orderNote: body.orderNote,
      activationLimit: body.activationLimit,
      licenseKey: body.licenseKey,
    });

    return writeJson(res, 200, {
      ...created,
      detail: service.getLicenseDetail(created.licenseKey),
    });
  }

  const detailMatch = pathname.match(/^\/admin\/api\/licenses\/([^/]+)$/);
  if (req.method === "GET" && detailMatch) {
    const licenseKey = decodeURIComponent(detailMatch[1]);
    const detail = service.getLicenseDetail(licenseKey);
    if (!detail) {
      return writeJson(res, 404, {
        success: false,
        error: "未找到授权码。",
      });
    }

    return writeJson(res, 200, {
      success: true,
      ...detail,
    });
  }

  const renewMatch = pathname.match(/^\/admin\/api\/licenses\/([^/]+)\/renew$/);
  if (req.method === "POST" && renewMatch) {
    const body = await readJsonBody(req);
    const licenseKey = decodeURIComponent(renewMatch[1]);
    const detail = service.renewLicense({
      licenseKey,
      sku: body.sku,
      durationDays: body.durationDays,
    });
    return writeJson(res, 200, {
      success: true,
      ...detail,
    });
  }

  const resetMatch = pathname.match(/^\/admin\/api\/licenses\/([^/]+)\/reset$/);
  if (req.method === "POST" && resetMatch) {
    const body = await readJsonBody(req);
    const licenseKey = decodeURIComponent(resetMatch[1]);
    const result = service.resetActivation({
      licenseKey,
      hardwareId: body.hardwareId,
    });
    return writeJson(res, 200, {
      ...result,
      detail: service.getLicenseDetail(licenseKey),
    });
  }

  const revokeMatch = pathname.match(/^\/admin\/api\/licenses\/([^/]+)\/revoke$/);
  if (req.method === "POST" && revokeMatch) {
    const body = await readJsonBody(req);
    const licenseKey = decodeURIComponent(revokeMatch[1]);
    const detail = service.revokeLicense({
      licenseKey,
      reason: body.reason,
    });
    return writeJson(res, 200, {
      success: true,
      ...detail,
    });
  }

  const expireMatch = pathname.match(/^\/admin\/api\/licenses\/([^/]+)\/expire$/);
  if (req.method === "POST" && expireMatch) {
    const body = await readJsonBody(req);
    const licenseKey = decodeURIComponent(expireMatch[1]);
    const detail = service.expireLicense({
      licenseKey,
      reason: body.reason,
    });
    return writeJson(res, 200, {
      success: true,
      ...detail,
    });
  }

  return writeJson(res, 404, {
    success: false,
    error: "Not found",
  });
}

function handleAdminSession(req, res, config, sessions) {
  const session = getAdminSession(req, config, sessions);
  return writeJson(res, 200, {
    success: true,
    configured: Boolean(config.adminPassword),
    authenticated: Boolean(session),
    username: session?.username || null,
  });
}

async function handleAdminLogin(req, res, config, sessions, body) {
  if (!config.adminPassword) {
    return writeJson(res, 503, {
      success: false,
      error: "后台密码还没有配置，请先设置 ADMIN_PASSWORD。",
    });
  }

  const username = `${body.username || ""}`.trim();
  const password = `${body.password || ""}`;
  if (!matchesAdminCredentials(username, password, config)) {
    return writeJson(res, 401, {
      success: false,
      error: "账号或密码不正确。",
    });
  }

  const token = crypto.randomBytes(24).toString("hex");
  const storeKey = hashSessionToken(token, config);
  const expiresAt = Date.now() + config.adminSessionHours * ONE_HOUR_MS;
  sessions.set(storeKey, {
    username: config.adminUsername,
    expiresAt,
  });

  res.setHeader("Set-Cookie", buildSessionCookie(token, config));
  return writeJson(res, 200, {
    success: true,
    username: config.adminUsername,
    expiresAt: new Date(expiresAt).toISOString(),
  });
}

function handleAdminLogout(req, res, config, sessions) {
  const sessionToken = getCookieValue(req, ADMIN_COOKIE_NAME);
  if (sessionToken) {
    sessions.delete(hashSessionToken(sessionToken, config));
  }

  res.setHeader("Set-Cookie", buildExpiredSessionCookie(config));
  return writeJson(res, 200, {
    success: true,
  });
}

function getAdminSession(req, config, sessions) {
  const token = getCookieValue(req, ADMIN_COOKIE_NAME);
  if (!token) {
    return null;
  }

  const session = sessions.get(hashSessionToken(token, config));
  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(hashSessionToken(token, config));
    return null;
  }

  return session;
}

function matchesAdminCredentials(username, password, config) {
  return safeEqual(username, config.adminUsername) && safeEqual(password, config.adminPassword);
}

function safeEqual(left, right) {
  const leftHash = crypto.createHash("sha256").update(`${left || ""}`).digest();
  const rightHash = crypto.createHash("sha256").update(`${right || ""}`).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function hashSessionToken(token, config) {
  const secret = config.adminSessionSecret || config.licenseSigningSecret || "natively-license-lite-admin";
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

function buildSessionCookie(token, config) {
  const parts = [
    `${ADMIN_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${config.adminSessionHours * 60 * 60}`,
  ];

  if (config.publicBaseUrl.startsWith("https://")) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function buildExpiredSessionCookie(config) {
  const parts = [
    `${ADMIN_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (config.publicBaseUrl.startsWith("https://")) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function getCookieValue(req, key) {
  const cookieHeader = `${req.headers.cookie || ""}`;
  const parts = cookieHeader.split(/;\s*/g);
  for (const part of parts) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const name = part.slice(0, separatorIndex).trim();
    if (name !== key) {
      continue;
    }

    return decodeURIComponent(part.slice(separatorIndex + 1));
  }

  return "";
}

function cleanupExpiredSessions(sessions) {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}

function serveAdminAsset(res, pathname) {
  const relativePath = pathname === "/admin" || pathname === "/admin/"
    ? "index.html"
    : pathname.slice("/admin/".length);
  const assetPath = path.normalize(path.join(ADMIN_PUBLIC_DIR, relativePath));
  if (!assetPath.startsWith(ADMIN_PUBLIC_DIR)) {
    return writeJson(res, 403, {
      success: false,
      error: "Forbidden",
    });
  }

  if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
    return writeJson(res, 404, {
      success: false,
      error: "Not found",
    });
  }

  const extension = path.extname(assetPath).toLowerCase();
  const contentType = STATIC_CONTENT_TYPES[extension] || "application/octet-stream";
  const body = fs.readFileSync(assetPath);
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

function decodePathname(value) {
  try {
    return decodeURIComponent(value || "/");
  } catch {
    return value || "/";
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString();
      if (raw.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
    req.on("error", reject);
  });
}

function writeRedirect(res, location) {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

function writeEmpty(res, statusCode) {
  res.statusCode = statusCode;
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

function writeJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function startServer(overrides = {}) {
  loadEnvironment();
  const config = overrides.config || readConfig();
  const db = overrides.db || openDatabase(config);
  const service = overrides.service || createLicenseService({ db, config });
  const server = createServer({ service, config });

  return new Promise((resolve) => {
    server.listen(config.port, config.host, () => {
      console.log(`[license-lite] Listening on http://${config.host}:${config.port}`);
      console.log(`[license-lite] SQLite store: ${config.dbPath}`);
      if (!config.licenseSigningSecret) {
        console.warn("[license-lite] LICENSE_SIGNING_SECRET is empty. Please set it before production use.");
      }
      if (!config.adminPassword) {
        console.warn("[license-lite] ADMIN_PASSWORD is empty. Admin web access is disabled until you set it.");
      }
      resolve({ server, config, db, service });
    });
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("[license-lite] Failed to start:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  createServer,
  startServer,
};
