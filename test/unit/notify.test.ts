import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { notify } from "../../src/notify.js"

describe("notify", () => {
  let rejections: unknown[]
  const onRejection = (reason: unknown): void => {
    rejections.push(reason)
  }
  beforeEach(() => {
    rejections = []
    process.on("unhandledRejection", onRejection)
  })
  afterEach(() => {
    process.off("unhandledRejection", onRejection)
  })
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 20))

  it("tells the hook exactly what it was given, once", () => {
    const hook = vi.fn()
    notify(hook, "check", { a: 1 }, 3)
    expect(hook).toHaveBeenCalledTimes(1)
    expect(hook).toHaveBeenCalledWith("check", { a: 1 }, 3)
  })

  it("does nothing, and does not throw, when nobody asked to be told", () => {
    expect(() => {
      notify<[string]>(undefined, "check")
    }).not.toThrow()
    expect(() => {
      notify()
    }).not.toThrow()
  })

  it("ignores a hook that throws", () => {
    expect(() => {
      notify((_id: string) => {
        throw new Error("a broken reporter")
      }, "x")
    }).not.toThrow()
  })

  it("ignores an async hook that rejects, which would otherwise be an unhandled rejection", async () => {
    notify(() => Promise.reject(new Error("a broken async reporter")))
    notify(async () => {
      await Promise.resolve()
      throw new Error("another one")
    })
    await settle()
    expect(rejections).toEqual([])
  })

  it("does not wait for an async hook, and never reads what a hook returns", async () => {
    let finished = false
    notify(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      finished = true
    })
    expect(finished).toBe(false)
    notify(() => "a value")
    notify(() => ({ then: () => undefined }))
    await settle()
    expect(finished).toBe(true)
  })
})
