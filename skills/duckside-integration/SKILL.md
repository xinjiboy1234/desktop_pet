---
name: duckside-integration
description: 接入或使用 Duckside（desktop_pet）Agent 桌宠项目时使用，涵盖 Web 组件、Tauri 桌面、本地 HTTP/WebSocket、任务状态与鸭子表情动作。适用于让 Agent 驱动此项目的宠物，不适用于 ChatGPT Pets 或其他桌宠系统。
---

# Duckside 接入

将用户的 Agent 状态映射到 Duckside 的任务事件或临时表情。项目仓库：https://github.com/xinjiboy1234/desktop_pet 。本 skill 不包含运行时或图集；先定位用户的项目 checkout，避免假设 skill 所在目录就是项目根目录。

## 选择接入方式

- 已有 Web 产品：嵌入 `<agent-pet>`，直接调用 `pet.dispatch()`；不必启动桥接。
- 外部 Agent 驱动现有网页或桌面鸭子：启动本地 bridge，通过 HTTP `/events` 发送事件，由 WebSocket 同步状态。
- 独立透明桌面窗口：使用项目的 Tauri 启动入口，仍由 bridge 接收事件。

按需求读 [references/integration.md](references/integration.md) 的运行、Web、协议或排错部分。选择表情时读 [references/expressions.md](references/expressions.md)，使用协议 action 名，不把资源目录名发给接口。

## 工作方法

1. 查看目标 checkout 的 `package.json`、`README.md`、`src/core/protocol.ts` 和 `src/core/animation-catalog.ts`，确认版本。本文以 11 动作版本为基准；版本不一致时以目标源码为准。
2. 为真实任务分配稳定的 `taskId`。开始发 `task.start`，阶段变化发 `task.update`，成功或失败发 `task.end`；取消发 `task.cancel`。长期任务约每 30 秒续租，不用临时表情模拟整个任务生命周期。
3. 单次展示用 `pet.action`，如 `angry` 或 `speaking`；默认按素材时长到期后恢复任务/idle。`message` 是状态文案，不会生成语音或改变口型。
4. 新事件生成新 `id`；同一事件重试保留原 `id`。同一任务按顺序发送。桥接快照是网络模式的权威状态，避免同时混用本地 dispatch 和远程任务。
5. 用 `/health` 确认桥接服务标识，再用带认证的 `/snapshot` 检查状态。验证成功结束、失败、续租和并发恢复。组件模式检查 `pet-state`、`pet-error` 和图集请求。

## 可复用发送工具

`scripts/pet_event.py` 仅依赖 Python 标准库。先用 `--help` 查看参数；发送事件才会改变桥接状态。默认地址 `http://127.0.0.1:17789`，可用 `--endpoint` 或 `PET_BRIDGE_URL` 覆盖；令牌从 `PET_TOKEN` 读取，不打印令牌。

```powershell
python <skill目录>/scripts/pet_event.py health
python <skill目录>/scripts/pet_event.py task.start --task-id job-1 --action thinking
python <skill目录>/scripts/pet_event.py task.update --task-id job-1 --action working
python <skill目录>/scripts/pet_event.py task.end --task-id job-1 --outcome success
python <skill目录>/scripts/pet_event.py pet.action --action angry
```

桥接不可用时给出明确失败和启动方法，不为了桌宠反馈中断 Agent 的主体任务，不无限重试。`pet.reset` 会清空全部任务，只在用户要求重置时使用。

## 增加表情

沿用现有多页图集协议：新增 `sprite.json` 和 PNG 页、登记 `animations.json`、扩展 protocol 的 `actions`、animation catalog 映射以及 Web/桌面 labels。保持帧数、FPS、页坐标一致；不要预加载所有图集或逐帧 PNG。执行 `npm run build`，再检查新动作解析、到期恢复和构建资源。详见表情参考中的扩展说明。
