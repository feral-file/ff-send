import type { DisplayDeviceStatus, DisplayGrantSession, EphemeralBrowserSession } from "@feralfile/display";

export type StatusView = {
  pairing: string;
  device: string;
  checkedAt?: number;
};

type StatusDependencies = {
  readSession: () => Promise<EphemeralBrowserSession | undefined>;
  query: (session: DisplayGrantSession) => Promise<DisplayDeviceStatus>;
  render: (view: StatusView) => void;
  visible: () => boolean;
};

/** Polls only a stored grant; pairing is always an explicit visitor action. */
export function createStatusMonitor(deps: StatusDependencies): {
  refresh: () => Promise<void>;
  pause: () => void;
  resume: () => void;
} {
  let pending = false;
  let paused = false;
  let generation = 0;

  async function refresh(): Promise<void> {
    if (pending || paused || !deps.visible()) {
      return;
    }
    pending = true;
    const current = generation;
    let pairing = "Storage unavailable";
    try {
      const session = await deps.readSession();
      if (current !== generation) {
        return;
      }
      pairing = session === undefined ? "Not paired" : "Paired";
      if (session?.kind !== "displayGrant") {
        deps.render({ pairing, device: session === undefined ? "Pair to read device status." : "Device status requires a relay v2 display grant." });
        return;
      }
      pairing = `Paired with ${session.deviceId}`;
      const status = await deps.query(session);
      if (current === generation) {
        deps.render({ pairing, device: `Screen rotation: ${status.screenRotation}`, checkedAt: Date.now() });
      }
    } catch (error) {
      if (current === generation) {
        deps.render({ pairing, device: error instanceof Error ? error.message : "Could not read device status." });
      }
    } finally {
      pending = false;
    }
  }

  return {
    refresh,
    pause: () => {
      paused = true;
      generation += 1;
    },
    resume: () => {
      paused = false;
      void refresh();
    }
  };
}
