import { describe, expect, it } from "vitest"
import { scopedEnv } from "../../../scripts/contract-env.mjs"

describe("scopedEnv()", () => {
  it("keeps the shell's furniture, Node's settings, CI metadata and the two tokens, and nothing else", () => {
    const env = scopedEnv({
      PATH: "/usr/bin",
      HOME: "/home/me",
      NODE_OPTIONS: "--max-old-space-size=4096",
      GITHUB_ACTIONS: "true",
      npm_config_cache: "/tmp/npm",
      GH_TOKEN: "t",
      SOCKET_SECURITY_API_KEY: "k",
      NPM_TOKEN: "secret",
      AWS_SECRET_ACCESS_KEY: "secret",
      MY_APP_DATABASE_URL: "postgres://",
      SystemRoot: "C:\\Windows",
    })
    expect(env).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/me",
      NODE_OPTIONS: "--max-old-space-size=4096",
      GITHUB_ACTIONS: "true",
      npm_config_cache: "/tmp/npm",
      GH_TOKEN: "t",
      SOCKET_SECURITY_API_KEY: "k",
      SystemRoot: "C:\\Windows",
    })
  })

  it("drops undefined values, as a spawned process cannot receive them", () => {
    expect(scopedEnv({ PATH: undefined, HOME: "/h" })).toEqual({ HOME: "/h" })
  })
})
