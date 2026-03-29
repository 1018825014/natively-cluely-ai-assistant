# 腾讯云轻量服务器部署 License Lite

这份文档对应仓库里的 [license-lite](/E:/qqbroDownload/natively-cluely-ai-assistant/license-lite/README.md)。

目标：

- 不动现有 `commerce/` 主线
- 先用 `101.43.20.2` 跑通授权服务
- 支持桌面端授权校验
- 支持公网后台管理页，手机和电脑都能登录发码

## 1. 本地打包服务端

在项目根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-license-lite.ps1
```

生成文件：

- [tmp/license-lite.tar.gz](/E:/qqbroDownload/natively-cluely-ai-assistant/tmp/license-lite.tar.gz)

## 2. 部署到腾讯云

在项目根目录执行：

```powershell
python .\scripts\deploy-license-lite.py --host 101.43.20.2 --username root
```

脚本会做这些事：

- 上传 `license-lite.tar.gz`
- 更新服务器 `/srv/natively/app/license-lite`
- 安装依赖
- 写入 `.env`
- 启动或重启 `pm2`
- 配置 `nginx`
- 检查 `healthz`

脚本第一次部署时会自动生成后台密码；以后再次部署会默认保留原来的后台密码，不会乱变。

部署完成后，脚本会打印：

- `DEPLOYED_ENV`
- `ADMIN_URL`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

## 3. 后台登录地址

部署成功后，直接打开：

```text
http://101.43.20.2/admin/
```

你可以在：

- 手机浏览器
- 平板浏览器
- 任意联网电脑浏览器

上登录后台。

## 4. 后台可做的事

后台页面目前支持：

- 创建授权码
- 创建推广试用码 `cn_1d_promo`
- 推广试用码自选 `1-7` 天
- 推广试用码不限设备
- 查看最近授权码
- 查看单个授权详情
- 查看激活记录和事件记录
- 续费旧授权码
- 换机重置
- 停用授权

## 5. 常用命令

如果你仍然想走命令行，也可以：

```bash
cd /srv/natively/app/license-lite
node admin-cli.js create-license --sku cn_30d --buyer wx_001 --wechat-note "paid customer"
node admin-cli.js create-license --sku cn_1d_promo --duration-days 5 --buyer wx_trial_001 --wechat-note "promo trial"
node admin-cli.js renew-license --license NAT-XXXX-XXXX-XXXX-XXXX --sku cn_30d
node admin-cli.js renew-license --license NAT-XXXX-XXXX-XXXX-XXXX --sku cn_1d_promo --duration-days 7
node admin-cli.js reset-activation --license NAT-XXXX-XXXX-XXXX-XXXX
node admin-cli.js revoke-license --license NAT-XXXX-XXXX-XXXX-XXXX --reason refund
node admin-cli.js show-license --license NAT-XXXX-XXXX-XXXX-XXXX
node admin-cli.js list-licenses --limit 20
```

## 6. 桌面端打包

打包轻量售卖版：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-license-lite.ps1
```

这会把桌面端构建成：

- 强制授权
- 不走 Hosted 模式
- 显示 BYOK 设置
- 授权地址指向你的云服务器

## 7. 注意事项

- 你现在还在用 `http://101.43.20.2`，所以后台登录密码和操作请求不是 HTTPS 加密。
- 这在你当前“小范围内测 / 试卖”阶段可以先用，但等域名备案完成后，建议尽快切到 HTTPS。
- 如果后面上正式售卖，推荐再加：
  - HTTPS
  - 服务器防火墙收口
  - 后台密码定期更换
  - 独立域名，比如 `admin.xxx.com`
