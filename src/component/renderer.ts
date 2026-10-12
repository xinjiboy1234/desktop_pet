import type { PetAction } from "../core/protocol";
const names: Record<PetAction, string> = {
  idle: "normal_duck",
  thinking: "thinking_duck",
  working: "work_duck",
  waiting: "box_duck",
  success: "cool_duck2",
  error: "tired_duck",
  celebrating: "music_duck",
};
interface Metadata {
  frameCount: number;
  fps: number;
  pages: { image: string; firstFrame: number; frameCount: number }[];
  frames: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
}
export class PetRenderer {
  private cache = new Map<string, ImageBitmap>();
  private pending = new Map<string, Promise<ImageBitmap | undefined>>();
  private failures = new Map<string, { count: number; retryAt: number }>();
  private visiblePage: string | undefined;
  private controller = new AbortController();
  private metadata = new Map<string, Metadata>();
  private action: PetAction = "idle";
  private meta: Metadata | undefined;
  private loadingAction: PetAction | undefined;
  private started = Date.now();
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private visible = true;
  private destroyed = false;
  private observer: IntersectionObserver;
  private motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
  private staticDirty = true;
  public lowPower = false;
  constructor(
    private canvas: HTMLCanvasElement,
    private base: string,
    private report: (error: Error) => void,
  ) {
    this.observer = new IntersectionObserver((entries) => {
      this.visible = entries[0]?.isIntersecting ?? true;
      this.staticDirty = true;
      this.schedule();
    });
    this.observer.observe(canvas);
    document.addEventListener("visibilitychange", this.visibility);
    this.motionPreference.addEventListener("change", this.motionChanged);
    void this.setAction("idle");
  }
  private visibility = () => {
    this.staticDirty = true;
    this.schedule();
  };
  private motionChanged = () => {
    this.staticDirty = true;
    this.schedule();
  };
  get diagnostics() {
    return {
      decodedPages: this.cache.size,
      pendingPages: this.pending.size,
      estimatedDecodedBytes: [...this.cache.values()].reduce(
        (n, b) => n + b.width * b.height * 4,
        0,
      ),
      paused: !this.visible || document.hidden,
      action: this.action,
      reducedMotion: this.motionPreference.matches,
      targetFps: this.motionPreference.matches ? 0 : this.targetFps,
    };
  }
  resize(size: number): void {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const pixels = Math.round(size * ratio);
    // Assigning even the same canvas dimensions clears its backing store.
    if (this.canvas.width !== pixels || this.canvas.height !== pixels) {
      this.canvas.width = this.canvas.height = pixels;
    }
    this.canvas.style.width = this.canvas.style.height = `${size}px`;
    this.staticDirty = true;
    this.schedule();
  }
  async setAction(action: PetAction): Promise<void> {
    if (this.destroyed) return;
    const metadataKey = `${names[action]}/sprite.json`;
    if ((this.failures.get(metadataKey)?.retryAt ?? 0) > Date.now()) return;
    if (action === this.loadingAction || (action === this.action && this.meta))
      return;
    const generation = ++this.generation;
    this.action = action;
    this.staticDirty = true;
    this.loadingAction = action;
    this.meta = undefined;
    try {
      const name = names[action];
      let meta = this.metadata.get(name);
      if (!meta) {
        const response = await fetch(
          `${this.base.replace(/\/?$/, "/")}${name}/sprite.json`,
          { signal: this.controller.signal },
        );
        if (!response.ok)
          throw new Error(`Sprite metadata HTTP ${response.status}`);
        meta = (await response.json()) as Metadata;
        if (
          !Array.isArray(meta.pages) ||
          !Array.isArray(meta.frames) ||
          !meta.frames.length ||
          meta.frameCount !== meta.frames.length
        )
          throw new Error("Invalid sprite metadata");
        this.metadata.set(name, meta);
        this.failures.delete(metadataKey);
      }
      if (generation !== this.generation || this.destroyed) return;
      const firstPath = `${name}/${meta.pages[meta.frames[0]!.page]!.image}`;
      // The old frame is already on the canvas; pin the incoming page while
      // decoding so another prefetch cannot close it before the handover.
      this.visiblePage = firstPath;
      const first = await this.load(firstPath, true);
      if (!first || generation !== this.generation || this.destroyed) return;
      this.meta = meta;
      this.visiblePage = firstPath;
      this.started = Date.now();
      // RGBA crossfades ghost different poses and reduce opacity. Swap a
      // complete first frame in this turn, then continue at the source rate.
      const frame = meta.frames[0]!;
      this.paint(first, frame);
      this.staticDirty = false;
    } catch (error) {
      this.failed(metadataKey, error);
    } finally {
      if (generation === this.generation) {
        this.loadingAction = undefined;
        this.schedule(!this.meta);
      }
    }
  }
  private failed(path: string, error: unknown): void {
    if (this.destroyed) return;
    const previous = this.failures.get(path);
    const count = (previous?.count ?? 0) + 1;
    this.failures.set(path, {
      count,
      retryAt: Date.now() + Math.min(30000, 1000 * 2 ** Math.min(count - 1, 5)),
    });
    if (!previous)
      this.report(error instanceof Error ? error : new Error(String(error)));
  }
  private load(
    path: string,
    waitForSlot = false,
  ): Promise<ImageBitmap | undefined> {
    const hit = this.cache.get(path);
    if (hit) {
      this.cache.delete(path);
      this.cache.set(path, hit);
      return Promise.resolve(hit);
    }
    const waiting = this.pending.get(path);
    if (waiting) return waiting;
    if (this.destroyed) return Promise.resolve(undefined);
    if ((this.failures.get(path)?.retryAt ?? 0) > Date.now())
      return Promise.resolve(undefined);
    if (this.pending.size >= 2)
      return waitForSlot
        ? Promise.race(this.pending.values()).then(() => this.load(path, true))
        : Promise.resolve(undefined);
    const promise = (async () => {
      try {
        const response = await fetch(
          `${this.base.replace(/\/?$/, "/")}${path}`,
          { signal: this.controller.signal },
        );
        if (!response.ok)
          throw new Error(`Sprite page HTTP ${response.status}`);
        const bitmap = await createImageBitmap(await response.blob());
        if (this.destroyed) {
          bitmap.close();
          return undefined;
        }
        this.cache.set(path, bitmap);
        this.failures.delete(path);
        while (this.cache.size > 2) {
          const key = [...this.cache.keys()].find(
            (key) => key !== this.visiblePage && key !== path,
          )!;
          this.cache.get(key)!.close();
          this.cache.delete(key);
        }
        return bitmap;
      } catch (error) {
        this.failed(path, error);
        return undefined;
      } finally {
        this.pending.delete(path);
      }
    })();
    this.pending.set(path, promise);
    return promise;
  }
  private get targetFps(): number {
    return this.action === "idle"
      ? this.lowPower
        ? 4
        : 8
      : this.lowPower
        ? 12
        : 24;
  }
  private schedule(retry = false): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.destroyed || !this.visible || document.hidden) return;
    if (this.motionPreference.matches && !this.staticDirty) return;
    const retryAt = Math.max(
      this.failures.get(`${names[this.action]}/sprite.json`)?.retryAt ?? 0,
      this.meta
        ? (this.failures.get(
            `${names[this.action]}/${this.meta.pages[this.meta.frames[0]!.page]!.image}`,
          )?.retryAt ?? 0)
        : 0,
    );
    this.timer = setTimeout(
      () => this.draw(),
      this.motionPreference.matches
        ? retry
          ? Math.max(1000, retryAt - Date.now())
          : 0
        : 1000 / this.targetFps,
    );
  }
  private draw(): void {
    const meta = this.meta;
    if (!meta) void this.setAction(this.action);
    if (meta) {
      const index = this.motionPreference.matches
        ? 0
        : Math.floor(((Date.now() - this.started) * meta.fps) / 1000) %
          meta.frames.length;
      const frame = meta.frames[index]!;
      const name = names[this.action];
      const path = `${name}/${meta.pages[frame.page]!.image}`;
      const bitmap = this.cache.get(path);
      if (bitmap) {
        this.staticDirty = false;
        this.visiblePage = path;
        this.cache.delete(path);
        this.cache.set(path, bitmap);
        this.paint(bitmap, frame);
      } else void this.load(path);
      if (!this.motionPreference.matches) {
        const next = meta.pages[(frame.page + 1) % meta.pages.length]!;
        void this.load(`${name}/${next.image}`);
      }
    }
    this.schedule(true);
  }
  private paint(bitmap: ImageBitmap, frame: Metadata["frames"][number]): void {
    const context = this.canvas.getContext("2d");
    if (!context) return;
    context.globalAlpha = 1;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.drawImage(
      bitmap, frame.x, frame.y, frame.width, frame.height,
      0, 0, this.canvas.width, this.canvas.height,
    );
  }
  destroy(): void {
    this.destroyed = true;
    this.generation++;
    this.controller.abort();
    if (this.timer) clearTimeout(this.timer);
    this.observer.disconnect();
    document.removeEventListener("visibilitychange", this.visibility);
    this.motionPreference.removeEventListener("change", this.motionChanged);
    for (const bitmap of this.cache.values()) bitmap.close();
    this.cache.clear();
    this.pending.clear();
    this.metadata.clear();
    this.failures.clear();
  }
}
