/**
 * An environment safe to spawn `git` in when the caller's own `cwd` argument must be authoritative
 * -- strips every `GIT_*` variable git itself sets when invoking a hook from a worktree of a bare
 * repository (`GIT_DIR` chief among them, e.g. `<bare-repo>/worktrees/<name>`; confirmed directly
 * with a minimal bare-repo-plus-worktree-plus-pre-push-hook reproduction). `GIT_DIR` overrides
 * `cwd`-based repository discovery entirely -- not a fallback, discovery never runs once it's set
 * -- so `runGit`'s own `cwd` parameter (see diff-files.ts) silently stopped being authoritative
 * whenever this repository's own self-hosting checks ran through its real pre-push hook rather
 * than a plain manual invocation, which happened not to matter for the self-hosting case (the
 * inherited `GIT_DIR` and `cwd` coincidentally named the same repository) but broke every
 * git-fixture test that calls `runApiContractCheck`/`readBranchCommits`/`listChangedFiles` against
 * a deliberately different, isolated scratch repository.
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
