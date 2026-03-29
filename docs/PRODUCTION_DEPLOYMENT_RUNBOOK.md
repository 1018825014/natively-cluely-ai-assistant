# 生产环境部署操作单

这份 runbook 默认按“1 台 Ubuntu 服务器 + Nginx + PM2 + 同域名站点/接口”来写，适合你现在这条中国区首发路线。

## 0. 默认假设

本文默认：

- 服务器系统：Ubuntu 22.04 LTS
- 对外域名：`https://app.example.com`
- 安装包下载也先挂同域名
- 服务目录：`/srv/natively`
- Node 版本：22.x

如果你后面要把下载页拆到 CDN 或单独下载域名，也可以，但第一阶段不必复杂化。

## 1. 先准备服务器

登录服务器后执行：

```bash
sudo apt update
sudo apt install -y nginx unzip curl git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

确认版本：

```bash
node -v
npm -v
pm2 -v
nginx -v
```

## 2. 准备目录

```bash
sudo mkdir -p /srv/natively
sudo chown -R $USER:$USER /srv/natively
cd /srv/natively
```

推荐结构：

- `/srv/natively/app`
  代码目录
- `/srv/natively/app/commerce/data`
  SQLite 数据
- `/srv/natively/downloads`
  安装包目录，可选

## 3. 上传代码

你可以用两种方式：

### 方式 A：直接上传当前仓库

把本地仓库打包后上传到服务器，再解压到 `/srv/natively/app`。

### 方式 B：服务器拉代码

```bash
cd /srv/natively
git clone <你的仓库地址> app
cd app
```

## 4. 安装依赖

```bash
cd /srv/natively/app
npm install
```

如果你的生产机构建机和服务器分离，也可以在本地先构建好再上传。

## 5. 写生产环境变量

在服务器上创建：

```bash
cd /srv/natively/app
cp commerce/.env.example commerce/.env
```

然后编辑 `commerce/.env`。

至少要填：

```env
COMMERCE_SERVER_PORT=8787

LICENSE_SIGNING_SECRET=替换成很长的随机字符串
HOSTED_SESSION_SIGNING_SECRET=替换成另一条很长的随机字符串

AFDIAN_USER_ID=你的爱发电用户ID
AFDIAN_TOKEN=你的爱发电Token
AFDIAN_PLAN_MAP_JSON={"真实plan_id":"cn_1d","真实plan_id":"cn_7d","真实plan_id":"cn_30d","真实plan_id":"cn_365d","真实plan_id":"cn_lifetime"}

NATIVELY_APP_NAME=Natively
NATIVELY_SITE_NAME=Natively China
NATIVELY_TAGLINE=中国区优先、本地化优先的 AI 助手
NATIVELY_WEBSITE_URL=https://app.example.com
NATIVELY_DOWNLOAD_URL=https://app.example.com/downloads
NATIVELY_WINDOWS_DOWNLOAD_URL=https://app.example.com/downloads
NATIVELY_MAC_DOWNLOAD_URL=https://app.example.com/downloads
NATIVELY_PURCHASE_PAGE_URL=https://app.example.com/purchase
NATIVELY_ACTIVATION_HELP_URL=https://app.example.com/activation-help
NATIVELY_PURCHASE_URL=https://afdian.net/a/你的主页
NATIVELY_SUPPORT_EMAIL=你的支持邮箱
NATIVELY_SUPPORT_URL=mailto:你的支持邮箱
NATIVELY_PRIVACY_URL=https://app.example.com/privacy
NATIVELY_REFUND_URL=https://app.example.com/refund
NATIVELY_EULA_URL=https://app.example.com/eula
NATIVELY_LICENSE_API_URL=https://app.example.com
NATIVELY_UPDATE_FEED_URL=https://app.example.com/downloads/latest.json
NATIVELY_HOSTED_GATEWAY_URL=https://app.example.com
NATIVELY_HOSTED_ENABLED=true
NATIVELY_HIDE_BYOK=true

ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS=false
LICENSE_OFFLINE_GRACE_DAYS=5
LICENSE_MAX_ACTIVATIONS=1
HOSTED_SESSION_TTL_SECONDS=21600
HOSTED_STT_TOKEN_TTL_SECONDS=60

PACKY_BASE_URL=https://www.packyapi.com/v1
PACKY_API_KEY=你的Packy主Key
PACKY_TEXT_MODEL=gpt-5.4-mini
PACKY_FAST_MODEL=gpt-5.4-mini
PACKY_VISION_MODEL=gpt-5.4

