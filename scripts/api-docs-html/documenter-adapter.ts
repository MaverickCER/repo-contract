/**
 * The only file in this feature that imports `@microsoft/api-documenter` -- mirrors
 * `../api-contract/extractor-adapter.ts`'s role for `@microsoft/api-extractor`: isolate the rest
 * of the feature from this one library's own implementation details. Uses api-documenter's
 * programmatic `MarkdownDocumenter` class (imported via its declared `./lib/*` subpath export,
 * never the CLI) -- the same programmatic-over-CLI preference `extractor-adapter.ts` already
 * states for API Extractor itself.
 */
// No trailing ".js": this is a package subpath resolved through api-documenter's own `exports`
// map (`"./lib/*": { "types": "./lib-dts/*.d.ts", ... }`), whose `*` capture already includes the
// extension it substitutes -- appending ".js" here would resolve to a nonexistent
// "MarkdownDocumenter.js.d.ts", unlike this repository's own relative imports (which do need it).
import { MarkdownDocumenter } from "@microsoft/api-documenter/lib/documenters/MarkdownDocumenter"
import { loadApiModel } from "../api-contract/extractor-adapter.js"

/**
 * Loads one target's Doc Model (`apiJsonFilePath`, preserved by
 * `../api-docs/report-targets.ts`'s `generateApiReports` when given `docModelFolder`) and renders
 * it into markdown pages under `outputFolder`. `MarkdownDocumenter.generateFiles()` empties
 * `outputFolder` first, so this must be pointed at a per-target scratch folder -- never a folder
 * shared across targets. Every one of this package's three public entry points
 * (`repo-contract`/`repo-contract/presets`/`repo-contract/helpers`) shares the literal package
 * name `"repo-contract"` (from `package.json`), so their Doc Models -- and the files
 * `generateFiles()` writes -- both carry that same `repo-contract.*` filename prefix regardless of
 * which target produced them; per-target output folders are what keeps them from colliding.
 * @param apiJsonFilePath - Absolute path to the target's `.api.json` Doc Model file.
 * @param outputFolder - Absolute path to write this target's markdown pages into. Emptied first.
 */
export function generateMarkdownPages(apiJsonFilePath: string, outputFolder: string): void {
  const { model } = loadApiModel(apiJsonFilePath)
  const documenter = new MarkdownDocumenter({
    apiModel: model,
    documenterConfig: undefined,
    outputFolder,
  })
  documenter.generateFiles()
}
