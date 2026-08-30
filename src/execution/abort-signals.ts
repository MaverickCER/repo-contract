/** The composed signal, and a `dispose` to release any resources this composition holds once it's no longer needed. */
interface ComposedSignal {
  readonly signal: AbortSignal
  readonly dispose: () => void
}

/**
 * Combines multiple signals into one that aborts as soon as any input does.
 * Prefers the native `AbortSignal.any()` where available; falls back to a
 * manual composition for engines without it. `AbortSignal.any` landed in
 * Node 20.3.0 -- genuinely newer than this package's `engines.node >=20.0.0`
 * floor, so the fallback is live code for a real gap (a 20.0-20.2 patch
 * release), not dead code kept out of caution.
 *
 * The native path's `dispose` is a no-op -- `AbortSignal.any` manages its own
 * source-signal listeners internally and doesn't leak them. The manual
 * fallback's `dispose` removes the "abort" listeners it added to each input
 * `signal`; without calling it, a long-lived input (like a whole run's shared
 * `AbortSignal`, composed fresh for every check the run spawns) would
 * accumulate one permanent, never-removed listener per composed signal for
 * the rest of its own lifetime, regardless of whether that particular
 * composition ever actually needed to abort. Callers should call `dispose()`
 * once the composed signal is no longer needed, whether or not it ever
 * aborted.
 * @param signals - the signals to combine; the composed signal aborts as soon as any one of them does
 * @returns the composed signal (aborting with that input's abort reason as soon as any signal in `signals` aborts), and a `dispose` to release this composition's own resources
 */
export function composeSignals(signals: readonly AbortSignal[]): ComposedSignal {
  if (typeof AbortSignal.any === "function") {
    // Expression-bodied no-op, not `() => {}` (an empty block body trips
    // @typescript-eslint/no-empty-function): the native AbortSignal.any
    // manages its own source-signal listeners internally and doesn't leak
    // them, so there's nothing for this composition's own dispose to
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
