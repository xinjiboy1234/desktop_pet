# Duckside · Agent 桌面宠物

一个可嵌入 Agent 产品的透明鸭子组件。Web 和 Tauri 桌面共用 TypeScript 调度器与 Canvas 播放器，通过本机 HTTP / WebSocket 切换动作。复用 `desktop_pet_resources/` 中的 7 组动画，参考原项目的图集坐标协议。

## 快速运行

需要 Node.js 22+。

```bash
npm ci
npm start
```

打开 `http://127.0.0.1:5173`，点击「连接桥接」。页面提供独立动作预览、100ms 短任务、8 秒长任务和并发任务演示；连接后演示通过真实 HTTP 事件驱动。

也可分别运行：

```bash
npm run bridge    # 127.0.0.1:17789
npm run dev       # 127.0.0.1:5173
```

### 桌面

安装 [Tauri 2 前置依赖](https://v2.tauri.app/start/prerequisites/)：Rust stable、Windows C++ 开发工具及 WebView2；macOS/Linux 需各自的系统依赖。

```bash
npm run desktop          # 启动/复用桥接，编译透明置顶窗口
npm run desktop:build    # 构建可执行文件，不生成安装包
```

Windows 输出 `src-tauri/target/release/duckside.exe`。可执行文件内嵌图集，可直接运行；本地桥接另用 `npm run bridge` 启动，也可由 Agent 产品集成运行。拖动鸭子移动窗口，悬停或键盘聚焦显示省电/关闭按钮。保留任务栏入口，便于找回窗口。默认不做鼠标穿透。

启动脚本在 Windows 使用 `vswhere` 选择 C++ 环境；若项目内 `.tools/cargo` 存在则使用它，否则使用系统 Rust。不会修改全局 PATH。可复用已运行的本项目 Vite 和桥接；桥接令牌不同会提示错误。Windows 默认禁用 WebView GPU 加速以降低常驻开销，小画布由软件绘制；可按部署机器情况调整 `additionalBrowserArgs`。

桌面程序从环境变量读取 `PET_PORT`、`PET_TOKEN`、可选 `PET_ENDPOINT`。默认 CSP 允许环回地址的任意端口；自定义非环回 / wss 地址时需同步修改 `src-tauri/tauri.conf.json` 中 `connect-src`。macOS 透明窗口还需要 Tauri 的 `macOSPrivateApi` 配置/feature，当前交付实际验证的平台为 Windows，其他平台需单独验证。

## Agent 接入

```bash
curl -X POST http://127.0.0.1:17789/events \
  -H 'Content-Type: application/json' \
  -d '{"version":1,"id":"evt-1","type":"task.start","taskId":"research","action":"thinking","message":"正在查找资料"}'

curl -X POST http://127.0.0.1:17789/events \
  -H 'Content-Type: application/json' \
  -d '{"version":1,"id":"evt-2","type":"task.update","taskId":"research","action":"working"}'

curl -X POST http://127.0.0.1:17789/events \
  -H 'Content-Type: application/json' \
  -d '{"version":1,"id":"evt-3","type":"task.end","taskId":"research","outcome":"success","message":"资料整理完成"}'
```

以上为 Bash 格式；Windows PowerShell 可用 `Invoke-RestMethod -Method Post -ContentType application/json -Body '<JSON>' -Uri http://127.0.0.1:17789/events`。

Python（只用标准库）：

```python
import json, uuid, urllib.request

def pet_event(event_type, task_id, **fields):
    body = {"version": 1, "id": str(uuid.uuid4()), "type": event_type,
            "taskId": task_id, **fields}
    request = urllib.request.Request(
        "http://127.0.0.1:17789/events",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=3) as response:
        return json.load(response)

pet_event("task.start", "job-1", action="thinking")
try:
    # Agent 工作；长任务定期发 task.update 续租
    pet_event("task.update", "job-1", action="working")
    pet_event("task.end", "job-1", outcome="success")
except Exception:
    pet_event("task.end", "job-1", outcome="error")
    raise
```

### 协议 v1

每个事件必填 `version:1`、唯一 `id`、`type`。任务事件必填 `taskId`。不同任务使用不同 ID，并按任务生命周期顺序发送；不提供跨 HTTP 请求的乱序重排。重试同一事件保持原事件 `id`，去重最多保留最近 512 个 ID。

| type | 用途 | 字段 |
|---|---|---|
| `task.start` | 创建任务 | `action` 默认 thinking、`priority` 默认 0、`ttlMs` 默认 120000 |
| `task.update` | 更新动作并续租；未知任务会创建 | 可选 action / priority / message / ttlMs |
| `task.end` | 结束任务并播放反馈 | outcome: success / error；默认使用对应素材时长，可指定 ttlMs |
| `task.cancel` | 移除任务并立即显示 error 反馈 | 默认 error 素材时长；可选 message / ttlMs |
| `pet.action` | 临时表演，结束恢复任务或 idle | 必填 action，默认使用对应素材时长，可指定 ttlMs |
| `pet.reset` | 清空任务和反馈 | 无 |

`action`：idle / thinking / working / waiting / success / error / celebrating。

| 动作 | 资源 |
|---|---|
| idle | normal_duck |
| thinking | thinking_duck |
| working | work_duck |
| waiting | box_duck |
| success | cool_duck2 |
| error | tired_duck |
| celebrating | music_duck |

任务最多 128 个，priority 在 -1000～1000，ttlMs 在 1～600000，message 最多 1000 字符，事件 JSON 最多约 8 KiB（HTTP 体积硬上限 16 KiB）。超过限制返回错误。

调度规则：

- 短任务等待 180ms 才进入忙碌，不会为了展示完整 5–8 秒动画拖延任务完成。
- 长任务循环当前动作；每次 update 续租，默认超过 120 秒没续租即清理。建议每 30 秒发送一次 update。
- 并发按优先级、最近更新时间仲裁。任务结束反馈默认采用对应资源时长，然后恢复剩余任务；需要短反馈时可显式指定 `ttlMs:1200`。
- `pet.action` 和结束/取消反馈的默认时长来自 `animations.json`：thinking / success 为 8 秒，其他动作为 124÷24≈5.167 秒。显式 ttlMs 仍可覆盖。演示按钮展示素材时长，重复点击同一动作从首帧重新播放。
- 反馈计时从事件接收开始，重连不延长到期时间；冷加载和最短展示等待可能占用部分可见播放时间。任务状态动作以任务生命周期为准，持续循环，不在一个素材周期后自动结束。
- 普通动作至少展示 350ms。error / cancel 立即抢占；活动 error 任务优先于普通反馈和高优先级任务。
- 新动画首帧准备好前保留旧画面，就绪后完整替换，不混合透明角色的不同姿势，避免叠影和闪烁。原素材首尾存在差异，不能保证循环天然无缝。
- 重连收到带绝对 `expiresAt` 的快照，不续租、不复活已过期任务。桥接重启会清空内存状态，Agent 应重发当前活跃任务。

`GET /health` 返回服务状态；`GET /snapshot` 返回任务快照；`WS /ws` 连接后收到 `{type:"snapshot",snapshot:...}`，后续接受事件也发送快照。WS 可直接发送同样的事件 JSON，收到 ack 或 error。最多 64 个连接，每个来源最多 100 次请求/秒；慢消费者断开，客户端指数退避重连（约 0.5～30 秒）。

## 嵌入 Web 产品

```bash
npm run build:lib
npm pack    # 本地生成组件包；尚未发布 npm
```

将图集目录复制到产品的静态资源目录（不需要 `frames/`），然后：

仓库推送后也可使用 `npm install github:xinjiboy1234/desktop_pet`，prepare 脚本会生成 ESM 与类型声明。Git 来源安装需要可用的 Node/npm 和构建依赖。

```ts
import { registerAgentPet, type AgentPetElement } from '@xinjiboy/agent-pet';
registerAgentPet();

const pet = document.createElement('agent-pet') as AgentPetElement;
pet.setAttribute('asset-base', '/pets/video_sprites/');
pet.setAttribute('size', '240');
document.querySelector('#companion')!.append(pet);

// 本地通信是可选的；纯 Web 集成也能直接驱动。
pet.connect('ws://127.0.0.1:17789/ws');
pet.dispatch({version: 1, id: crypto.randomUUID(), type: 'pet.action',
              action: 'celebrating', ttlMs: 1600});

pet.addEventListener('pet-state', e => console.log((e as CustomEvent).detail));
pet.addEventListener('pet-connection', e => console.log((e as CustomEvent).detail.state));
pet.addEventListener('pet-error', e => console.warn((e as CustomEvent).detail.message));
console.log(pet.diagnostics);
// 移除节点会释放播放器、网络和定时器；重新挂载按原到期时间恢复。
pet.remove();
```

也支持声明式：

```html
<agent-pet asset-base="/pets/video_sprites/" size="240"
           endpoint="ws://127.0.0.1:17789/ws" low-power></agent-pet>
```

调用 `registerAgentPet()` 后可在任意框架模板中使用此标签。React 可用 ref 操作组件；Vue 需在编译器 `isCustomElement` 中声明 `agent-pet`。网络模式收到桥接快照会覆盖组件的本地任务；建议选定一个权威事件来源。

`PetScheduler`、`parseEvent`、`parseSnapshot` 也独立导出；在 Node/SSR 导入库不会访问 DOM，注册元素和渲染需要浏览器环境。库 JS 约 20 KiB、gzip 约 5.7 KiB，具体见构建输出，不包含图集。

## 性能与资源预算

- Canvas 单一实例，不引入 React/Vue，不逐帧触发 UI 状态更新。
- 活动绘制 24 FPS，idle 8 FPS，`low-power` 活动 12 / idle 4 FPS；源动画时间仍按实际时间推进。遵从系统 prefers-reduced-motion 时仅显示动作首帧，不持续绘制。
- 隐藏页面或离屏停止绘制，任务过期逻辑继续按真实时间计算。
- 最多缓存 2 张解码图集、最多 2 个并行页加载；只预取下一页。上限图集 1920×1920，2 页 RGBA 约 **28.1 MiB**，不包含临时解码、Canvas、浏览器网络缓存和系统 WebView。
- 不加载全部动作，不载入逐帧 PNG，资源失败指数退避，避免不断请求。状态切换中异步旧请求不会覆盖新状态。
- DPR 上限 2。默认显示 240 CSS px；页面通过 diagnostics 展示缓存估算。
- Tauri 依赖系统 WebView，体积和内存仍受 WebView/操作系统影响。28.1 MiB 是图集缓存预算，**不是进程总内存承诺**；CPU 和总内存需在部署设备实测。完整进程树采样见验证文档；如果产品已有 WebView，直接嵌入组件可避免额外桌面壳开销。

当前 PNG 图集以视觉质量优先，资源包仍较大。更严格的内存预算可离线将图集降至 160/240 px 帧并同步重写坐标；组件代码无需更改。

## 桥接配置与浏览器限制

PowerShell 示例：

```powershell
$env:PET_TOKEN = 'your-local-secret'
$env:PET_PORT = '17789'
$env:PET_ORIGINS = 'https://agent.example.com,http://localhost:3000'
npm run bridge
```

HTTP 使用 `Authorization: Bearer ...`，组件 `pet.connect(url, token)` 自动把 token 加到 WS query。不要记录带 token 的 URL。默认不要求 token，仅监听环回地址；生产集成建议设置 token。默认白名单包含本项目开发/预览 origin 和 Tauri origin；额外页面来源需显式加到 `PET_ORIGINS`。无 Origin 的本地 Agent 客户端允许接入，因此 origin 白名单不替代身份认证。

`PET_HOST` 可更改绑定地址；离开环回地址时必须设置 PET_TOKEN。跨设备需要防火墙配置，默认不开放局域网。

HTTPS 网站连接本机 `ws://` / `http://` 受浏览器 mixed-content、Local Network Access 权限和企业策略影响。不能保证任意托管站点都可直连；使用允许的本地页面、配置可信 `wss://` 网关，或直接组件 API。见 [MDN WebSocket 指南](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications) 和 [Local Network Access](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access)。

## 开发与验证

```bash
npm run check
npm run build
npm run desktop:build
```

按需求不创建或运行单元测试。通过类型检查、生产构建、实际 HTTP/WebSocket、浏览器页面和桌面运行检查验证。详细结果见 `docs/verification.md`。

规划见 `docs/superpowers/specs/2026-10-12-desktop-pet-design.md` 和 `docs/superpowers/plans/2026-10-12-desktop-pet.md`。
