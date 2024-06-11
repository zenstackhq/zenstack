# Changelog

## [Unreleased]
### Added
- Support comparing fields from different models in mutation policy rules ("create", "update", and "delete).

## 2.1.0
### Added
- Support using ZModel type names (e.g., `DateTime`) as model field names.
- `auth()` is resolved from all reachable schema files.

## 2.0.0
### Added
- ZenStack V2 release!

## 1.11.0
### Added
- Added support to complex usage of `@@index` attribute like `@@index([content(ops: raw("gin_trgm_ops"))], type: Gin)`.
### Fixed
- Fixed several ZModel validation issues related to model inheritance.

## 1.7.0

### Added

-   Auto-completion is now supported inside attributes.
