# 表情、动作与使用技巧

以下时长按当前图集的帧数 / 24 FPS 计算。`pet.action` 的默认 TTL 向上取整到毫秒；任务动作持续到结束或租约到期，期间循环播放。实际可见时长可能受冷加载和最短展示等待影响。

| action | 表现 / 建议场景 | 图集目录 | 帧数 | 单周期 / 默认临时展示 |
|---|---|---|---:|---:|
| `idle` | 自在待命；无任务时自动进入 | normal_duck | 124 | 5.167 秒 |
| `thinking` | 认真思考；规划、推理、检索 | thinking_duck | 192 | 8 秒 |
| `working` | 埋头工作；执行工具、写文件、构建 | work_duck | 124 | 5.167 秒 |
| `waiting` | 箱中等待；外部结果、用户输入 | box_duck | 124 | 5.167 秒 |
| `success` | 酷鸭完成；任务成功反馈 | cool_duck2 | 192 | 8 秒 |
| `error` | 疲惫鸭；失败、取消、需要帮助 | tired_duck | 124 | 5.167 秒 |
| `celebrating` | 音乐鸭；里程碑、庆祝 | music_duck | 124 | 5.167 秒 |
| `sleeping` | 睡觉；用户选择休息 | sleep_duck | 158 | 6.584 秒 |
| `speaking` | 普通鸭说话；展示回应或播报状态 | normal_speak | 158 | 6.584 秒 |
| `box_speaking` | 箱中说话；等待时的提示 | box_speak | 158 | 6.584 秒 |
| `angry` | 气鼓鼓；用户主动展示生气情绪 | angry_duck | 124 | 5.167 秒 |

`angry` 与 `error` 独立。失败和取消仍默认显示 `error`，不会自动转成 `angry`。说话动作是已有动画，不含 TTS、音频播放或音素同步。`sleeping` 是视觉状态；省电需另外设置 `low-power`。

## 按场景使用

- 连续任务：thinking → working → waiting → task.end(success)。用同一 taskId 更新；不要等动画播完才提交任务结果。
- 短任务：调度器等待 180 ms 才进入忙碌，100 ms 工作可能不展示 working，这是预期行为。
- 简短反馈：可给 `pet.action` 或 `task.end` 设置 `ttlMs: 1200`。不传则播放对应素材时长。
- 持续休息：`pet.action sleeping` 仅展示约 6.584 秒。需要更长可指定 TTL（最多 600000 ms）；超过这个范围需由应用管理生命周期。
- 并发：每个任务不同 taskId，用 priority 仲裁；同优先级看最近更新。活动 error 任务优先，不能只靠提高普通任务优先级盖过它。
- 重复展示：重复点击或新 id 的同一动作会从首帧重新播放；复用旧 id 会被去重。
- 取消立即显示 error；普通动作有最短 350 ms 展示保护。临时表情到期后回到仍活跃的任务，没有任务则 idle。

## 扩展素材

`desktop_pet_resources/video_sprites/<name>/sprite.json` 包含 frameWidth、frameHeight、frameCount、fps、loop、order 和 pages；每页定义 image、width、height、columns、rows、firstFrame、frameCount。以现有素材元数据为模板，不猜测坐标。

同步维护：

1. 新素材 PNG 页与 sprite.json。
2. animations.json 的 name、metadata、frameCount、fps、durationSeconds。
3. src/core/protocol.ts 的 actions 与 src/core/animation-catalog.ts 的映射。
4. src/demo/main.ts、src/demo/desktop.ts 的文案，以及本表和 README。

Vite 构建会复制素材目录（排除 frames）；npm 包包含 sprite.json、manifest 与图集 PNG。图集缓存最多 2 页，首帧就绪前保留旧画面；源素材首尾不一致时循环可能有跳变。
