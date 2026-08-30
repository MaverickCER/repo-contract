// Entry point for the "security-network" self-hosting check, invoked via
// `run: ["tsx", "scripts/security-network/scan.ts"]` in repo-contract.config.ts.
// Prints ONLY the JSON evidence to stdout (for `output: { format: "json" }`
// to parse) -- mirrors scripts/adr-governance/check.ts's/scripts/suppression-
// governance/check.ts's own stdout contract.
//
// This is the second of two independent layers enforcing the "no network
// calls" invariant (see eslint.config.js's own doc comment on the first).
// It deliberately does not invoke ESLint, load eslint.config.js, or depend
// on any ESLint rule still being configured correctly -- an AST scan of the
// real source files, built from the language's own compiler API (the same
// approach scripts/suppression-governance/discover-suppressions.ts already
// uses, for the identical reason: a suppression-governance-style guarantee
// must survive its own primary enforcement mechanism being silently
// weakened or bypassed). See specs/decisions/0007-no-network-surface.md.

import { readFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import * as ts from "typescript"
import { listSourceFiles } from "../suppression-governance/find-source-files.js"
import type { NetworkCapabilityFinding, NetworkScanEvidence } from "./evidence-types.js"
import {
  ALLOWED_PRESET_COMMANDS,
  NETWORK_CORE_MODULES,
  NETWORK_GLOBALS,
  NETWORK_THIRD_PARTY_PACKAGES,
  RESTRICTED_NAMED_IMPORTS,
} from "./network-surface.mjs"

/**
 * Scope: `src/**\/*.ts` only -- the entire built/published surface (see
 * package.json's "files"/exports; `npm pack --dry-run` confirms dist/ is
 * built from nothing else). Reuses suppression-governance's own whole-repo
 * walker (already excludes node_modules/dist/coverage/.stryker-tmp/etc. and
 * fixtures directories) rather than re-implementing file discovery, then
 * filters to this check's own, narrower scope.
 * @param repoRelativePath - A repo-relative, POSIX-separated file path, as produced by `listSourceFiles`.
 * @returns `true` if this file is inside this check's `src/**\/*.ts` scope.
 */
function isInScope(repoRelativePath: string): boolean {
  return repoRelativePath.startsWith("src/") && repoRelativePath.endsWith(".ts")
}

const RESTRICTED_MODULE_SPECIFIERS: ReadonlySet<string> = new Set([
  ...NETWORK_CORE_MODULES,
  ...NETWORK_CORE_MODULES.map((name) => `node:${name}`),
  ...NETWORK_THIRD_PARTY_PACKAGES,
])

const RESTRICTED_GLOBAL_NAMES: ReadonlySet<string> = new Set(NETWORK_GLOBALS)

/**
 * @param sourceFile - The file the position belongs to.
 * @param pos - A 0-based character offset into `sourceFile`'s text.
 * @returns The 1-based line/column TypeScript's own scanner would report for `pos`.
 */
function lineAndColumn(
  sourceFile: ts.SourceFile,
  pos: number,
): { readonly line: number; readonly column: number } {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos)
  return { line: line + 1, column: character + 1 }
}

/**
 * Walks one already-parsed source file's AST, looking for every prohibited
 * (or unverifiable) network capability this module's own doc comment and
 * specs/decisions/0007-no-network-surface.md describe. Never executes
 * anything it finds -- this is pure static analysis over the parsed syntax
 * tree, the same "prefer AST-based analysis over fragile regular
 * expressions" approach discover-suppressions.ts already uses.
 * @param relativePath - The file's repo-relative path, used only to label findings.
 * @param text - The file's full source text.
 * @returns Every finding in this one file, in source order.
 */
