import { spawn } from "node:child_process"
import { describe, expect, it } from "vitest"
import { killTree } from "../../../src/execution/process-tree.js"

/**
 * Windows has no POSIX process groups, so `killTree` shells out to
 * `taskkill /pid <pid> /t /f` there instead of `process.kill(-pid, signal)`
 * (see process-tree.ts). That branch is genuinely OS-exclusive and cannot
 * be exercised on a macOS/Linux CI runner no matter how the test is
 * written -- this file only runs its assertions on `win32`, and is exercised
 * for real by the CI Windows runner (see .github/workflows/ci.yml). See
 * vitest.config.ts's coverage thresholds for the accompanying rationale.
 */
describe.skipIf(process.platform !== "win32")("killTree on Windows", () => {
  it("kills a real process tree via taskkill /t", async () => {
    const script = `
      const { spawn } = require("child_process")
      const grandchild = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"])
      process.stdout.write(String(grandchild.pid) + "\\n")
      setTimeout(() => {}, 30000)
    `
    const child = spawn(process.execPath, ["-e", script])
    await new Promise((resolve) => child.once("spawn", resolve))
    expect(child.pid).toBeDefined()

    const grandchildPid = await new Promise<number>((resolve) => {
      let buffer = ""
      child.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8")
        const match = /(\d+)/.exec(buffer)
        if (match?.[1] !== undefined) resolve(Number(match[1]))
      })
    })
    await new Promise((resolve) => setTimeout(resolve, 200))

    killTree(child.pid!, "SIGTERM")

    const isAlive = (pid: number): boolean => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    }
    const deadline = Date.now() + 5000
    while (isAlive(grandchildPid) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    expect(isAlive(grandchildPid)).toBe(false)
  })

  it("is a no-op, not a throw, for a PID taskkill cannot find", () => {
    expect(() => {
      killTree(999_999_999, "SIGTERM")
    }).not.toThrow()
  })
})
