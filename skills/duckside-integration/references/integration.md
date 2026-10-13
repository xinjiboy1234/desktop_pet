# 接入与排错

## 本地运行

从项目根目录执行，需要 Node.js 22+：

```powershell
npm ci
npm start
```

访问 `http://127.0.0.1:5173` 并点击“连接桥接”。分开启动可用 `npm run bridge` 与 `npm run dev`。bridge 默认 `127.0.0.1:17789`。`npm start` 会识别并复用本项目服务，不要终止占用端口的未知进程。

桌面用 `npm run desktop`；构建用 `npm run desktop:build`。Windows 需要 Rust、C++ 构建工具与 WebView2。输出 `src-tauri/target/release/duckside.exe` 内嵌图集，独立执行时另启动 bridge。拖动鸭子移动窗口，悬停可省电/关闭。其他平台需独立验证。

## Web 嵌入

项目根目录 `npm run build:lib`、`npm pack` 生成本地包；在目标产品安装该 tgz。也可使用 Git 来源 `npm install github:xinjiboy1234/desktop_pet`，安装期间 prepare 会构建库，需要 Node/npm 和构建依赖。未发布到 npm registry。

将包内 `desktop_pet_resources/video_sprites/` 复制到目标产品的 `public/pets/video_sprites/`（无需 frames），再在浏览器入口运行：

```ts
import { registerAgentPet, type AgentPetElement } from '@xinjiboy/agent-pet';
registerAgentPet();
const pet = document.createElement('agent-pet') as AgentPetElement;
pet.setAttribute('asset-base', '/pets/video_sprites/');
pet.setAttribute('size', '240');
document.querySelector('#companion')!.append(pet);
pet.addEventListener('pet-error', e => console.warn((e as CustomEvent).detail));
pet.dispatch({ version: 1, id: crypto.randomUUID(), type: 'pet.action', action: 'angry' });
// 如使用远程 bridge，由它统一管理任务：
// pet.connect('ws://127.0.0.1:17789/ws', token);
// 页面卸载时 pet.disconnect()；移除组件 pet.remove() 会释放资源。
```

React 用 ref 操作自定义元素；Vue 配置 isCustomElement 接受 agent-pet。Node/SSR 可以导入库和调度器，但 registerAgentPet 与渲染只能在浏览器运行。监听 pet-state 读取 action/tasks/feedback，pet-connection 读取 detail.state，pet-error 读取 detail.message；pet.diagnostics 查看缓存与加载情况。

## 事件协议 v1

POST `/events`，Content-Type 为 application/json。每个事件有 version:1、唯一 id、type。任务事件必须有 taskId。HTTP 成功为 202 / accepted:true；WS `/ws` 也接受相同 JSON，返回 ack/error，连接时及状态变化时发送 snapshot 信封。

| type | 字段与行为 |
|---|---|
| task.start | action 默认 thinking，priority 默认 0，ttlMs 默认 120000 |
| task.update | 可更新 action/priority/message/ttlMs，续租；未知 taskId 创建任务 |
| task.end | 移除任务；outcome:error 强制 error，否则 action 或默认 success；反馈 TTL 默认素材时长 |
| task.cancel | 移除任务并立即显示 error；可带 message/ttlMs |
| pet.action | action 必填；临时反馈，到期恢复任务或 idle |
| pet.reset | 清空所有任务与反馈 |

priority 范围 -1000～1000，ttlMs 1～600000，message 最多 1000 字符，id/taskId 最多 128 字符，任务最多 128 个；事件序列化长度限制 8192，HTTP 原始体另有 16 KiB 上限。重试同一事件保持 id；近期最多 512 个去重记录，不承诺永久幂等。

```powershell
$body = @{ version = 1; id = [guid]::NewGuid().ToString(); type = 'task.start'; taskId = 'job-1'; action = 'thinking' } | ConvertTo-Json -Compress
$headers = @{}
if ($env:PET_TOKEN) { $headers.Authorization = 'Bearer ' + $env:PET_TOKEN }
Invoke-RestMethod -Uri http://127.0.0.1:17789/events -Method Post -ContentType application/json -Headers $headers -Body $body
```

长期任务每约 30 秒 task.update 续租；120 秒不更新默认清理。重连快照携带绝对 expiresAt，不延长租约。bridge 重启清空内存，Agent 应重新发送仍活跃任务。按用户任务生命周期管理，不让桌宠 HTTP 失败改变主体任务的成功/失败结果。

## 配置与诊断

PET_PORT 改端口，PET_TOKEN 设置共享令牌，PET_ORIGINS 逗号分隔浏览器来源；PET_HOST 改监听地址，非环回必须设置令牌。桌面支持 PET_ENDPOINT，自定义端点需同步 Tauri CSP connect-src。HTTP 用 Authorization: Bearer；组件 connect 自动通过 WS query 传令牌，不记录包含令牌的 URL。

| 现象 | 检查 / 处理 |
|---|---|
| 连接拒绝 | GET /health，应返回 service:agent-pet-bridge；检查进程和 PET_PORT |
| 401 | HTTP 客户端与 bridge 的 PET_TOKEN 一致；/health 本身不验证令牌，另查 /snapshot |
| 403 / CORS | 将目标页面 origin 加入 PET_ORIGINS 后重启 bridge |
| 400 | 使用协议 action 名、唯一 id、必需 taskId；检查 TTL 和 payload 限制 |
| 动画资源 404 | asset-base 指向 video_sprites 层；sprite.json 和所有 PNG 页已复制，路径大小写一致 |
| 远程站点无法连本机 | HTTPS mixed-content、本地网络权限或企业策略可能阻止 ws/http；改用直接组件 API、允许的本地页面或可信 wss 网关 |
| 动作意外恢复待机 | 检查临时 TTL 与任务续租；不要为 task.start 使用短展示 TTL |
| 页面不动 | 检查 reduced-motion（只画首帧）、隐藏/离屏状态、pet-error |

low-power 属性降低绘制频率（活动 12 / idle 4 FPS，普通为 24 / 8），不改变源动画时间。DPR 上限 2、最多缓存 2 张解码图集，约 28.1 MiB 是图集预算而非进程总内存。

接入完成用真实 start/update/end 和 pet.action 验证，检查 snapshot 和可见表情；源码修改后运行 npm run build，桌面交付另运行 npm run desktop:build。不声称仅构建成功就等于桌面已实机验证。
