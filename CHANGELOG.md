# Changelog

## [0.4.0](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.3.2...repo-contract-v0.4.0) (2026-09-09)


### ⚠ BREAKING CHANGES

* adds the new Experimental repo-contract/helpers subpath (exception-policy primitive). No existing export's shape changes; classified as minor per VERSIONING.md's "a new preset -> minor" convention for the Experimental tier, not a literal incompatibility.

### Features

* add a narrow `repo-contract init` scaffolding command ([#63](https://github.com/MaverickCER/repo-contract/issues/63)) ([a1d4e4a](https://github.com/MaverickCER/repo-contract/commit/a1d4e4a242cb0253e0a62e486e86a475a5c8ddbd))
* add a verified-exception waiver path to security-network ([94dbf43](https://github.com/MaverickCER/repo-contract/commit/94dbf4321b9288b10c65e7efc3e2596a40f4c628))
* add security-socket and coderabbitai checks ([cb7d3ca](https://github.com/MaverickCER/repo-contract/commit/cb7d3cad8d8015e85c82731075abe48e12371b15))
* add security-socket and coderabbitai checks ([31374ee](https://github.com/MaverickCER/repo-contract/commit/31374eebe5c35ff54e3efd37d5ed756cc8b8cdc4))
* add the checks/shared exception-matching and identity layer ([0d711f5](https://github.com/MaverickCER/repo-contract/commit/0d711f5f17d382af507cfafab4a441d620a8b220))
* add the generic exception-policy core primitive ([8d8f670](https://github.com/MaverickCER/repo-contract/commit/8d8f6704c20bc2c5a4b07e68dcb8e328ee48b9c7))
* content-bound verification for suppression-governance ([fb6a838](https://github.com/MaverickCER/repo-contract/commit/fb6a838da76247cc42ab316ad9d420ff174a4124))
* content-bound verification for suppression-governance (disable-comments.json) ([8da651a](https://github.com/MaverickCER/repo-contract/commit/8da651a0f76ab0464ed3b22ac5113b837ea3ecc1))
* **helpers:** add the exception-registry lifecycle primitives ([de8e855](https://github.com/MaverickCER/repo-contract/commit/de8e8558a26ca238aafc69d736e576aafddd8fa0))
* publish the repo-contract/helpers subpath ([35f168c](https://github.com/MaverickCER/repo-contract/commit/35f168ca9fbde4f46d1a29624f112e0d4d3b296d))
* retrofit security-network onto the exception-policy primitive ([62b8d0a](https://github.com/MaverickCER/repo-contract/commit/62b8d0afae9f3958b60666531d58a25a6f5b796e))


### Bug Fixes

* address CodeRabbit findings on the security-network retrofit ([e53313e](https://github.com/MaverickCER/repo-contract/commit/e53313ecf2973649cc2dca045a220f27f0e205db))
* address CodeRabbit findings on the two new checks ([255e495](https://github.com/MaverickCER/repo-contract/commit/255e49584a2b6622cee174f560221e731932d840))
* address CodeRabbit findings on the verification retrofit ([3d91878](https://github.com/MaverickCER/repo-contract/commit/3d91878407dd006f82239d034cb319d3856a0c46))
* address round-2 CodeRabbit findings on the helpers primitive ([fabb9df](https://github.com/MaverickCER/repo-contract/commit/fabb9df2261051cc35fbe15faf3e6df9317afdf5))
* backfill verification baseline onto records merged in from main ([286e877](https://github.com/MaverickCER/repo-contract/commit/286e8775ad66d7d727f68c0ba269ad2cfa036d56))
* harden exception-policy config validation and smoke/license accuracy ([e23c069](https://github.com/MaverickCER/repo-contract/commit/e23c069f422ac8967cf8c3a65605bdfb85c07abc))
* reject impossible calendar dates in verifiedAt, sync ADR 0013 ([6df0911](https://github.com/MaverickCER/repo-contract/commit/6df0911c8bbbfe99bd97095e811b9d762aeb6438))
* reject trailing newline in verifiedAt; PATH-aware socket probe in the integration test ([ef01ba6](https://github.com/MaverickCER/repo-contract/commit/ef01ba65950041838a3e43f8d8f440add6c4a97c))
* remove duplicate StandardSchemaV1 re-export in src/helpers/index.ts ([a0d8ee7](https://github.com/MaverickCER/repo-contract/commit/a0d8ee7a490d05fc99d9cbb7150706f7c1494694))
* skip the real-source drift test inside a Stryker mutation sandbox ([e9e64f6](https://github.com/MaverickCER/repo-contract/commit/e9e64f6dbe57a9e0612209bb568b584961d130cc))
* validate exception registries on every run and tighten verification ([8d6993f](https://github.com/MaverickCER/repo-contract/commit/8d6993fb94299a50c7b2589d400e592e43767df5))
* validate the coderabbit terminal event findings count ([a7acd09](https://github.com/MaverickCER/repo-contract/commit/a7acd0950b54f3bd2dbde3956a697d97d80daf9c))

## [0.3.2](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.3.1...repo-contract-v0.3.2) (2026-09-04)


### Features

* validate and transform check output with a Standard Schema ([d53cb17](https://github.com/MaverickCER/repo-contract/commit/d53cb17a9e3a3f939cd403226ab5256be0de79ac))
* validate and transform check output with a Standard Schema ([fbb7925](https://github.com/MaverickCER/repo-contract/commit/fbb79259f4a6cede1da64a0abd7e1f1541e1d505))


### Bug Fixes

* address CodeRabbit findings and close mutation-testing gaps in Standard Schema support ([53baf87](https://github.com/MaverickCER/repo-contract/commit/53baf877d367fd17dbe1ec2f312ab9ed790e6ae6))
* **api-contract:** don't classify a required property on a brand-new container as breaking ([27ad5d5](https://github.com/MaverickCER/repo-contract/commit/27ad5d5c57811d90393b00f48ae8a8bbd413407b))
* **test:** harden isRuntimeAvailable against spawnSync throwing under load ([60c76b6](https://github.com/MaverickCER/repo-contract/commit/60c76b642dfd6187888f02d31639e68468e77b17))

## [0.3.1](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.3.0...repo-contract-v0.3.1) (2026-09-03)


### Bug Fixes

* correct the release runbook that shipped types-less tarballs ([f56ea34](https://github.com/MaverickCER/repo-contract/commit/f56ea342606cfc92a09943ea5eb787936e7b7ba9))
* published tarball missing types; simplify CI matrix ([7ec8fd9](https://github.com/MaverickCER/repo-contract/commit/7ec8fd946bd584098255c5d2ab3f07b98b55ba1f))

## [0.3.0](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.2.1...repo-contract-v0.3.0) (2026-09-03)


### ⚠ BREAKING CHANGES

* defineRepoContract/runRepoContract now require spawn and env on the config (e.g. spawn: child_process.spawn, env: process.env). See ADR 0011 and README's "Supplying spawn/env" section for migration.

### Features

* contract engine, self-hosting checks and CI workflows ([97ae128](https://github.com/MaverickCER/repo-contract/commit/97ae128bd96f2c631057f1150068af58cc66b224))
* contract engine, self-hosting checks and CI workflows ([22b2a3b](https://github.com/MaverickCER/repo-contract/commit/22b2a3b03fe4e44ad7a01b82342d86583926416a))
* make process spawning and env access consumer-supplied capabilities ([640a961](https://github.com/MaverickCER/repo-contract/commit/640a961b65fd73511586c3b4f6274284bf5172a9))


### Bug Fixes

* clear Socket supply-chain alerts (unminified dist, no prepare script) ([71c9230](https://github.com/MaverickCER/repo-contract/commit/71c92306fcf00e3858f0596c2d56f3272199339d))
* publish the dist bundle unminified ([266ae47](https://github.com/MaverickCER/repo-contract/commit/266ae47919753c55f10364713fe0c7c5876815b7))
* remove the prepare install script from the published package ([9153540](https://github.com/MaverickCER/repo-contract/commit/9153540e4f0f1a069e07c12ddfee8ba62827ce5b))

## [0.2.1](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.2.0...repo-contract-v0.2.1) (2026-09-03)


### Documentation

* add Socket security badge to README

## [0.2.0](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.1.1...repo-contract-v0.2.0) (2026-09-03)


### ⚠ BREAKING CHANGES

* defineRepoContract/runRepoContract now require spawn and env on the config (e.g. spawn: child_process.spawn, env: process.env). See ADR 0011 and README's "Supplying spawn/env" section for migration.

### Features

* make process spawning and env access consumer-supplied capabilities ([640a961](https://github.com/MaverickCER/repo-contract/commit/640a961b65fd73511586c3b4f6274284bf5172a9))

## [0.1.1](https://github.com/MaverickCER/repo-contract/compare/repo-contract-v0.1.0...repo-contract-v0.1.1) (2026-09-01)


### Bug Fixes

* clear Socket supply-chain alerts (unminified dist, no prepare script) ([71c9230](https://github.com/MaverickCER/repo-contract/commit/71c92306fcf00e3858f0596c2d56f3272199339d))
* publish the dist bundle unminified ([266ae47](https://github.com/MaverickCER/repo-contract/commit/266ae47919753c55f10364713fe0c7c5876815b7))
* remove the prepare install script from the published package ([9153540](https://github.com/MaverickCER/repo-contract/commit/9153540e4f0f1a069e07c12ddfee8ba62827ce5b))

## Changelog
