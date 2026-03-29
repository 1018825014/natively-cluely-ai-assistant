# 没有 Mac 也能打 Mac 包

这套仓库已经加好了 GitHub Actions 工作流：

- 工作流文件：[`build-macos-lite.yml`](/E:/qqbroDownload/natively-cluely-ai-assistant/.github/workflows/build-macos-lite.yml)

它会在 GitHub 的 macOS runner 上自动打两套包：

- `x64`：Intel Mac
- `arm64`：Apple Silicon / M 系列 Mac

## 你第一次要做什么

1. 把当前代码推到 GitHub 默认分支

```bash
git add .
git commit -m "Add macOS GitHub Actions build"
git push origin main
```

如果你的默认分支不是 `main`，就把上面命令里的 `main` 换成你自己的默认分支。

2. 进入你的 GitHub 仓库页面

仓库地址通常是：

- [你的仓库](https://github.com/1018825014/natively-cluely-ai-assistant)

3. 点顶部的 `Actions`

4. 在左边找到 `Build macOS Lite Package`

5. 点右侧 `Run workflow`

6. 等它跑完

这个工作流是手动触发的，所以你想打 Mac 包时，再点一次就行。

现在这个工作流还会自动做一轮基础烟雾测试：

- 检查 `.zip` 里能不能解出 `.app`
- 检查 `.dmg` 里能不能挂载出 `.app`
- 校验 `.app` 的签名结构和 `Info.plist`

这能帮你排除“包已经坏了、结构不完整、打包产物缺失”这类明显问题。

## 跑完后怎么下载

1. 打开这次 workflow run
2. 往下拉到 `Artifacts`
3. 你会看到两个压缩包：
   - `macos-lite-x64`
   - `macos-lite-arm64`
4. 分别下载

下载后里面会有：

- `.dmg`
- `.zip`

你发给 Mac 用户时：

- Intel Mac 发 `x64`
- M1 / M2 / M3 / M4 Mac 发 `arm64`

## 朋友第一次安装时会发生什么

因为现在还是未签名、未公证的 Mac 包，所以第一次打开时，macOS 大概率会拦一下。

可以让对方这样处理：

### 方法 1：右键打开

1. 把 App 拖到 `Applications`
2. 在 Finder 里右键 App
3. 点 `Open`
4. 再确认一次 `Open`

### 方法 2：如果提示“已损坏”

让对方打开终端运行：

```bash
xattr -cr /Applications/Natively.app
```

如果是对 `.dmg` 本身先处理，也可以：

```bash
xattr -cr ~/Downloads/你的-dmg-文件名.dmg
```

## 你需要知道的限制

- 这次打出来的是未签名 Mac 包
- 可以安装，但第一次打开会有系统提示
- 现在不适合拿去做大规模正式商用分发
- 小范围朋友试用、内测、手动发包是够用的
- GitHub Actions 的烟雾测试不能替代真实 Mac 人工测试，尤其无法完整覆盖屏幕录制、麦克风权限、快捷键、悬浮窗和首次打开体验

## 常见问题

### 1. Actions 里看不到 `Run workflow`

通常是这两个原因：

- 工作流文件还没推到默认分支
- 你没有仓库写权限

GitHub 官方说明：只有包含 `workflow_dispatch` 的工作流，才会出现手动运行按钮。
来源：[Manually running a workflow](https://docs.github.com/en/actions/managing-workflow-runs/manually-running-a-workflow)

### 2. 为什么要分 `x64` 和 `arm64`

因为 GitHub 官方 macOS runner 也分 Intel 和 arm64，两种包分别给不同芯片的 Mac 用户。
来源：[GitHub-hosted runners reference](https://docs.github.com/actions/reference/runners/github-hosted-runners)

### 3. 这会不会收费

如果你的仓库不是完全免费的公共仓库，macOS runner 会消耗 GitHub Actions 分钟数。
这部分规则会随 GitHub 方案变化，建议你直接看仓库的 Actions 用量页面。

### 4. 我以后想做成“点一下自动发 Release”

可以，下一步可以把这套工作流再接到 GitHub Release，跑完自动把 `.dmg` / `.zip` 挂到 Releases 页面。
