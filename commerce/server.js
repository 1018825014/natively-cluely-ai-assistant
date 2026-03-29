const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const axios = require('axios');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const baseConfig = require('../commercial.config.json');

const PORT = Number(process.env.COMMERCE_SERVER_PORT || 8787);
const DATA_DIR = process.env.COMMERCE_DATA_DIR
  ? path.resolve(process.env.COMMERCE_DATA_DIR)
  : path.join(__dirname, 'data');
const SITE_ROOT = path.join(__dirname, '..', 'commerce-site');
const DB_PATH = path.join(DATA_DIR, 'licenses.db');
const DEFAULT_OFFLINE_GRACE_DAYS = Math.max(3, Math.min(7, Number(process.env.LICENSE_OFFLINE_GRACE_DAYS || 5)));
const DEFAULT_ACTIVATION_LIMIT = Math.max(1, Number(process.env.LICENSE_MAX_ACTIVATIONS || 1));
const LICENSE_SIGNING_SECRET = (process.env.LICENSE_SIGNING_SECRET || 'dev-signing-secret').trim();
const SESSION_SIGNING_SECRET = (process.env.HOSTED_SESSION_SIGNING_SECRET || LICENSE_SIGNING_SECRET).trim();
const ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS = `${process.env.ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS || ''}`.trim().toLowerCase() === 'true';
const HOSTED_SESSION_TTL_SECONDS = clampNumber(process.env.HOSTED_SESSION_TTL_SECONDS, 900, 60, 86400);
const HOSTED_STT_TOKEN_TTL_SECONDS = clampNumber(process.env.HOSTED_STT_TOKEN_TTL_SECONDS, 60, 1, 1800);
const PACKY_BASE_URL = normalizeBaseUrl(process.env.PACKY_BASE_URL || 'https://www.packyapi.com/v1');
const PACKY_API_KEY = `${process.env.PACKY_API_KEY || ''}`.trim();
const PACKY_TEXT_MODEL = `${process.env.PACKY_TEXT_MODEL || 'gpt-5.4-mini'}`.trim();
const PACKY_FAST_MODEL = `${process.env.PACKY_FAST_MODEL || PACKY_TEXT_MODEL}`.trim();
const PACKY_VISION_MODEL = `${process.env.PACKY_VISION_MODEL || PACKY_TEXT_MODEL}`.trim();
const PACKY_MODEL_LIST = parseJsonEnv('PACKY_MODEL_LIST_JSON', [
  { id: PACKY_TEXT_MODEL, owned_by: 'packyapi' },
  { id: PACKY_FAST_MODEL, owned_by: 'packyapi' },
  { id: PACKY_VISION_MODEL, owned_by: 'packyapi' },
]).map((item) => ({
  id: `${item?.id || ''}`.trim(),
  owned_by: `${item?.owned_by || 'packyapi'}`.trim() || 'packyapi',
})).filter((item, index, list) => item.id && list.findIndex((candidate) => candidate.id === item.id) === index);
const ALIBABA_TEMP_KEY_API_URL = `${process.env.ALIBABA_TEMP_KEY_API_URL || 'https://dashscope.aliyuncs.com/api/v1/tokens'}`.trim();
const ALIBABA_DASHSCOPE_API_KEY = `${process.env.ALIBABA_DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY || ''}`.trim();
const NATIVELY_HOSTED_GATEWAY_URL = normalizeBaseUrl(process.env.NATIVELY_HOSTED_GATEWAY_URL || process.env.NATIVELY_LICENSE_API_URL || baseConfig.hostedGatewayBaseUrl || baseConfig.licenseApiBaseUrl);
const NATIVELY_HOSTED_ENABLED = parseBooleanEnv('NATIVELY_HOSTED_ENABLED', baseConfig.hostedEnabled !== false);
const NATIVELY_HIDE_BYOK = parseBooleanEnv('NATIVELY_HIDE_BYOK', baseConfig.hideByok !== false);

const SKU_CATALOG = {
  cn_1d: { label: '1 天体验版', durationDays: 1 },
  cn_7d: { label: '7 天通行版', durationDays: 7 },
  cn_30d: { label: '30 天标准版', durationDays: 30 },
  cn_365d: { label: '365 天年版', durationDays: 365 },
  cn_lifetime: { label: '永久版', durationDays: null },
};

const DEFAULT_HOSTED_QUOTAS = {
  cn_1d: { llm_requests: 120, vision_requests: 30, stt_minutes: 90, hosted_days: 1 },
  cn_7d: { llm_requests: 900, vision_requests: 140, stt_minutes: 500, hosted_days: 7 },
  cn_30d: { llm_requests: 4000, vision_requests: 500, stt_minutes: 1800, hosted_days: 30 },
  cn_365d: { llm_requests: 48000, vision_requests: 4000, stt_minutes: 24000, hosted_days: 365 },
  cn_lifetime: { llm_requests: 24000, vision_requests: 2400, stt_minutes: 12000, hosted_days: 365 },
};

const HOSTED_QUOTA_CATALOG = normalizeQuotaCatalog(
  parseJsonEnv('HOSTED_QUOTA_CONFIG_JSON', DEFAULT_HOSTED_QUOTAS),
  DEFAULT_HOSTED_QUOTAS
);

