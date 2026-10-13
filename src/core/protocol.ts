export const actions = [
  "idle",
  "thinking",
  "working",
  "waiting",
  "success",
  "error",
  "celebrating",
  "sleeping",
  "speaking",
  "box_speaking",
  "angry",
] as const;
export type PetAction = (typeof actions)[number];
export type PetEventType =
  | "task.start"
  | "task.update"
  | "task.end"
  | "task.cancel"
  | "pet.action"
  | "pet.reset";
export interface PetEvent {
  version: 1;
  id: string;
  type: PetEventType;
  taskId?: string;
  action?: PetAction;
  priority?: number;
  message?: string;
  ttlMs?: number;
  outcome?: "success" | "error";
}
export interface PetTask {
  taskId: string;
  action: PetAction;
  priority: number;
  message?: string;
  startedAt: number;
  updatedAt: number;
  expiresAt: number;
}
export interface PetFeedback {
  id?: string;
  action: PetAction;
  message?: string;
  expiresAt: number;
}
export interface PetSnapshot {
  version: 1;
  tasks: PetTask[];
  feedback: PetFeedback | null;
  action: PetAction;
  seenIds: string[];
}
const types = [
  "task.start",
  "task.update",
  "task.end",
  "task.cancel",
  "pet.action",
  "pet.reset",
];
function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Expected an object");
  return input as Record<string, unknown>;
}
function str(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}
function action(value: unknown): value is PetAction {
  return actions.includes(value as PetAction);
}
export function parseEvent(input: unknown): PetEvent {
  if (typeof input === "string") {
    if (input.length > 8192) throw new Error("Event exceeds 8 KiB");
    input = JSON.parse(input);
  }
  const v = record(input);
  if (JSON.stringify(v).length > 8192) throw new Error("Event exceeds 8 KiB");
  if (v.version !== 1 || !str(v.id, 128) || !types.includes(v.type as string))
    throw new Error("Invalid event version, id or type");
  if ((v.type as string).startsWith("task.") && !str(v.taskId, 128))
    throw new Error("taskId required");
  if (v.action !== undefined && !action(v.action))
    throw new Error("Invalid action");
  if (v.type === "pet.action" && !action(v.action))
    throw new Error("action required");
  if (
    v.priority !== undefined &&
    (typeof v.priority !== "number" ||
      !Number.isFinite(v.priority) ||
      Math.abs(v.priority) > 1000)
  )
    throw new Error("Invalid priority");
  if (
    v.message !== undefined &&
    (typeof v.message !== "string" || v.message.length > 1000)
  )
    throw new Error("Invalid message");
  if (
    v.ttlMs !== undefined &&
    (typeof v.ttlMs !== "number" ||
      !Number.isFinite(v.ttlMs) ||
      v.ttlMs < 1 ||
      v.ttlMs > 600000)
  )
    throw new Error("Invalid TTL");
  if (
    v.outcome !== undefined &&
    v.outcome !== "success" &&
    v.outcome !== "error"
  )
    throw new Error("Invalid outcome");
  return {
    version: 1,
    id: v.id,
    type: v.type as PetEventType,
    ...(v.taskId !== undefined ? { taskId: v.taskId as string } : {}),
    ...(v.action !== undefined ? { action: v.action as PetAction } : {}),
    ...(v.priority !== undefined ? { priority: v.priority as number } : {}),
    ...(v.message !== undefined ? { message: v.message as string } : {}),
    ...(v.ttlMs !== undefined ? { ttlMs: v.ttlMs as number } : {}),
    ...(v.outcome !== undefined
      ? { outcome: v.outcome as "success" | "error" }
      : {}),
  };
}
export function parseSnapshot(input: unknown): PetSnapshot {
  const v = record(input);
  if (
    v.version !== 1 ||
    !Array.isArray(v.tasks) ||
    v.tasks.length > 128 ||
    !action(v.action) ||
    !Array.isArray(v.seenIds) ||
    v.seenIds.length > 512 ||
    !v.seenIds.every((x) => str(x, 128))
  )
    throw new Error("Invalid snapshot");
  const tasks = v.tasks.map((item) => {
    const t = record(item);
    if (
      !str(t.taskId, 128) ||
      !action(t.action) ||
      typeof t.priority !== "number" ||
      !Number.isFinite(t.priority) ||
      Math.abs(t.priority) > 1000 ||
      ![t.startedAt, t.updatedAt, t.expiresAt].every(
        (x) => typeof x === "number" && Number.isFinite(x),
      ) ||
      (t.message !== undefined &&
        (typeof t.message !== "string" || t.message.length > 1000))
    )
      throw new Error("Invalid snapshot task");
    return { ...t } as unknown as PetTask;
  });
  if (new Set(tasks.map((t) => t.taskId)).size !== tasks.length)
    throw new Error("Duplicate snapshot task");
  let feedback: PetFeedback | null = null;
  if (v.feedback !== null) {
    const f = record(v.feedback);
    if (
      !action(f.action) ||
      (f.id !== undefined && !str(f.id, 128)) ||
      typeof f.expiresAt !== "number" ||
      !Number.isFinite(f.expiresAt) ||
      (f.message !== undefined &&
        (typeof f.message !== "string" || f.message.length > 1000))
    )
      throw new Error("Invalid feedback");
    feedback = { ...f } as unknown as PetFeedback;
  }
  return {
    version: 1,
    tasks,
    feedback,
    action: v.action,
    seenIds: [...v.seenIds] as string[],
  };
}
