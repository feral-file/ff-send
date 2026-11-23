import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onPageVisible, pageHidden, watchPageHidden, whenPageVisible } from "../src/visibility.js";
import { FakeVisibility } from "./fakeVisibility.js";

describe("page visibility without a document", () => {
  it("counts the page as always visible", async () => {
    expect(pageHidden()).toBe(false);
    await whenPageVisible();
    const watch = watchPageHidden();
    expect(watch.wasHidden()).toBe(false);
    watch.stop();
    const wake = vi.fn();
    onPageVisible(wake)();
    expect(wake).not.toHaveBeenCalled();
  });
});

describe("page visibility", () => {
  let page: FakeVisibility;

  beforeEach(() => {
    page = new FakeVisibility().install();
  });

  afterEach(() => {
    page.uninstall();
  });

  it("wakes once when the page turns visible, and not when it hides", () => {
    const wake = vi.fn();
    onPageVisible(wake);
    page.hide();
    expect(wake).not.toHaveBeenCalled();
    page.show();
    page.hide();
    page.show();
    expect(wake).toHaveBeenCalledTimes(1);
    expect(page.listenerCount).toBe(0);
  });

  it("does not wake after unsubscribing", () => {
    const wake = vi.fn();
    const stop = onPageVisible(wake);
    page.hide();
    stop();
    page.show();
    expect(wake).not.toHaveBeenCalled();
    expect(page.listenerCount).toBe(0);
  });

  it("resolves at once when visible and on return when hidden", async () => {
    await whenPageVisible();
    page.hide();
    let resolved = false;
    const waiting = whenPageVisible().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    page.show();
    await waiting;
    expect(resolved).toBe(true);
  });

  it("remembers a hidden spell after the page is visible again, and one that began before the watch", () => {
    const watch = watchPageHidden();
    expect(watch.wasHidden()).toBe(false);
    page.hide();
    page.show();
    expect(watch.wasHidden()).toBe(true);
    watch.stop();
    expect(watch.wasHidden()).toBe(true);
    expect(page.listenerCount).toBe(0);

    page.hide();
    expect(watchPageHidden().wasHidden()).toBe(true);
  });
});