const PLAN_MAP = parseJsonEnv('AFDIAN_PLAN_MAP_JSON', {
  plan_1d: 'cn_1d',
  plan_7d: 'cn_7d',
  plan_30d: 'cn_30d',
  plan_365d: 'cn_365d',
  plan_lifetime: 'cn_lifetime',
});

const PUBLIC_CONFIG = buildPublicConfig();

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
initializeDatabase();

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || `127.0.0.1:${PORT}`}`);

    if (req.method === 'GET' && requestUrl.pathname === '/healthz') {
      return writeJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && requestUrl.pathname === '/site-config.json') {
      return writeJson(res, 200, PUBLIC_CONFIG);
    }

    if (req.method === 'POST' && requestUrl.pathname === '/webhooks/afdian') {
      const body = await readJsonBody(req);
      const result = await handleAfdianWebhook(body);
      return writeJson(res, 200, { ec: 200, em: 'ok', data: result });
    }

    if (req.method === 'POST' && requestUrl.pathname === '/licenses/activate') {
      const body = await readJsonBody(req);
      return writeJson(res, 200, activateLicense(body));
    }

    if (req.method === 'POST' && requestUrl.pathname === '/licenses/deactivate') {
      const body = await readJsonBody(req);
      return writeJson(res, 200, deactivateLicense(body));
    }

    if (req.method === 'GET' && requestUrl.pathname === '/licenses/status') {
      return writeJson(res, 200, getLicenseStatus(Object.fromEntries(requestUrl.searchParams.entries())));
    }

    if (req.method === 'POST' && requestUrl.pathname === '/app/session/exchange') {
      const body = await readJsonBody(req);
      return writeJson(res, 200, createHostedSession(body));
    }

    if (req.method === 'GET' && requestUrl.pathname === '/app/usage') {
      const session = authorizeHostedSession(req, { requireHostedUpstream: false });
      return writeJson(res, 200, {
        success: true,
        usage: buildUsageSummary(session.license),
        service_expires_at: computeServiceWindow(session.license).serviceExpiresAt,
      });
    }

    if (req.method === 'POST' && requestUrl.pathname === '/gateway/llm/respond') {
      const session = authorizeHostedSession(req, { requireHostedUpstream: true });
      const body = await readJsonBody(req);
      return proxyHostedResponses(res, session, coerceGatewayRequestBody(body), { category: 'llm' });
    }

    if (req.method === 'POST' && requestUrl.pathname === '/gateway/vision/respond') {
      const session = authorizeHostedSession(req, { requireHostedUpstream: true });
      const body = await readJsonBody(req);
      return proxyHostedResponses(res, session, coerceGatewayRequestBody(body, { forceVision: true }), { category: 'vision' });
    }

    if (req.method === 'POST' && requestUrl.pathname === '/stt/alibaba/session') {
      const session = authorizeHostedSession(req, { requireAlibabaUpstream: true });
      const body = await readJsonBody(req);
      return writeJson(res, 200, await createAlibabaTemporarySession(session, body));
    }

    if (req.method === 'POST' && requestUrl.pathname === '/hosted/openai/v1/responses') {
      const session = authorizeHostedSession(req, { requireHostedUpstream: true });
      const body = await readJsonBody(req);
      return proxyHostedResponses(res, session, body, { category: detectVisionInput(body) ? 'vision' : 'llm' });
    }

    if (req.method === 'GET' && requestUrl.pathname === '/hosted/openai/v1/models') {
      authorizeHostedSession(req);
      return writeJson(res, 200, {
        object: 'list',
        data: PACKY_MODEL_LIST.map((model) => ({
          id: model.id,
          object: 'model',
          created: 0,
          owned_by: model.owned_by,
        })),
      });
    }

    if (req.method === 'GET' && requestUrl.pathname === '/downloads/latest.json') {
      return serveStaticFile(res, path.join(SITE_ROOT, 'downloads', 'latest.json'));
    }

    return serveStaticRequest(requestUrl.pathname, res);
  } catch (error) {
    console.error('[commerce] Request failed:', error);

    if (error && typeof error === 'object' && error.__statusCode) {
      return writeJson(res, error.__statusCode, {
        success: false,
        status: error.status || 'request_failed',
        error: error.message || 'Request failed',
      });
    }

    return writeJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

server.listen(PORT, () => {
  console.log(`[commerce] Listening on http://127.0.0.1:${PORT}`);
  console.log(`[commerce] SQLite store: ${DB_PATH}`);
});

module.exports = server;

