/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      // Upgraded from dependency-cruiser's own default ("warn") to "error".
      // checks/architecture.ts's policy (evaluateArchitecturePolicy) only
      // fails the check on "error"-severity violations. A circular
      // dependency inside src/ left at "warn" would never fail this
      // repository's own architecture check. No circular dependency
      // currently exists in src/ (confirmed via `npx depcruise --config
      // .dependency-cruiser.cjs --output-type json src`). So this is a
      // zero-regression tightening of a standard architectural invariant.
      severity: "error",
      comment:
        "This dependency is part of a circular relationship. You might want to revise " +
        "your solution (i.e. use dependency inversion, make sure the modules have a single responsibility) ",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "no-orphans",
      comment:
        "This is an orphan module - it's likely not used (anymore?). Either use it or " +
        "remove it. If it's logical this module is an orphan (i.e. it's a config file), " +
        "add an exception for it in your dependency-cruiser configuration. By default " +
        "this rule does not scrutinize dot-files (e.g. .eslintrc.js), TypeScript declaration " +
        "files (.d.ts), tsconfig.json and some of the babel and webpack configs.",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)[.][^/]+[.](?:js|cjs|mjs|ts|cts|mts|json)$", // dot files
          "[.]d[.](?:ts|cts|mts)$", // TypeScript declaration files (incl. the .d.mts shims scripts/emit-dts-shims.mjs's siblings use)
          "(^|/)tsconfig[.]json$", // TypeScript config
          "(^|/)(?:babel|webpack)[.]config[.](?:js|cjs|mjs|ts|cts|mts|json)$", // other configs
          // Data about the contract itself, read only by test/unit/config/standard-coverage.test.ts.
          "^checks/standard-coverage[.]ts$",
        ],
      },
      to: {},
    },
    {
      name: "no-deprecated-core",
      comment:
        "A module depends on a node core module that has been deprecated. Find an alternative - these are " +
        "bound to exist - node doesn't deprecate lightly.",
      severity: "warn",
      from: {},
      to: {
        dependencyTypes: ["core"],
        path: [
          "^v8/tools/codemap$",
          "^v8/tools/consarray$",
          "^v8/tools/csvparser$",
          "^v8/tools/logreader$",
          "^v8/tools/profile_view$",
          "^v8/tools/profile$",
          "^v8/tools/SourceMap$",
          "^v8/tools/splaytree$",
          "^v8/tools/tickprocessor-driver$",
          "^v8/tools/tickprocessor$",
          "^node-inspect/lib/_inspect$",
          "^node-inspect/lib/internal/inspect_client$",
          "^node-inspect/lib/internal/inspect_repl$",
          "^async_hooks$",
          "^punycode$",
          "^domain$",
          "^constants$",
          "^sys$",
          "^_linklist$",
          "^_stream_wrap$",
        ],
      },
    },
    {
      name: "not-to-deprecated",
      comment:
        "This module uses a (version of an) npm module that has been deprecated. Either upgrade to a later " +
        "version of that module, or find an alternative. Deprecated modules are a security risk.",
      severity: "warn",
      from: {},
      to: {
        dependencyTypes: ["deprecated"],
      },
    },
    {
      name: "no-non-package-json",
      severity: "error",
      comment:
        "This module depends on an npm package that isn't in the 'dependencies' section of your package.json. " +
        "That's problematic as the package either (1) won't be available on live (2 - worse) will be " +
        "available on live with an non-guaranteed version. Fix it by adding the package to the dependencies " +
        "in your package.json.",
      from: {},
      to: {
        dependencyTypes: ["npm-no-pkg", "npm-unknown"],
        // `yaml` is deliberately declared in BOTH peerDependencies and devDependencies. The peer is
        // the real, optional runtime dependency (see
        // specs/decisions/0008-self-hosting-tool-and-dependency-choices.md). The devDependency lets
        // this repository's own tests and scripts use it locally. `depcruise --output-type json`
        // confirms how dependency-cruiser classifies src/parsing/parse-yaml.ts's `import("yaml")`.
        // Its dependencyTypes array holds npm-peer AND npm-dev alongside npm-no-pkg at once. That
        // happens for this dual-declared, type-resolved-through-.d.ts case. It is a
        // dependency-cruiser classification quirk, not an undeclared dependency. The exclusion is
        // by resolved path, not by dependencyTypes. So a genuinely undeclared package resolving
        // anywhere else still fails this rule. `typescript` is the same case. It is an optional
        // peer dependency (type-only use in src/affected/, specs/decisions/0021-*). It is also a
        // devDependency for this repository's own tests and scripts.
        pathNot: ["node_modules/yaml/", "node_modules/typescript/"],
      },
    },
    {
      name: "not-to-unresolvable",
      comment:
        "This module depends on a module that cannot be found ('resolved to disk'). If it's an npm " +
        "module: add it to your package.json. In all other cases you likely already know what to do.",
      severity: "error",
      from: {},
      to: {
        couldNotResolve: true,
      },
    },
    {
      name: "no-duplicate-dep-types",
      comment:
        "Likely this module depends on an external ('npm') package that occurs more than once " +
        "in your package.json i.e. bot as a devDependencies and in dependencies. This will cause " +
        "maintenance problems later on.",
      severity: "warn",
      from: {},
      to: {
        moreThanOneDependencyType: true,
        // It is common to use a devDependency for type-only imports, so type-only
        // dependencyTypes are not considered for this rule.
        dependencyTypesNot: ["type-only"],
        // Intentional peer + dev declaration (see peer-deps-used below).
        pathNot: ["node_modules/typescript/"],
      },
    },

    {
      name: "not-to-test",
      comment:
        "This module depends on code within a folder that should only contain tests. As tests don't " +
        "implement functionality this is odd. Either you're writing a test outside the test folder " +
        "or there's something in the test folder that isn't a test.",
      severity: "error",
      from: {
        pathNot: "^(specs|test)",
      },
      to: {
        path: "^(specs|test)",
      },
    },
    {
      name: "not-to-spec",
      comment:
        "This module depends on a spec (test) file. The responsibility of a spec file is to test code. " +
        "If there's something in a spec that's of use to other modules, it doesn't have that single " +
        "responsibility anymore. Factor it out into (e.g.) a separate utility/ helper or a mock.",
      severity: "error",
      from: {},
      to: {
        path: "[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$",
      },
    },
    {
      name: "not-to-dev-dep",
      severity: "error",
      comment:
        "This module depends on an npm package from the 'devDependencies' section of your " +
        "package.json. It looks like something that ships to production, though. To prevent problems " +
        "with npm packages that aren't there on production declare it (only!) in the 'dependencies'" +
        "section of your package.json. If this module is development only - add it to the " +
        "from.pathNot re of the not-to-dev-dep rule in the dependency-cruiser configuration",
      from: {
        path: "^(src)",
        pathNot: "[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$",
      },
      to: {
        dependencyTypes: ["npm-dev"],
        // Type-only dependencies are not a problem: they don't end up in the
        // production code, or the runtime ignores them.
        dependencyTypesNot: ["type-only"],
        // For node_modules/@types/, see the comment immediately above. node_modules/yaml/ and
        // node_modules/typescript/ have the dual peerDependencies+devDependencies declaration
        // exempted in no-non-package-json above. That rule's comment has the full reasoning. It is
        // identical here: dependency-cruiser classifies the same edge as npm-dev alongside npm-peer.
        pathNot: ["node_modules/@types/", "node_modules/yaml/", "node_modules/typescript/"],
      },
    },
    {
      name: "optional-deps-used",
      severity: "info",
      comment:
        "This module depends on an npm package that is declared as an optional dependency " +
        "in your package.json. As this makes sense in limited situations only, it's flagged here. " +
        "If you use an optional dependency here by design - add an exception to your" +
        "dependency-cruiser configuration.",
      from: {},
      to: {
        dependencyTypes: ["npm-optional"],
      },
    },
    {
      name: "peer-deps-used",
      comment:
        "This module depends on an npm package that is declared as a peer dependency " +
        "in your package.json. This makes sense if your package is e.g. a plugin, but in " +
        "other cases - maybe not so much. If the use of a peer dependency is intentional " +
        "add an exception to your dependency-cruiser configuration.",
      severity: "warn",
      from: {},
      to: {
        dependencyTypes: ["npm-peer"],
        // Intentional: `typescript` is an optional peer dependency used for types only by
        // src/affected/ (specs/decisions/0021-*). It is also a devDependency for this repository's
        // own tooling, the same dual declaration `yaml` has.
        pathNot: ["node_modules/typescript/"],
      },
    },
    {
      name: "no-unresolvable",
      severity: "error",
      comment:
        "Every import must resolve to a real module -- an unresolvable import is a build-time defect, not a style preference.",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "execution-must-not-import-evidence-or-policy",
      severity: "error",
      comment:
        "Protects ADR 0001 (execution and policy evaluation are strictly phased): execution/ must stay ignorant of evidence/ and policy/ so no check's process can ever be influenced by another check's evidence or policy outcome.",
      from: { path: "^src/execution" },
      to: { path: "^src/(evidence|policy)" },
    },
    {
      name: "config-must-not-import-execution-evidence-or-policy",
      severity: "error",
      comment:
        "config/ is the most foundational layer (structural validation, before anything spawns) -- it must not depend on layers built on top of it.",
      from: { path: "^src/config" },
      to: { path: "^src/(execution|evidence|policy)" },
    },
    {
      name: "presets-must-not-import-execution-evidence-or-policy",
      severity: "error",
      comment:
        "src/presets/ defines plain check configs (run + policy over already-parsed evidence) -- it must not depend on the runtime layers that consume them.",
      from: { path: "^src/presets" },
      to: { path: "^src/(execution|evidence|policy)" },
    },
    {
      name: "helpers-must-not-import-execution-evidence-or-policy",
      severity: "error",
      comment:
        "src/helpers/ is a second, independent published barrel (repo-contract/helpers, specs/decisions/0013-reusable-exception-policy-helper.md) -- like src/presets/, it must not depend on the runtime layers that consume checks.",
      from: { path: "^src/helpers" },
      to: { path: "^src/(execution|evidence|policy)" },
    },
    {
      name: "affected-must-not-import-execution-evidence-or-policy",
      severity: "error",
      comment:
        "src/affected/ is a fourth independent published barrel (repo-contract/affected) -- pure analysis over supplied data, like src/helpers/, so it must not depend on the runtime layers that consume checks.",
      from: { path: "^src/affected" },
      to: { path: "^src/(execution|evidence|policy)" },
    },
    {
      name: "metrics-must-not-import-execution-evidence-or-policy",
      severity: "error",
      comment:
        "src/metrics/ is a fifth independent published barrel (repo-contract/metrics) -- pure record keeping over supplied data, like src/helpers/ -- so it must not depend on the runtime layers that consume checks.",
      from: { path: "^src/metrics" },
      to: { path: "^src/(execution|evidence|policy)" },
    },
    {
      name: "tiers-and-tool-config-must-not-import-execution-evidence-or-policy",
      severity: "error",
      comment:
        "src/tiers/ and src/tool-config/ are independent published barrels (repo-contract/tiers, repo-contract/config): they build check and tool configs, so they must not depend on the runtime layers that consume checks.",
      from: { path: "^src/(tiers|tool-config)" },
      to: { path: "^src/(execution|evidence|policy)" },
    },
    {
      name: "src-must-not-import-scripts",
      severity: "error",
      comment:
        "scripts/ (self-hosting tooling, e.g. scripts/suppression-governance/) exists to validate this repository using the public src/ API -- the dependency must stay one-directional.",
      from: { path: "^src" },
      to: { path: "^scripts" },
    },
    {
      name: "checks-and-scripts-must-not-import-src-internals",
      severity: "error",
      comment:
        "Mirrors eslint.config.js's own root-config policy ('Only src/index.ts... may be imported from outside src/'): checks/ and scripts/ are equally outside src/, so they must reach it only through src/index.ts (or the two public-ish surfaces already granted a direct exception -- the four src-root files and src/presets/, both real published surface) rather than reaching into an internal layer (config/execution/evidence/parsing/policy) directly.",
      from: { path: "^(checks|scripts)" },
      to: { path: "^src/(config|execution|evidence|parsing|policy)" },
    },
    {
      name: "src-must-lazy-load-yaml",
      severity: "error",
      comment:
        "`yaml` is an optional peer dependency (README 'Installation'; ADR 0008), loaded only when a check requests `output: { format: 'yaml' }`. src/ must reach it exclusively via a dynamic `await import('yaml')` (src/parsing/parse-yaml.ts) so a consumer who never requests YAML output does not need it installed -- a real static `import ... from 'yaml'` in src/ silently breaks that. A compile-erased `import type ... from 'yaml'` is fine and is excluded here via dependencyTypesNot. `peer-deps-used` above only warns; this rule is the hard gate. Raised as a CodeRabbit review finding on the release split.",
      from: { path: "^src" },
      to: {
        path: "node_modules/yaml/",
        dependencyTypes: ["import"],
        dependencyTypesNot: ["type-only"],
      },
    },
  ],
  options: {
    // Deliberately no `includeOnly`. An earlier `includeOnly: "^src"` here silently excluded
    // every non-src module (scripts/, test/, checks/, and every node_modules package) from the
    // cruised graph. That made not-to-test, not-to-dev-dep and src-must-not-import-scripts above
    // structurally incapable of ever firing. This was confirmed empirically: a fixture
    // reproducing each showed 0 violations with includeOnly set and 2 with it removed. The rule
    // set was otherwise identical. The cruise target is still only `src` (see
    // scripts/check-architecture.mjs's own `depcruise ... src` invocation). This only changes
    // whether an edge src/ follows *out* (to scripts/, test/, an npm-dev dependency) is visible in
    // the resulting graph. It does not change what is cruised as a root. `doNotFollow` below still
    // prevents recursing into node_modules' own internal dependency graph.
    doNotFollow: {
      path: ["node_modules"],
    },

    // Count JSDoc-style imports as dependencies. This makes dependency-cruiser parse with `tsc`, so
    // `typescript` must be installed.
    detectJSDocImports: true,

    // Count `process.getBuiltinModule(...)` calls as imports, so a builtin loaded that way is still
    // visible to the rules above.
    detectProcessBuiltinModuleCalls: true,

    // Keep type-only imports in the graph. A rule that exempts them says so with `dependencyTypesNot`.
    tsPreCompilationDeps: true,

    tsConfig: {
      fileName: "tsconfig.json",
    },

    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },

    // Run only the analysis the rules above need.
    skipAnalysisNotInRules: true,

    reporterOptions: {
      dot: {
        // Collapse each npm package to one node, so graphs show packages, not their internals.
        collapsePattern: "node_modules/(?:@[^/]+/[^/]+|[^/]+)",
      },
      archi: {
        collapsePattern:
          "^(?:packages|src|lib(s?)|app(s?)|bin|test(s?)|spec(s?))/[^/]+|node_modules/(?:@[^/]+/[^/]+|[^/]+)",
      },
      text: {
        highlightFocused: true,
      },
    },
  },
}
