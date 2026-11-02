import path from "node:path"
import type * as TypeScript from "typescript"
import { listOf } from "./memo.js"
import type { TypeScriptApi, Widening } from "./types.js"

const DEFAULT_FILE = "tsconfig.json"
/** A chain of `extends` longer than this is not a real project; reading it stops here, so a cycle cannot loop. */
const MAX_CONFIGS = 64

export interface LoadCompilerOptionsInput {
  readonly ts: TypeScriptApi
  /** Reads a repo-relative file; resolves to `undefined` if it cannot be read. */
  readonly readFile: (path: string) => Promise<string | undefined>
  /** The config to read. Defaults to `tsconfig.json`, which may be absent; a named one may not. */
  readonly file?: string
}

const failure = (file: string, detail: string): { readonly because: Widening } => ({
  because: { reason: "tsconfig", file, to: "full", detail },
})

/**
 * Where an `extends` specifier lives, relative to the repository.
 * @param spec - The specifier as written.
 * @param from - The config that wrote it.
 * @returns The repo-relative path to read.
 */
function resolveExtends(spec: string, from: string): string {
  const isRelative = spec.startsWith("./") || spec.startsWith("../")
  const base = isRelative
    ? path.posix.join(path.posix.dirname(from), spec)
    : path.posix.join("node_modules", spec)
  if (base.endsWith(".json")) {
    return base
  }
  return isRelative ? `${base}.json` : `${base}/tsconfig.json`
}

const extendsOf = (config: Record<string, unknown>): string[] => {
  const value = config.extends
  const list: unknown[] = Array.isArray(value) ? value : [value]
  return list.filter((item): item is string => typeof item === "string")
}

/**
 * Reads the compiler options module resolution depends on (`paths`, `baseUrl`, ...), following
 * `extends` through the repository and `node_modules`. An import written through a path alias
 * looks like a package to the graph, so options that could not be read must widen the answer,
 * not be skipped.
 * @param input - The TypeScript API, a file reader and optionally the config to use.
 * @returns The options (absent when there is no default `tsconfig.json`), or the reason to go full.
 */
export async function loadCompilerOptions(
  input: LoadCompilerOptionsInput,
): Promise<{ readonly options?: TypeScript.CompilerOptions } | { readonly because: Widening }> {
  const { ts, readFile } = input
  const root = path.posix.normalize(input.file ?? DEFAULT_FILE)
  const configs = new Map<string, Record<string, unknown>>()
  const texts = new Map<string, string>()
  const queue: { file: string; referrer?: { file: string; spec: string } }[] = [{ file: root }]

  let read = 0
  for (let entry = queue.pop(); entry !== undefined; entry = queue.pop()) {
    const { file, referrer } = entry
    if (configs.has(file)) {
      continue
    }
    read += 1
    if (read > MAX_CONFIGS) {
      return failure(root, `extends more than ${String(MAX_CONFIGS)} configs`)
    }
    const text = await readFile(file)
    if (text === undefined) {
      if (referrer === undefined && input.file === undefined) {
        return {}
      }
      return referrer === undefined
        ? failure(file, "could not be read")
        : failure(referrer.file, `extends '${referrer.spec}', which could not be read`)
    }
    const parsed = ts.parseConfigFileTextToJson(file, text)
    // TypeScript reports a root that is not an object (`null`, `5`, `[]`) as an error, with `{}` as the config.
    if (parsed.error !== undefined) {
      return failure(file, "could not be parsed")
    }
    const config = parsed.config as Record<string, unknown>
    configs.set(file, config)
    texts.set(file, text)
    for (const spec of extendsOf(config)) {
      queue.push({ file: resolveExtends(spec, file), referrer: { file, spec } })
    }
  }

  // Nothing here reads `include` or `files`, so how names are cased only matters to TypeScript's own
  // bookkeeping; follow the platform it is running on.
  const host: TypeScript.ParseConfigHost = {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    readDirectory: () => listOf<string>(undefined),
    // Every path TypeScript asks about is absolute, because the config is given as `/<repo-relative path>`.
    fileExists: (candidate) => texts.has(candidate.slice(1)),
    readFile: (candidate) => texts.get(candidate.slice(1)),
  }
  const rootConfig = configs.get(root) ?? {}
  const parsed = ts.parseJsonConfigFileContent(
    rootConfig,
    host,
    path.posix.join("/", path.posix.dirname(root)),
    undefined,
    path.posix.join("/", root),
  )
  const references = rootConfig.references
  if (Array.isArray(references) && references.length > 0 && parsed.options.paths === undefined) {
    return failure(
      root,
      "uses project references; name the config that holds the paths with --tsconfig",
    )
  }
  return { options: parsed.options }
}
