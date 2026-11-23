/**
 * A stand-in for the part of `document` the library reads for page
 * visibility. `install` puts it on `globalThis`; `uninstall` restores what was
 * there.
 */
export class FakeVisibility {
  public visibilityState: "visible" | "hidden" = "visible";
  private readonly listeners = new Set<() => void>();
  private previous: PropertyDescriptor | undefined;

  public addEventListener(type: string, listener: () => void): void {
    if (type === "visibilitychange") {
      this.listeners.add(listener);
    }
  }

  public removeEventListener(type: string, listener: () => void): void {
    if (type === "visibilitychange") {
      this.listeners.delete(listener);
    }
  }

  /** Listeners still attached: a wait that ended must have removed its own. */
  public get listenerCount(): number {
    return this.listeners.size;
  }

  public hide(): void {
    this.set("hidden");
  }

  public show(): void {
    this.set("visible");
  }

  public install(): this {
    this.previous = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "document", { configurable: true, value: this });
    return this;
  }

  public uninstall(): void {
    if (this.previous === undefined) {
      Reflect.deleteProperty(globalThis, "document");
    } else {
      Object.defineProperty(globalThis, "document", this.previous);
    }
  }

  private set(state: "visible" | "hidden"): void {
    this.visibilityState = state;
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
