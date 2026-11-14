/**
 * An environment safe to spawn `git` in when the caller's own `cwd` argument must be authoritative.
 * It strips every `GIT_*` variable git itself sets when invoking a hook from a worktree of a bare
 * repository. `GIT_DIR` is chief among them (e.g. `<bare-repo>/worktrees/<name>`). This was
 * confirmed directly with a minimal bare-repo-plus-worktree-plus-pre-push-hook reproduction.
 *
 * `GIT_DIR` overrides `cwd`-based repository discovery entirely. It is not a fallback: discovery
 * never runs once it's set. `runGit`'s own `cwd` parameter (see diff-files.ts) therefore silently
 * stopped being authoritative in one situation. The situation was this repository's own
 * self-hosting checks running through its real pre-push hook, not a plain manual invocation.
 * This happened
 * not to matter for the self-hosting case. The inherited `GIT_DIR` and `cwd`
 * coincidentally named the same repository. It did break every git-fixture test (such as those
 * calling `readBranchCommits`/`listChangedFiles`) that targets a deliberately different, isolated
 * scratch repository.
 * @returns an environment object safe to pass as `execFile`'s/`execFileSync`'s `env`.
 */
export function gitSpawnEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.GIT_DIR
  delete env.GIT_WORK_TREE
  delete env.GIT_INDEX_FILE
  delete env.GIT_COMMON_DIR
  delete env.GIT_OBJECT_DIRECTORY
  delete env.GIT_ALTERNATE_OBJECT_DIRECTORIES
  return env
}
