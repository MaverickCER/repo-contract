# Changelog

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
