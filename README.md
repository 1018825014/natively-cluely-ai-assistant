# Natively 中国区商业版

这个仓库当前面向“中国区先卖、托管优先、海外后开”的桌面软件商业化方案。

它包含三条已经接上的主链路：

- 官网与下载页：承接品牌、购买、下载、找回许可证
- 授权与订单服务：爱发电订单入库、发码、激活、停用、状态查询
- 托管模型后端：PackyAPI 文本/视觉托管，阿里云百炼 STT 临时密钥签发

当前默认产品规则：

- 首发只做中国区个人版
- 支付统一跳转爱发电
- SKU 固定为 `cn_1d`、`cn_7d`、`cn_30d`、`cn_365d`、`cn_lifetime`
- 托管模式默认开启，BYOK 作为隐藏高级入口保留
- `cn_lifetime` 默认解释为“永久授权 + 首年托管服务”，不是永久无限托管

## 当前状态

仓库已经具备以下能力：

- 官网静态页：`/`、`/purchase`、`/downloads`、`/activation-help`
- 许可证接口：`/licenses/activate`、`/licenses/deactivate`、`/licenses/status`
- 爱发电 Webhook：`/webhooks/afdian`
- 托管会话接口：`/app/session/exchange`、`/app/usage`
- 托管模型网关：`/gateway/llm/respond`、`/gateway/vision/respond`
- Hosted OpenAI 兼容入口：`/hosted/openai/v1/responses`
- 百炼 STT 临时密钥接口：`/stt/alibaba/session`
- 桌面端 Hosted Session、百炼临时 token 续签与隐藏 BYOK UI

## 目录说明

- `commerce-site/`
  中国区官网、购买页、下载页、找回许可证页、隐私/退款/EULA 模板
- `commerce/server.js`
  商业服务主入口，负责订单、许可证、托管会话、用量、PackyAPI 网关、百炼临时密钥
- `premium/electron/services/HostedSessionManager.ts`
  桌面端托管会话管理、Hosted LLM 接入、百炼 STT 临时密钥管理
- `electron/services/CredentialsManager.ts`
  本地凭证管理。敏感字段只允许进系统安全存储，不再明文回退
- `commercial.config.json`
  对外品牌、下载、购买、帮助和 Hosted 开关的默认配置
- `docs/COMMERCIAL_CHINA_SETUP.md`
  中国区商业化部署说明
- `docs/PRODUCTION_LAUNCH_CHECKLIST.md`
  开卖前检查清单

## 本地启动

1. 准备商业服务环境变量。

参考 [commerce/.env.example](/E:/qqbroDownload/natively-cluely-ai-assistant/commerce/.env.example) 创建 `commerce/.env`。

2. 启动商业服务。

```bash
npm run commerce:server
```

3. 启动前端或桌面端开发环境。

```bash
npm run dev
```

或：

```bash
npm run electron:dev
```

## 关键配置

必须替换的真实值：

- 爱发电主页与方案映射
- `PACKY_API_KEY`
- `ALIBABA_DASHSCOPE_API_KEY`
- `LICENSE_SIGNING_SECRET`
- `HOSTED_SESSION_SIGNING_SECRET`
- 下载域名、支持邮箱、隐私/退款/EULA 链接

默认建议：

- `NATIVELY_HOSTED_ENABLED=true`
- `NATIVELY_HIDE_BYOK=true`
- `ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS=false`
- `LICENSE_MAX_ACTIVATIONS=1`
- `HOSTED_SESSION_TTL_SECONDS=21600`
- `HOSTED_STT_TOKEN_TTL_SECONDS=60`

## 验证命令

```bash
npm run test:commerce
npx tsc --noEmit
npx tsc -p electron/tsconfig.json --noEmit
npx vite build --emptyOutDir false
npm run build:native
```

## 开卖前一定要确认

- 官网文案、购买页、隐私、退款、EULA 已替换为你的主体信息
- 下载链接和更新链接都已指向你自己的域名
- 服务端环境变量已经注入真实 Provider Key，客户端不保存上游永久 key
- 爱发电 5 个 SKU 已创建，`plan_id -> sku` 映射正确
- 至少做过一次真实闭环测试：
  支付 -> 发码 -> 激活 -> Hosted 文本调用 -> 百炼 STT -> 额度扣减 -> 到期提示

## 相关文档

- [中国区商业化部署说明](/E:/qqbroDownload/natively-cluely-ai-assistant/docs/COMMERCIAL_CHINA_SETUP.md)
- [生产环境部署操作单](/E:/qqbroDownload/natively-cluely-ai-assistant/docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md)
- [生产开卖前检查清单](/E:/qqbroDownload/natively-cluely-ai-assistant/docs/PRODUCTION_LAUNCH_CHECKLIST.md)
- [商业配置文件](/E:/qqbroDownload/natively-cluely-ai-assistant/commercial.config.json)

## 说明

当前仓库里仍可能存在一些历史开发文件或与旧路线相关的实现，但面向中国区商业交付的主线已经切到：

- 自建官网
- 爱发电支付
- 自建许可证服务
- 自建托管网关
- Hosted 优先，隐藏 BYOK 兜底

如果你要继续推进正式上线，下一步优先级建议是：

1. 替换全部占位域名、邮箱和法律文本
2. 部署 `commerce/server.js` 和 `commerce-site/`
3. 完成一次真实支付到激活的全链路验证
4. 再做小范围真实付费内测
