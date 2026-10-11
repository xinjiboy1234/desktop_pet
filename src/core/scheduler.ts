import {
  parseEvent,
  parseSnapshot,
  type PetEvent,
  type PetSnapshot,
  type PetTask,
  type PetFeedback,
  type PetAction,
} from "./protocol";
export class PetScheduler {
  private tasks = new Map<string, PetTask>();
  private seen = new Set<string>();
  private feedback: PetFeedback | null = null;
  private current: PetAction = "idle";
  private changedAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<(state: PetSnapshot) => void>();
  private disposed = false;
  dispatch(input: PetEvent | unknown): void {
    if (this.disposed) return;
    const e = parseEvent(input);
    if (this.seen.has(e.id)) return;
    const now = Date.now();
    if (e.type === "pet.reset") {
      this.tasks.clear();
      this.feedback = null;
      this.current = "idle";
      this.changedAt = now;
    } else if (e.type === "task.start" || e.type === "task.update") {
      const old = this.tasks.get(e.taskId!);
      if (!old && this.tasks.size >= 128) throw new Error("Task limit reached");
      // Move updates to the end so equal millisecond timestamps still have
      // deterministic latest-event order, including after snapshot hydration.
      this.tasks.delete(e.taskId!);
      this.tasks.set(e.taskId!, {
        taskId: e.taskId!,
        action: e.action ?? old?.action ?? "thinking",
        priority: e.priority ?? old?.priority ?? 0,
        message: e.message ?? old?.message,
        startedAt: old?.startedAt ?? now,
        updatedAt: now,
        expiresAt: now + (e.ttlMs ?? 120000),
      });
    } else if (e.type === "task.end" || e.type === "task.cancel") {
      this.tasks.delete(e.taskId!);
      this.feedback = {
        action:
          e.type === "task.cancel" || e.outcome === "error"
            ? "error"
            : (e.action ?? "success"),
        message: e.message,
        expiresAt: now + (e.ttlMs ?? 1200),
      };
    } else
      this.feedback = {
        action: e.action!,
        message: e.message,
        expiresAt: now + (e.ttlMs ?? 1200),
      };
    this.seen.add(e.id);
    if (this.seen.size > 512)
      this.seen.delete(this.seen.values().next().value!);
    this.reconcile(
      e.type === "task.cancel" || e.outcome === "error" || e.action === "error",
    );
  }
  hydrate(input: PetSnapshot | unknown): void {
    if (this.disposed) return;
    const s = parseSnapshot(input);
    this.tasks = new Map(s.tasks.map((t) => [t.taskId, t]));
    this.feedback = s.feedback;
    this.seen = new Set(s.seenIds);
    this.reconcile();
  }
  snapshot(): PetSnapshot {
    return {
      version: 1,
      tasks: [...this.tasks.values()].map((t) => ({ ...t })),
      feedback: this.feedback ? { ...this.feedback } : null,
      action: this.current,
      seenIds: [...this.seen],
    };
  }
  subscribe(listener: (state: PetSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }
  private reconcile(urgent = false): void {
    if (this.timer) clearTimeout(this.timer);
    const now = Date.now();
    for (const [id, t] of this.tasks)
      if (t.expiresAt <= now) this.tasks.delete(id);
    if (this.feedback && this.feedback.expiresAt <= now) this.feedback = null;
    const ordered = [...this.tasks.values()].reverse().sort(
      (a, b) => b.priority - a.priority || b.updatedAt - a.updatedAt,
    );
    const ready = ordered.filter(
      (t) => t.action === "error" || t.startedAt + 180 <= now,
    );
    const desired = ready.some((t) => t.action === "error")
      ? "error"
      : (this.feedback?.action ?? ready[0]?.action ?? "idle");
    const hold = this.changedAt + 350;
    if (
      desired !== this.current &&
      (urgent || desired === "error" || now >= hold)
    ) {
      this.current = desired;
      this.changedAt = now;
    }
    const deadlines = [
      ...ordered.map((t) => t.expiresAt),
      ...ordered
        .filter((t) => t.startedAt + 180 > now)
        .map((t) => t.startedAt + 180),
      ...(this.feedback ? [this.feedback.expiresAt] : []),
      ...(desired !== this.current ? [hold] : []),
    ];
    if (deadlines.length)
      this.timer = setTimeout(
        () => this.reconcile(),
        Math.max(1, Math.min(...deadlines) - now),
      );
    const state = this.snapshot();
    for (const listener of this.listeners) listener(state);
  }
  suspend(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
  resume(): void {
    if (!this.disposed) this.reconcile(true);
  }
  dispose(): void {
    this.disposed = true;
    this.suspend();
    this.listeners.clear();
    this.tasks.clear();
  }
}
