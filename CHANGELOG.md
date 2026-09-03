# Changelog

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
