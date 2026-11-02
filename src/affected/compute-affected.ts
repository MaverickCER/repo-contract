import type * as TypeScript from "typescript"
import { globMatch } from "../helpers/glob-match.js"
import { analyzeModule, EMPTY_MODULE } from "./analyze-module.js"
import type { ExportTarget, ModuleInfo } from "./analyze-module.js"
import { append, listOf, memoizeBy, valuesOf } from "./memo.js"
import { Worklist } from "./worklist.js"
import { required } from "./required.js"
import {
  allKey,
  anyKey,
  changedKey,
  exportKey,
  localKey,
  opaqueKey,
  sourceKey,
  testKey,
} from "./keys.js"
import type {
  AffectedResult,
  ChangedFile,
  ComputeAffectedInput,
  LinkRule,
  Widening,
} from "./types.js"

/**
 * Whether a path names a JS/TS module the graph analyses.
 * @param path - A repo-relative path.
 * @returns True for `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs` and `.cjs` files.
 */
export const isModulePath = (path: string): boolean => MODULE_FILE.test(path)

const MODULE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/

/** Files whose change can alter how every test behaves, so nothing narrower than a full run is sound. */
export const DEFAULT_TRIGGERS: readonly string[] = [
  "**/package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "**/tsconfig*.json",
  "**/vitest*.config.*",
  "**/vitest.workspace.*",
  "**/vite.config.*",
  "**/stryker*.config.*",
  "**/.stryker*",
  "**/eslint.config.*",
  "**/repo-contract.config.*",
  ".repo-contract/**",
  ".github/**",
  ".nvmrc",
  ".node-version",
  ".npmrc",
]

/** Files that cannot influence a test and so are not worth a full run. */
export const DEFAULT_IGNORE: readonly string[] = [
  ".changeset/**",
  "CHANGELOG.md",
  "LICENSE",
  "CODEOWNERS",
]

/** Test entry points: the files a runner is asked to execute. */
export const DEFAULT_TESTS: readonly string[] = ["**/*.test.*", "**/*.spec.*"]

/** Files that are not mutation targets. */
export const DEFAULT_NOT_MUTATED: readonly string[] = [
  ...DEFAULT_TESTS,
  "**/test/**",
  "**/tests/**",
  "**/__tests__/**",
  "**/*.d.ts",
]

type Edge =
  | { readonly file: string; readonly kind: "local"; readonly local: string }
  | { readonly file: string; readonly kind: "export"; readonly as: string }
  | { readonly file: string; readonly kind: "all" }

type Event =
  | { readonly kind: "local" | "export"; readonly file: string; readonly name: string }
  | { readonly kind: "all" | "any"; readonly file: string }

/** What placing one path of a change decided: a module to analyse, a reason to go full, or neither. */
interface Placement {
  readonly module?: ChangedModule
  readonly because?: Widening
}

interface ChangedModule {
  readonly path: string
  /** Whether the module exists in the working tree (false for deleted and renamed-away paths). */
  readonly current: boolean
  /** The path to read from `baseFiles`, when the module existed at the base. */
  readonly basePath?: string
}

const matches = (path: string, patterns: readonly string[]): boolean =>
  patterns.some((pattern) => globMatch(path, pattern))

/**
 * Computes which tests (and which mutation targets) a change can affect.
 *
 * The analysis is symbol-level: each changed module is diffed against its base to find the exported
 * names whose behavior may differ, and those names are followed through the import graph --
 * including re-exports and `export *` -- to every module that uses them. Anything it cannot reason
 * about does not narrow the result: a changed file the graph cannot place, a global trigger such as
 * a lockfile, or a file that does not parse makes the whole result `"full"`, and a module that loads
 * code dynamically is treated as affected by everything. Narrowing is only ever an optimization of
 * a sound answer, never a guess.
 * @param input - Module contents, the diff, and the TypeScript compiler API.
 * @returns The affected sets, with provenance for every test (see `explainAffected`).
 */
export function computeAffected(input: ComputeAffectedInput): AffectedResult {
  return new Computation(input).run()
}

class Computation {
  private readonly ts: ComputeAffectedInput["ts"]
  private readonly triggers: readonly string[]
  private readonly ignore: readonly string[]
  private readonly tests: readonly string[]
  private readonly notMutated: readonly string[]
  private readonly links: readonly LinkRule[]
  private readonly known = new Set<string>()
  private readonly infos = new Map<string, ModuleInfo>()
  private readonly compilerOptions: TypeScript.CompilerOptions
  private readonly host: TypeScript.ModuleResolutionHost
  private readonly widened: Widening[] = []

