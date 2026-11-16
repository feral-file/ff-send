import { describe, expect, it, vi } from "vitest";
import { createStatusMonitor } from "../sample/status.js";
import type { DisplayDeviceStatus, DisplayGrantSession } from "@feralfile/display";

const session: DisplayGrantSession = { kind: "displayGrant", ctl: "site", deviceId: "FF1-TEST0001", persistent: true };

describe("sample device status", () => {
  it("queries fresh status only for a stored grant, skips hidden pages, and never starts pairing", async () => {
    const render = vi.fn();
    const readSession = vi.fn<() => Promise<DisplayGrantSession | undefined>>().mockResolvedValue(undefined);
    const query = vi.fn<() => Promise<DisplayDeviceStatus>>().mockResolvedValue({ screenRotation: "landscape" });
    let visible = true;
    const monitor = createStatusMonitor({ readSession, query, render, visible: () => visible });
    await monitor.refresh();
    expect(query).not.toHaveBeenCalled();
    expect(render).toHaveBeenLastCalledWith({ pairing: "Not paired", device: "Pair to read device status." });
    readSession.mockResolvedValue(session);
    await monitor.refresh();
    expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ device: "Screen rotation: landscape", checkedAt: expect.any(Number) as unknown }));
    query.mockResolvedValue({ screenRotation: "portrait" });
    await monitor.refresh();
    expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ device: "Screen rotation: portrait" }));
    visible = false;
    await monitor.refresh();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("does not overlap requests or publish a status reply after Forget", async () => {
    let finish: ((status: DisplayDeviceStatus) => void) | undefined;
    const query = vi.fn(() => new Promise<DisplayDeviceStatus>((resolve) => { finish = resolve; }));
    const render = vi.fn();
    const monitor = createStatusMonitor({ readSession: () => Promise.resolve(session), query, render, visible: () => true });
    const first = monitor.refresh();
    await vi.waitFor(() => { expect(query).toHaveBeenCalledOnce(); });
    await monitor.refresh();
    expect(query).toHaveBeenCalledOnce();
    monitor.pause();
    finish?.({ screenRotation: "portrait" });
    await first;
    expect(render).not.toHaveBeenCalled();
    await monitor.refresh();
    expect(query).toHaveBeenCalledOnce();
  });

  it("reports query and storage failures without showing a stale rotation as current", async () => {
    const render = vi.fn();
    const readSession = vi.fn().mockResolvedValue(session);
    const monitor = createStatusMonitor({ readSession, query: () => Promise.reject(new Error("device is offline")), render, visible: () => true });
    await monitor.refresh();
    expect(render).toHaveBeenLastCalledWith({ pairing: "Paired with FF1-TEST0001", device: "device is offline" });
    readSession.mockRejectedValue(new Error("storage blocked"));
    await monitor.refresh();
    expect(render).toHaveBeenLastCalledWith({ pairing: "Storage unavailable", device: "storage blocked" });
  });
});
