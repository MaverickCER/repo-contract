import type * as TypeScript from "typescript"
import { append } from "./memo.js"
import type { TypeScriptApi } from "./types.js"

/** Where an exported name comes from. */
export type ExportTarget =
  | { readonly kind: "local"; readonly local: string }
  | { readonly kind: "reexport"; readonly from: string; readonly name: string }

/** One `import` binding: `local` is bound to `imported` (`"default"`, a name, or `"*"` for a namespace) of module `from`. */
export interface ImportBinding {
  readonly local: string
  readonly from: string
  readonly imported: string
}

/** A top-level statement that runs at import time and declares nothing others can name. */
export interface EffectUnit {
  readonly text: string
  readonly refs: ReadonlySet<string>
}

/**
 * Everything the affected analysis needs to know about one module, extracted syntactically. A name
 * here is a top-level binding. `declText` is the whitespace- and comment-insensitive text of
 * everything that declares it. `refs` is the set of identifiers mentioned there: the
 * module-internal dependency graph used to decide which exports a changed helper reaches.
 */
export interface ModuleInfo {
  readonly declText: ReadonlyMap<string, string>
  readonly refs: ReadonlyMap<string, ReadonlySet<string>>
  readonly effects: readonly EffectUnit[]
  readonly exports: ReadonlyMap<string, ExportTarget>
  /** For each local name, the names it is exported as (`export { a as b }` gives `a` -> `b`). */
  readonly exportedAs: ReadonlyMap<string, readonly string[]>
  /** Specifiers of `export * from`. */
  readonly stars: readonly string[]
  readonly bindings: readonly ImportBinding[]
  /** Specifiers loaded in a way that names no binding: `import "m"`, `import("m")`, `require("m")`. */
  readonly bareImports: readonly string[]
  /** Loads a module by a non-literal specifier, so what it depends on is unknowable. */
  readonly opaque: boolean
  readonly parseError: boolean
}

/** A module with nothing in it: the base of a file that did not exist, and the current form of one that was deleted. */
export const EMPTY_MODULE: ModuleInfo = {
  declText: new Map(),
  refs: new Map(),
  effects: [],
  exports: new Map(),
  exportedAs: new Map(),
  stars: [],
  bindings: [],
  bareImports: [],
  opaque: false,
  parseError: false,
}

/**
 * @param exports - A module's exports.
 * @returns For each local name, the names it is exported as.
 */
function exportedAsOf(exports: ReadonlyMap<string, ExportTarget>): Map<string, string[]> {
  const exportedAs = new Map<string, string[]>()
  for (const [exported, target] of exports) {
    if (target.kind === "local") {
      append(exportedAs, target.local, exported)
    }
  }
  return exportedAs
}

/** The shape of a parsed source file this module relies on but TypeScript does not publish. */
interface ParsedSourceFile extends TypeScript.SourceFile {
  readonly parseDiagnostics?: readonly unknown[]
}

/**
 * Parses one module and reduces it to a {@link ModuleInfo}.
 * @param ts - The TypeScript compiler API.
 * @param path - Path used only to choose the script kind (`.tsx`, `.mjs`, ...).
 * @param content - The module's source text.
 * @returns The extracted facts; a file that does not parse cleanly is flagged `parseError`.
 */
export function analyzeModule(ts: TypeScriptApi, path: string, content: string): ModuleInfo {
  const sourceFile = ts.createSourceFile(
    path,
    content,
    ts.ScriptTarget.ESNext,
    true,
  ) as ParsedSourceFile
  if ((sourceFile.parseDiagnostics?.length ?? 0) > 0) {
    return { ...EMPTY_MODULE, parseError: true }
  }
  return new Extractor(ts, sourceFile).run()
}

class Extractor {
  private readonly declText = new Map<string, string>()
  private readonly refs = new Map<string, Set<string>>()
  private readonly effects: EffectUnit[] = []
  private readonly exports = new Map<string, ExportTarget>()
  private readonly stars: string[] = []
  private readonly bindings: ImportBinding[] = []
  private readonly bareImports: string[] = []
  private opaque = false

  constructor(
    private readonly ts: TypeScriptApi,
    private readonly sourceFile: TypeScript.SourceFile,
  ) {}

