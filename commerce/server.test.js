const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

function startServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['commerce/server.js'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let settled = false;
    const cleanup = () => {
      child.stdout.removeAllListeners();
      child.stderr.removeAllListeners();
      child.removeAllListeners();
    };

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      if (!settled && text.includes('[commerce] Listening on')) {
        settled = true;
        resolve(child);
      }
    });

    child.stderr.on('data', (chunk) => {
      if (!settled) {
        settled = true;
        reject(new Error(chunk.toString()));
      }
    });

    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`commerce server exited early with code ${code}`));
      }
      cleanup();
    });
  });
}

async function stopServer(child) {
  if (!child || child.killed) return;

  await new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.kill();
  });
}

function startHttpServer(handler) {
  return getFreePort().then((port) => new Promise((resolve, reject) => {
    const server = require('node:http').createServer(handler);
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ server, port }));
  }));
}

async function stopHttpServer(server) {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function issueAndActivateLicense(baseUrl, orderId, buyerId, hardwareId = 'hw-hosted-001') {
  const webhookResponse = await fetch(`${baseUrl}/webhooks/afdian`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        type: 'order',
        order: {
          out_trade_no: orderId,
          user_id: buyerId,
          user_private_id: buyerId,
          plan_id: 'plan_30d',
          title: '30 天标准版',
          total_amount: '29.00',
          status: 2,
        },
      },
    }),
  });
  const webhookPayload = await webhookResponse.json();
  const licenseKey = webhookPayload.data.licenseKey;

  const activateResponse = await fetch(`${baseUrl}/licenses/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      license_key: licenseKey,
      hardware_id: hardwareId,
    }),
  });
  const activatePayload = await activateResponse.json();
  assert.equal(activatePayload.success, true);

  return { licenseKey, hardwareId };
}

test('blocks unverified webhook orders by default when no Afdian API credentials are configured', async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'commerce-test-'));
  const port = await getFreePort();
  const server = await startServer({
    COMMERCE_SERVER_PORT: String(port),
    COMMERCE_DATA_DIR: tempDir,
    LICENSE_SIGNING_SECRET: 'test-secret',
    ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS: 'false',
  });

  try {
    const response = await fetch(`http://127.0.0.1:${port}/webhooks/afdian`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          type: 'order',
          order: {
            out_trade_no: 'blocked-order-1',
            user_id: 'buyer-1',
            user_private_id: 'buyer-1',
            plan_id: 'plan_30d',
            title: '30 天标准版',
            total_amount: '29.00',
            status: 2,
          },
        },
      }),
    });

    const payload = await response.json();
    assert.equal(payload.data.processed, false);
    assert.equal(payload.data.reason, 'order-not-verified');
  } finally {
    await stopServer(server);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('issues, activates, queries, and deactivates a license when unverified webhooks are explicitly allowed', async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'commerce-test-'));
  const port = await getFreePort();
  const server = await startServer({
    COMMERCE_SERVER_PORT: String(port),
    COMMERCE_DATA_DIR: tempDir,
    LICENSE_SIGNING_SECRET: 'test-secret',
    ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS: 'true',
  });

  try {
    const orderId = 'order-success-1';
    const buyerId = 'buyer-success-1';
    const webhookResponse = await fetch(`http://127.0.0.1:${port}/webhooks/afdian`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          type: 'order',
          order: {
            out_trade_no: orderId,
            user_id: buyerId,
            user_private_id: buyerId,
            plan_id: 'plan_30d',
            title: '30 天标准版',
            total_amount: '29.00',
            status: 2,
          },
        },
      }),
    });
    const webhookPayload = await webhookResponse.json();

    assert.equal(webhookPayload.data.processed, true);
    assert.match(webhookPayload.data.licenseKey, /^NAT-/);

    const licenseKey = webhookPayload.data.licenseKey;

    const activateResponse = await fetch(`http://127.0.0.1:${port}/licenses/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        license_key: licenseKey,
        hardware_id: 'hw-test-001',
      }),
    });
    const activatePayload = await activateResponse.json();

    assert.equal(activatePayload.success, true);
    assert.equal(activatePayload.status, 'valid');
    assert.equal(activatePayload.license.orderId, orderId);

    const statusResponse = await fetch(`http://127.0.0.1:${port}/licenses/status?license_key=${encodeURIComponent(licenseKey)}&hardware_id=hw-test-001`);
    const statusPayload = await statusResponse.json();

    assert.equal(statusPayload.success, true);
    assert.equal(statusPayload.status, 'valid');
    assert.equal(statusPayload.license.buyerId, buyerId);

    const deactivateResponse = await fetch(`http://127.0.0.1:${port}/licenses/deactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        license_key: licenseKey,
        hardware_id: 'hw-test-001',
      }),
    });
    const deactivatePayload = await deactivateResponse.json();

    assert.equal(deactivatePayload.success, true);
  } finally {
    await stopServer(server);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('creates hosted session and proxies OpenAI-compatible hosted responses', async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'commerce-hosted-test-'));
  const port = await getFreePort();
  const mockPacky = await startHttpServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/v1/responses') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.equal(req.headers.authorization, 'Bearer packy-master-key');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        id: 'resp_test_1',
        object: 'response',
        model: body.model,
        output_text: '托管文本返回成功',
      }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  const server = await startServer({
    COMMERCE_SERVER_PORT: String(port),
    COMMERCE_DATA_DIR: tempDir,
    LICENSE_SIGNING_SECRET: 'test-secret',
    ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS: 'true',
    NATIVELY_HOSTED_ENABLED: 'true',
    NATIVELY_HIDE_BYOK: 'true',
    PACKY_API_KEY: 'packy-master-key',
    PACKY_BASE_URL: `http://127.0.0.1:${mockPacky.port}/v1`,
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const { licenseKey, hardwareId } = await issueAndActivateLicense(baseUrl, 'hosted-order-1', 'hosted-buyer-1');

    const sessionResponse = await fetch(`${baseUrl}/app/session/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        license_key: licenseKey,
        hardware_id: hardwareId,
        app_version: '2.0.6',
        platform: 'win32',
      }),
    });
    const sessionPayload = await sessionResponse.json();

    assert.equal(sessionPayload.success, true);
    assert.equal(typeof sessionPayload.session_token, 'string');
    assert.match(sessionPayload.hosted.openai_compatible.base_url, /\/hosted\/openai\/v1$/);

    const gatewayResponse = await fetch(`${baseUrl}/hosted/openai/v1/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionPayload.session_token}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        input: [{ role: 'user', content: [{ type: 'input_text', text: '你好' }] }],
      }),
    });
    const gatewayPayload = await gatewayResponse.json();

    assert.equal(gatewayPayload.output_text, '托管文本返回成功');

    const usageResponse = await fetch(`${baseUrl}/app/usage`, {
      headers: { Authorization: `Bearer ${sessionPayload.session_token}` },
    });
    const usagePayload = await usageResponse.json();
    assert.equal(usagePayload.success, true);
    assert.equal(usagePayload.usage.llm_requests_used, 1);
  } finally {
    await stopServer(server);
    await stopHttpServer(mockPacky.server);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('issues Alibaba temporary STT token and deducts minute quota', async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'commerce-stt-test-'));
  const port = await getFreePort();
  const mockAlibaba = await startHttpServer(async (req, res) => {
    if (req.method === 'POST' && req.url?.startsWith('/api/v1/tokens')) {
      assert.equal(req.headers.authorization, 'Bearer bailian-master-key');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        token: 'st-temporary-001',
        expires_at: Math.floor(Date.now() / 1000) + 60,
      }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  const server = await startServer({
    COMMERCE_SERVER_PORT: String(port),
    COMMERCE_DATA_DIR: tempDir,
    LICENSE_SIGNING_SECRET: 'test-secret',
    ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS: 'true',
    NATIVELY_HOSTED_ENABLED: 'true',
    PACKY_API_KEY: 'packy-master-key',
    PACKY_BASE_URL: 'http://127.0.0.1:65535/v1',
    ALIBABA_DASHSCOPE_API_KEY: 'bailian-master-key',
    ALIBABA_TEMP_KEY_API_URL: `http://127.0.0.1:${mockAlibaba.port}/api/v1/tokens`,
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const { licenseKey, hardwareId } = await issueAndActivateLicense(baseUrl, 'stt-order-1', 'stt-buyer-1');

    const sessionResponse = await fetch(`${baseUrl}/app/session/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        license_key: licenseKey,
        hardware_id: hardwareId,
      }),
    });
    const sessionPayload = await sessionResponse.json();
    assert.equal(sessionPayload.success, true);

    const sttResponse = await fetch(`${baseUrl}/stt/alibaba/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionPayload.session_token}`,
      },
      body: JSON.stringify({ expire_in_seconds: 60 }),
    });
    const sttPayload = await sttResponse.json();

    assert.equal(sttPayload.success, true);
    assert.equal(sttPayload.token, 'st-temporary-001');
    assert.equal(sttPayload.usage.stt_minutes_used, 1);
  } finally {
    await stopServer(server);
    await stopHttpServer(mockAlibaba.server);
    rmSync(tempDir, { recursive: true, force: true });
  }
});
