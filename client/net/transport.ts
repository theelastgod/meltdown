/** WebSocket transport with an optional simulated link (latency, jitter, loss) in both directions. */

export interface Transport {
  send(buf: ArrayBuffer): void;
  close(): void;
  onMessage: ((buf: ArrayBuffer) => void) | null;
  onOpen: (() => void) | null;
  onClose: ((reason: string) => void) | null;
  readonly open: boolean;
}

export interface LinkSim {
  /** one-way latency in ms */
  latencyMs: number;
  jitterMs: number;
  /** packet loss probability per message per direction */
  loss: number;
  seed?: number;
}

export class WsTransport implements Transport {
  private ws: WebSocket;
  onMessage: ((buf: ArrayBuffer) => void) | null = null;
  onOpen: (() => void) | null = null;
  onClose: ((reason: string) => void) | null = null;
  open = false;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";
    this.ws.onopen = () => {
      this.open = true;
      this.onOpen?.();
    };
    this.ws.onmessage = (e) => this.onMessage?.(e.data as ArrayBuffer);
    this.ws.onclose = (e) => {
      this.open = false;
      this.onClose?.(e.reason || `code ${e.code}`);
    };
    this.ws.onerror = () => {
      /* onclose follows */
    };
  }
  send(buf: ArrayBuffer): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(buf);
  }
  close(): void {
    this.ws.close(1000, "client close");
  }
}

/** Wraps a transport and delays/drops messages deterministically (seeded). */
export class SimulatedLink implements Transport {
  onMessage: ((buf: ArrayBuffer) => void) | null = null;
  onOpen: (() => void) | null = null;
  onClose: ((reason: string) => void) | null = null;
  private s: number;
  private lastDeliverOut = 0;
  private lastDeliverIn = 0;
  readonly dropped = { out: 0, in: 0 };
  constructor(private inner: Transport, private sim: LinkSim) {
    this.s = (sim.seed ?? 12345) >>> 0;
    inner.onOpen = () => this.onOpen?.();
    inner.onClose = (r) => this.onClose?.(r);
    inner.onMessage = (buf) => {
      if (this.rnd() < sim.loss) {
        this.dropped.in++;
        return;
      }
      const at = Math.max(this.lastDeliverIn + 0.01, performance.now() + this.delay());
      this.lastDeliverIn = at;
      setTimeout(() => this.onMessage?.(buf), Math.max(0, at - performance.now()));
    };
  }
  get open(): boolean {
    return this.inner.open;
  }
  private rnd(): number {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s / 0xffffffff;
  }
  private delay(): number {
    return this.sim.latencyMs + (this.rnd() * 2 - 1) * this.sim.jitterMs;
  }
  send(buf: ArrayBuffer): void {
    if (this.rnd() < this.sim.loss) {
      this.dropped.out++;
      return;
    }
    // preserve ordering (TCP semantics) while adding delay
    const at = Math.max(this.lastDeliverOut + 0.01, performance.now() + this.delay());
    this.lastDeliverOut = at;
    setTimeout(() => this.inner.send(buf), Math.max(0, at - performance.now()));
  }
  close(): void {
    this.inner.close();
  }
}
