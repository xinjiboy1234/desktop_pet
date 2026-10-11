# Agent 桌面宠物设计

## 目标与选择
独立、可嵌入的宠物组件，复用现有七组 RGBA 图集。推荐 TypeScript / Canvas / Custom Element + Node 本地桥接 + Tauri 2。Electron 易交付但携带 Chromium，纯浏览器无法提供桌面透明置顶窗口。Tauri 使用系统 WebView。当前机器没有 Rust 工具链，需安装后验证桌面构建，不能以 Web 构建替代桌面验证。

## 边界
- `src/core`：类型、协议验证、任务调度。无 DOM、无框架依赖。
- `src/component`：Canvas 图集播放器、Web Component、可重连 WebSocket 客户端。
- `bridge`：Node HTTP / WebSocket，默认 127.0.0.1:17789，接收 Agent 事件并保存有界任务快照；不轮询。
- `src/demo`：中文控制台，动作预览、并发任务演示、连接状态、缓存诊断。
- `src-tauri`：透明、无边框、置顶、可拖动窗口。桥接单独启动，可被多个 Web/桌面实例共用。

## 事件与衔接
协议 v1，事件包含 id、type、taskId、action、priority、message、ttlMs 等可选字段。
task.start / task.update / task.end / task.cancel；pet.action 表示限时或一次性表演；pet.reset 清空状态。
短任务延迟 180ms 进入忙碌，完成后轻量反馈。活动任务默认 thinking，可 update 到 working / waiting。并发按 priority，再按更新顺序仲裁。普通状态切换最短展示 350ms，最长延迟 250ms；error/cancel 立即抢占。长操作持续循环，默认任务租约 120 秒，可 update 续租，过期清理。完成反馈约 1200ms，之后恢复剩余任务或 idle，不必等 5–8 秒原动画播完。
idle=normal_duck；thinking=thinking_duck；working=work_duck；waiting=box_duck；success=cool_duck2；error=tired_duck；celebrating=music_duck。资源缺少专门转场，采用 120ms 淡入，保留上一帧直到下一动作首帧准备完成，不声称原资源无缝。
限制事件去重集合、任务数量、消息长度、TTL、输入体积。断线重连指数退避，重连以快照恢复；本地任务同样会过期。

## 性能
Canvas 不驱动框架逐帧更新。24 FPS 活动、idle 8 FPS；降低模式 12 FPS。setTimeout 按帧调度，隐藏 / 离屏时停止绘制，逻辑时间保持真实时间。设备像素比上限 2，默认 240 CSS px。
图集按页加载，最多 3 页解码缓存（1920²×4×3≈42.2 MiB，额外不包括 WebView/Canvas/临时解码），只预取下一页。播放器销毁释放计时器、监听器、连接和缓存。禁止加载 frames/ 冗余单帧；发布仅包含 PNG 图集、poster 和 JSON。提供缓存统计，实际 CPU/进程内存须在目标设备测量，不承诺未经测量的数值。

## 通信与安全
HTTP POST /events 与 WebSocket /ws 使用同一事件校验，GET /health 与 /snapshot。HTTP 可用 Bearer token；WebSocket token 通过 query。默认仅允许本地开发及 Tauri origin，额外 origin 用环境变量白名单，不任意 CORS。绑定环回地址；远程访问需用户显式配置。HTTPS 站点集成可能受到浏览器 mixed-content / Local Network Access 限制，支持配置 wss 网关或直接组件 API。

## 验证与交付
遵照用户要求不创建、不运行单元测试。执行 TypeScript 检查、Web/组件生产构建、HTTP/WebSocket 实际通信、浏览器演示、桌面编译及运行检查（环境允许时）。提供 README 接入示例、生命周期说明、性能预算和限制。提交到用户指定空 Git 仓库；不覆盖参考目录。
