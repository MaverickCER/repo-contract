---
"repo-contract": minor
---

Four new commands guard the project's files and the run's memory: `mutation run`, `except`, `exceptions` and `npm-script`. `quick-start` and `loadExceptionRegistry` gain the same guards.

- **`mutation run` deletes only inside the project.** It deletes Stryker's `tempDirName`, `incrementalFile` and `jsonReporter.fileName` before a cold run. It refuses an empty name, `.`, `..`, an absolute path, and a path that climbs out of the project. A path through a symbolic link that leads out counts as outside. On a refused path the run exits 1, runs nothing and deletes nothing.
- **`mutation run --no-patch-vitest-runner`, and `mutation({ patchVitestRunner: false })`.** By default the run patches `@stryker-mutator/vitest-runner` on Vitest 5. The patch changes its test-name separator to `' > '` (stryker-js#6210). The option leaves `node_modules` as installed.
- **The patch touches only an install inside the project.** A runner hoisted to a parent directory, or linked in from outside, is left untouched. The run prints a note naming it.
- **`except` writes only a registry it could read.** On a registry that fails to parse, it exits 1 and names the file. The file stays byte-identical.
- **`exceptions` never follows a symbolic link or quotes a registry.** `readExceptionRegistries`, which it calls, lists a symlinked or non-regular `*.json` as skipped. Each reason names an error code or a shape, never the file's bytes.
- **`loadExceptionRegistry` no longer follows a symbolic link.** It refuses a symlinked registry, and takes an `isSymlink` option like `writeExceptionRegistry`. Its JSON errors no longer quote the file's bytes; they keep the line and column.
- **`npm-script` keeps the last 65,536 characters of each output stream.** A timeout that finds the process group already gone counts the script as stopped.
- **`quick-start` no longer holds a README command's whole output.** It keeps the last 65,536 characters, as `npm-script` does. A timeout that finds the process group already gone no longer throws.
- **`repo-contract doctor` no longer reports a false all-clear outside a git repository.** When `git ls-files` fails, it exits 1 with "git cannot list the tracked files" instead of printing "Nothing to change." With `--json` it prints `{ schemaVersion, error }` on stdout instead.
- **A `-C` path that is not a usable directory is named.** Every command that takes `-C` checks the path first. It exits 1 through the command's usual failure line or JSON error, never a raw ENOENT, a stack trace or an empty result. The message is one of three:
  - `the directory <dir> does not exist`: nothing is at the path.
  - `<dir> is not a directory`: a file or other non-directory is there.
  - `cannot read the directory <dir>: <code>`: the check failed with an error code, such as `ENAMETOOLONG` or `ELOOP`, or the process may not list or enter the directory (`EACCES`).
