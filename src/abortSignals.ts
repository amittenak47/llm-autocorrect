export function anySignal(signals: AbortSignal[]): AbortSignal {
  return typeof AbortSignal.any === "function" ? AbortSignal.any(signals) : anySignalFallback(signals);
}

export function anySignalFallback(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const onAbort = (event: Event) => abort(event.target as AbortSignal);
  const abort = (signal: AbortSignal) => {
    controller.abort(signal.reason);
    for (const input of signals) {
      input.removeEventListener("abort", onAbort);
    }
  };
  const alreadyAborted = signals.find((signal) => signal.aborted);
  if (alreadyAborted) {
    abort(alreadyAborted);
  } else {
    for (const signal of signals) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }
  return controller.signal;
}