  private readonly bindEdges = new Map<string, Edge[]>()
  private readonly nsEdges = new Map<string, Edge[]>()
  private readonly starEdges = new Map<string, string[]>()

  private readonly causes = new Map<string, string>()
  private readonly work = new Worklist<Event>()
  private readonly changedSymbols = new Set<string>()
  private readonly affectedFiles = new Map<string, { cause: string; hops: number }>()

  constructor(private readonly input: ComputeAffectedInput) {
    const { options } = input
    this.ts = input.ts
    this.triggers = options?.triggers ?? DEFAULT_TRIGGERS
    this.ignore = options?.ignore ?? DEFAULT_IGNORE
    this.tests = options?.tests ?? DEFAULT_TESTS
    this.notMutated = options?.notMutated ?? DEFAULT_NOT_MUTATED
    this.links = listOf(options?.links)
    this.compilerOptions = {
      module: input.ts.ModuleKind.ESNext,
      moduleResolution: input.ts.ModuleResolutionKind.Bundler,
      ...input.compilerOptions,
    }
    for (const path of input.files.keys()) {
      this.known.add(path)
    }
    // Only which files exist matters to module resolution: package manifests are not read, and
    // TypeScript assumes a directory exists when the host does not say.
    this.host = {
      fileExists: (path) => this.known.has(strip(path)),
      readFile: () => undefined,
    }
  }

  run(): AffectedResult {
    if (this.input.fullBecause !== undefined) {
      return this.fullResult(this.input.fullBecause)
    }
    const classified = this.classify()
    if ("because" in classified) {
      return this.fullResult(classified.because)
    }
    const { modules, linked } = classified
    // A deleted or renamed-away module still exists as far as the importers' base form is concerned.
    for (const path of this.input.baseFiles.keys()) {
      this.known.add(path)
    }

    const analysis = this.analyzeAll(modules)
    if ("because" in analysis) {
      return this.fullResult(analysis.because)
    }
    this.buildEdges()
    for (const module of modules) {
      this.seedFromDiff(module, analysis.bases.get(module.path) ?? EMPTY_MODULE)
    }
    this.drain()

    const opaqueTests = modules.length > 0 || linked.length > 0 ? this.widenForDynamicLoads() : []
    return this.assemble(modules, linked, opaqueTests)
  }

  /**
   * Parses every current module and the base form of every changed one.
   * @param modules - The changed modules.
   * @returns The base analyses by path, or the reason to go full if anything fails to parse.
   */
  private analyzeAll(
    modules: readonly ChangedModule[],
  ): { readonly because: Widening } | { readonly bases: Map<string, ModuleInfo> } {
    for (const [path, content] of this.input.files) {
      const info = analyzeModule(this.ts, path, content)
      if (info.parseError) {
        return { because: { reason: "parse-error", file: path, to: "full" } }
      }
      this.infos.set(path, info)
    }
    const bases = new Map<string, ModuleInfo>()
    for (const module of modules) {
      if (module.basePath === undefined) {
        continue
      }
      const info = analyzeModule(
        this.ts,
        module.basePath,
        required(this.input.baseFiles, module.basePath),
      )
      if (info.parseError) {
        return { because: { reason: "parse-error", file: module.basePath, to: "full" } }
      }
      bases.set(module.path, info)
    }
    return { bases }
  }

  /**
   * A module that loads code by a non-literal specifier can depend on anything: a test of that
   * kind always runs, and a source of that kind is treated as changed in every export.
   * @returns The tests that must always run.
   */
  private widenForDynamicLoads(): string[] {
    const opaqueTests: string[] = []
    for (const [path, info] of this.infos) {
      if (!info.opaque) {
        continue
      }
      if (this.isTest(path)) {
        opaqueTests.push(path)
        this.widened.push({ reason: "dynamic-import", file: path, to: "always-run" })
      } else {
        this.widened.push({ reason: "dynamic-import", file: path, to: "all-exports" })
        this.emit({ kind: "all", file: path }, opaqueKey(path), 1)
      }
    }
    this.drain()
    return opaqueTests
  }