function buildPublicConfig() {
  const resolve = (envKey, fallback) => {
    const value = process.env[envKey];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  };

  const hostedGatewayUrl = normalizeBaseUrl(resolve('NATIVELY_HOSTED_GATEWAY_URL', NATIVELY_HOSTED_GATEWAY_URL));
  const hostedEnabled = parseBooleanEnv('NATIVELY_HOSTED_ENABLED', NATIVELY_HOSTED_ENABLED);
  const hideByok = parseBooleanEnv('NATIVELY_HIDE_BYOK', NATIVELY_HIDE_BYOK);

  return {
    appName: resolve('NATIVELY_APP_NAME', baseConfig.appName),
    siteName: resolve('NATIVELY_SITE_NAME', baseConfig.siteName),
    tagline: resolve('NATIVELY_TAGLINE', baseConfig.tagline),
    websiteUrl: stripTrailingSlash(resolve('NATIVELY_WEBSITE_URL', baseConfig.websiteUrl)),
    downloadUrl: stripTrailingSlash(resolve('NATIVELY_DOWNLOAD_URL', baseConfig.downloadUrl)),
    downloadWindowsUrl: stripTrailingSlash(resolve('NATIVELY_WINDOWS_DOWNLOAD_URL', baseConfig.downloadWindowsUrl)),
    downloadMacUrl: stripTrailingSlash(resolve('NATIVELY_MAC_DOWNLOAD_URL', baseConfig.downloadMacUrl)),
    purchasePageUrl: stripTrailingSlash(resolve('NATIVELY_PURCHASE_PAGE_URL', baseConfig.purchasePageUrl)),
    activationHelpUrl: stripTrailingSlash(resolve('NATIVELY_ACTIVATION_HELP_URL', baseConfig.activationHelpUrl)),
    purchaseUrl: resolve('NATIVELY_PURCHASE_URL', baseConfig.purchaseUrl),
    supportEmail: resolve('NATIVELY_SUPPORT_EMAIL', baseConfig.supportEmail),
    supportUrl: resolve('NATIVELY_SUPPORT_URL', baseConfig.supportUrl || `mailto:${baseConfig.supportEmail}`),
    issuesUrl: resolve('NATIVELY_ISSUES_URL', baseConfig.issuesUrl),
    communityUrl: resolve('NATIVELY_COMMUNITY_URL', baseConfig.communityUrl),
    donationUrl: resolve('NATIVELY_DONATION_URL', baseConfig.donationUrl),
    privacyUrl: resolve('NATIVELY_PRIVACY_URL', baseConfig.privacyUrl),
    refundUrl: resolve('NATIVELY_REFUND_URL', baseConfig.refundUrl),
    eulaUrl: resolve('NATIVELY_EULA_URL', baseConfig.eulaUrl),
    licenseApiBaseUrl: stripTrailingSlash(resolve('NATIVELY_LICENSE_API_URL', baseConfig.licenseApiBaseUrl)),
    updateFeedUrl: resolve('NATIVELY_UPDATE_FEED_URL', baseConfig.updateFeedUrl),
    hostedEnabled,
    hideByok,
    hostedGatewayBaseUrl: hostedGatewayUrl,
    hostedOpenAIBaseUrl: `${hostedGatewayUrl}/hosted/openai/v1`,
    hostedDefaultModel: PACKY_TEXT_MODEL,
    hostedFastModel: PACKY_FAST_MODEL,
    hostedVisionModel: PACKY_VISION_MODEL,
    skuCatalog: SKU_CATALOG,
  };
}

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      buyer_id TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      sku TEXT,
      total_amount TEXT,
      status INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS licenses (
      license_key TEXT PRIMARY KEY,
      sku TEXT NOT NULL,
      duration_days INTEGER,
      expires_at TEXT,
      activation_limit INTEGER NOT NULL,
      status TEXT NOT NULL,
      order_id TEXT NOT NULL UNIQUE,
      buyer_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(order_id)
    );

    CREATE TABLE IF NOT EXISTS activations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT NOT NULL,
      hardware_id TEXT NOT NULL,
      first_activated_at TEXT NOT NULL,
      last_validated_at TEXT NOT NULL,
      released_at TEXT,
      UNIQUE(license_key, hardware_id),
      FOREIGN KEY(license_key) REFERENCES licenses(license_key)
    );

    CREATE TABLE IF NOT EXISTS usage_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT NOT NULL,
      usage_type TEXT NOT NULL,
      units INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      metadata_json TEXT,
      FOREIGN KEY(license_key) REFERENCES licenses(license_key)
    );

    CREATE INDEX IF NOT EXISTS idx_usage_ledger_license_created
    ON usage_ledger (license_key, created_at);
  `);
}

async function handleAfdianWebhook(payload) {
  const order = await extractCanonicalOrder(payload);
  if (!order) {
    return { received: true, processed: false, reason: 'order-not-verified' };
  }

  const sku = inferSku(order);
  const buyerId = `${order.user_private_id || order.user_id || ''}`.trim();
  const orderId = `${order.out_trade_no || ''}`.trim();

  if (!orderId || !buyerId) {
    return { received: true, processed: false, reason: 'missing-order-fields' };
  }

  if (!isOrderPaid(order)) {
    return { received: true, processed: false, orderId, reason: 'order-not-paid' };
  }

  const timestamp = new Date().toISOString();
  db.prepare(`
    INSERT INTO orders (order_id, buyer_id, raw_json, sku, total_amount, status, created_at, updated_at)
    VALUES (@order_id, @buyer_id, @raw_json, @sku, @total_amount, @status, @created_at, @updated_at)
    ON CONFLICT(order_id) DO UPDATE SET
      buyer_id=excluded.buyer_id,
      raw_json=excluded.raw_json,
      sku=excluded.sku,
      total_amount=excluded.total_amount,
      status=excluded.status,
      updated_at=excluded.updated_at
  `).run({
    order_id: orderId,
    buyer_id: buyerId,
    raw_json: JSON.stringify(order),
    sku: sku || null,
    total_amount: order.total_amount || null,
    status: Number(order.status || 0),
    created_at: timestamp,
    updated_at: timestamp,
  });

  if (!sku || !SKU_CATALOG[sku]) {
    return { received: true, processed: false, orderId, reason: 'sku-unmapped' };
  }

  const existing = db.prepare('SELECT license_key FROM licenses WHERE order_id = ?').get(orderId);
  if (existing) {
    return { received: true, processed: true, orderId, licenseKey: existing.license_key, reused: true };
  }

  const catalog = SKU_CATALOG[sku];
  const licenseKey = generateLicenseKey();
  const expiresAt = catalog.durationDays === null
    ? null
    : new Date(Date.now() + catalog.durationDays * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO licenses (
      license_key, sku, duration_days, expires_at, activation_limit, status,
      order_id, buyer_id, created_at, updated_at
    ) VALUES (
      @license_key, @sku, @duration_days, @expires_at, @activation_limit, @status,
      @order_id, @buyer_id, @created_at, @updated_at
    )
  `).run({
    license_key: licenseKey,
    sku,
    duration_days: catalog.durationDays,
    expires_at: expiresAt,
    activation_limit: DEFAULT_ACTIVATION_LIMIT,
    status: 'valid',
    order_id: orderId,
    buyer_id: buyerId,
    created_at: timestamp,
    updated_at: timestamp,
  });

  return { received: true, processed: true, orderId, licenseKey, sku };
}

