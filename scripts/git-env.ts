/**
 * An environment safe to spawn `git` in when the caller's `cwd` argument must be authoritative.
 * It strips every `GIT_*` variable git sets when it invokes a hook from a worktree of a bare
 * repository. `GIT_DIR` is chief among them (e.g. `<bare-repo>/worktrees/<name>`). A minimal
 * reproduction (a bare repository, a worktree and a pre-push hook) shows it.
 *
 * `GIT_DIR` overrides `cwd`-based repository discovery entirely. It is not a fallback: discovery
 * never runs once it's set. Without this environment, `runGit`'s `cwd` parameter (see
 * diff-files.ts) stops being authoritative when this repository's checks run through its pre-push
 * hook. The self-hosting checks are unaffected: the inherited `GIT_DIR` and `cwd` name the same
 * repository. Every git-fixture test that targets a separate scratch repository breaks (such as
 * those calling `readBranchCommits`/`listChangedFiles`).
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
