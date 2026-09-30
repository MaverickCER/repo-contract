// Shared benchmark-id formatting, factored out of env-cap's/data-cap's own (per-category)
// scenarios.mjs into its own tiny module here -- repo-contract's three categories each define their
// own tier ladder (see each category's own fixtures.mjs), so there is no single shared `TIERS`
// object to hang this on the way env-cap/data-cap do; only the id format itself is shared.

/**
 * `id` embeds both the suite version (methodology, at generation time) and this specific
 * (category, name, tier)'s own definition version -- an id pasted into an issue or dashboard stays
 * unambiguous even out of context.
 */
export function benchmarkId(category, name, tier, suiteVersion, definitionVersion) {
  return `${category}-${name}-${tier}-s${suiteVersion}-v${definitionVersion}`
}

/** Every (category, name, tier) a category declares, independent of whether a given run produced a result for it. */
export function buildManifest(category, benchmarks, suiteVersion) {
  const manifest = []
  for (const [name, def] of Object.entries(benchmarks)) {
    for (const tier of def.tiers) {
      manifest.push({
        id: benchmarkId(category, name, tier, suiteVersion, def.definitionVersion),
        category,
        name,
        tier,
        suiteVersion,
        definitionVersion: def.definitionVersion,
      })
    }
  }
  return manifest
}
