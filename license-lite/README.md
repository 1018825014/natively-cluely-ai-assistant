# Natively License Lite

`license-lite/` is an independent, minimal license service for early paid testing.

It does not touch the existing `commerce/` flow and provides:

- `POST /licenses/activate`
- `POST /licenses/deactivate`
- `GET /licenses/status`
- `GET /healthz`
- `GET /admin/`
- `POST /admin/api/login`
- `GET /admin/api/licenses`

It is designed for:

- WeChat manual payment
- Manual license issuance
- One-device activation limit by default
- Customer-managed PackyAPI / Alibaba Cloud API keys
- Phone-friendly web-based license operations

## Quick Start

1. Install dependencies:

```bash
cd license-lite
npm install
```

2. Copy env template:

```bash
cp .env.example .env
```

3. Set at least:

```env
HOST=127.0.0.1
PORT=8787
PUBLIC_BASE_URL=http://101.43.20.2
DATA_DIR=/srv/natively/data
LICENSE_SIGNING_SECRET=replace-with-a-long-random-secret
LICENSE_OFFLINE_GRACE_DAYS=5
LICENSE_MAX_ACTIVATIONS=1
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-a-strong-admin-password
ADMIN_SESSION_SECRET=replace-with-a-long-random-admin-session-secret
ADMIN_SESSION_HOURS=168
```

4. Start the service:

```bash
npm start
```

5. Health check:

```bash
curl http://127.0.0.1:8787/healthz
```

6. Open the admin web app:

```text
http://127.0.0.1:8787/admin/
```

## Admin Web UI

The built-in admin page supports:

- Creating license codes
- Issuing `cn_1d_promo` with a custom `1-7` day duration and unlimited devices
- Renewing the same license key
- Resetting device activations
- Revoking a license
- Listing recent licenses
- Viewing detail, activation history, and event history

This admin page is mobile-friendly, so after deployment you can manage licenses from your phone browser.

## Admin CLI

Create a license:

```bash
node admin-cli.js create-license --sku cn_30d --buyer wx_001 --wechat-note "paid customer"
node admin-cli.js create-license --sku cn_1d_promo --duration-days 5 --buyer wx_trial_001 --wechat-note "promo trial"
```

Reset an activation:

```bash
node admin-cli.js reset-activation --license NAT-XXXX-XXXX-XXXX-XXXX
```

Revoke a license:

```bash
node admin-cli.js revoke-license --license NAT-XXXX-XXXX-XXXX-XXXX --reason refund
```

Renew the same license key:

```bash
node admin-cli.js renew-license --license NAT-XXXX-XXXX-XXXX-XXXX --sku cn_30d
node admin-cli.js renew-license --license NAT-XXXX-XXXX-XXXX-XXXX --sku cn_1d_promo --duration-days 7
```

Show one license:

```bash
node admin-cli.js show-license --license NAT-XXXX-XXXX-XXXX-XXXX
```

List recent licenses:

```bash
node admin-cli.js list-licenses --limit 20
```

## License Rules

- `cn_1d`, `cn_7d`, `cn_30d`, `cn_365d` start counting from first activation.
- `cn_1d_promo` supports a custom duration between `1` and `7` days and allows unlimited active devices.
- `cn_lifetime` never expires.
- `LICENSE_MAX_ACTIVATIONS=1` means one active device at a time for normal SKUs.
- Releasing the old device or running `reset-activation` allows migration to a new device.
- Renewing the same license key extends from the current expiry time if still valid, or from now if already expired.

## Tencent Cloud Deployment

Use the helper scripts in [deploy/](./deploy/):

- [setup-opencloudos9.sh](./deploy/setup-opencloudos9.sh)
- [configure-nginx.sh](./deploy/configure-nginx.sh)

The full guided checklist is in [docs/LICENSE_LITE_TENCENT_CLOUD.md](../docs/LICENSE_LITE_TENCENT_CLOUD.md).

When you deploy with [scripts/deploy-license-lite.py](../scripts/deploy-license-lite.py), it prints:

- `ADMIN_URL`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

You can then open that URL from your phone or any other device with internet access and manage licenses from the web UI.
