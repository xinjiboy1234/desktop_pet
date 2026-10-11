import { PetScheduler } from "../core/scheduler";
import type { PetEvent } from "../core/protocol";
import { PetRenderer } from "./renderer";
import { PetTransport, type ConnectionState } from "./transport";
export interface AgentPetElement extends HTMLElement {
  scheduler: PetScheduler;
  dispatch(event: PetEvent): void;
  connect(url?: string, token?: string): void;
  disconnect(): void;
  reset(): void;
  readonly diagnostics: Record<string, unknown>;
}
export function registerAgentPet(tagName = "agent-pet"): void {
  if (typeof customElements === "undefined" || customElements.get(tagName))
    return;
  class AgentPet extends HTMLElement implements AgentPetElement {
    static observedAttributes = [
      "asset-base",
      "endpoint",
      "token",
      "size",
      "low-power",
    ];
    scheduler = new PetScheduler();
    private renderer: PetRenderer | undefined;
    private transport: PetTransport | undefined;
    private unsubscribe: (() => void) | undefined;
    private connection: ConnectionState = "disconnected";
    private canvas: HTMLCanvasElement;
    constructor() {
      super();
      const shadow = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent =
        ":host{display:inline-block;line-height:0}canvas{display:block;pointer-events:none}";
      this.canvas = document.createElement("canvas");
      this.canvas.setAttribute("aria-label", "Agent desktop pet");
      this.canvas.setAttribute("role", "img");
      shadow.append(style, this.canvas);
    }
    connectedCallback(): void {
      this.scheduler.resume();
      this.renderer = new PetRenderer(
        this.canvas,
        this.getAttribute("asset-base") ??
          "/desktop_pet_resources/video_sprites/",
        (error) => this.report(error),
      );
      this.configure();
      this.unsubscribe = this.scheduler.subscribe((snapshot) => {
        void this.renderer?.setAction(snapshot.action);
        this.emit("pet-state", snapshot);
      });
      this.transport = new PetTransport(
        (snapshot) => this.scheduler.hydrate(snapshot),
        (event) => this.scheduler.dispatch(event),
        (state) => {
          this.connection = state;
          this.emit("pet-connection", { state });
        },
        (error) => this.report(error),
      );
      if (this.hasAttribute("endpoint")) this.connect();
    }
    disconnectedCallback(): void {
      this.disconnect();
      this.transport = undefined;
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      this.renderer?.destroy();
      this.renderer = undefined;
      this.scheduler.suspend();
    }
    attributeChangedCallback(name: string): void {
      if (!this.isConnected) return;
      if (name === "asset-base") {
        this.renderer?.destroy();
        this.renderer = new PetRenderer(
          this.canvas,
          this.getAttribute("asset-base") ??
            "/desktop_pet_resources/video_sprites/",
          (e) => this.report(e),
        );
        this.configure();
        void this.renderer.setAction(this.scheduler.snapshot().action);
      } else if (name === "endpoint" || name === "token") {
        if (this.hasAttribute("endpoint")) this.connect();
        else this.disconnect();
      } else this.configure();
    }
    private configure(): void {
      const raw = Number(this.getAttribute("size") ?? 240);
      this.renderer?.resize(
        Number.isFinite(raw) ? Math.min(1024, Math.max(32, raw)) : 240,
      );
      if (this.renderer)
        this.renderer.lowPower = this.hasAttribute("low-power");
    }
    dispatch(event: PetEvent): void {
      try {
        this.scheduler.dispatch(event);
      } catch (error) {
        this.report(error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    }
    connect(
      url = this.getAttribute("endpoint") ?? "ws://127.0.0.1:17789/ws",
      token = this.getAttribute("token") ?? undefined,
    ): void {
      try {
        this.transport?.connect(url, token);
      } catch (error) {
        this.report(error instanceof Error ? error : new Error(String(error)));
      }
    }
    disconnect(): void {
      this.transport?.disconnect();
    }
    reset(): void {
      this.dispatch({
        version: 1,
        id:
          globalThis.crypto?.randomUUID?.() ??
          `reset-${Date.now()}-${Math.random()}`,
        type: "pet.reset",
      });
    }
    get diagnostics(): Record<string, unknown> {
      return {
        ...this.renderer?.diagnostics,
        connection: this.connection,
        tasks: this.scheduler.snapshot().tasks.length,
      };
    }
    private emit(name: string, detail: unknown): void {
      this.dispatchEvent(
        new CustomEvent(name, { detail, bubbles: true, composed: true }),
      );
    }
    private report(error: Error): void {
      this.emit("pet-error", { message: error.message });
    }
  }
  customElements.define(tagName, AgentPet);
}