function activateLicense(body) {
  const licenseKey = `${body?.license_key || body?.licenseKey || ''}`.trim().toUpperCase();
  const hardwareId = `${body?.hardware_id || body?.hardwareId || ''}`.trim();

  if (!licenseKey || !hardwareId) {
    return { success: false, status: 'invalid_request', error: 'license_key 和 hardware_id 为必填项。' };
  }

  const license = getLicenseRowByKey(licenseKey);
  if (!license) {
    return { success: false, status: 'invalid_license', error: '未找到对应许可证。' };
  }

  const computedStatus = computeLicenseStatus(license);
  if (computedStatus !== 'valid') {
    return {
      success: false,
      status: computedStatus,
      error: statusToError(computedStatus),
      license: serializeLicense(license),
    };
  }

  const now = new Date().toISOString();
  const activeActivation = db.prepare(`
    SELECT * FROM activations
    WHERE license_key = ? AND hardware_id = ? AND released_at IS NULL
  `).get(licenseKey, hardwareId);

  if (!activeActivation) {
    const activeCount = db.prepare(`
      SELECT COUNT(*) AS count FROM activations
      WHERE license_key = ? AND released_at IS NULL
    `).get(licenseKey);

    if (Number(activeCount?.count || 0) >= Number(license.activation_limit || DEFAULT_ACTIVATION_LIMIT)) {
      return {
        success: false,
        status: 'activation_limit_hit',
        error: '该许可证已达到设备激活上限，请先在旧设备停用后再试。',
        license: serializeLicense(license),
      };
    }

    db.prepare(`
      INSERT INTO activations (license_key, hardware_id, first_activated_at, last_validated_at)
      VALUES (?, ?, ?, ?)
    `).run(licenseKey, hardwareId, now, now);
  } else {
    db.prepare(`
      UPDATE activations
      SET last_validated_at = ?
      WHERE id = ?
    `).run(now, activeActivation.id);
  }

  db.prepare('UPDATE licenses SET updated_at = ? WHERE license_key = ?').run(now, licenseKey);
  const freshLicense = getLicenseRowByKey(licenseKey);
  const entitlement = buildEntitlement(freshLicense, hardwareId, 'valid');

  return {
    success: true,
    status: 'valid',
    entitlement,
    license: serializeLicense(freshLicense),
  };
}

