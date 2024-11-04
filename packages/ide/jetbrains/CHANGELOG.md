# Changelog

## [Unreleased]

### Added

-   Type declaration support.

## 2.7.0

### Fixed

-   ZModel validation issues importing zmodel files from npm packages.

## 2.6.0

### Fixed

-   ZModel validation issues when accessing fields defined in a base model from `future().` or `this.`.

## 2.5.0

### Added

-   A new `path` parameter to the `@@validate` attribute for providing an optional path to the field that caused the error.

## 2.4.0

### Added

-   The `uuid()` function is updated to support the new UUID version feature from Prisma.

## 2.3.0

### Added

-   New `check()` policy rule function.

### Fixed

-   Fixed the issue with formatting schemas containing `Unsupported` type.

## 2.2.0

### Added

-   Support comparing fields from different models in mutation policy rules ("create", "update", and "delete).

## 2.1.0

### Added

-   Support using ZModel type names (e.g., `DateTime`) as model field names.
-   `auth()` is resolved from all reachable schema files.

## 2.0.0

### Added

-   ZenStack V2 release!

## 1.11.0

### Added

-   Added support to complex usage of `@@index` attribute like `@@index([content(ops: raw("gin_trgm_ops"))], type: Gin)`.

### Fixed

-   Fixed several ZModel validation issues related to model inheritance.

## 1.7.0

### Added

-   Auto-completion is now supported inside attributes.
