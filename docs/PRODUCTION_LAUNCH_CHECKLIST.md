# 生产开卖前检查清单

这份清单用于中国区商业版正式开卖前的最后确认。

## 一、品牌与对外信息

- [ ] [commercial.config.json](/E:/qqbroDownload/natively-cluely-ai-assistant/commercial.config.json) 已替换为你的正式品牌名
- [ ] 官网标题、标语、支持邮箱、购买链接都已替换为真实值
- [ ] 隐私、退款、EULA 页面不再是模板文案
- [ ] 下载页、关于页、帮助页不再指向旧仓库或历史品牌

## 二、支付与订单

- [ ] 爱发电 5 个方案都已创建
- [ ] `AFDIAN_PLAN_MAP_JSON` 与真实 `plan_id` 一一对应
- [ ] 爱发电 Webhook 已指向生产域名
- [ ] `ALLOW_UNVERIFIED_AFDIAN_WEBHOOKS=false`
- [ ] 至少完成过一次真实支付闭环测试

## 三、许可证与设备激活

- [ ] `/licenses/activate` 可正常激活
- [ ] `/licenses/status` 可按订单号与买家 ID 找回许可证
- [ ] `/licenses/deactivate` 可正常释放设备占用
- [ ] 设备上限策略与对外文案一致
- [ ] 到期、停用、设备上限命中时文案可读

## 四、托管模型与额度

- [ ] `PACKY_API_KEY` 已配置到服务端
- [ ] `ALIBABA_DASHSCOPE_API_KEY` 已配置到服务端
- [ ] 文本调用能走 `/gateway/llm/respond`
- [ ] 视觉调用能走 `/gateway/vision/respond`
- [ ] 百炼 STT 临时密钥能通过 `/stt/alibaba/session` 下发
- [ ] 额度耗尽后会硬停并提示续费
- [ ] `cn_lifetime` 的托管服务时长已按你的规则设置

## 五、安全与密钥

- [ ] 客户端不会拿到 Provider 永久 key
- [ ] 敏感凭证只保存在系统安全存储中
- [ ] 仓库中没有硬编码真实 API key
- [ ] 生产环境没有把 `.env` 提交进仓库
- [ ] 服务端签名密钥已替换为随机强密钥

## 六、下载与更新

- [ ] [commerce-site/downloads/latest.json](/E:/qqbroDownload/natively-cluely-ai-assistant/commerce-site/downloads/latest.json) 已更新为当前版本
- [ ] Windows 下载链接可用
- [ ] macOS 下载链接可用或已明确隐藏
- [ ] 应用内更新会打开你的下载页，而不是旧 Release 页

## 七、部署与监控

- [ ] 商业服务已部署到真实域名
- [ ] 官网静态页已部署到真实域名
- [ ] SQLite 数据目录已备份或有迁移方案
- [ ] 服务端日志可查看
- [ ] 至少能看到订单、激活、Hosted 调用、错误日志

## 八、客服与售后

- [ ] 客服邮箱可正常收信
- [ ] 有“买后没收到许可证”的处理流程
- [ ] 有“换机释放激活”的处理流程
- [ ] 有“退款申请”的处理流程
- [ ] 有“额度用尽后怎么处理”的统一回复口径

## 九、建议的首发节奏

建议不要一步到位公开放量。

更稳的顺序：

1. 自己全链路走通一次
2. 让 3 到 10 个真实用户付费内测
3. 修复客服和风控问题
4. 再正式公开开卖