function deactivateLicense(body) {
  const licenseKey = `${body?.license_key || body?.licenseKey || ''}`.trim().toUpperCase();
  const hardwareId = `${body?.hardware_id || body?.hardwareId || ''}`.trim();

  if (!licenseKey || !hardwareId) {
    return { success: false, error: 'license_key 和 hardware_id 为必填项。' };
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE activations
    SET released_at = ?, last_validated_at = ?
    WHERE license_key = ? AND hardware_id = ? AND released_at IS NULL
  `).run(now, now, licenseKey, hardwareId);

  return { success: true };
}

function getLicenseStatus(params) {
  const licenseKey = `${params.license_key || params.licenseKey || ''}`.trim().toUpperCase();
  const hardwareId = `${params.hardware_id || params.hardwareId || ''}`.trim();
  const orderId = `${params.order_id || params.orderId || ''}`.trim();
  const buyerId = `${params.buyer_id || params.buyerId || ''}`.trim();

  let license = null;
  if (licenseKey) {
    license = getLicenseRowByKey(licenseKey);
  } else if (orderId && buyerId) {
    license = db.prepare(`
      SELECT * FROM licenses WHERE order_id = ? AND buyer_id = ?
    `).get(orderId, buyerId);
  } else if (orderId) {
    return { success: false, error: '找回许可证时请同时提供订单号和买家 ID。' };
  }

  if (!license) {
    return { success: false, status: 'not_found', error: '未找到对应许可证。' };
  }

  const status = computeLicenseStatus(license);
  const serialized = serializeLicense(license);
  const response = {
    success: true,
    status,
    isPremium: status === 'valid' || status === 'offline_grace',
    license: serialized,
    entitlement: null,
  };

  if (hardwareId && (status === 'valid' || status === 'offline_grace')) {
    db.prepare(`
      UPDATE activations
      SET last_validated_at = ?
      WHERE license_key = ? AND hardware_id = ? AND released_at IS NULL
    `).run(new Date().toISOString(), serialized.licenseKey, hardwareId);

    response.entitlement = buildEntitlement(license, hardwareId, status === 'valid' ? 'valid' : 'offline_grace');
  }

  return response;
}

function createHostedSession(body) {
  ensureHostedEnabled();

  const licenseKey = `${body?.license_key || body?.licenseKey || ''}`.trim().toUpperCase();
  const hardwareId = `${body?.hardware_id || body?.hardwareId || ''}`.trim();
  const appVersion = `${body?.app_version || body?.appVersion || ''}`.trim() || 'unknown';
  const platform = `${body?.platform || body?.os || ''}`.trim() || 'unknown';

  if (!licenseKey || !hardwareId) {
    return {
      success: false,
      status: 'invalid_request',
      error: 'license_key 和 hardware_id 为必填项。',
    };
  }

  const license = getLicenseRowByKey(licenseKey);
  if (!license) {
    return {
      success: false,
      status: 'invalid_license',
      error: '未找到对应许可证。',
    };
  }

  const hostedEligibility = getHostedEligibility(license, hardwareId);
  if (!hostedEligibility.ok) {
    return {
      success: false,
      status: hostedEligibility.status,
      error: hostedEligibility.error,
      license: serializeLicense(license),
    };
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + HOSTED_SESSION_TTL_SECONDS;
  const sessionToken = signSessionToken({
    licenseKey,
    hardwareId,
    sku: license.sku,
    appVersion,
    platform,
    issuedAt,
    expiresAt,
  });

  return {
    success: true,
    session_token: sessionToken,
    expires_at: new Date(expiresAt * 1000).toISOString(),
    hosted: {
      enabled: true,
      byok_hidden: NATIVELY_HIDE_BYOK,
      openai_compatible: {
        base_url: `${NATIVELY_HOSTED_GATEWAY_URL}/hosted/openai/v1`,
        preferred_model: PACKY_TEXT_MODEL,
        fast_model: PACKY_FAST_MODEL,
        vision_model: PACKY_VISION_MODEL,
      },
      stt: {
        provider: 'alibaba',
        ws_url: 'wss://dashscope.aliyuncs.com/api-ws/v1/inference',
        token_ttl_seconds: HOSTED_STT_TOKEN_TTL_SECONDS,
      },
    },
    usage: buildUsageSummary(license),
    service_expires_at: computeServiceWindow(license).serviceExpiresAt,
  };
}

async function createAlibabaTemporarySession(session, body) {
  const requestedSeconds = clampNumber(body?.expire_in_seconds || body?.expireInSeconds, HOSTED_STT_TOKEN_TTL_SECONDS, 1, 1800);
  const usageCost = Math.max(1, Math.ceil(requestedSeconds / 60));
  const summary = buildUsageSummary(session.license);

  if (summary.stt_minutes_remaining < usageCost) {
    return {
      success: false,
      status: 'quota_exhausted',
      error: '语音额度已用尽，请续费后再试。',
      usage: summary,
    };
  }

  const response = await axios.post(`${ALIBABA_TEMP_KEY_API_URL}?expire_in_seconds=${requestedSeconds}`, null, {
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${ALIBABA_DASHSCOPE_API_KEY}`,
    },
  });

  if (!response?.data?.token) {
    throw new Error('百炼临时密钥接口未返回 token。');
  }

  recordUsage(session.license.license_key, 'stt_minutes', usageCost, {
    requestedSeconds,
    issuedFor: `${body?.issued_for || body?.issuedFor || 'realtime-session'}`,
  });

  return {
    success: true,
    provider: 'alibaba',
    token: `${response.data.token}`.trim(),
    expires_at: new Date(Number(response.data.expires_at) * 1000).toISOString(),
    lease_minutes: usageCost,
    usage: buildUsageSummary(session.license),
  };
}

