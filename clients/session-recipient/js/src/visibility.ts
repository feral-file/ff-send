/**
 * Page visibility. A phone suspends a hidden tab within seconds, and pairing
 * sends the visitor to the Feral File app and back, so the page is routinely
 * frozen between the owner's approval and the display: timers stop, a request
 * in flight is aborted on return, and a deadline set before the freeze has
 * passed by the time the page runs again. These helpers let the waits end when
 * the visitor comes back, and let a display request tell a suspension from an
 * Art Computer that did not answer.
 *
 * Everything here is a no-op where there is no document (workers, tests, a
 * server render): the page then counts as always visible.
 */

type VisibilityDocument = {
  visibilityState: string;
  addEventListener: (type: "visibilitychange", listener: () => void) => void;
  removeEventListener: (type: "visibilitychange", listener: () => void) => void;
};

function visibilityDocument(): VisibilityDocument | undefined {
  const candidate = (globalThis as { document?: Partial<VisibilityDocument> }).document;
  if (
    candidate === undefined ||
    typeof candidate.visibilityState !== "string" ||
    typeof candidate.addEventListener !== "function" ||
    typeof candidate.removeEventListener !== "function"
  ) {
    return undefined;
  }
  return candidate as VisibilityDocument;
}

/** Whether the page is hidden right now. */
export function pageHidden(): boolean {
  return visibilityDocument()?.visibilityState === "hidden";
}

/**
 * Calls `wake` once, the next time the page turns visible. Returns the
 * unsubscribe, which is safe to call after `wake` ran.
 */
export function onPageVisible(wake: () => void): () => void {
  const doc = visibilityDocument();
  if (doc === undefined) {
    return () => undefined;
  }
  const listener = (): void => {
    if (doc.visibilityState !== "visible") {
      return;
    }
    doc.removeEventListener("visibilitychange", listener);
    wake();
  };
  doc.addEventListener("visibilitychange", listener);
  return () => {
    doc.removeEventListener("visibilitychange", listener);
  };
}

/** Resolves once the page is visible: at once when it already is. */
export function whenPageVisible(): Promise<void> {
  if (!pageHidden()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    onPageVisible(resolve);
  });
}

/**
 * Records whether the page was hidden at any moment from this call until
 * `stop`. `wasHidden` stays readable after `stop`.
 */
export function watchPageHidden(): { wasHidden: () => boolean; stop: () => void } {
  const doc = visibilityDocument();
  let hidden = doc?.visibilityState === "hidden";
  if (doc === undefined) {
    return { wasHidden: () => false, stop: () => undefined };
  }
  const listener = (): void => {
    if (doc.visibilityState === "hidden") {
      hidden = true;
    }
  };
  doc.addEventListener("visibilitychange", listener);
  return {
    wasHidden: () => hidden,
    stop: () => {
      doc.removeEventListener("visibilitychange", listener);
    }
  };
}
