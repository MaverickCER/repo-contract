import { afterEach, describe, expect, it, vi } from "vitest"
import { composeSignals } from "../../../src/execution/abort-signals.js"

/** Temporarily removes the native `AbortSignal.any` so a test can exercise `composeSignals`'s manual-composition fallback path (the real gap between this package's `engines.node >=20.0.0` floor and `AbortSignal.any`'s actual Node 20.3.0 debut), then restores it -- isolated here so the `delete`'s type-unsafety is suppressed in exactly one place. */
function withoutNativeAbortSignalAny(run: () => void): void {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- reads and later restores a reference to a static function (not a `this`-using instance method); never called detached from AbortSignal.
  const original: typeof AbortSignal.any = AbortSignal.any
  const mutableAbortSignal = AbortSignal as unknown as Record<string, unknown>
  delete mutableAbortSignal.any
  try {
    run()
  } finally {
    AbortSignal.any = original
  }
}

describe("composeSignals", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns a signal that is not aborted when none of the inputs are aborted", () => {
    const a = new AbortController()
    const b = new AbortController()
    const { signal } = composeSignals([a.signal, b.signal])
    expect(signal.aborted).toBe(false)
  })

  it("aborts as soon as the first input signal aborts", () => {
    const a = new AbortController()
    const b = new AbortController()
    const { signal } = composeSignals([a.signal, b.signal])

    a.abort("a aborted")

    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe("a aborted")
  })

  it("aborts when a later input signal aborts, not just the first", () => {
    const a = new AbortController()
    const b = new AbortController()
    const { signal } = composeSignals([a.signal, b.signal])

    b.abort("b aborted")

    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe("b aborted")
  })

  it("is immediately aborted if any input signal is already aborted at composition time", () => {
    const a = new AbortController()
    a.abort("already gone")
    const b = new AbortController()

    const { signal } = composeSignals([a.signal, b.signal])

    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe("already gone")
  })

  it("works with a single input signal", () => {
    const a = new AbortController()
    const { signal } = composeSignals([a.signal])
    expect(signal.aborted).toBe(false)
    a.abort()
    expect(signal.aborted).toBe(true)
  })

  it("uses the native AbortSignal.any when available", () => {
    const a = new AbortController()
    const b = new AbortController()
    const spy = vi.spyOn(AbortSignal, "any")

    composeSignals([a.signal, b.signal])

    expect(spy).toHaveBeenCalledWith([a.signal, b.signal])
  })

  it("the native path's dispose is a callable no-op", () => {
    const a = new AbortController()
    const { dispose } = composeSignals([a.signal])
    expect(() => {
      dispose()
    }).not.toThrow()
  })

  it("falls back to manual composition when AbortSignal.any is unavailable -- exercises the pre-20.3 Node code path", () => {
    withoutNativeAbortSignalAny(() => {
      const a = new AbortController()
      const b = new AbortController()
      const { signal } = composeSignals([a.signal, b.signal])

      expect(signal.aborted).toBe(false)
      b.abort("fallback path")
      expect(signal.aborted).toBe(true)
      expect(signal.reason).toBe("fallback path")
    })
  })

  it("the fallback path is also immediately-aborted-aware for an already-aborted input", () => {
    withoutNativeAbortSignalAny(() => {
      const a = new AbortController()
      a.abort("pre-aborted")
      const { signal } = composeSignals([a.signal])
      expect(signal.aborted).toBe(true)
      expect(signal.reason).toBe("pre-aborted")
    })
  })

  it("the fallback path's dispose stops the composed signal from reacting to a later input abort", () => {
    withoutNativeAbortSignalAny(() => {
      const a = new AbortController()
      const { signal, dispose } = composeSignals([a.signal])

      dispose()
      a.abort("after dispose")

      // dispose() removed this composition's own "abort" listener from
      // `a.signal` before it ever fired, so the composed signal never learns
      // of the abort -- the input signal itself still aborts normally either
      // way, dispose only detaches this composition's own listener from it.
      expect(a.signal.aborted).toBe(true)
      expect(signal.aborted).toBe(false)
    })
  })
})