async function proxyHostedResponses(res, session, requestBody, options = {}) {
  const category = options.category || (detectVisionInput(requestBody) ? 'vision' : 'llm');
  const usageType = category === 'vision' ? 'vision_requests' : 'llm_requests';
  const summary = buildUsageSummary(session.license);
  const remainingKey = category === 'vision' ? 'vision_requests_remaining' : 'llm_requests_remaining';

  if (summary[remainingKey] < 1) {
    return writeJson(res, 402, {
      success: false,
      status: 'quota_exhausted',
      error: category === 'vision' ? '截图理解额度已用尽，请续费后再试。' : '文本额度已用尽，请续费后再试。',
      usage: summary,
    });
  }

  const upstreamBody = {
    ...requestBody,
    model: `${requestBody?.model || (category === 'vision' ? PACKY_VISION_MODEL : PACKY_TEXT_MODEL)}`.trim(),
  };

  const upstreamResponse = await fetch(`${PACKY_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PACKY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(upstreamBody),
  });

  if (!upstreamResponse.ok) {
    const errorText = await upstreamResponse.text();
    res.writeHead(upstreamResponse.status, {
      'Content-Type': upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(errorText);
    return;
  }

  recordUsage(session.license.license_key, usageType, 1, {
    model: upstreamBody.model,
    category,
  });

  const contentType = upstreamResponse.headers.get('content-type') || (upstreamBody.stream ? 'text/event-stream; charset=utf-8' : 'application/json; charset=utf-8');
  res.writeHead(upstreamResponse.status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });

  if (!upstreamResponse.body) {
    res.end();
    return;
  }

  for await (const chunk of upstreamResponse.body) {
    res.write(chunk);
  }
  res.end();
}

function authorizeHostedSession(req, options = {}) {
  ensureHostedEnabled();

  const header = `${req.headers.authorization || ''}`.trim();
  if (!header.toLowerCase().startsWith('bearer ')) {
    throw createHttpError(401, 'missing_authorization', '缺少授权令牌。');
  }

  const token = header.slice(7).trim();
  const payload = verifySessionToken(token);
  const license = getLicenseRowByKey(payload.licenseKey);

  if (!license) {
    throw createHttpError(401, 'invalid_license', '许可证不存在或已失效。');
  }

  const hostedEligibility = getHostedEligibility(license, payload.hardwareId);
  if (!hostedEligibility.ok) {
    throw createHttpError(401, hostedEligibility.status, hostedEligibility.error);
  }

  if (options.requireHostedUpstream && (!PACKY_API_KEY || !PACKY_BASE_URL)) {
    throw createHttpError(503, 'hosted_unconfigured', 'PackyAPI 主密钥尚未配置。');
  }

  if (options.requireAlibabaUpstream && !ALIBABA_DASHSCOPE_API_KEY) {
    throw createHttpError(503, 'stt_unconfigured', '阿里云百炼永久密钥尚未配置。');
  }

  return { token, payload, license };
}

function ensureHostedEnabled() {
  if (!NATIVELY_HOSTED_ENABLED) {
    throw createHttpError(503, 'hosted_disabled', '托管服务尚未开启。');
  }
}

function getHostedEligibility(license, hardwareId) {
  const licenseStatus = computeLicenseStatus(license);
  if (licenseStatus !== 'valid') {
    return {
      ok: false,
      status: licenseStatus,
      error: statusToError(licenseStatus),
    };
  }

  if (!isActivationActive(license.license_key, hardwareId)) {
    return {
      ok: false,
      status: 'activation_required',
      error: '请先在桌面端完成许可证激活后再使用托管服务。',
    };
  }

  const serviceWindow = computeServiceWindow(license);
  if (Date.now() > new Date(serviceWindow.serviceExpiresAt).getTime()) {
    return {
      ok: false,
      status: 'service_expired',
      error: '托管服务已到期，请续费后再继续使用。',
    };
  }

  return { ok: true, status: 'valid' };
}

function computeServiceWindow(license) {
  const createdAt = new Date(license.created_at);
  const fallbackHostedDays = HOSTED_QUOTA_CATALOG[license.sku]?.hosted_days || license.duration_days || 365;
  const hostedDays = license.sku === 'cn_lifetime'
    ? fallbackHostedDays
    : (license.duration_days || fallbackHostedDays);
  const computedServiceExpiresAt = new Date(createdAt.getTime() + hostedDays * 24 * 60 * 60 * 1000).toISOString();
  const serviceExpiresAt = license.expires_at
    ? new Date(Math.min(new Date(license.expires_at).getTime(), new Date(computedServiceExpiresAt).getTime())).toISOString()
    : computedServiceExpiresAt;

  return {
    serviceStartsAt: createdAt.toISOString(),
    serviceExpiresAt,
  };
}

function buildUsageSummary(license) {
  const window = computeServiceWindow(license);
  const quota = HOSTED_QUOTA_CATALOG[license.sku] || DEFAULT_HOSTED_QUOTAS.cn_30d;
  const usage = db.prepare(`
    SELECT usage_type, COALESCE(SUM(units), 0) AS total
    FROM usage_ledger
    WHERE license_key = ?
      AND created_at >= ?
      AND created_at <= ?
    GROUP BY usage_type
  `).all(license.license_key, window.serviceStartsAt, window.serviceExpiresAt);

  const usedMap = Object.create(null);
  for (const row of usage) {
    usedMap[row.usage_type] = Number(row.total || 0);
  }

  const llmUsed = usedMap.llm_requests || 0;
  const visionUsed = usedMap.vision_requests || 0;
  const sttUsed = usedMap.stt_minutes || 0;

  return {
    llm_requests_total: quota.llm_requests,
    llm_requests_used: llmUsed,
    llm_requests_remaining: Math.max(0, quota.llm_requests - llmUsed),
    vision_requests_total: quota.vision_requests,
    vision_requests_used: visionUsed,
    vision_requests_remaining: Math.max(0, quota.vision_requests - visionUsed),
    stt_minutes_total: quota.stt_minutes,
    stt_minutes_used: sttUsed,
    stt_minutes_remaining: Math.max(0, quota.stt_minutes - sttUsed),
    reset_at: window.serviceExpiresAt,
    service_expires_at: window.serviceExpiresAt,
  };
}

function recordUsage(licenseKey, usageType, units, metadata) {
  db.prepare(`
    INSERT INTO usage_ledger (license_key, usage_type, units, created_at, metadata_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    licenseKey,
    usageType,
    units,
    new Date().toISOString(),
    metadata ? JSON.stringify(metadata) : null
  );
}

function isActivationActive(licenseKey, hardwareId) {
  const row = db.prepare(`
    SELECT id FROM activations
    WHERE license_key = ? AND hardware_id = ? AND released_at IS NULL
  `).get(licenseKey, hardwareId);
  return Boolean(row?.id);
}

async function extractCanonicalOrder(payload) {
  const webhookOrder = payload?.data?.type === 'order' ? payload?.data?.order : null;
  const orderId = `${webhookOrder?.out_trade_no || payload?.out_trade_no || ''}`.trim();

  if (!orderId) {
    return null;
  }

  if (!process.env.AFDIAN_USER_ID || !process.env.AFDIAN_TOKEN) {
    if (!ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS) {
      console.warn('[commerce] AFDIAN_USER_ID / AFDIAN_TOKEN not configured. Refusing to trust raw webhook payload.');
      return null;
    }

    console.warn('[commerce] Trusting raw webhook payload because ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS=true.');
    return webhookOrder;
  }

  try {
    const apiOrder = await queryAfdianOrder(orderId);
    if (apiOrder) {
      return apiOrder;
    }

    if (ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS) {
      console.warn(`[commerce] Could not reconcile order ${orderId} via Afdian API. Falling back to raw webhook because ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS=true.`);
      return webhookOrder;
    }

    console.warn(`[commerce] Could not reconcile order ${orderId} via Afdian API. Webhook ignored.`);
    return null;
  } catch (error) {
    if (ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS) {
      console.warn('[commerce] Failed to reconcile order via API, falling back to raw webhook because ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS=true:', error);
      return webhookOrder;
    }

    console.warn('[commerce] Failed to reconcile order via API. Webhook ignored:', error);
    return null;
  }
}

async function queryAfdianOrder(orderId) {
  const ts = Math.floor(Date.now() / 1000);
  const params = JSON.stringify({ out_trade_no: orderId });
  const signRaw = `${process.env.AFDIAN_TOKEN}params${params}ts${ts}user_id${process.env.AFDIAN_USER_ID}`;
  const sign = crypto.createHash('md5').update(signRaw).digest('hex');

  const response = await axios.post('https://afdian.net/api/open/query-order', {
    user_id: process.env.AFDIAN_USER_ID,
    params,
    ts,
    sign,
  }, {
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
  });

  if (Number(response?.data?.ec) !== 200) {
    throw new Error(`Afdian query-order failed: ${response?.data?.em || 'unknown error'}`);
  }

  const list = response?.data?.data?.list;
  if (!Array.isArray(list)) {
    return null;
  }
  return list.find((item) => `${item?.out_trade_no || ''}`.trim() === orderId) || null;
}

function inferSku(order) {
  const planId = `${order?.plan_id || ''}`.trim();
  const productNames = Array.isArray(order?.sku_detail)
    ? order.sku_detail.map((item) => `${item?.name || ''}`.trim()).filter(Boolean)
    : [];
  const title = `${order?.title || ''}`.trim();

  if (PLAN_MAP[planId]) {
    return PLAN_MAP[planId];
  }

  const lookup = `${title} ${productNames.join(' ')}`.toLowerCase();
  if (/(1天|1\s*day|24\s*小时)/i.test(lookup)) return 'cn_1d';
  if (/(7天|7\s*day|周卡)/i.test(lookup)) return 'cn_7d';
  if (/(30天|30\s*day|月卡|月版)/i.test(lookup)) return 'cn_30d';
  if (/(365天|365\s*day|年卡|年版)/i.test(lookup)) return 'cn_365d';
  if (/(永久|买断|lifetime)/i.test(lookup)) return 'cn_lifetime';

  return null;
}

function isOrderPaid(order) {
  return Number(order?.status || 0) === 2;
}

function getLicenseRowByKey(licenseKey) {
  return db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(licenseKey);
}

function computeLicenseStatus(license) {
  if (!license) return 'not_found';
  if (license.status === 'revoked') return 'revoked';
  if (license.expires_at && Date.now() > new Date(license.expires_at).getTime()) return 'expired';
  return 'valid';
}

function serializeLicense(license) {
  return {
    licenseKey: license.license_key,
    sku: license.sku,
    durationDays: license.duration_days,
    expiresAt: license.expires_at,
    activationLimit: license.activation_limit,
    status: computeLicenseStatus(license),
    orderId: license.order_id,
    buyerId: license.buyer_id,
  };
}

function buildEntitlement(license, hardwareId, overrideStatus) {
  const now = new Date();
  const expiresAt = license.expires_at ? new Date(license.expires_at) : null;
  const offlineGraceEndsAt = new Date(now.getTime() + DEFAULT_OFFLINE_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const boundedOfflineGrace = expiresAt && offlineGraceEndsAt > expiresAt ? expiresAt : offlineGraceEndsAt;
  const entitlement = {
    licenseKey: license.license_key,
    sku: license.sku,
    status: overrideStatus,
    expiresAt: license.expires_at,
    activationLimit: license.activation_limit,
    orderId: license.order_id,
    buyerId: license.buyer_id,
    hardwareId,
    lastValidatedAt: now.toISOString(),
    offlineGraceEndsAt: boundedOfflineGrace.toISOString(),
  };

  return {
    ...entitlement,
    signature: signEntitlement(entitlement),
  };
}

function signEntitlement(entitlement) {
  return crypto
    .createHmac('sha256', LICENSE_SIGNING_SECRET)
    .update(JSON.stringify(entitlement))
    .digest('hex');
}

function signSessionToken(payload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', SESSION_SIGNING_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(token) {
  const parts = `${token || ''}`.trim().split('.');
  if (parts.length !== 2) {
    throw createHttpError(401, 'invalid_session', '会话令牌格式无效。');
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', SESSION_SIGNING_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw createHttpError(401, 'invalid_session', '会话令牌签名无效。');
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    throw createHttpError(401, 'invalid_session', '会话令牌无法解析。');
  }

  if (!payload?.licenseKey || !payload?.hardwareId || !payload?.expiresAt) {
    throw createHttpError(401, 'invalid_session', '会话令牌缺少必要字段。');
  }

  if (Math.floor(Date.now() / 1000) >= Number(payload.expiresAt)) {
    throw createHttpError(401, 'session_expired', '会话令牌已过期，请重新登录。');
  }

  return payload;
}

function generateLicenseKey() {
  const raw = crypto.randomBytes(12).toString('base64url').toUpperCase();
  return `NAT-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

function statusToError(status) {
  switch (status) {
    case 'revoked':
      return '该许可证已被停用。';
    case 'expired':
      return '该许可证已过期，请重新购买或续费。';
    case 'activation_limit_hit':
      return '该许可证已达到设备上限。';
    default:
      return '许可证不可用。';
  }
}

function parseJsonEnv(key, fallback) {
  const raw = process.env[key];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function parseBooleanEnv(key, fallback) {
  const raw = process.env[key];
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeQuotaCatalog(rawCatalog, fallbackCatalog) {
  const merged = {};
  for (const sku of Object.keys(fallbackCatalog)) {
    const source = rawCatalog?.[sku] || fallbackCatalog[sku];
    merged[sku] = {
      llm_requests: clampNumber(source?.llm_requests, fallbackCatalog[sku].llm_requests, 0, Number.MAX_SAFE_INTEGER),
      vision_requests: clampNumber(source?.vision_requests, fallbackCatalog[sku].vision_requests, 0, Number.MAX_SAFE_INTEGER),
      stt_minutes: clampNumber(source?.stt_minutes, fallbackCatalog[sku].stt_minutes, 0, Number.MAX_SAFE_INTEGER),
      hosted_days: clampNumber(source?.hosted_days, fallbackCatalog[sku].hosted_days, 1, 3650),
    };
  }
  return merged;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function normalizeBaseUrl(value) {
  return stripTrailingSlash(`${value || ''}`.trim());
}

function detectVisionInput(requestBody) {
  const queue = [requestBody];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;

    if (current.type === 'input_image' || current.type === 'image_url') {
      return true;
    }

    if (typeof current.image_url === 'string' || typeof current.imageUrl === 'string') {
      return true;
    }

    for (const value of Object.values(current)) {
      if (Array.isArray(value)) {
        queue.push(...value);
      } else if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return false;
}

function coerceGatewayRequestBody(body, options = {}) {
  if (Array.isArray(body?.input) || typeof body?.input === 'string') {
    return body;
  }

  const message = `${body?.message || body?.text || ''}`.trim();
  const instructions = `${body?.instructions || body?.system || ''}`.trim();
  const images = Array.isArray(body?.images)
    ? body.images.map((item) => ({ type: 'input_image', image_url: item }))
    : [];

  return {
    model: body?.model,
    stream: Boolean(body?.stream),
    ...(instructions ? { instructions } : {}),
    input: [{
      role: 'user',
      content: [
        ...(message ? [{ type: 'input_text', text: message }] : []),
        ...(options.forceVision ? images : images),
      ],
    }],
  };
}

function createHttpError(statusCode, status, message) {
  const error = new Error(message);
  error.__statusCode = statusCode;
  error.status = status;
  return error;
}

function base64UrlEncode(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function serveStaticRequest(requestPath, res) {
  let pathname = decodeURIComponent(requestPath || '/');
  if (pathname === '/') {
    pathname = '/index.html';
  } else if (!path.extname(pathname)) {
    pathname = `${pathname.replace(/\/$/, '')}/index.html`;
  }

  const filePath = path.normalize(path.join(SITE_ROOT, pathname));
  if (!filePath.startsWith(SITE_ROOT)) {
    return writeJson(res, 403, { success: false, error: 'Forbidden' });
  }

  if (!fs.existsSync(filePath)) {
    return writeJson(res, 404, { success: false, error: 'Not found' });
  }

  return serveStaticFile(res, filePath);
}

function serveStaticFile(res, filePath) {
  const contentType = getContentType(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}



