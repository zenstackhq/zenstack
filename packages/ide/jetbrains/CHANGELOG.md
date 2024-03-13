# Changelog

## [2.0.0-alpha.3](https://github.com/zenstackhq/zenstack/compare/v2.0.0-alpha.2...v2.0.0-alpha.3) (2024-03-13)


### Bug Fixes

* more robust calculation of default location for code generation ([#1095](https://github.com/zenstackhq/zenstack/issues/1095)) ([d11d4ba](https://github.com/zenstackhq/zenstack/commit/d11d4bade318d5a17d1a5e3860292352e25cc813))
* prisma.d.ts is not properly saved ([#1090](https://github.com/zenstackhq/zenstack/issues/1090)) ([d3629be](https://github.com/zenstackhq/zenstack/commit/d3629bef459afc11c16461fb18621d2f77ac35cc))

## [2.0.0-alpha.2](https://github.com/zenstackhq/zenstack/compare/v2.0.0-alpha.1...v2.0.0-alpha.2) (2024-02-21)


### Miscellaneous Chores

* release 2.0.0-alpha.2 ([f40d7e3](https://github.com/zenstackhq/zenstack/commit/f40d7e3718d4210137a2e131d28b5491d065b914))

## [Unreleased]
### Added
- Added support to complex usage of `@@index` attribute like `@@index([content(ops: raw("gin_trgm_ops"))], type: Gin)`.
### Fixed
- Fixed several ZModel validation issues related to model inheritance.

## 1.7.0
### Added
- Auto-completion is now supported inside attributes.