  run(): ModuleInfo {
    for (const statement of this.sourceFile.statements) {
      this.statement(statement)
    }
    this.scanLoads(this.sourceFile)
    return {
      declText: this.declText,
      refs: this.refs,
      effects: this.effects,
      exports: this.exports,
      exportedAs: exportedAsOf(this.exports),
      stars: this.stars,
      bindings: this.bindings,
      bareImports: this.bareImports,
      opaque: this.opaque,
      parseError: false,
    }
  }

  /**
   * The node's tokens joined by single spaces: insensitive to whitespace, line breaks and comments
   * (the compiler's printer is not; it preserves block layout and keeps comments), sensitive to
   * everything that can change behavior, including quote style, which is merely conservative.
   * @param node - The node to flatten into tokens.
   * @returns The normalized token text.
   */
  private print(node: TypeScript.Node): string {
    const tokens: string[] = []
    const visit = (current: TypeScript.Node): void => {
      if (this.ts.isJSDoc(current)) {
        return
      }
      const children = current.getChildren(this.sourceFile)
      if (children.length === 0) {
        tokens.push(current.getText(this.sourceFile))
        return
      }
      for (const child of children) {
        visit(child)
      }
    }
    visit(node)
    return tokens.join(" ")
  }

  private identifiers(node: TypeScript.Node): Set<string> {
    const found = new Set<string>()
    const visit = (child: TypeScript.Node): void => {
      if (this.ts.isIdentifier(child)) {
        found.add(child.text)
      }
      this.ts.forEachChild(child, visit)
    }
    visit(node)
    return found
  }

  /**
   * True when evaluating `node` itself (not merely defining a function) can call into other code.
   * @param node - The node to inspect.
   * @returns Whether evaluating it can call into other code.
   */
  private callsImmediately(node: TypeScript.Node): boolean {
    const { ts } = this
    if (
      ts.isCallExpression(node) ||
      ts.isNewExpression(node) ||
      ts.isTaggedTemplateExpression(node) ||
      ts.isAwaitExpression(node) ||
      ts.isClassStaticBlockDeclaration(node)
    ) {
      return true
    }
    if (ts.isFunctionLike(node)) {
      return false
    }
    return ts.forEachChild(node, (child) => this.callsImmediately(child) || undefined) === true
  }

  private declare(names: readonly string[], node: TypeScript.Node): void {
    const text = this.print(node)
    const mentioned = this.identifiers(node)
    for (const name of names) {
      this.declText.set(name, `${this.declText.get(name) ?? ""}${text}\n`)
      const existing = this.refs.get(name) ?? new Set<string>()
      for (const identifier of mentioned) {
        existing.add(identifier)
      }
      this.refs.set(name, existing)
    }
  }

  private effect(node: TypeScript.Node): void {
    this.effects.push({ text: this.print(node), refs: this.identifiers(node) })
  }

  private hasModifier(node: TypeScript.Node, kind: TypeScript.SyntaxKind): boolean {
    const modifiers = this.ts.canHaveModifiers(node) ? this.ts.getModifiers(node) : undefined
    return modifiers?.some((modifier) => modifier.kind === kind) === true
  }

  private bindingNames(name: TypeScript.BindingName, into: string[]): void {
    if (this.ts.isIdentifier(name)) {
      into.push(name.text)
      return
    }
    for (const element of name.elements) {
      if (!this.ts.isOmittedExpression(element)) {
        this.bindingNames(element.name, into)
      }
    }
  }

  private exportLocal(exported: string, local: string): void {
    this.exports.set(exported, { kind: "local", local })
  }

