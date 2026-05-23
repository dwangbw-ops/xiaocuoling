# 小搓灵

小搓灵是一个 Codex 能力成长桌面宠物 MVP。它不是普通桌面宠物，也不读取 Codex 官方宠物数据；它只根据本机 Codex 使用过程中的真实交付证据成长。

## 它怎么判断成长

小搓灵会严格区分：

- Codex 基础环境：Codex CLI、hooks、skills、plugins、MCP、git、package.json、build/test 脚本等，只代表环境可用。
- Codex 行为事件：SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、Bash、apply_patch、Stop 等，只作为证据来源。
- 项目交付证据：文件变化、成功命令、build/test 成功、git commit、新依赖、失败到成功的修复链。
- Skill 贡献：工具只有帮助完成 delivered / breakthrough session，才算真实贡献。

工具入口不等于能力。打开 Codex 不等于成长。交付成功，才会净化。

## 隐私边界

第一版只保存本地数据，不需要登录，不使用后端，不上传用户数据。

小搓灵不会保存：

- 完整 prompt
- 完整代码
- 完整终端输出
- `.env` 内容
- API key、token、password、secret

本地数据保存在 Electron 的 `userData/xiaocuoling-data` 目录中。Codex hook 事件保存为本地 JSONL 元数据。

## 运行

需要 Node.js 和 npm。

```bash
npm install
npm run dev
```

启动后会打开 Electron 桌面应用，并显示迷你桌面挂件和主面板。

## 验证

```bash
npm test
npx tsc --noEmit
npm run build
```

## 给别人部署 / 预览

这是 Electron 桌面端项目，完整功能需要在本机运行：

```bash
git clone https://github.com/dwangbw-ops/xiaocuoling.git
cd xiaocuoling
npm install
npm run dev
```

仓库里保留了 `vercel.json`，可以部署一个静态面板预览：

```bash
npm run build:renderer
```

注意：Vercel 或普通网页环境没有 Electron 主进程能力，所以文件监听、桌面浮窗、Codex hooks 安装、本地命令执行等桌面功能只能在本地 Electron 应用里使用。

## 主要功能

- 迷你桌面宠物挂件
- 主面板成长状态
- 严格的 session 状态判断
- Codex 基础环境检测
- Codex hooks 元数据捕获
- 本地项目变化与命令结果记录
- Skill 质量和真实使用区分
- 每日晚间报告和每周周末报告
- 本地 JSON 持久化

## Codex hooks

应用可以生成项目级 hooks：

```text
.codex/hooks/xiaocuoling-capture.js
```

hook 只记录 Codex session 元数据、工具调用摘要和本地项目变化证据，不读取 Codex 官方宠物，不复制 Codex 官方视觉，也不依赖私有 UI。