  /**
   * Splits the diff into module changes the graph can reason about and everything else, and
   * detects the changes that force a full run outright.
   * @returns Either the reason to go full, or the module changes and the changes linked to tests.
   */
  private classify():
    | { readonly because: Widening }
    | { readonly modules: ChangedModule[]; readonly linked: ChangedFile[] } {
    const modules: ChangedModule[] = []
    const linked: ChangedFile[] = []
    for (const change of this.input.changed) {
      const paths =
        change.renamedFrom === undefined ? [change.path] : [change.path, change.renamedFrom]
      const trigger = paths.find((path) => matches(path, this.triggers))
      if (trigger !== undefined) {
        return { because: { reason: "global-trigger", file: trigger, to: "full" } }
      }
      const isLinked = paths.some((path) => this.links.some((link) => globMatch(path, link.when)))
      if (isLinked) {
        linked.push(change)
      }
      const placements = [
        change.renamedFrom === undefined ? {} : this.placeRenamedFrom(change.renamedFrom, isLinked),
        this.placeCurrent(change, isLinked),
      ]
      for (const placement of placements) {
        if (placement.because !== undefined) {
          return { because: placement.because }
        }
        if (placement.module !== undefined) {
          modules.push(placement.module)
        }
      }
    }
    return { modules, linked }
  }

  /**
   * A changed file that is not a module is harmless only if it is ignored or linked to tests.
   * @param path - The changed file.
   * @param linked - Whether a link rule covers it.
   * @returns Nothing to record, or the reason to go full.
   */
  private placeNonModule(path: string, linked: boolean): Placement {
    return linked || matches(path, this.ignore)
      ? {}
      : { because: { reason: "unplaced-file", file: path, to: "full" } }
  }

  /**
   * Places the old path of a rename: a module that no longer exists, known only by its base.
   * @param from - The path the file had at the base.
   * @param linked - Whether a link rule covers it.
   * @returns The ghost module, nothing to record, or the reason to go full.
   */
  private placeRenamedFrom(from: string, linked: boolean): Placement {
    if (!MODULE_FILE.test(from)) {
      return this.placeNonModule(from, linked)
    }
    return this.input.baseFiles.has(from)
      ? { module: { path: from, current: false, basePath: from } }
      : { because: missingBase(from, "renamed") }
  }

  /**
   * Places the current path of a change.
   * @param change - The change.
   * @param linked - Whether a link rule covers it.
   * @returns The changed module, nothing to record, or the reason to go full.
   */
  private placeCurrent(change: ChangedFile, linked: boolean): Placement {
    const { path, kind } = change
    if (!MODULE_FILE.test(path)) {
      return this.placeNonModule(path, linked)
    }
    if (kind !== "deleted" && !this.input.files.has(path)) {
      return {
        because: {
          reason: "unplaced-file",
          file: path,
          to: "full",
          detail: "changed module was not supplied to the analysis",
        },
      }
    }
    const hasBase = kind === "modified" || kind === "deleted"
    if (hasBase && !this.input.baseFiles.has(path)) {
      return { because: missingBase(path, kind) }
    }
    return {
      module: { path, current: kind !== "deleted", ...(hasBase ? { basePath: path } : {}) },
    }
  }

  /** The module an import reaches, or {@link EXTERNAL} for a package or anything not in the project. */
  private readonly resolve = memoizeBy((from: string, specifier: string): string => {
    const result = this.ts.resolveModuleName(specifier, `/${from}`, this.compilerOptions, this.host)
    const resolved = result.resolvedModule?.resolvedFileName
    const candidate = resolved === undefined ? EXTERNAL : strip(resolved)
    return this.known.has(candidate) ? candidate : EXTERNAL
  })

  private buildEdges(): void {
    for (const [file, info] of this.infos) {
      for (const binding of info.bindings) {
        const target = this.resolve(file, binding.from)
        const edge: Edge = { file, kind: "local", local: binding.local }
        if (binding.imported === "*") {
          append(this.nsEdges, target, edge)
        } else {
          append(this.bindEdges, `${target}#${binding.imported}`, edge)
        }
      }
      for (const specifier of info.bareImports) {
        append(this.nsEdges, this.resolve(file, specifier), { file, kind: "all" })
      }
      for (const [exported, target] of info.exports) {
        if (target.kind !== "reexport") {
          continue
        }
        const resolved = this.resolve(file, target.from)
        const edge: Edge = { file, kind: "export", as: exported }
        if (target.name === "*") {
          append(this.nsEdges, resolved, edge)
        } else {
          append(this.bindEdges, `${resolved}#${target.name}`, edge)
        }
      }
      for (const specifier of info.stars) {
        append(this.starEdges, this.resolve(file, specifier), file)
      }
    }
  }

