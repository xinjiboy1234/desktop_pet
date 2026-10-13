import { registerAgentPet, animationCatalog, type AgentPetElement, type PetAction, type PetEvent, type PetSnapshot } from '../index';
import './style.css';

registerAgentPet();
const labels: Record<PetAction, string> = {
  idle: '自在待命', thinking: '认真思考', working: '埋头工作', waiting: '等待结果',
  success: '任务完成', error: '需要休息', celebrating: '开心庆祝',
  sleeping: '安心睡觉',
  speaking: '开口说话', box_speaking: '箱中说话',
  angry: '气鼓鼓',
};
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar"><a class="brand" href="./"><span class="brandmark">d.</span> duckside<span class="brandtag">AGENT COMPANION</span></a><a class="source" href="https://github.com/xinjiboy1234/desktop_pet" target="_blank" rel="noreferrer">GitHub ↗</a></header>
  <main>
    <section class="intro"><div class="eyebrow"><span></span> 你的 Agent，有了一个小伙伴</div><h1>让等待，<br>多一点<span class="accent">陪伴。</span></h1><p>思考、工作、完成。把 Agent 的每一个状态，<br class="desktop-break">交给一只认真生活的小鸭子。</p><div class="platforms"><span>Web 组件</span><span>桌面悬浮</span><span>本地通信</span></div></section>
    <section class="workspace" aria-label="宠物控制台">
      <div class="stage"><div class="stage-top"><span class="section-label">LIVE PREVIEW</span><span id="connection" role="status" class="connection">本地预览</span></div><div class="pet-space"><div class="orbit"></div><agent-pet size="280" asset-base="./desktop_pet_resources/video_sprites/"></agent-pet><div class="pet-shadow"></div></div><div class="pet-caption"><span class="state-dot"></span><strong id="state-label">自在待命</strong><span id="task-count">0 个进行中的任务</span></div><p id="message" role="status">准备好了，随时开始。</p><div class="stage-bottom"><label class="toggle"><input type="checkbox" id="low-power"> 低功耗模式</label><span id="cache">图集按需加载</span></div></div>
      <aside class="controls"><div class="panel-title"><span class="section-label">PLAYGROUND</span><span class="mini">01 — 动作</span></div><h2>今天是什么状态？</h2><div id="actions" class="actions"></div><div class="divider"></div><div class="panel-title"><span class="section-label">TASK FLOW</span><span class="mini">02 — 衔接</span></div><p class="control-hint">试试不同耗时，小鸭子会自己接好下一步。</p><div class="flow-buttons"><button id="short-task">⚡ 短任务 <small>100 ms</small></button><button id="long-task">◷ 长任务 <small>8 秒</small></button><button id="parallel-task">⇄ 并发任务 <small>优先级切换</small></button></div><button class="reset-button" id="reset">重置状态 ↺</button></aside>
    </section>
    <section class="integration"><div class="connection-panel"><div class="panel-title"><span class="section-label">CONNECT YOUR AGENT</span><span class="mini">03 — 接入</span></div><h2>一条事件，就能动起来。</h2><p>启动本地桥接，将 Agent 的任务事件发送给宠物。</p><form id="connect-form"><label for="endpoint">WebSocket 地址</label><div class="input-row"><input id="endpoint" type="url" value="ws://127.0.0.1:17789/ws" required><button id="connect-button" type="submit">连接桥接</button></div><label for="token">访问令牌 <span>可选</span></label><input id="token" type="password" placeholder="与 PET_TOKEN 保持一致" autocomplete="off"></form><p id="connection-help" class="helper">未启动桥接时，可直接体验上方动作。</p></div><div class="code-panel"><div class="code-heading"><span>Agent → Pet</span><button id="copy" aria-label="复制事件示例">复制</button></div><pre><code><span class="code-dim">POST http://127.0.0.1:17789/events</span>
{
  <span class="code-key">"version"</span>: 1,
  <span class="code-key">"id"</span>: <span class="code-value">"event-001"</span>,
  <span class="code-key">"type"</span>: <span class="code-value">"task.start"</span>,
  <span class="code-key">"taskId"</span>: <span class="code-value">"research"</span>,
  <span class="code-key">"action"</span>: <span class="code-value">"thinking"</span>
}</code></pre><div class="event-heading"><span>活动任务</span><span id="event-count">0</span></div><ul id="tasks" aria-live="polite"><li class="empty">没有进行中的任务。</li></ul></div></section>
    <div id="error" role="alert" hidden></div>
    <footer><span>一点陪伴，不打扰工作。</span><span>Canvas · 24 FPS · 按需加载</span></footer>
  </main>`;

const pet = document.querySelector<AgentPetElement>('agent-pet')!;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let connected = false;
let current = 'idle';
let generation = 0;
const timers = new Set<ReturnType<typeof setTimeout>>();
const sample = { version: 1, id: 'event-001', type: 'task.start', taskId: 'research', action: 'thinking' };
for (const [action, label] of Object.entries(labels)) {
  const button = document.createElement('button');
  button.type = 'button'; button.dataset.action = action;
  button.textContent = label; button.setAttribute('aria-pressed', String(action === 'idle'));
  button.setAttribute('aria-label', label);
  const duration = document.createElement('small');
  duration.textContent = `${(animationCatalog[action as PetAction].durationMs / 1000).toFixed(2)} s`;
  duration.setAttribute('aria-hidden', 'true');
  button.append(duration);
  button.title = `按素材时长播放 ${duration.textContent}`;
  button.onclick = () => { void send({ type: 'pet.action', action: action as PetAction }); };
  $('actions').append(button);
}
function error(message: string) { $('error').hidden = false; $('error').textContent = message; }
async function send(fields: Omit<PetEvent, 'version' | 'id'>) {
  const event = { ...fields, version: 1 as const, id: crypto.randomUUID() } as PetEvent;
  try {
    if (!connected) { pet.dispatch(event); return; }
    const endpoint = new URL($<HTMLInputElement>('endpoint').value);
    endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
    endpoint.pathname = '/events'; endpoint.search = '';
    const token = $<HTMLInputElement>('token').value;
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(event), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error((await response.json()).error || `HTTP ${response.status}`);
    $('error').hidden = true;
  } catch (reason) { error(reason instanceof Error ? reason.message : String(reason)); }
}
function later(ms: number, fn: () => void) {
  const g = generation;
  const timer = setTimeout(() => { timers.delete(timer); if (g === generation) fn(); }, ms);
  timers.add(timer);
}
function task(duration: number, priority = 0, message = '正在整理你的想法…') {
  const taskId = crypto.randomUUID();
  void send({ type: 'task.start', taskId, action: 'thinking', priority, message });
  if (duration > 1000) later(duration * 0.35, () => { void send({ type: 'task.update', taskId, action: 'working', message: '把想法变成结果…' }); });
  later(duration, () => { void send({ type: 'task.end', taskId, outcome: 'success', message: '完成了！做得不错。' }); });
}
$('short-task').onclick = () => task(100);
$('long-task').onclick = () => task(8000);
$('parallel-task').onclick = () => { task(8000, 0, '后台任务正在工作…'); later(1500, () => task(3500, 10, '先处理更重要的任务…')); };
$('reset').onclick = () => { generation++; timers.forEach(clearTimeout); timers.clear(); void send({ type: 'pet.reset' }); };
$<HTMLInputElement>('low-power').onchange = (e) => pet.toggleAttribute('low-power', (e.target as HTMLInputElement).checked);
$('connect-form').onsubmit = (e) => {
  e.preventDefault();
  if (connected) { pet.disconnect(); return; }
  pet.connect($<HTMLInputElement>('endpoint').value, $<HTMLInputElement>('token').value || undefined);
};
pet.addEventListener('pet-connection', (e) => {
  const detail = (e as CustomEvent).detail;
  const status = typeof detail === 'string' ? detail : detail?.state;
  connected = status === 'connected';
  $('connection').textContent = connected ? '桥接已连接' : status === 'disconnected' ? '本地预览' : '正在重连';
  $('connection').classList.toggle('online', connected);
  $('connect-button').textContent = connected ? '断开连接' : '连接桥接';
  $('connection-help').textContent = connected ? '任务演示通过真实本地网络发送。' : '连接不可用时将自动重试。检查 npm run bridge 与令牌。';
});
pet.addEventListener('pet-state', (e) => {
  const state = (e as CustomEvent<PetSnapshot>).detail;
  current = state.action;
  $('state-label').textContent = labels[state.action];
  $('task-count').textContent = `${state.tasks.length} 个进行中的任务`;
  $('event-count').textContent = String(state.tasks.length);
  const tasks = state.tasks.slice().reverse().sort((a, b) => b.priority - a.priority || b.updatedAt - a.updatedAt);
  const selected = state.action === 'error' ? tasks.find(t => t.action === 'error') : tasks[0];
  $('message').textContent = (state.action === 'error' ? selected?.message || state.feedback?.message : state.feedback?.message || selected?.message) || '准备好了，随时开始。';
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.action === current)));
  $('tasks').replaceChildren();
  if (!state.tasks.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = '没有进行中的任务。'; $('tasks').append(li); }
  for (const t of state.tasks) {
    const li = document.createElement('li'); const span = document.createElement('span');
    span.textContent = t.message || t.taskId;
    const badge = document.createElement('small'); badge.textContent = `${labels[t.action]} · P${t.priority}`;
    li.append(span, badge); $('tasks').append(li);
  }
});
pet.addEventListener('pet-error', (e) => { const d = (e as CustomEvent).detail; error(typeof d === 'string' ? d : d?.message || '资源或连接不可用'); });
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(JSON.stringify(sample, null, 2)); $('copy').textContent = '已复制'; later(1500, () => { $('copy').textContent = '复制'; }); }
  catch { error('无法访问剪贴板，请手动复制事件示例。'); }
};
const statsTimer = setInterval(() => {
  const stats = pet.diagnostics;
  $('cache').textContent = stats ? `${stats.decodedPages ?? 0} 页缓存 · ${(Number(stats.estimatedDecodedBytes ?? 0) / 1024 / 1024).toFixed(1)} MiB` : '图集按需加载';
}, 2000);
window.addEventListener('pagehide', () => { clearInterval(statsTimer); timers.forEach(clearTimeout); pet.disconnect(); });