ALIBABA_DASHSCOPE_API_KEY=你的百炼主Key
ALIBABA_TEMP_KEY_API_URL=https://dashscope.aliyuncs.com/api/v1/tokens
```

注意：

- `ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS` 生产环境必须是 `false`
- `PACKY_API_KEY` 和 `ALIBABA_DASHSCOPE_API_KEY` 只存在于服务端
- 如果你还没准备好 macOS 安装包，`NATIVELY_MAC_DOWNLOAD_URL` 可以先指向下载页

## 6. 启动商业服务

先在服务器上做一次启动测试：

```bash
cd /srv/natively/app
node commerce/server.js
```

如果看到监听端口日志，说明服务端本身没问题。按 `Ctrl+C` 停掉后，再用 PM2 托管：

```bash
cd /srv/natively/app
pm2 start commerce/server.js --name natively-commerce
pm2 save
pm2 startup
```

常用命令：

```bash
pm2 status
pm2 logs natively-commerce
pm2 restart natively-commerce
pm2 stop natively-commerce
```

## 7. 配 Nginx

新建站点配置：

```bash
sudo nano /etc/nginx/sites-available/natively.conf
```

写入：

```nginx
server {
    listen 80;
    server_name app.example.com;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用并重载：

```bash
sudo ln -s /etc/nginx/sites-available/natively.conf /etc/nginx/sites-enabled/natively.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 8. 配 HTTPS

如果你用 Let’s Encrypt：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.example.com
```

完成后确认：

- `https://app.example.com/` 能打开
- `https://app.example.com/healthz` 返回 `ok: true`

## 9. 发布安装包

先在本地构建安装包：

```bash
npm run build:native
npx tsc --noEmit
npx tsc -p electron/tsconfig.json --noEmit
npx vite build --emptyOutDir false
npm run dist
```

把安装包上传到你的下载目录后，更新：

- [commercial.config.json](/E:/qqbroDownload/natively-cluely-ai-assistant/commercial.config.json)
- [commerce-site/downloads/latest.json](/E:/qqbroDownload/natively-cluely-ai-assistant/commerce-site/downloads/latest.json)
- `commerce/.env` 里的下载链接

## 10. 配爱发电

在爱发电后台创建 5 个方案：

- `cn_1d`
- `cn_7d`
- `cn_30d`
- `cn_365d`
- `cn_lifetime`

然后：

1. 记录每个方案的真实 `plan_id`
2. 写入 `AFDIAN_PLAN_MAP_JSON`
3. 将 Webhook 地址配置为：

```text
https://app.example.com/webhooks/afdian
```

## 11. 做第一次联调

依次检查：

```bash
curl https://app.example.com/healthz
curl https://app.example.com/site-config.json
curl https://app.example.com/downloads/latest.json
```

再人工检查页面：

- `https://app.example.com/`
- `https://app.example.com/purchase`
- `https://app.example.com/downloads`
- `https://app.example.com/activation-help`
- `https://app.example.com/privacy`
- `https://app.example.com/refund`
- `https://app.example.com/eula`

## 12. 做第一次真实付费测试

建议你自己先用小金额完整跑一遍：

1. 打开购买页
2. 在爱发电完成一次真实支付
3. 看 PM2 日志里是否收到 Webhook
4. 用订单号和买家 ID 在找回页查出许可证
5. 在桌面端输入许可证激活
6. 测试 Hosted 文本调用
7. 测试截图理解
8. 测试 STT 能否拿到百炼临时密钥

这一步不通过，不要公开开卖。

## 13. 首发后一周重点盯的东西

优先盯这几类问题：

- 爱发电付款后没发码
- 许可证激活失败
- 设备上限误伤
- Hosted 429 / 超时 / 上游故障
- 百炼临时密钥签发失败
- 用户额度异常消耗

建议至少保证你能查看：

- `pm2 logs natively-commerce`
- Nginx 访问日志
- 服务器磁盘占用
- SQLite 数据目录备份

## 14. 最后提醒

在你正式公开开卖前，下面几件事一定不能跳过：

- 法律页还是模板时，不要公开卖
- `support@example.com` 一类占位值没改完时，不要公开卖
- 没做过一笔真实支付闭环测试时，不要公开卖
- Provider 永久 key 不能下发给客户端
