const crypto = require("crypto");
const LICENSE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createLicenseService({ db, config }) {
  const insertLicense = db.prepare(`
    INSERT INTO licenses (
      license_key, sku, duration_days, activated_at, expires_at, activation_limit,
      status, buyer_id, order_id, wechat_note, order_note, created_at, updated_at, revoked_at
    ) VALUES (
      @license_key, @sku, @duration_days, @activated_at, @expires_at, @activation_limit,
      @status, @buyer_id, @order_id, @wechat_note, @order_note, @created_at, @updated_at, @revoked_at
    )
  `);
  const getLicenseByKeyStmt = db.prepare("SELECT * FROM licenses WHERE license_key = ?");
  const getLicenseByOrderStmt = db.prepare("SELECT * FROM licenses WHERE order_id = ? AND buyer_id = ?");
  const updateLicenseStatusStmt = db.prepare(`
    UPDATE licenses
    SET status = @status, revoked_at = @revoked_at, updated_at = @updated_at
    WHERE license_key = @license_key
  `);
  const updateLicenseActivationStmt = db.prepare(`
    UPDATE licenses
    SET activated_at = @activated_at, expires_at = @expires_at, updated_at = @updated_at
    WHERE license_key = @license_key
  `);
  const updateLicenseExpiryStmt = db.prepare(`
    UPDATE licenses
    SET activated_at = @activated_at, expires_at = @expires_at, updated_at = @updated_at
    WHERE license_key = @license_key
  `);
  const renewLicenseStmt = db.prepare(`
    UPDATE licenses
    SET sku = @sku,
        duration_days = @duration_days,
        activation_limit = @activation_limit,
        expires_at = @expires_at,
        status = @status,
        updated_at = @updated_at
    WHERE license_key = @license_key
  `);
  const touchLicenseStmt = db.prepare(`
    UPDATE licenses
    SET updated_at = ?
    WHERE license_key = ?
  `);
  const getActiveActivationStmt = db.prepare(`
    SELECT *
    FROM activations
    WHERE license_key = ? AND hardware_id = ? AND released_at IS NULL
    ORDER BY id DESC
    LIMIT 1
  `);
  const getActivationHistoryStmt = db.prepare(`
    SELECT *
    FROM activations
    WHERE license_key = ?
    ORDER BY id DESC
  `);
  const countActiveActivationsStmt = db.prepare(`
    SELECT COUNT(*) AS count
    FROM activations
    WHERE license_key = ? AND released_at IS NULL
  `);
  const insertActivationStmt = db.prepare(`
    INSERT INTO activations (
      license_key, hardware_id, first_activated_at, last_validated_at, released_at, created_at, updated_at
    ) VALUES (
      @license_key, @hardware_id, @first_activated_at, @last_validated_at, @released_at, @created_at, @updated_at
    )
  `);
  const updateActivationTouchStmt = db.prepare(`
    UPDATE activations
    SET last_validated_at = ?, updated_at = ?
    WHERE id = ?
  `);
  const releaseActivationForHardwareStmt = db.prepare(`
    UPDATE activations
    SET released_at = ?, last_validated_at = ?, updated_at = ?
    WHERE license_key = ? AND hardware_id = ? AND released_at IS NULL
  `);
  const releaseAllActivationsStmt = db.prepare(`
    UPDATE activations
    SET released_at = ?, last_validated_at = ?, updated_at = ?
    WHERE license_key = ? AND released_at IS NULL
  `);
  const listLicensesStmt = db.prepare(`
    SELECT *
    FROM licenses
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const searchLicensesStmt = db.prepare(`
    SELECT *
    FROM licenses
    WHERE license_key LIKE @query ESCAPE '\\'
       OR COALESCE(buyer_id, '') LIKE @query ESCAPE '\\'
       OR COALESCE(order_id, '') LIKE @query ESCAPE '\\'
       OR COALESCE(wechat_note, '') LIKE @query ESCAPE '\\'
       OR COALESCE(order_note, '') LIKE @query ESCAPE '\\'
    ORDER BY created_at DESC
    LIMIT @limit
  `);
  const insertEventStmt = db.prepare(`
    INSERT INTO license_events (license_key, event_type, payload_json, created_at)
    VALUES (?, ?, ?, ?)
  `);
  const listEventsStmt = db.prepare(`
    SELECT *
    FROM license_events
    WHERE license_key = ?
    ORDER BY id DESC
    LIMIT ?
  `);

  const createLicenseTxn = db.transaction((input) => {
    const sku = normalizeSku(input.sku);
    const catalog = config.skuCatalog[sku];
    if (!catalog) {
      throw new Error(`Unsupported sku: ${input.sku}`);
    }

    const now = new Date().toISOString();
    const durationDays = resolveDurationDays(input.durationDays, catalog);
    const activationLimit = normalizeActivationLimit(
      input.activationLimit,
      catalog.defaultActivationLimit ?? config.activationLimit,
    );
    const orderId = cleanText(input.orderId) || defaultOrderId();
    const buyerId = cleanText(input.buyerId);
    const wechatNote = cleanText(input.wechatNote);
    const orderNote = cleanText(input.orderNote);
    const licenseKey = ensureUniqueLicenseKey(cleanText(input.licenseKey));

    insertLicense.run({
      license_key: licenseKey,
      sku,
      duration_days: durationDays,
      activated_at: null,
      expires_at: null,
      activation_limit: activationLimit,
      status: "valid",
      buyer_id: buyerId,
      order_id: orderId,
      wechat_note: wechatNote,
      order_note: orderNote,
      created_at: now,
      updated_at: now,
      revoked_at: null,
    });

    recordEvent(licenseKey, "created", {
      sku,
      durationDays,
      activationLimit,
      buyerId,
      orderId,
      wechatNote,
      orderNote,
    }, now);

    return getLicenseByKey(licenseKey);
  });

  const activateLicenseTxn = db.transaction((payload) => {
    const licenseKey = normalizeLicenseKey(payload.licenseKey);
    const hardwareId = cleanText(payload.hardwareId);

    if (!licenseKey || !hardwareId) {
      return {
        success: false,
        status: "invalid_license",
        error: "license_key 和 hardware_id 为必填项。",
      };
    }

    let license = getLicenseByKey(licenseKey);
    if (!license) {
      return {
        success: false,
        status: "invalid_license",
        error: "未找到对应许可证。",
      };
    }

    const status = computeLicenseStatus(license);
    if (status !== "valid") {
      return {
        success: false,
        status,
        error: statusToError(status),
        license: serializeLicense(license),
      };
    }

    const now = new Date().toISOString();
    const activeActivation = getActiveActivationStmt.get(licenseKey, hardwareId);

    if (!activeActivation) {
      const activeCount = Number(countActiveActivationsStmt.get(licenseKey)?.count || 0);
      const activationLimit = resolveActivationLimit(license, config);
      if (activationLimit > 0 && activeCount >= activationLimit) {
        return {
          success: false,
          status: "activation_limit_hit",
          error: "该许可证已达到设备激活上限，请先在旧设备停用后再试。",
          license: serializeLicense(license),
        };
      }

      insertActivationStmt.run({
        license_key: licenseKey,
        hardware_id: hardwareId,
        first_activated_at: now,
        last_validated_at: now,
        released_at: null,
        created_at: now,
        updated_at: now,
      });
      recordEvent(licenseKey, "activated", { hardwareId }, now);
    } else {
      updateActivationTouchStmt.run(now, now, activeActivation.id);
      recordEvent(licenseKey, "validated", { hardwareId }, now);
    }

    if (!license.activated_at) {
      const started = beginActivationWindow(license, now);
      updateLicenseActivationStmt.run({
        activated_at: started.activatedAt,
        expires_at: started.expiresAt,
        updated_at: now,
        license_key: licenseKey,
      });
    } else {
      touchLicenseStmt.run(now, licenseKey);
    }

    license = getLicenseByKey(licenseKey);
    return {
      success: true,
      status: "valid",
      isPremium: true,
      entitlement: buildEntitlement(license, hardwareId, config),
      license: serializeLicense(license),
    };
  });

  const deactivateLicenseTxn = db.transaction((payload) => {
    const licenseKey = normalizeLicenseKey(payload.licenseKey);
    const hardwareId = cleanText(payload.hardwareId);

    if (!licenseKey || !hardwareId) {
      return {
        success: false,
        error: "license_key 和 hardware_id 为必填项。",
      };
    }

    const now = new Date().toISOString();
    const result = releaseActivationForHardwareStmt.run(now, now, now, licenseKey, hardwareId);
    if (result.changes > 0) {
      recordEvent(licenseKey, "deactivated", { hardwareId }, now);
    }

    return {
      success: true,
      released: result.changes,
    };
  });

  const resetActivationTxn = db.transaction((payload) => {
    const licenseKey = normalizeLicenseKey(payload.licenseKey);
    const hardwareId = cleanText(payload.hardwareId);

    if (!licenseKey) {
      throw new Error("Missing license key");
    }

    const now = new Date().toISOString();
    const result = hardwareId
      ? releaseActivationForHardwareStmt.run(now, now, now, licenseKey, hardwareId)
      : releaseAllActivationsStmt.run(now, now, now, licenseKey);

    recordEvent(licenseKey, "activation_reset", { hardwareId: hardwareId || null, released: result.changes }, now);
    return {
      success: true,
      released: result.changes,
    };
  });

  const revokeLicenseTxn = db.transaction((payload) => {
    const licenseKey = normalizeLicenseKey(payload.licenseKey);
    const reason = cleanText(payload.reason) || "manual";
    const now = new Date().toISOString();

    const license = getLicenseByKey(licenseKey);
    if (!license) {
      throw new Error("License not found");
    }

    updateLicenseStatusStmt.run({
      license_key: licenseKey,
      status: "revoked",
      revoked_at: now,
      updated_at: now,
    });
    releaseAllActivationsStmt.run(now, now, now, licenseKey);
    recordEvent(licenseKey, "revoked", { reason }, now);
    return getLicenseDetail(licenseKey);
  });

  const expireLicenseTxn = db.transaction((payload) => {
    const licenseKey = normalizeLicenseKey(payload.licenseKey);
    const reason = cleanText(payload.reason) || "manual_expire";
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() - 1000).toISOString();

    const license = getLicenseByKey(licenseKey);
    if (!license) {
      throw new Error("License not found");
    }

    if (license.status === "revoked") {
      throw new Error("Revoked licenses cannot be manually expired");
    }

    updateLicenseExpiryStmt.run({
      license_key: licenseKey,
      activated_at: license.activated_at || now,
      expires_at: expiresAt,
      updated_at: now,
    });
    recordEvent(licenseKey, "expired_manually", {
      reason,
      previousExpiresAt: license.expires_at,
    }, now);
    return getLicenseDetail(licenseKey);
  });

  const renewLicenseTxn = db.transaction((payload) => {
    const licenseKey = normalizeLicenseKey(payload.licenseKey);
    const sku = normalizeSku(payload.sku);
    const catalog = config.skuCatalog[sku];

    if (!licenseKey) {
      throw new Error("Missing license key");
    }

    if (!catalog) {
      throw new Error(`Unsupported sku: ${payload.sku}`);
    }

    const license = getLicenseByKey(licenseKey);
    if (!license) {
      throw new Error("License not found");
    }

    if (license.status === "revoked") {
      throw new Error("Revoked licenses cannot be renewed");
    }

    if (license.duration_days === null && catalog.durationDays !== null) {
      throw new Error("Lifetime licenses cannot be converted back to timed licenses");
    }

    const now = new Date().toISOString();
    const durationDays = resolveDurationDays(payload.durationDays, catalog);
    const nextExpiresAt = computeRenewedExpiry({
      license,
      nextDurationDays: durationDays,
      now,
    });

    renewLicenseStmt.run({
      license_key: licenseKey,
      sku,
      duration_days: durationDays,
      activation_limit: Number(catalog.defaultActivationLimit ?? license.activation_limit ?? config.activationLimit),
      expires_at: nextExpiresAt,
      status: "valid",
      updated_at: now,
    });

    recordEvent(licenseKey, "renewed", {
      previousSku: license.sku,
      previousDurationDays: license.duration_days,
      previousExpiresAt: license.expires_at,
      sku,
      durationDays,
      nextExpiresAt,
    }, now);

    return getLicenseDetail(licenseKey);
  });

  function createLicense(input) {
    const license = createLicenseTxn(input);
    return {
      success: true,
      licenseKey: license.license_key,
      license: serializeLicense(license),
    };
  }

  function activateLicense(payload) {
    return activateLicenseTxn({
      licenseKey: payload.license_key || payload.licenseKey,
      hardwareId: payload.hardware_id || payload.hardwareId,
    });
  }

  function deactivateLicense(payload) {
    return deactivateLicenseTxn({
      licenseKey: payload.license_key || payload.licenseKey,
      hardwareId: payload.hardware_id || payload.hardwareId,
    });
  }

  function getLicenseStatus(payload) {
    const licenseKey = normalizeLicenseKey(payload.license_key || payload.licenseKey);
    const hardwareId = cleanText(payload.hardware_id || payload.hardwareId);
    const orderId = cleanText(payload.order_id || payload.orderId);
    const buyerId = cleanText(payload.buyer_id || payload.buyerId);

    let license = null;
    if (licenseKey) {
      license = getLicenseByKey(licenseKey);
    } else if (orderId && buyerId) {
      license = getLicenseByOrderStmt.get(orderId, buyerId);
    }

    if (!license) {
      return {
        success: false,
        status: "invalid_license",
        isPremium: false,
        error: "未找到对应许可证。",
        entitlement: null,
        license: null,
      };
    }

    const status = computeLicenseStatus(license);
    const response = {
      success: true,
      status,
      isPremium: false,
      error: status === "valid" ? undefined : statusToError(status),
      entitlement: null,
      license: serializeLicense(license),
    };

    if (status !== "valid") {
      return response;
    }

    if (!hardwareId) {
      return response;
    }

    const activation = getActiveActivationStmt.get(license.license_key, hardwareId);
    if (!activation) {
      return {
        ...response,
        error: "该许可证尚未在当前设备激活。",
      };
    }

    const now = new Date().toISOString();
    updateActivationTouchStmt.run(now, now, activation.id);
    license = getLicenseByKey(license.license_key);

    return {
      ...response,
      isPremium: true,
      error: undefined,
      entitlement: buildEntitlement(license, hardwareId, config),
      license: serializeLicense(license),
    };
  }

  function resetActivation(payload) {
    return resetActivationTxn(payload);
  }

  function revokeLicense(payload) {
    return revokeLicenseTxn(payload);
  }

  function expireLicense(payload) {
    return expireLicenseTxn({
      licenseKey: payload.licenseKey || payload.license_key,
      reason: payload.reason,
    });
  }

  function renewLicense(payload) {
    return renewLicenseTxn({
      licenseKey: payload.licenseKey || payload.license_key,
      sku: payload.sku,
      durationDays: payload.durationDays || payload.duration_days,
    });
  }

  function getLicenseDetail(licenseKey) {
    const normalizedKey = normalizeLicenseKey(licenseKey);
    const license = getLicenseByKey(normalizedKey);
    if (!license) {
      return null;
    }

    return {
      license: serializeLicense(license),
      activations: getActivationHistoryStmt.all(normalizedKey).map(serializeActivation),
      events: listEventsStmt.all(normalizedKey, 50).map((event) => ({
        id: event.id,
        eventType: event.event_type,
        payload: safeJsonParse(event.payload_json),
        createdAt: event.created_at,
      })),
    };
  }

  function listLicenses(limit = 20, query = "") {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const normalizedQuery = `${query || ""}`.trim();
    const rows = normalizedQuery
      ? searchLicensesStmt.all({
        query: `%${escapeSqlLike(normalizedQuery)}%`,
        limit: safeLimit,
      })
      : listLicensesStmt.all(safeLimit);

    return rows.map((license) => ({
      ...serializeLicense(license),
      activeActivations: Number(countActiveActivationsStmt.get(license.license_key)?.count || 0),
    }));
  }

  function getLicenseByKey(licenseKey) {
    if (!licenseKey) {
      return null;
    }

    return getLicenseByKeyStmt.get(licenseKey) || null;
  }

  function ensureUniqueLicenseKey(inputKey) {
    const provided = normalizeLicenseKey(inputKey);
    if (provided) {
      if (getLicenseByKey(provided)) {
        throw new Error(`License key already exists: ${provided}`);
      }
      return provided;
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generateLicenseKey();
      if (!getLicenseByKey(candidate)) {
        return candidate;
      }
    }

    throw new Error("Failed to generate a unique license key");
  }

  function recordEvent(licenseKey, eventType, payload, createdAt = new Date().toISOString()) {
    insertEventStmt.run(licenseKey, eventType, JSON.stringify(payload || {}), createdAt);
  }

  return {
    createLicense,
    activateLicense,
    deactivateLicense,
    getLicenseStatus,
    resetActivation,
    revokeLicense,
    expireLicense,
    renewLicense,
    getLicenseDetail,
    listLicenses,
  };
}

function beginActivationWindow(license, activatedAt) {
  const activationDate = new Date(activatedAt);
  const expiresAt = license.duration_days === null || license.duration_days === undefined
    ? null
    : new Date(activationDate.getTime() + Number(license.duration_days) * 24 * 60 * 60 * 1000).toISOString();

  return {
    activatedAt: activatedAt,
    expiresAt,
  };
}

function computeLicenseStatus(license) {
  if (!license) {
    return "invalid_license";
  }

  if (license.status === "revoked") {
    return "revoked";
  }

  if (license.expires_at && Date.now() > new Date(license.expires_at).getTime()) {
    return "expired";
  }

  return "valid";
}

function computeRenewedExpiry({ license, nextDurationDays, now }) {
  if (nextDurationDays === null || nextDurationDays === undefined) {
    return null;
  }

  if (!license.activated_at) {
    return null;
  }

  const nowMs = new Date(now).getTime();
  const baseMs = license.expires_at
    ? Math.max(nowMs, new Date(license.expires_at).getTime())
    : nowMs;

  return new Date(baseMs + Number(nextDurationDays) * 24 * 60 * 60 * 1000).toISOString();
}

function buildEntitlement(license, hardwareId, config) {
  const now = new Date();
  const expiresAt = license.expires_at ? new Date(license.expires_at) : null;
  const offlineGraceEndsAt = new Date(now.getTime() + config.offlineGraceDays * 24 * 60 * 60 * 1000);
  const boundedOfflineGrace = expiresAt && offlineGraceEndsAt > expiresAt ? expiresAt : offlineGraceEndsAt;
  const payload = {
    licenseKey: license.license_key,
    sku: license.sku,
    status: "valid",
    expiresAt: license.expires_at,
    activationLimit: resolveActivationLimit(license, config),
    orderId: license.order_id || "",
    buyerId: license.buyer_id || "",
    hardwareId,
    lastValidatedAt: now.toISOString(),
    offlineGraceEndsAt: boundedOfflineGrace.toISOString(),
  };

  return {
    ...payload,
    signature: crypto
      .createHmac("sha256", config.licenseSigningSecret)
      .update(JSON.stringify(payload))
      .digest("hex"),
  };
}

function generateLicenseKey() {
  const bytes = crypto.randomBytes(16);
  let token = "";
  for (const byte of bytes) {
    token += LICENSE_ALPHABET[byte & 31];
  }

  return `NAT-${token.slice(0, 4)}-${token.slice(4, 8)}-${token.slice(8, 12)}-${token.slice(12, 16)}`;
}

function serializeLicense(license) {
  return {
    licenseKey: license.license_key,
    sku: license.sku,
    durationDays: license.duration_days,
    activatedAt: license.activated_at,
    expiresAt: license.expires_at,
    activationLimit: Number(license.activation_limit),
    status: computeLicenseStatus(license),
    orderId: license.order_id,
    buyerId: license.buyer_id,
    wechatNote: license.wechat_note,
    orderNote: license.order_note,
    createdAt: license.created_at,
    updatedAt: license.updated_at,
    revokedAt: license.revoked_at,
  };
}

function serializeActivation(activation) {
  return {
    id: activation.id,
    hardwareId: activation.hardware_id,
    firstActivatedAt: activation.first_activated_at,
    lastValidatedAt: activation.last_validated_at,
    releasedAt: activation.released_at,
    createdAt: activation.created_at,
    updatedAt: activation.updated_at,
  };
}

function normalizeSku(value) {
  return `${value || ""}`.trim().toLowerCase();
}

function normalizeLicenseKey(value) {
  return `${value || ""}`.trim().toUpperCase();
}

function cleanText(value) {
  const trimmed = `${value || ""}`.trim();
  return trimmed ? trimmed : null;
}

function normalizeActivationLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.min(100000, Math.floor(parsed)));
}

function resolveDurationDays(value, catalog) {
  if (catalog.durationDays === null || catalog.durationDays === undefined) {
    return null;
  }

  if (catalog.minDurationDays === undefined && catalog.maxDurationDays === undefined) {
    return Number(catalog.durationDays);
  }

  const parsed = Number(value);
  const fallback = Number(catalog.durationDays);
  const min = Number(catalog.minDurationDays ?? fallback);
  const max = Number(catalog.maxDurationDays ?? fallback);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.floor(parsed);
  if (normalized < min || normalized > max) {
    throw new Error(`Duration days for ${catalog.label} must be between ${min} and ${max}`);
  }

  return normalized;
}

function resolveActivationLimit(license, config) {
  const raw = Number(license.activation_limit);
  if (Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }

  return Number(config.activationLimit || 1);
}

function defaultOrderId() {
  return `wx-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

function escapeSqlLike(value) {
  return `${value || ""}`.replace(/[\\%_]/g, "\\$&");
}

function statusToError(status) {
  switch (status) {
    case "revoked":
      return "该许可证已被停用。";
    case "expired":
      return "该许可证已过期，请重新购买或续费。";
    case "activation_limit_hit":
      return "该许可证已达到设备上限。";
    default:
      return "许可证不可用。";
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

module.exports = {
  beginActivationWindow,
  buildEntitlement,
  computeLicenseStatus,
  createLicenseService,
  generateLicenseKey,
  serializeLicense,
  statusToError,
};
