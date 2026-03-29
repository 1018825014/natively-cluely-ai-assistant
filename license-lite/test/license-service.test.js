const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { readConfig } = require("../lib/config");
const { openDatabase } = require("../lib/database");
const { createLicenseService } = require("../lib/license-service");
const { createServer } = require("../server");

function createHarness() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "license-lite-test-"));
  const config = readConfig({
    HOST: "127.0.0.1",
    PORT: "0",
    PUBLIC_BASE_URL: "http://127.0.0.1",
    DATA_DIR: tempDir,
    DB_PATH: path.join(tempDir, "licenses.db"),
    LICENSE_SIGNING_SECRET: "test-secret",
    LICENSE_OFFLINE_GRACE_DAYS: "5",
    LICENSE_MAX_ACTIVATIONS: "1",
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "test-admin-pass",
    ADMIN_SESSION_SECRET: "test-admin-session-secret",
  });
  const db = openDatabase(config);
  const service = createLicenseService({ db, config });
  return { tempDir, config, db, service };
}

test("duration license starts on first activation and enforces one active device", () => {
  const { service, db, tempDir } = createHarness();
  try {
    const created = service.createLicense({
      sku: "cn_7d",
      buyerId: "wx_001",
      wechatNote: "Alice",
    });

    assert.equal(created.success, true);
    assert.equal(created.license.activatedAt, null);
    assert.equal(created.license.expiresAt, null);

    const activated = service.activateLicense({
      license_key: created.licenseKey,
      hardware_id: "hw-1",
    });
    assert.equal(activated.success, true);
    assert.equal(activated.status, "valid");
    assert.ok(activated.license.activatedAt);
    assert.ok(activated.license.expiresAt);

    const blocked = service.activateLicense({
      license_key: created.licenseKey,
      hardware_id: "hw-2",
    });
    assert.equal(blocked.success, false);
    assert.equal(blocked.status, "activation_limit_hit");
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("reset activation allows moving a license to a new device", () => {
  const { service, db, tempDir } = createHarness();
  try {
    const created = service.createLicense({ sku: "cn_30d", buyerId: "wx_002" });
    assert.equal(service.activateLicense({
      license_key: created.licenseKey,
      hardware_id: "hw-old",
    }).success, true);

    const reset = service.resetActivation({ licenseKey: created.licenseKey });
    assert.equal(reset.success, true);
    assert.equal(reset.released, 1);

    const moved = service.activateLicense({
      license_key: created.licenseKey,
      hardware_id: "hw-new",
    });
    assert.equal(moved.success, true);
    assert.equal(moved.license.status, "valid");
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("lifetime license does not expire after activation", () => {
  const { service, db, tempDir } = createHarness();
  try {
    const created = service.createLicense({ sku: "cn_lifetime", buyerId: "wx_003" });
    const activated = service.activateLicense({
      license_key: created.licenseKey,
      hardware_id: "hw-life",
    });

    assert.equal(activated.success, true);
    assert.equal(activated.license.expiresAt, null);
    assert.equal(activated.license.status, "valid");
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("renewing a valid timed license extends the same key from the current expiry", () => {
  const { service, db, tempDir } = createHarness();
  try {
    const created = service.createLicense({ sku: "cn_7d", buyerId: "wx_renew_1" });
    const activated = service.activateLicense({
      license_key: created.licenseKey,
      hardware_id: "hw-renew-1",
    });

    const previousExpiresAt = activated.license.expiresAt;
    assert.ok(previousExpiresAt);

    const renewed = service.renewLicense({
      licenseKey: created.licenseKey,
      sku: "cn_30d",
    });

    assert.equal(renewed.license.licenseKey, created.licenseKey);
    assert.equal(renewed.license.sku, "cn_30d");
    assert.ok(renewed.license.expiresAt);
    assert.ok(new Date(renewed.license.expiresAt).getTime() > new Date(previousExpiresAt).getTime());
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("renewing an expired license makes the same key valid again", () => {
  const { service, db, tempDir } = createHarness();
  try {
    const created = service.createLicense({ sku: "cn_1d", buyerId: "wx_renew_2" });
    service.activateLicense({
      license_key: created.licenseKey,
      hardware_id: "hw-renew-2",
    });

    db.prepare("UPDATE licenses SET expires_at = ?, updated_at = ? WHERE license_key = ?")
      .run("2020-01-01T00:00:00.000Z", new Date().toISOString(), created.licenseKey);

    const expiredBeforeRenew = service.getLicenseStatus({
      license_key: created.licenseKey,
      hardware_id: "hw-renew-2",
    });
    assert.equal(expiredBeforeRenew.status, "expired");
    assert.equal(expiredBeforeRenew.isPremium, false);

    const renewed = service.renewLicense({
      licenseKey: created.licenseKey,
      sku: "cn_30d",
    });

    assert.equal(renewed.license.status, "valid");
    assert.equal(renewed.license.sku, "cn_30d");
    assert.ok(renewed.license.expiresAt);
    assert.ok(new Date(renewed.license.expiresAt).getTime() > Date.now());
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("manually expiring a license marks it expired immediately", () => {
  const { service, db, tempDir } = createHarness();
  try {
    const created = service.createLicense({ sku: "cn_7d", buyerId: "wx_expire_now" });
    service.activateLicense({
      license_key: created.licenseKey,
      hardware_id: "hw-expire-now",
    });

    const expired = service.expireLicense({
      licenseKey: created.licenseKey,
      reason: "test_now",
    });

    assert.equal(expired.license.status, "expired");
    assert.ok(expired.license.expiresAt);

    const status = service.getLicenseStatus({
      license_key: created.licenseKey,
      hardware_id: "hw-expire-now",
    });
    assert.equal(status.status, "expired");
    assert.equal(status.isPremium, false);
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("promo trial license supports 1-7 custom days with unlimited active devices", () => {
  const { service, db, tempDir } = createHarness();
  try {
    const created = service.createLicense({
      sku: "cn_1d_promo",
      durationDays: 5,
      buyerId: "promo_001",
    });

    assert.equal(created.license.activationLimit, 0);
    assert.equal(created.license.durationDays, 5);

    const first = service.activateLicense({
      license_key: created.licenseKey,
      hardware_id: "promo-hw-1",
    });
    const second = service.activateLicense({
      license_key: created.licenseKey,
      hardware_id: "promo-hw-2",
    });
    const third = service.activateLicense({
      license_key: created.licenseKey,
      hardware_id: "promo-hw-3",
    });

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(third.success, true);

    const detail = service.getLicenseDetail(created.licenseKey);
    assert.equal(detail.license.activationLimit, 0);
    assert.equal(detail.license.durationDays, 5);
    assert.equal(detail.activations.filter((item) => !item.releasedAt).length, 3);
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("promo trial rejects durations longer than seven days", () => {
  const { service, db, tempDir } = createHarness();
  try {
    assert.throws(
      () => service.createLicense({ sku: "cn_1d_promo", durationDays: 8, buyerId: "promo_002" }),
      /between 1 and 7/,
    );
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("http server exposes healthz and compatible status payloads", async () => {
  const { service, db, tempDir } = createHarness();
  const server = createServer({ service, config: { host: "127.0.0.1", port: 0, publicBaseUrl: "http://127.0.0.1" } });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const healthResponse = await fetch(`${baseUrl}/healthz`);
    assert.equal(healthResponse.status, 200);
    const healthPayload = await healthResponse.json();
    assert.equal(healthPayload.ok, true);

    const statusResponse = await fetch(`${baseUrl}/licenses/status?license_key=TEST&hardware_id=TEST`);
    assert.equal(statusResponse.status, 200);
    const statusPayload = await statusResponse.json();
    assert.equal(statusPayload.success, false);
    assert.equal(statusPayload.status, "invalid_license");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin api requires login before listing licenses", async () => {
  const { service, db, tempDir } = createHarness();
  const server = createServer({ service, config: readConfig({
    HOST: "127.0.0.1",
    PORT: "0",
    PUBLIC_BASE_URL: "http://127.0.0.1",
    DATA_DIR: tempDir,
    DB_PATH: path.join(tempDir, "licenses.db"),
    LICENSE_SIGNING_SECRET: "test-secret",
    LICENSE_OFFLINE_GRACE_DAYS: "5",
    LICENSE_MAX_ACTIVATIONS: "1",
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "test-admin-pass",
    ADMIN_SESSION_SECRET: "test-admin-session-secret",
  }) });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${baseUrl}/admin/api/licenses`);
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.success, false);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin web api can create and inspect a custom promo trial license", async () => {
  const { service, config, db, tempDir } = createHarness();
  const server = createServer({ service, config });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const loginResponse = await fetch(`${baseUrl}/admin/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "admin",
        password: "test-admin-pass",
      }),
    });
    assert.equal(loginResponse.status, 200);
    const cookieHeader = getCookieHeader(loginResponse);
    assert.ok(cookieHeader);

    const createResponse = await fetch(`${baseUrl}/admin/api/licenses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        sku: "cn_1d_promo",
        durationDays: 5,
        buyerId: "trial_user_001",
        wechatNote: "推广试用",
      }),
    });
    assert.equal(createResponse.status, 200);
    const created = await createResponse.json();
    assert.equal(created.success, true);
    assert.equal(created.license.durationDays, 5);
    assert.equal(created.license.activationLimit, 0);
    assert.ok(created.licenseKey);

    const detailResponse = await fetch(`${baseUrl}/admin/api/licenses/${created.licenseKey}`, {
      headers: {
        Cookie: cookieHeader,
      },
    });
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json();
    assert.equal(detail.success, true);
    assert.equal(detail.license.durationDays, 5);

    const htmlResponse = await fetch(`${baseUrl}/admin/`);
    assert.equal(htmlResponse.status, 200);
    const html = await htmlResponse.text();
    assert.match(html, /随时随地发码的授权后台/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin web api can search licenses by buyer and license key", async () => {
  const { service, config, db, tempDir } = createHarness();
  const first = service.createLicense({
    sku: "cn_30d",
    buyerId: "search_target_buyer",
    wechatNote: "vip customer",
  });
  service.createLicense({
    sku: "cn_7d",
    buyerId: "another_buyer",
    wechatNote: "other note",
  });

  const server = createServer({ service, config });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const loginResponse = await fetch(`${baseUrl}/admin/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "admin",
        password: "test-admin-pass",
      }),
    });
    const cookieHeader = getCookieHeader(loginResponse);
    assert.ok(cookieHeader);

    const buyerSearchResponse = await fetch(`${baseUrl}/admin/api/licenses?limit=20&q=search_target`, {
      headers: {
        Cookie: cookieHeader,
      },
    });
    assert.equal(buyerSearchResponse.status, 200);
    const buyerSearch = await buyerSearchResponse.json();
    assert.equal(buyerSearch.success, true);
    assert.equal(buyerSearch.licenses.length, 1);
    assert.equal(buyerSearch.licenses[0].buyerId, "search_target_buyer");

    const keyFragment = first.licenseKey.split("-")[1];
    const keySearchResponse = await fetch(`${baseUrl}/admin/api/licenses?limit=20&q=${encodeURIComponent(keyFragment)}`, {
      headers: {
        Cookie: cookieHeader,
      },
    });
    assert.equal(keySearchResponse.status, 200);
    const keySearch = await keySearchResponse.json();
    assert.equal(keySearch.success, true);
    assert.equal(keySearch.licenses.length, 1);
    assert.equal(keySearch.licenses[0].licenseKey, first.licenseKey);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin web api can expire a license immediately for stop-use testing", async () => {
  const { service, config, db, tempDir } = createHarness();
  const created = service.createLicense({
    sku: "cn_7d",
    buyerId: "expire_via_admin",
  });
  service.activateLicense({
    license_key: created.licenseKey,
    hardware_id: "hw-expire-admin",
  });

  const server = createServer({ service, config });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const loginResponse = await fetch(`${baseUrl}/admin/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "admin",
        password: "test-admin-pass",
      }),
    });
    const cookieHeader = getCookieHeader(loginResponse);
    assert.ok(cookieHeader);

    const expireResponse = await fetch(`${baseUrl}/admin/api/licenses/${created.licenseKey}/expire`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        reason: "test_expire",
      }),
    });
    assert.equal(expireResponse.status, 200);
    const expired = await expireResponse.json();
    assert.equal(expired.success, true);
    assert.equal(expired.license.status, "expired");

    const statusResponse = await fetch(`${baseUrl}/licenses/status?license_key=${created.licenseKey}&hardware_id=hw-expire-admin`);
    assert.equal(statusResponse.status, 200);
    const status = await statusResponse.json();
    assert.equal(status.status, "expired");
    assert.equal(status.isPremium, false);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function getCookieHeader(response) {
  if (typeof response.headers.getSetCookie === "function") {
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) {
      return cookies[0].split(";")[0];
    }
  }

  const raw = response.headers.get("set-cookie");
  return raw ? raw.split(";")[0] : "";
}
