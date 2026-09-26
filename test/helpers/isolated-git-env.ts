/**
 * A safe-to-spawn-git-in environment for a disposable fixture repository at `root`.
 *
 * Strips every `GIT_*` variable git itself sets when invoking a hook from a worktree of a bare
 * repository -- `GIT_DIR` chief among them, e.g. `<bare-repo>/worktrees/<name>` (confirmed
 * directly: a minimal bare-repo-plus-worktree reproduction shows git setting exactly this before
 * running `.githooks/pre-push`). `GIT_DIR` overrides `cwd`-based repository discovery entirely --
 * it is not merely a fallback -- so a fixture's own `execFileSync("git", [...], { cwd: root })`
 * silently operated on the outer repository's real `.git` instead of `root` whenever this suite
 * ran through a real `git push` (which invokes the pre-push hook, which runs `npm run contract`,
 * which inherits this environment down through every spawned subprocess) rather than a plain
 * manual `npm run contract`. This is what actually caused a real, repeated corruption of this
 * repository's own local branches during development -- fixture commits ("add baseline",
 * "establish baseline", ...) landing on the real checkout's `main`/feature branch. Adding
 * `GIT_CEILING_DIRECTORIES` alone (a prior, incomplete fix attempt) only guards against upward
 * repository *discovery*; it does nothing once `GIT_DIR` is explicitly set, since discovery never
 * happens at all in that case.
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
