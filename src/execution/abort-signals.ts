/** The composed signal, and a `dispose` to release any resources this composition holds once it's no longer needed. */
interface ComposedSignal {
  readonly signal: AbortSignal
  readonly dispose: () => void
}

/**
 * Combines multiple signals into one that aborts as soon as any input does.
 * Prefers the native `AbortSignal.any()` where available; falls back to a
 * manual composition for engines without it. `AbortSignal.any` landed in
 * Node 20.3.0, inside this package's `engines.node >=22.0.0` floor, so on every
 * supported Node the native path runs. The manual fallback is kept as defence
 * in depth for a host that removes or shims the global, and stays unit-tested.
 *
 * The native path's `dispose` is a no-op: `AbortSignal.any` manages its own
 * source-signal listeners internally and doesn't leak them. The manual
 * fallback's `dispose` removes the "abort" listeners it added to each input
 * `signal`. Without it, a long-lived input would keep one listener per
 * composed signal for the rest of its lifetime, whether or not that
 * composition ever aborted. A whole run's shared `AbortSignal`, composed
 * fresh for every check the run spawns, is such an input. Callers should call `dispose()`
 * once the composed signal is no longer needed, whether or not it ever
 * aborted.
 * @param signals - the signals to combine; the composed signal aborts as soon as any one of them does
 * @returns the composed signal (aborting with that input's abort reason as soon as any signal in `signals` aborts), and a `dispose` to release this composition's own resources
 */
export function composeSignals(signals: readonly AbortSignal[]): ComposedSignal {
  if (typeof AbortSignal.any === "function") {
    // Expression-bodied no-op, not `() => {}`: an empty block body trips
    // @typescript-eslint/no-empty-function. The native AbortSignal.any
    // manages its own source-signal listeners internally and doesn't leak
    // them. So there's nothing for this composition's own dispose to
    // release.
    return { signal: AbortSignal.any(signals as AbortSignal[]), dispose: () => undefined }
  }
  const controller = new AbortController()
  const attached: { signal: AbortSignal; listener: () => void }[] = []
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      break
    }
    const listener = (): void => {
      controller.abort(signal.reason)
    }
    signal.addEventListener("abort", listener)
    attached.push({ signal, listener })
  }
  return {
    signal: controller.signal,
    dispose: () => {
      for (const { signal, listener } of attached) signal.removeEventListener("abort", listener)
    },
  }
}
