# 中国区商业化部署说明

这份说明对应当前仓库里的“中国区先卖、托管优先、海外后开”方案。

## 1. 架构概览

当前商业化链路如下：

1. 用户访问官网
2. 用户跳转爱发电完成支付
3. 爱发电 Webhook 通知你的商业服务
4. 商业服务生成许可证并保存订单、激活、用量
5. 用户在桌面端输入许可证完成激活
6. 桌面端换取 Hosted Session
7. 文本/视觉走 PackyAPI 托管网关
8. STT 通过服务端签发百炼临时密钥后直连百炼

代码位置：

- 官网：`commerce-site/`
- 商业服务：`commerce/server.js`
- 桌面端 Hosted Session：`premium/electron/services/HostedSessionManager.ts`
- 本地凭证安全存储：`electron/services/CredentialsManager.ts`

## 2. 先改品牌与对外配置

优先修改 [commercial.config.json](/E:/qqbroDownload/natively-cluely-ai-assistant/commercial.config.json)。

重点字段：

- `appName`
- `siteName`
- `tagline`
- `websiteUrl`
- `downloadUrl`
- `downloadWindowsUrl`
- `downloadMacUrl`
- `purchasePageUrl`
- `activationHelpUrl`
- `purchaseUrl`
- `supportEmail`
- `supportUrl`
- `privacyUrl`
- `refundUrl`
- `eulaUrl`
- `licenseApiBaseUrl`
- `updateFeedUrl`
- `hostedGatewayBaseUrl`
- `hostedEnabled`
- `hideByok`

说明：

- `hostedEnabled` 建议保持 `true`
- `hideByok` 建议保持 `true`
- 上述字段也可以通过环境变量覆盖

## 3. 配置商业服务环境变量

基于 [commerce/.env.example](/E:/qqbroDownload/natively-cluely-ai-assistant/commerce/.env.example) 创建 `commerce/.env`。

必填：

- `LICENSE_SIGNING_SECRET`
- `HOSTED_SESSION_SIGNING_SECRET`
- `AFDIAN_USER_ID`
- `AFDIAN_TOKEN`
- `AFDIAN_PLAN_MAP_JSON`
- `PACKY_API_KEY`
- `PACKY_BASE_URL`
- `ALIBABA_DASHSCOPE_API_KEY`

建议值：

- `ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS=false`
- `LICENSE_OFFLINE_GRACE_DAYS=5`
- `LICENSE_MAX_ACTIVATIONS=1`
- `HOSTED_SESSION_TTL_SECONDS=21600`
- `HOSTED_STT_TOKEN_TTL_SECONDS=60`
- `PACKY_TEXT_MODEL=gpt-5.4-mini`
- `PACKY_FAST_MODEL=gpt-5.4-mini`
- `PACKY_VISION_MODEL=gpt-5.4`

注意：

- `PACKY_API_KEY` 和 `ALIBABA_DASHSCOPE_API_KEY` 只允许存在于服务端环境变量
- 不要把 Provider 永久 key 下发给客户端
- 生产环境必须关闭 `ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS`

## 4. 在爱发电创建 5 个方案

按以下 SKU 创建：

- `cn_1d`
- `cn_7d`
- `cn_30d`
- `cn_365d`
- `cn_lifetime`

建议对外说明统一成：

- 1 个订单 = 1 个许可证
- 默认 1 台设备激活
- 到期后手动续购
- `cn_lifetime` 为永久授权，不代表永久无限托管

创建完成后，把真实 `plan_id -> sku` 填进 `AFDIAN_PLAN_MAP_JSON`。

## 5. 启动商业服务

```bash
npm run commerce:server
```

这个服务会同时提供：

- 站点页：`/`、`/purchase`、`/downloads`、`/activation-help`
- 法律页：`/privacy`、`/refund`、`/eula`
- 许可证接口：`/licenses/activate`、`/licenses/deactivate`、`/licenses/status`
- Webhook：`/webhooks/afdian`
- Hosted 接口：`/app/session/exchange`、`/app/usage`
- 模型网关：`/gateway/llm/respond`、`/gateway/vision/respond`
- STT 临时密钥：`/stt/alibaba/session`
- Hosted OpenAI 兼容入口：`/hosted/openai/v1/responses`

## 6. 构建桌面端

先构建原生模块：

```bash
npm run build:native
```

再构建前端和 Electron：

```bash
npx tsc --noEmit
npx tsc -p electron/tsconfig.json --noEmit
npx vite build --emptyOutDir false
```

最终打包：

```bash
npm run dist
```

## 7. 发布下载页

把安装包上传到你的下载域名，然后更新：

- [commercial.config.json](/E:/qqbroDownload/natively-cluely-ai-assistant/commercial.config.json) 里的下载链接
- [commerce-site/downloads/latest.json](/E:/qqbroDownload/natively-cluely-ai-assistant/commerce-site/downloads/latest.json)

当前策略是：

- 桌面端检测到新版本后，直接打开你自己的下载页
- 第一阶段不依赖 GitHub Release
- 第一阶段不走国际自动更新源

## 8. 托管模式验证

至少验证以下链路：

1. 爱发电支付后，只发 1 个许可证
2. 桌面端能用许可证换到 Hosted Session
3. 用户本机没有上游 API key 时，文本和截图理解仍可使用
4. 开始会议前，客户端能拿到百炼临时密钥
5. 额度耗尽、许可证到期、许可证停用时，服务端会拒绝继续调用
6. `cn_lifetime` 在托管权益到期后不再默认提供无限托管

## 9. 常见上线问题

### 用户买了但没收到许可证

优先检查：

- 爱发电 Webhook 是否成功到达
- `AFDIAN_USER_ID` 和 `AFDIAN_TOKEN` 是否正确
- `AFDIAN_PLAN_MAP_JSON` 是否和真实方案匹配
- `ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS` 是否错误开启

### 客户端激活成功但不能用托管模型

优先检查：

- `PACKY_API_KEY` 是否已注入服务端
- `hostedGatewayBaseUrl` 是否指向真实域名
- 客户端是否已刷新 Hosted Session
- 许可证是否已过期或命中设备上限

### 百炼 STT 无法工作

优先检查：

- `ALIBABA_DASHSCOPE_API_KEY` 是否存在
- 服务端是否能成功访问百炼临时 token 接口
- 客户端是否拿到了临时密钥
- 该许可证的 `stt_minutes` 是否已用尽

## 10. 上线建议

建议分三步走：

1. 本地联调
2. 小范围真实付费内测
3. 再公开开卖

不要在以下情况直接公开放量：

- 法律页还是模板
- 下载链接还是本地地址
- Provider Key 还没有放到服务端环境变量
- 真实支付链路还没跑通过
