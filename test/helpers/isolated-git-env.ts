/**
 * A safe-to-spawn-git-in environment for a disposable fixture repository at `root`.
 *
 * Strips every `GIT_*` variable git itself sets when invoking a hook from a worktree of a bare
 * repository: `GIT_DIR` chief among them, e.g. `<bare-repo>/worktrees/<name>` (confirmed
 * directly: a minimal bare-repo-plus-worktree reproduction shows git setting exactly this before
 * running `.githooks/pre-push`). `GIT_DIR` overrides `cwd`-based repository discovery entirely; it
 * is not a fallback. A `git push` runs the pre-push hook, which runs `npm run contract`, and every
 * spawned subprocess inherits that environment. So under a push, a fixture's
 * `execFileSync("git", [...], { cwd: root })` operated on the outer repository's `.git` instead of
 * `root`. A manual `npm run contract` did not show the problem. This caused repeated corruption of
 * this repository's local branches during development: fixture commits ("add baseline", "establish
 * baseline", ...) landed on the checkout's `main`/feature branch. Adding `GIT_CEILING_DIRECTORIES`
 * alone (a prior, incomplete fix attempt) only guards against upward repository *discovery*. It
 * does nothing once `GIT_DIR` is set, since discovery never happens in that case.
 * @param root - the fixture's own isolated repository root.
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
