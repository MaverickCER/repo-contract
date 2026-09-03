import { spawn, spawnSync } from "node:child_process"
import type { SpawnSyncReturns } from "node:child_process"
import { afterEach, describe, expect, it, vi } from "vitest"
import { killTree, shouldSpawnDetached } from "../../../src/execution/process-tree.js"

/** Waits for a process to actually exit (real event, not a timer) so tests never race the OS's own async teardown. */
function waitForExit(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve) => {
    child.once("exit", () => {
      resolve()
    })
  })
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Temporarily overrides `process.platform` for one test, restoring the real value afterward. `process.platform` is a configurable value property, so redefining it is safe and does not require mocking `child_process` itself. */
function withPlatform<T>(platform: NodeJS.Platform, run: () => T): T {
  const original = Object.getOwnPropertyDescriptor(process, "platform")!
  Object.defineProperty(process, "platform", { value: platform, configurable: true })
  try {
    return run()
  } finally {
    Object.defineProperty(process, "platform", original)
  }
}

describe("shouldSpawnDetached", () => {
  it("reflects the real, unmodified platform by construction", () => {
    expect(shouldSpawnDetached()).toBe(process.platform !== "win32")
  })

  it("is false specifically on win32", () => {
    withPlatform("win32", () => {
      expect(shouldSpawnDetached()).toBe(false)
    })
  })

  it("is true on a representative non-win32 platform", () => {
    withPlatform("linux", () => {
      expect(shouldSpawnDetached()).toBe(true)
    })
  })
})

describe("killTree", () => {
  it("kills a real single process", async () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], {
      detached: shouldSpawnDetached(),
    })
    await new Promise((resolve) => child.once("spawn", resolve))
    expect(child.pid).toBeDefined()

    // killProcessTree (Windows-only; a no-op without it, see RepoContractConfig.killProcessTree's
    // doc comment) is supplied here since this test's own point is "killTree actually terminates
    // the process on any platform," not the documented no-capability fallback -- that fallback
    // gets its own dedicated coverage below.
    killTree(child.pid!, "SIGKILL", spawnSync)
    await waitForExit(child)

    expect(isAlive(child.pid!)).toBe(false)
  })

  it("kills an entire real process tree -- a grandchild spawned by the killed process is also gone", async () => {
    // Parent spawns a grandchild (also node), then both sleep. Killing only
    // the parent PID (not the tree) would leave the grandchild orphaned.
    const script = `
      const { spawn } = require("child_process")
      const grandchild = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"])
      process.stdout.write(String(grandchild.pid) + "\\n")
      setTimeout(() => {}, 30000)
    `
    const child = spawn(process.execPath, ["-e", script], { detached: shouldSpawnDetached() })
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
    expect(Number.isInteger(grandchildPid)).toBe(true)
    // Give the grandchild a brief moment to fully register before killing.
    await new Promise((resolve) => setTimeout(resolve, 100))

    // See the single-process test above for why killProcessTree is supplied here.
    killTree(child.pid!, "SIGKILL", spawnSync)
    await waitForExit(child)
    // Grandchild cleanup is async at the OS level; poll briefly rather than
    // asserting immediately.
    const deadline = Date.now() + 5000
    while (isAlive(grandchildPid) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    expect(isAlive(grandchildPid)).toBe(false)
  })

  describe("invalid pid guard", () => {
    // In an afterEach so the spy is restored even if an assertion above throws.
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it("refuses pid 0, negative, and non-integer pids without ever calling process.kill -- 0 would signal the host's own group", () => {
      const killSpy = vi.spyOn(process, "kill")
      for (const bad of [0, -1, -12345, 1.5, Number.NaN]) {
        expect(() => {
          killTree(bad, "SIGTERM")
        }).not.toThrow()
      }
      expect(killSpy).not.toHaveBeenCalled()
    })
  })

  it("is a no-op, not a throw, for a PID that has already exited", async () => {
    const child = spawn(process.execPath, ["-e", "process.exit(0)"], {
      detached: shouldSpawnDetached(),
    })
    await new Promise((resolve) => child.once("exit", resolve))
    expect(child.pid).toBeDefined()

    expect(() => {
      killTree(child.pid!, "SIGTERM")
    }).not.toThrow()
  })

  // EPERM (signaling a process owned by another user) and other unexpected
  // process.kill errors can't be triggered for real in CI without
  // cross-user permissions -- the one narrow, justified mock in this suite,
  // isolated to exactly this error-classification behavior rather than
  // mocking child_process itself.
  // Forces the win32 branch via withPlatform so this suite can verify the JS-level
  // killProcessTree call-through contract on any OS -- the real taskkill behavior itself is
  // exercised only on a real Windows runner, by test/unit/cross-platform/windows-taskkill.test.ts.
  describe("killProcessTree capability (forced win32)", () => {
    it("is a documented no-op -- never throws, never calls anything -- when killProcessTree is omitted", () => {
      withPlatform("win32", () => {
        expect(() => {
          killTree(12345, "SIGTERM")
        }).not.toThrow()
      })
    })

    it("calls the supplied killProcessTree with taskkill's command/args and reads its .error", () => {
      withPlatform("win32", () => {
        const calls: { command: string; args: readonly string[] }[] = []
        const fakeKillProcessTree = (command: string, args: readonly string[]) => {
          calls.push({ command, args })
          return { error: undefined } as SpawnSyncReturns<Buffer>
        }

        killTree(12345, "SIGTERM", fakeKillProcessTree)

        expect(calls).toEqual([{ command: "taskkill", args: ["/pid", "12345", "/t", "/f"] }])
      })
    })

    it("rethrows killProcessTree's own result.error (a JS-level spawn failure)", () => {
      withPlatform("win32", () => {
        const spawnFailure = new Error("taskkill ENOENT")
        const failingKillProcessTree = () => ({ error: spawnFailure }) as SpawnSyncReturns<Buffer>

        expect(() => {
          killTree(12345, "SIGTERM", failingKillProcessTree)
        }).toThrow(spawnFailure)
      })
    })
  })

  describe.skipIf(process.platform === "win32")(
    "process.kill error classification (mocked -- EPERM is not reproducible in CI)",
    () => {
      afterEach(() => {
        vi.restoreAllMocks()
      })

      it("swallows EPERM rather than throwing", () => {
        vi.spyOn(process, "kill").mockImplementation(() => {
          const error = new Error("kill EPERM") as NodeJS.ErrnoException
          error.code = "EPERM"
          throw error
        })

        expect(() => {
          killTree(12345, "SIGTERM")
        }).not.toThrow()
      })

      it("rethrows an unexpected error code rather than swallowing it", () => {
        vi.spyOn(process, "kill").mockImplementation(() => {
          const error = new Error("kill EINVAL") as NodeJS.ErrnoException
          error.code = "EINVAL"
          throw error
        })

        expect(() => {
          killTree(12345, "SIGTERM")
        }).toThrow("kill EINVAL")
      })

      it("rethrows a thrown value that carries a code property but is not an Error instance -- classification requires both", () => {
        vi.spyOn(process, "kill").mockImplementation(() => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately not an Error instance, to prove isErrnoException requires both `instanceof Error` and a `code` property, not either alone.
          throw { code: "ESRCH" }
        })

        expect(() => {
          killTree(12345, "SIGTERM")
        }).toThrow()
      })
    },
  )
})
