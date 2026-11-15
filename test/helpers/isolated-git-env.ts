/**
 * A safe-to-spawn-git-in environment for a disposable fixture repository at `root`.
 *
 * Strips every `GIT_*` variable git sets when it invokes a hook from a worktree of a bare
 * repository. The main one is `GIT_DIR`, for example `<bare-repo>/worktrees/<name>`, which git
 * sets before running `.githooks/pre-push`. `GIT_DIR` overrides `cwd`-based repository discovery
 * entirely; it is not a fallback. A `git push` runs the pre-push hook, which runs
 * `npm run contract`, and every spawned subprocess inherits that environment. Without this
 * helper, a fixture's `execFileSync("git", [...], { cwd: root })` under a push operates on the
 * outer repository's `.git` instead of `root`. Fixture commits ("add baseline", ...) then land on
 * the outer checkout's branches. A manual `npm run contract` does not show the problem.
 * `GIT_CEILING_DIRECTORIES` alone is not enough: it guards only upward repository *discovery*,
 * and discovery never happens once `GIT_DIR` is set.
 * @param root - the fixture's isolated repository root.
 * @returns an environment object safe to pass as `execFileSync`'s/`spawnSync`'s `env`.
 */
export function isolatedGitEnv(root: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_CEILING_DIRECTORIES: root }
  delete env.GIT_DIR
  delete env.GIT_WORK_TREE
  delete env.GIT_INDEX_FILE
  delete env.GIT_COMMON_DIR
  delete env.GIT_OBJECT_DIRECTORY
  delete env.GIT_ALTERNATE_OBJECT_DIRECTORIES
  return env
}
