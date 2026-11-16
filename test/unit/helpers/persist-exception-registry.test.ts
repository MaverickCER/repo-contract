import { describe, it } from "vitest"

describe("R2x registry persistence", () => {
  it.todo("reconcileAndPersistExceptionRegistry writes a stub for each new finding")
  it.todo("reconcileAndPersistExceptionRegistry keeps a stale record and reports it")
  it.todo("reconcileAndPersistExceptionRegistry creates the registry directory when missing")
  it.todo("reconcileAndPersistExceptionRegistry fails with the relative path when the write fails")
  it.todo(
    "loadAndReconcileExceptionRegistry leaves an invalid registry unchanged and lists every error",
  )
  it.todo("loadAndReconcileExceptionRegistry treats a missing file as an empty registry")
})