  private statement(node: TypeScript.Statement): void {
    const { ts } = this
    if (ts.isImportDeclaration(node)) {
      this.importDeclaration(node)
    } else if (ts.isImportEqualsDeclaration(node)) {
      this.importEquals(node)
    } else if (ts.isExportDeclaration(node)) {
      this.exportDeclaration(node)
    } else if (ts.isExportAssignment(node)) {
      const name = node.isExportEquals === true ? "export=" : "default"
      this.declare([name], node)
      this.exportLocal(name, name)
      // `export = x` is also what a default import receives.
      this.exportLocal("default", name)
    } else if (ts.isVariableStatement(node)) {
      this.variableStatement(node)
    } else if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isModuleDeclaration(node)
    ) {
      this.namedDeclaration(node)
    } else {
      this.effect(node)
    }
  }

  private namedDeclaration(
    node:
      | TypeScript.FunctionDeclaration
      | TypeScript.ClassDeclaration
      | TypeScript.InterfaceDeclaration
      | TypeScript.TypeAliasDeclaration
      | TypeScript.EnumDeclaration
      | TypeScript.ModuleDeclaration,
  ): void {
    const { ts } = this
    const isDefault = this.hasModifier(node, ts.SyntaxKind.DefaultKeyword)
    const isExported = this.hasModifier(node, ts.SyntaxKind.ExportKeyword)
    // Only `export default function () {}` and `export default class {}` have no name, and they are `default`.
    const name = node.name?.text ?? "default"
    this.declare([name], node)
    if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
      // `declare module "x" { ... }` augments another module: a global, import-time effect.
      this.effect(node)
    }
    if (isExported) {
      this.exportLocal(isDefault ? "default" : name, name)
    }
    if (ts.isClassDeclaration(node) && this.callsImmediately(node)) {
      this.effect(node)
    }
  }

  private variableStatement(node: TypeScript.VariableStatement): void {
    const isExported = this.hasModifier(node, this.ts.SyntaxKind.ExportKeyword)
    for (const declaration of node.declarationList.declarations) {
      const names: string[] = []
      this.bindingNames(declaration.name, names)
      this.declare(names, declaration)
      if (isExported) {
        for (const name of names) {
          this.exportLocal(name, name)
        }
      } else if (this.callsImmediately(declaration)) {
        this.effect(declaration)
      }
    }
  }

  private importDeclaration(node: TypeScript.ImportDeclaration): void {
    const { ts } = this
    // A specifier that is not a string literal does not parse, and a module that does not parse never gets here.
    const from = (node.moduleSpecifier as TypeScript.StringLiteral).text
    const clause = node.importClause
    if (clause === undefined) {
      this.bareImports.push(from)
      return
    }
    const bind = (local: string, imported: string): void => {
      this.bindings.push({ local, from, imported })
      this.declText.set(local, `import ${imported} from ${JSON.stringify(from)}`)
      this.refs.set(local, new Set())
    }
    if (clause.name !== undefined) {
      bind(clause.name.text, "default")
    }
    const named = clause.namedBindings
    if (named === undefined) {
      return
    }
    if (ts.isNamespaceImport(named)) {
      bind(named.name.text, "*")
      return
    }
    for (const element of named.elements) {
      bind(element.name.text, (element.propertyName ?? element.name).text)
    }
  }

  private importEquals(node: TypeScript.ImportEqualsDeclaration): void {
    const { ts } = this
    if (!ts.isExternalModuleReference(node.moduleReference)) {
      this.declare([node.name.text], node)
      return
    }
    const expression = node.moduleReference.expression
    if (!ts.isStringLiteral(expression)) {
      this.opaque = true
      return
    }
    this.bindings.push({ local: node.name.text, from: expression.text, imported: "*" })
    this.declText.set(node.name.text, `import = require ${JSON.stringify(expression.text)}`)
    this.refs.set(node.name.text, new Set())
  }

  private exportDeclaration(node: TypeScript.ExportDeclaration): void {
    const { ts } = this
    // `export * from` and `export * as ns from` always name a module; an export list may not.
    const specifier = (node.moduleSpecifier as TypeScript.StringLiteral | undefined)?.text
    const clause = node.exportClause
    if (clause === undefined) {
      this.stars.push((node.moduleSpecifier as TypeScript.StringLiteral).text)
      return
    }
    if (ts.isNamespaceExport(clause)) {
      this.exports.set(clause.name.text, {
        kind: "reexport",
        from: (node.moduleSpecifier as TypeScript.StringLiteral).text,
        name: "*",
      })
      return
    }
    for (const element of clause.elements) {
      const exported = element.name.text
      const original = (element.propertyName ?? element.name).text
      this.exports.set(
        exported,
        specifier === undefined
          ? { kind: "local", local: original }
          : { kind: "reexport", from: specifier, name: original },
      )
    }
  }

  /**
   * Finds `import("x")` / `require("x")` anywhere in the file, including inside function bodies.
   * @param root - The node to scan, recursively.
   */
  private scanLoads(root: TypeScript.Node): void {
    const { ts } = this
    const visit = (node: TypeScript.Node): void => {
      if (ts.isCallExpression(node)) {
        const isImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
        const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require"
        // Only the first argument names the module; `import("x", { with: ... })` has a second.
        for (const argument of isImport || isRequire ? node.arguments.slice(0, 1) : []) {
          if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
            this.bareImports.push(argument.text)
          } else {
            this.opaque = true
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(root)
  }
}