  /**
   * Emits the facts that differ between a module's base and its current form.
   * @param module - The changed module.
   * @param base - Its analysis at the base (an empty module if it did not exist).
   */
  private seedFromDiff(module: ChangedModule, base: ModuleInfo): void {
    const { path } = module
    const current = module.current ? (this.infos.get(path) ?? EMPTY_MODULE) : EMPTY_MODULE
    const root = changedKey(path)

    for (const name of new Set([...base.declText.keys(), ...current.declText.keys()])) {
      if (base.declText.get(name) !== current.declText.get(name)) {
        this.emit({ kind: "local", file: path, name }, root, 0)
      }
    }
    for (const name of new Set([...base.exports.keys(), ...current.exports.keys()])) {
      if (!sameTarget(base.exports.get(name), current.exports.get(name))) {
        this.emit({ kind: "export", file: path, name }, root, 0)
      }
    }
    const effectsChanged =
      signature(base.effects.map((effect) => effect.text)) !==
      signature(current.effects.map((effect) => effect.text))
    const loadsChanged =
      signature(base.bareImports) !== signature(current.bareImports) ||
      signature(base.stars) !== signature(current.stars)
    if (effectsChanged || loadsChanged) {
      this.widened.push({
        reason: "module-side-effect",
        file: path,
        to: "all-exports",
        detail: effectsChanged ? "top-level statement changed" : "bare import or export * changed",
      })
      this.emit({ kind: "all", file: path }, root, 0)
    }
    if (module.current) {
      this.affect(path, root, 0)
    }
  }

  private eventKey(event: Event): string {
    switch (event.kind) {
      case "local":
        return localKey(event.file, event.name)
      case "export":
        return exportKey(event.file, event.name)
      case "all":
        return allKey(event.file)
      case "any":
        return anyKey(event.file)
    }
  }

  /**
   * Queues a fact unless it is already known at an equal or smaller distance from the change.
   * @param event - The fact.
   * @param cause - Key of the fact that led to it.
   * @param hops - How many module boundaries it is from the change.
   */
  private emit(event: Event, cause: string, hops: number): void {
    const key = this.eventKey(event)
    if (this.work.offer(key, hops, event)) {
      this.causes.set(key, cause)
    }
  }

  private affect(file: string, cause: string, hops: number): void {
    const known = this.affectedFiles.get(file)
    if (known === undefined || hops < known.hops) {
      this.affectedFiles.set(file, { cause, hops })
    }
  }

  private readonly reverseOf = memoizeBy((file: string): Reverse => {
    const info = this.infos.get(file) ?? EMPTY_MODULE
    const referrers = new Map<string, string[]>()
    for (const [name, refs] of info.refs) {
      for (const ref of refs) {
        append(referrers, ref, name)
      }
    }
    return { info, referrers }
  })

  private drain(): void {
    for (let item = this.work.take(); item !== undefined; item = this.work.take()) {
      const { value: event, key, hops } = item
      switch (event.kind) {
        case "local":
          this.onLocal(event.file, event.name, key, hops)
          break
        case "export":
          this.onExport(event.file, event.name, key, hops)
          break
        case "all":
          this.onAll(event.file, key, hops)
          break
        case "any":
          this.onAny(event.file, key, hops)
          break
      }
    }
  }

  private onLocal(file: string, name: string, key: string, hops: number): void {
    const { info, referrers } = this.reverseOf(file)
    for (const other of valuesOf(referrers, name)) {
      this.emit({ kind: "local", file, name: other }, key, hops)
    }
    for (const effect of info.effects) {
      if (effect.refs.has(name)) {
        this.emit({ kind: "all", file }, key, hops)
      }
    }
    for (const exported of valuesOf(info.exportedAs, name)) {
      this.emit({ kind: "export", file, name: exported }, key, hops)
    }
  }

  private onExport(file: string, name: string, key: string, hops: number): void {
    this.changedSymbols.add(`${file}#${name}`)
    for (const edge of valuesOf(this.bindEdges, `${file}#${name}`)) {
      this.follow(edge, key, hops)
    }
    if (name !== "default") {
      for (const importer of valuesOf(this.starEdges, file)) {
        this.follow({ file: importer, kind: "export", as: name }, key, hops)
      }
    }
    this.emit({ kind: "any", file }, key, hops)
  }

  private onAny(file: string, key: string, hops: number): void {
    for (const edge of valuesOf(this.nsEdges, file)) {
      this.follow(edge, key, hops)
    }
  }

  private onAll(file: string, key: string, hops: number): void {
    for (const name of (this.infos.get(file) ?? EMPTY_MODULE).exports.keys()) {
      this.emit({ kind: "export", file, name }, key, hops)
    }
    this.emit({ kind: "any", file }, key, hops)
  }

  private follow(edge: Edge, key: string, hops: number): void {
    this.affect(edge.file, key, hops + 1)
    switch (edge.kind) {
      case "local":
        this.emit({ kind: "local", file: edge.file, name: edge.local }, key, hops + 1)
        break
      case "export":
        this.emit({ kind: "export", file: edge.file, name: edge.as }, key, hops + 1)
        break
      case "all":
        this.emit({ kind: "all", file: edge.file }, key, hops + 1)
        break
    }
  }

