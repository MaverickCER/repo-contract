import ts from "typescript"
import { computeAffected } from "../../../src/affected/index.js"
import type { AffectedOptions, AffectedResult, ChangedFile } from "../../../src/affected/index.js"

export type Project = Readonly<Record<string, string>>

/**
 * Runs the affected analysis over a virtual before/after project. The diff is derived from the two
 * maps, so a scenario reads as "this tree, then this tree" and nothing else.
 * @param before - Module and non-module files at the base.
 * @param after - The same at the working tree.
 * @param options - Analysis options.
 * @returns The analysis result.
 */
export function affected(
  before: Project,
  after: Project,
  options?: AffectedOptions,
): AffectedResult {
  const changed: ChangedFile[] = []
  const baseFiles = new Map<string, string>()
  for (const [path, content] of Object.entries(after)) {
    if (!(path in before)) {
      changed.push({ path, kind: "added" })
    } else if (before[path] !== content) {
      changed.push({ path, kind: "modified" })
      baseFiles.set(path, before[path] ?? "")
    }
  }
  for (const [path, content] of Object.entries(before)) {
    if (!(path in after)) {
      changed.push({ path, kind: "deleted" })
      baseFiles.set(path, content)
    }
  }
  const files = new Map(Object.entries(after).filter(([path]) => /\.[cm]?[jt]sx?$/.test(path)))
  return computeAffected({
    ts,
    files,
    baseFiles,
    changed,
    ...(options === undefined ? {} : { options }),
  })
}
