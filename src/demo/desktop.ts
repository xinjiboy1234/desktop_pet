import { registerAgentPet, type AgentPetElement, type PetSnapshot } from '../index';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
registerAgentPet();
const pet = document.querySelector<AgentPetElement>('agent-pet')!;
const status = document.getElementById('status')!;
const url = new URL(location.href);
async function connect() {
  try {
    const [endpoint, token] = '__TAURI_INTERNALS__' in window
      ? await invoke<[string, string]>('bridge_config')
      : ['ws://127.0.0.1:17789/ws', ''];
    pet.connect(url.searchParams.get('endpoint') || endpoint, url.searchParams.get('token') || token || undefined);
  } catch { status.textContent = '无法读取桥接配置'; }
}
const labels = { idle: '等待 Agent', thinking: '思考中…', working: '工作中…', waiting: '等待结果…', success: '完成了！', error: '需要你的帮助', celebrating: '好耶！', sleeping: '睡觉中…' };
pet.addEventListener('pet-state', (e) => { const s = (e as CustomEvent<PetSnapshot>).detail; status.textContent = s.feedback?.message || labels[s.action]; });
pet.addEventListener('pet-connection', (e) => { const s = (e as CustomEvent).detail; if ((typeof s === 'string' ? s : s.state) !== 'connected') status.textContent = '等待本地桥接…'; });
pet.addEventListener('pet-error', (e) => { status.textContent = (e as CustomEvent).detail?.message || '连接或资源不可用'; });
document.getElementById('power')!.onclick = () => { pet.toggleAttribute('low-power'); document.getElementById('power')!.textContent = pet.hasAttribute('low-power') ? '流畅' : '省电'; };
document.getElementById('close')!.onclick = () => { void getCurrentWindow().close(); };
document.querySelector('main')!.addEventListener('pointerdown', (e) => { if (!(e.target as HTMLElement).closest('button') && e.button === 0) void getCurrentWindow().startDragging(); });
window.addEventListener('pagehide', () => pet.disconnect());
void connect();