  private isTest(path: string): boolean {
    return matches(path, this.tests)
  }

  private isMutable(path: string): boolean {
    return !matches(path, this.notMutated)
  }

  private assemble(
    modules: readonly ChangedModule[],
    linked: readonly ChangedFile[],
    opaqueTests: readonly string[],
  ): AffectedResult {
    const testCauses = new Map<string, string>()
    const sourceCauses = new Map<string, string>()
    const direct = new Set<string>()

    for (const [file, { cause, hops }] of this.affectedFiles) {
      if (this.isTest(file)) {
        testCauses.set(file, cause)
      } else {
        sourceCauses.set(file, cause)
        if (hops === 1 && this.isMutable(file)) {
          direct.add(file)
        }
      }
    }
    for (const path of opaqueTests) {
      testCauses.set(path, opaqueKey(path))
    }
    for (const change of linked) {
      // A file renamed away from a linked path leaves that path just as surely as an edit would.
      const paths =
        change.renamedFrom === undefined ? [change.path] : [change.path, change.renamedFrom]
      for (const link of this.links) {
        if (paths.some((path) => globMatch(path, link.when))) {
          for (const path of this.input.files.keys()) {
            if (this.isTest(path) && matches(path, link.run) && !testCauses.has(path)) {
              testCauses.set(path, changedKey(change.path))
            }
          }
        }
      }
    }

    const changedSources = modules
      .filter((m) => m.current && !this.isTest(m.path))
      .map((m) => m.path)
    const mutateTargets = new Set<string>(direct)
    for (const path of changedSources) {
      if (this.isMutable(path)) {
        mutateTargets.add(path)
      }
    }

    const causes = new Map(this.causes)
    for (const [file, cause] of testCauses) {
      causes.set(testKey(file), cause)
    }
    for (const [file, cause] of sourceCauses) {
      causes.set(sourceKey(file), cause)
    }
    return {
      scope: "affected",
      changedFiles: sorted(this.input.changed.map((change) => change.path)),
      changedSymbols: sorted(this.changedSymbols),
      affectedSources: sorted(sourceCauses.keys()),
      affectedTests: sorted(testCauses.keys()),
      mutateTargets: sorted(mutateTargets),
      widened: this.widened,
      causes,
    }
  }

  /**
   * Everything is affected: the narrow path was abandoned for `because`.
   * @param because - Why the narrow path was abandoned.
   * @returns A result covering the whole project.
   */
  private fullResult(because: Widening): AffectedResult {
    const paths = [...this.input.files.keys()]
    const sources = paths.filter((path) => !this.isTest(path))
    return {
      scope: "full",
      fullBecause: because,
      changedFiles: sorted(this.input.changed.map((change) => change.path)),
      changedSymbols: [],
      affectedSources: sorted(sources),
      affectedTests: sorted(paths.filter((path) => this.isTest(path))),
      mutateTargets: sorted(sources.filter((path) => this.isMutable(path))),
      widened: [because],
      causes: new Map(),
    }
  }
}

/**
 * The reason to go full when a changed module's base content was not supplied.
 * @param file - The module.
 * @param kind - How it changed, for the message.
 * @returns The widening.
 */
function missingBase(file: string, kind: string): Widening {
  return {
    reason: "unplaced-file",
    file,
    to: "full",
    detail: `base content of a ${kind} module was not supplied`,
  }
}

interface Reverse {
  readonly info: ModuleInfo
  /** For each name, the names whose declarations mention it. */
  readonly referrers: ReadonlyMap<string, readonly string[]>
}

/** What an import resolves to when it does not reach a file of the project: no file has this name. */
const EXTERNAL = "\0external"

const strip = (path: string): string => (path.startsWith("/") ? path.slice(1) : path)

/**
 * Order matters: reordering top-level statements or imports can change what runs first.
 * @param values - Texts in the order they appear in a module.
 * @returns One text that differs if any of them, or their order, differs.
 */
const signature = (values: readonly string[]): string => values.join("\0")

const sorted = (values: Iterable<string>): string[] => [...values].sort()

/**
 * Whether two export targets point at the same thing. Targets are built with their fields in a
 * fixed order, so equal targets serialize alike; an absent one serializes to nothing.
 * @param a - One side, absent if the name is not exported there.
 * @param b - The other side.
 * @returns True when they are the same.
 */
const sameTarget = (a: ExportTarget | undefined, b: ExportTarget | undefined): boolean =>
  JSON.stringify(a) === JSON.stringify(b)
