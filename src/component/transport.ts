import {
  parseSnapshot,
  parseEvent,
  type PetSnapshot,
  type PetEvent,
} from "../core/protocol";
export type ConnectionState =
  "disconnected" | "connecting" | "connected" | "reconnecting";
export class PetTransport {
  private socket: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private attempt = 0;
  constructor(
    private receive: (snapshot: PetSnapshot) => void,
    private event: (event: PetEvent) => void,
    private state: (state: ConnectionState) => void,
    private error: (error: Error) => void,
  ) {}
  connect(url: string, token?: string): void {
    this.disconnect();
    const address = new URL(url);
    if (!["ws:", "wss:"].includes(address.protocol))
      throw new Error("Expected ws or wss URL");
    if (token) address.searchParams.set("token", token);
    const generation = this.generation;
    const open = () => {
      if (generation !== this.generation) return;
      this.state(this.attempt ? "reconnecting" : "connecting");
      const socket = new WebSocket(address);
      this.socket = socket;
      socket.onopen = () => {
        if (generation !== this.generation) return;
        this.attempt = 0;
        this.state("connected");
      };
      socket.onmessage = (e) => {
        if (generation !== this.generation) return;
        try {
          if (typeof e.data !== "string" || e.data.length > 262144)
            throw new Error("Invalid WebSocket payload");
          const data = JSON.parse(e.data);
          if (data.type === "ack") return;
          else if (data.type === "error")
            throw new Error(
              typeof data.message === "string"
                ? data.message
                : "Bridge rejected message",
            );
          else if (data.type === "snapshot")
            this.receive(parseSnapshot(data.snapshot));
          else if (data.type === "event") this.event(parseEvent(data.event));
          else this.event(parseEvent(data));
        } catch (error) {
          this.error(error instanceof Error ? error : new Error(String(error)));
        }
      };
      socket.onerror = () =>
        this.error(new Error("WebSocket connection failed"));
      socket.onclose = () => {
        if (generation !== this.generation) return;
        this.socket = null;
        this.state("reconnecting");
        this.timer = setTimeout(
          open,
          Math.min(30000, 500 * 2 ** Math.min(this.attempt++, 6)) +
            Math.random() * 250,
        );
      };
    };
    open();
  }
  disconnect(): void {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onopen = null;
      this.socket.close();
      this.socket = null;
    }
    this.attempt = 0;
    this.state("disconnected");
  }
}