export function scanSourceFile(
  relativePath: string,
  text: string,
): readonly NetworkCapabilityFinding[] {
  const findings: NetworkCapabilityFinding[] = []
  const sourceFile = ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, true)

  /**
   * Records one finding at `node`'s own source position.
   * @param node - The AST node the finding is anchored to, for its line/column.
   * @param capability - Which prohibited (or unverifiable) capability this is.
   * @param detail - Human-readable explanation of what was found and why.
   */
  function addFinding(
    node: ts.Node,
    capability: NetworkCapabilityFinding["capability"],
    detail: string,
  ): void {
    const { line, column } = lineAndColumn(sourceFile, node.getStart(sourceFile))
    findings.push({ file: relativePath, line, column, capability, detail })
  }

  /**
   * Shared by static `import`, static `export ... from`, dynamic `import(...)`, and a bare
   * `require(...)` call -- all four resolve a module by a specifier expression, and all four are
   * checked the same way.
   * @param specifier - The specifier expression, or `undefined` for a call with no arguments at all, or a re-export clause with no `from`.
   * @param namedElements - The static import's/export's named elements (for named-import restriction checks), or `undefined` for a dynamic import/require call, which cannot express one syntactically.
   * @param wholeNode - The enclosing node a finding not tied to a more specific location should be attached to.
   */
  function checkModuleSpecifier(
    specifier: ts.Expression | undefined,
    namedElements: readonly (ts.ImportSpecifier | ts.ExportSpecifier)[] | undefined,
    wholeNode: ts.Node,
  ): void {
    if (specifier === undefined) return

    if (!ts.isStringLiteral(specifier)) {
      addFinding(
        wholeNode,
        "dynamic-import-non-literal-specifier",
        "Module specifier is not a string literal and cannot be statically verified safe.",
      )
      return
    }

    const specifierText = specifier.text

    if (RESTRICTED_MODULE_SPECIFIERS.has(specifierText)) {
      addFinding(
        wholeNode,
        "restricted-module-import",
        `Imports "${specifierText}", which performs network I/O.`,
      )
    }

    const namedRestriction = RESTRICTED_NAMED_IMPORTS.find((r) => r.specifier === specifierText)
    if (namedRestriction !== undefined) {
      if (namedElements !== undefined) {
        for (const element of namedElements) {
          const importedName = (element.propertyName ?? element.name).text
          if (namedRestriction.importedNames.includes(importedName)) {
            addFinding(
              element,
              "restricted-named-import",
              `Imports "${importedName}" from "${specifierText}", which can synthesize dynamic module loading by a computed string.`,
            )
          }
        }
      } else {
        // A namespace import (`import * as m`), a default import, a dynamic
        // `import("node:module")`, an `import m = require("module")`, or a
        // bare `require("module")` cannot name individual elements -- but
        // every one of them hands back the whole module object, from which
        // the restricted name (`createRequire`) is still reachable. Flag the
        // import itself rather than let this be the gap that defeats the
        // "close that path at its only real chokepoint" guarantee.
        addFinding(
          wholeNode,
          "restricted-named-import",
          `Imports "${specifierText}" in a form that exposes its whole module object (namespace, default, dynamic import, or require), including ${namedRestriction.importedNames.join("/")}, which can synthesize dynamic module loading by a computed string.`,
        )
      }
    }
  }

  /**
   * Peels off `as const`, `satisfies <Type>`, and parenthesization -- none of these change a
   * `run:` initializer's runtime value, but each would otherwise defeat the array/string-literal
   * shape checks below (e.g. `run: ["curl", "x"] as const` is idiomatic given `run`'s declared
   * type `string | readonly string[]`, src/types.ts's own RunCommand type).
   * @param expr - The expression to unwrap.
   * @returns The innermost expression once every such wrapper has been removed.
   */
  function unwrapTypeWrapper(expr: ts.Expression): ts.Expression {
    if (ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr)) {
      return unwrapTypeWrapper(expr.expression)
    }
    if (ts.isParenthesizedExpression(expr)) {
      return unwrapTypeWrapper(expr.expression)
    }
    return expr
  }

  /**
   * A preset's (or any check's) `run:` property -- an array's first element, or a plain string's
   * first whitespace-separated token, must name a reviewed command. See
   * network-surface.mjs's ALLOWED_PRESET_COMMANDS doc comment for why this list is manually
   * maintained rather than derived.
   *
   * Fails closed: any shape this cannot statically resolve to a literal command name (a template
   * literal with interpolation, an identifier, a call/conditional expression, ...) is itself a
   * finding rather than a silent pass -- the same posture `dynamic-import-non-literal-specifier`
   * already takes for module specifiers.
   * @param initializer - The `run` property's value expression.
   */
  function checkRunProperty(initializer: ts.Expression): void {
    const value = unwrapTypeWrapper(initializer)

    if (ts.isArrayLiteralExpression(value)) {
      const [first] = value.elements
      if (first === undefined) return
      const firstValue = unwrapTypeWrapper(first)
      if (!ts.isStringLiteralLike(firstValue)) {
        addFinding(
          firstValue,
          "non-literal-preset-command",
          "The run array's first element is not a string literal and cannot be verified against the allowed command list.",
        )
        return
      }
      if (!ALLOWED_PRESET_COMMANDS.includes(firstValue.text)) {
        addFinding(
          firstValue,
          "unreviewed-preset-command",
          `Preset run command "${firstValue.text}" is not in the reviewed allowlist (scripts/security-network/network-surface.mjs's ALLOWED_PRESET_COMMANDS).`,
        )
      }
      return
    }

    if (ts.isStringLiteralLike(value)) {
      const [firstToken] = value.text.trim().split(/\s+/)
      if (
        firstToken !== undefined &&
        firstToken !== "" &&
        !ALLOWED_PRESET_COMMANDS.includes(firstToken)
      ) {
        addFinding(
          value,
          "unreviewed-preset-command",
          `Preset run command "${firstToken}" is not in the reviewed allowlist (scripts/security-network/network-surface.mjs's ALLOWED_PRESET_COMMANDS).`,
        )
      }
      return
    }

    addFinding(
      value,
      "non-literal-preset-command",
      "The run property's value is not a string or array literal (after unwrapping type assertions) and cannot be verified against the allowed command list.",
    )
  }

  /**
   * Recursively walks the whole tree rooted at `node`, dispatching each recognized shape to the
   * appropriate check above.
   * @param node - The AST node (or subtree root) to inspect.
   */
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const namedBindings = node.importClause?.namedBindings
      const namedElements =
        namedBindings !== undefined && ts.isNamedImports(namedBindings)
          ? namedBindings.elements
          : undefined
      checkModuleSpecifier(node.moduleSpecifier, namedElements, node)
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      // TypeScript's own `import x = require("...")` form -- a real module
      // load that the plain `require(...)` call branch below never sees
      // because it is a declaration, not a CallExpression.
      checkModuleSpecifier(node.moduleReference.expression, undefined, node)
    } else if (ts.isExportDeclaration(node)) {
      const { exportClause } = node
      const namedElements =
        exportClause !== undefined && ts.isNamedExports(exportClause)
          ? exportClause.elements
          : undefined
      checkModuleSpecifier(node.moduleSpecifier, namedElements, node)
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      checkModuleSpecifier(node.arguments[0], undefined, node)
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require"
    ) {
      checkModuleSpecifier(node.arguments[0], undefined, node)
    } else if (
      (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
      ts.isIdentifier(node.expression) &&
      RESTRICTED_GLOBAL_NAMES.has(node.expression.text)
    ) {
      addFinding(
        node,
        "restricted-global-usage",
        `Uses global "${node.expression.text}", which performs network I/O.`,
      )
    } else if (
      (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      (node.expression.expression.text === "globalThis" ||
        node.expression.expression.text === "global") &&
      RESTRICTED_GLOBAL_NAMES.has(node.expression.name.text)
    ) {
      addFinding(
        node,
        "restricted-global-usage",
        `Uses global "${node.expression.expression.text}.${node.expression.name.text}", which performs network I/O.`,
      )
    } else if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "run"
    ) {
      checkRunProperty(node.initializer)
    } else if (ts.isShorthandPropertyAssignment(node) && node.name.text === "run") {
      addFinding(
        node,
        "non-literal-preset-command",
        "The run property uses shorthand syntax; its value cannot be verified against the allowed command list.",
      )
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return findings
}

/**
 * The check's full logic, factored out of the bottom-of-file script invocation so
 * test/unit/security-network/scan.test.ts can exercise it directly against fixture directories,
 * without spawning a subprocess -- matching scripts/suppression-governance/check.ts's own testing
 * convention.
 * @param root - Absolute path to the repository (or fixture root) being scanned.
 * @returns The evidence for `output: { format: "json" }`: how many files were scanned, and every finding across all of them.
 */
export async function scanForNetworkCapability(root: string): Promise<NetworkScanEvidence> {
  const allFiles = await listSourceFiles(root)
  const scopedFiles = allFiles.filter((relativePath) => isInScope(relativePath))

  // Read all in-scope files in parallel, then scan them in the deterministic
  // `scopedFiles` order -- matching discover-suppressions.ts, which reads the
  // same `listSourceFiles()` set with `Promise.all` for the same reason.
  const texts = await Promise.all(
    scopedFiles.map((relativePath) => readFile(path.join(root, relativePath), "utf8")),
  )

  const findings: NetworkCapabilityFinding[] = []
  for (const [index, relativePath] of scopedFiles.entries()) {
    findings.push(...scanSourceFile(relativePath, texts[index] ?? ""))
  }

  return { filesScanned: scopedFiles.length, findings }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidence = await scanForNetworkCapability(process.cwd())
  process.stdout.write(JSON.stringify(evidence))
}
