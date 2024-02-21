# Changelog

## [2.0.0-alpha.2](https://github.com/zenstackhq/zenstack/compare/Monorepo-v2.0.0-alpha.1...Monorepo-v2.0.0-alpha.2) (2024-02-21)


### Features

* a better "zod" plugin ([#521](https://github.com/zenstackhq/zenstack/issues/521)) ([2280f83](https://github.com/zenstackhq/zenstack/commit/2280f83cd7f1f597fddfd6ab0c99417200124452))
* add "loadPath" options to runtime API and server adapter options ([#696](https://github.com/zenstackhq/zenstack/issues/696)) ([fc50deb](https://github.com/zenstackhq/zenstack/commit/fc50deb6e70acc78dcb66b17e564a6fc84475970))
* add @[@auth](https://github.com/auth) option for declaring auth model ([#787](https://github.com/zenstackhq/zenstack/issues/787)) ([c390de1](https://github.com/zenstackhq/zenstack/commit/c390de10cfa91ae3f954404bc07e0905973b0898))
* add CLI config file support ([#328](https://github.com/zenstackhq/zenstack/issues/328)) ([4668ee9](https://github.com/zenstackhq/zenstack/commit/4668ee9c7029be5b9f21f318c36df795abead335))
* Add multi-schema file support ([#368](https://github.com/zenstackhq/zenstack/issues/368)) ([4e57b96](https://github.com/zenstackhq/zenstack/commit/4e57b9640e6c9d0cca25a3c12a981ea6c9dbfda6))
* add prisma passthrough attribute for working around discripancies between zmodel and prisma ([#245](https://github.com/zenstackhq/zenstack/issues/245)) ([cef96d4](https://github.com/zenstackhq/zenstack/commit/cef96d4b6fe0a4d7d38742565817aca8e6533933))
* add support for comparing fields in the same model ([#631](https://github.com/zenstackhq/zenstack/issues/631)) ([4776685](https://github.com/zenstackhq/zenstack/commit/477668579e3d95e7371ca752244ad2e319a96477))
* add support for filter operator functions ([#289](https://github.com/zenstackhq/zenstack/issues/289)) ([7914470](https://github.com/zenstackhq/zenstack/commit/79144709b3bd56adf0a30f27b69426702980b95f))
* add support for type modifier attributes ([#240](https://github.com/zenstackhq/zenstack/issues/240)) ([a05d320](https://github.com/zenstackhq/zenstack/commit/a05d320e7135440c20f3d75746c62ae67bfabd58))
* add switch to zod plugin to control whether unchecked input types are generated ([#693](https://github.com/zenstackhq/zenstack/issues/693)) ([cea2019](https://github.com/zenstackhq/zenstack/commit/cea2019aee4f27ff4bf12677906a48daa91aa854))
* add zenstack CLI repl command ([#808](https://github.com/zenstackhq/zenstack/issues/808)) ([616be65](https://github.com/zenstackhq/zenstack/commit/616be65c3b8362be8a2cca2fa3abb77f8d0fe947))
* allow specifying zmodel location in package.json ([#879](https://github.com/zenstackhq/zenstack/issues/879)) ([bb149bd](https://github.com/zenstackhq/zenstack/commit/bb149bd22e820a9ba5a6c5325d1a330a7c495c71))
* allow to use custom fetch with generated hooks ([#556](https://github.com/zenstackhq/zenstack/issues/556)) ([2a6b31a](https://github.com/zenstackhq/zenstack/commit/2a6b31a29c71a786a27a0ddda5c64f8c973c7739))
* always use superjson to serialize/deserialize in the api layer ([#585](https://github.com/zenstackhq/zenstack/issues/585)) ([46fec66](https://github.com/zenstackhq/zenstack/commit/46fec666c3af971010c69e467f08f55830655441))
* automatic optimistic update for tanstack hooks ([#830](https://github.com/zenstackhq/zenstack/issues/830)) ([93dc7df](https://github.com/zenstackhq/zenstack/commit/93dc7df472427a4546ba71ec3703135d2d638ded))
* CLI improvements ([#694](https://github.com/zenstackhq/zenstack/issues/694)) ([eba3390](https://github.com/zenstackhq/zenstack/commit/eba3390b3b40af3ac4c71fd92cea983ae310fb74))
* **codeql.yml:** add CodeQL workflow for security analysis on push, pull request, ([5fc4572](https://github.com/zenstackhq/zenstack/commit/5fc45726103c9ee89313c336571856ee2f08d6a6))
* copy nextjs adapter over to `server` package ([#420](https://github.com/zenstackhq/zenstack/issues/420)) ([f79902a](https://github.com/zenstackhq/zenstack/commit/f79902a92622b6755afceda58a9c5b91f2b926b9))
* express.js adapter ([#271](https://github.com/zenstackhq/zenstack/issues/271)) ([e12fc5a](https://github.com/zenstackhq/zenstack/commit/e12fc5a4ca4c71c10c1d34fc4a1d19f9fb9f75bb))
* field-level access control ([#638](https://github.com/zenstackhq/zenstack/issues/638)) ([9a6f39b](https://github.com/zenstackhq/zenstack/commit/9a6f39bdb8940f7cef89fd7ee423658b8ed4c49f))
* field-level policy override ([#889](https://github.com/zenstackhq/zenstack/issues/889)) ([271d568](https://github.com/zenstackhq/zenstack/commit/271d568ad3695e85f216ad7a293d9b9e802e7aaa))
* flexible 'createRouter' typings ([#654](https://github.com/zenstackhq/zenstack/issues/654)) ([e147412](https://github.com/zenstackhq/zenstack/commit/e14741231b37ef1430fa8a02446f5748a76a02d7))
* fluent API support ([#666](https://github.com/zenstackhq/zenstack/issues/666)) ([4ae5a96](https://github.com/zenstackhq/zenstack/commit/4ae5a96ee2976dedbdb0b207f48c082c48b3f9ce))
* generate openapi doc with 3.1.0 version ([fe74a80](https://github.com/zenstackhq/zenstack/commit/fe74a805db4f84a534a1f2e6777d295bee66d3a8))
* generate openapi doc with 3.1.0 version ([#304](https://github.com/zenstackhq/zenstack/issues/304)) ([920b13e](https://github.com/zenstackhq/zenstack/commit/920b13e28bd28daa385c7cebf413733c71eb81b9))
* implement filter operators in restful service ([#411](https://github.com/zenstackhq/zenstack/issues/411)) ([52f44c5](https://github.com/zenstackhq/zenstack/commit/52f44c5ee7c34622f1ae53076e6249125b83f566))
* implement openapi security inferrence and override ([#341](https://github.com/zenstackhq/zenstack/issues/341)) ([2860f00](https://github.com/zenstackhq/zenstack/commit/2860f002e57d7772c0b7b9e9feabce7bae73c18c))
* implement tanstack-query generator plugin ([#413](https://github.com/zenstackhq/zenstack/issues/413)) ([9351fc9](https://github.com/zenstackhq/zenstack/commit/9351fc9431090d7720f75f751ad57ef2539b3d9e))
* implementing access control for Prisma Pulse ([#643](https://github.com/zenstackhq/zenstack/issues/643)) ([d8c2e87](https://github.com/zenstackhq/zenstack/commit/d8c2e8717e5fd3facb177443c8ef1baec89a81d5))
* implementing sveltekit adapter and refactor server package ([#418](https://github.com/zenstackhq/zenstack/issues/418)) ([53716c9](https://github.com/zenstackhq/zenstack/commit/53716c99c35d32767354729f372f2f15f1a478b2))
* import statment validation ([#369](https://github.com/zenstackhq/zenstack/issues/369)) ([782a449](https://github.com/zenstackhq/zenstack/commit/782a449eba0d954b215e80aea7c8587eb013387d))
* improved automatic query invalidation for tanstack-query ([#790](https://github.com/zenstackhq/zenstack/issues/790)) ([42d654f](https://github.com/zenstackhq/zenstack/commit/42d654fcfaa40b09fde578db79792c69e1e3b908))
* improvements of openapi plugin ([#335](https://github.com/zenstackhq/zenstack/issues/335)) ([3b9e356](https://github.com/zenstackhq/zenstack/commit/3b9e3567b81eec050f208ae5e97ae0c2e544ab0f))
* include raw zod errors in response ([#691](https://github.com/zenstackhq/zenstack/issues/691)) ([b5da998](https://github.com/zenstackhq/zenstack/commit/b5da998b7fa11c19b85cebd0956803d854332b4d))
* infinite query for swr plugin ([#680](https://github.com/zenstackhq/zenstack/issues/680)) ([757ccb5](https://github.com/zenstackhq/zenstack/commit/757ccb54cbaecf2274159b83b256cfa46a517f89))
* infinite query support for tanstack-query ([#679](https://github.com/zenstackhq/zenstack/issues/679)) ([3300499](https://github.com/zenstackhq/zenstack/commit/330049949bfce7e8d463d7be8f1c8653df10203a))
* JetBrains plugin for ZModel ([#904](https://github.com/zenstackhq/zenstack/issues/904)) ([c79be9e](https://github.com/zenstackhq/zenstack/commit/c79be9eb7f6b602bc84214bded2b927935b6273a))
* let `zenstack init` install exact versions for zenstack package… ([#313](https://github.com/zenstackhq/zenstack/issues/313)) ([38c97bd](https://github.com/zenstackhq/zenstack/commit/38c97bdc248ae00ff352205d727344cfdc016f90))
* make nextjs adapter support next 13 app dir ([#483](https://github.com/zenstackhq/zenstack/issues/483)) ([a078b23](https://github.com/zenstackhq/zenstack/commit/a078b23a1afd799ba9aba50b82d497851160ef24))
* make parameters of transactions configurable ([#988](https://github.com/zenstackhq/zenstack/issues/988)) ([d0745b1](https://github.com/zenstackhq/zenstack/commit/d0745b149a5ce6abfef546de0b9243ddc4f6e765))
* Make ZModel color schema looks cool and consistent ([#791](https://github.com/zenstackhq/zenstack/issues/791)) ([6dabb02](https://github.com/zenstackhq/zenstack/commit/6dabb02dfa76e58b7538ea38d9d9a0ff27d3609d)), closes [#716](https://github.com/zenstackhq/zenstack/issues/716)
* more flexible "createRouter" typings ([#651](https://github.com/zenstackhq/zenstack/issues/651)) ([d2bffb6](https://github.com/zenstackhq/zenstack/commit/d2bffb62d48a550937ebe3c147f55b6fab55f172))
* more flexible "in" operator and filter expressions ([#367](https://github.com/zenstackhq/zenstack/issues/367)) ([170bc73](https://github.com/zenstackhq/zenstack/commit/170bc73709a046ff12fb124eafd478e12bb51618))
* more flexible formating for zmodel and generated prisma file ([#388](https://github.com/zenstackhq/zenstack/issues/388)) ([4d7699f](https://github.com/zenstackhq/zenstack/commit/4d7699f05e2d64012dcf2b50e16a060b7e8609df))
* Nuxt server adapter and tanstack-query for "vue" hooks generation ([#757](https://github.com/zenstackhq/zenstack/issues/757)) ([033d95d](https://github.com/zenstackhq/zenstack/commit/033d95dcdeef67bc8183d1daeb3172ec9ee02b9b))
* OpenAPI & fastify adapter ([#254](https://github.com/zenstackhq/zenstack/issues/254)) ([dd9963c](https://github.com/zenstackhq/zenstack/commit/dd9963cd35d414ebf61727bb4a5d9ad0c31100e0))
* optimistic update support for SWR ([#860](https://github.com/zenstackhq/zenstack/issues/860)) ([0ca4670](https://github.com/zenstackhq/zenstack/commit/0ca46704f4c02b7d3e69470c68601835f426da59))
* options for logging queries sent to prisma ([#488](https://github.com/zenstackhq/zenstack/issues/488)) ([ccfb2b0](https://github.com/zenstackhq/zenstack/commit/ccfb2b088cf1ce14c78c1d1355db5cb4ebcdc957))
* polymorphism ([#990](https://github.com/zenstackhq/zenstack/issues/990)) ([bac3683](https://github.com/zenstackhq/zenstack/commit/bac368382b6c92585bc983861a56d141093b7896))
* react-hooks generator and runtime targeting @tanstack/react-query ([#309](https://github.com/zenstackhq/zenstack/issues/309)) ([21ccddb](https://github.com/zenstackhq/zenstack/commit/21ccddb9be437eabed35fbc62ae43c1e192d289e))
* RedwoodJS integration package ([#911](https://github.com/zenstackhq/zenstack/issues/911)) ([e4aeee3](https://github.com/zenstackhq/zenstack/commit/e4aeee32ae3a5ab1718fd1daa2f93043fb68a8d5))
* **release:** add release manifest and main config files for version 2.0.0-alpha.1 ([24b6c26](https://github.com/zenstackhq/zenstack/commit/24b6c26720d5a0f9cd6d64431288473cd9ee5a97))
* **release:** define package names and components in release main config file ([24b6c26](https://github.com/zenstackhq/zenstack/commit/24b6c26720d5a0f9cd6d64431288473cd9ee5a97))
* **release:** set up configuration for automated versioning and release process ([24b6c26](https://github.com/zenstackhq/zenstack/commit/24b6c26720d5a0f9cd6d64431288473cd9ee5a97))
* restful style openapi spec generation ([#410](https://github.com/zenstackhq/zenstack/issues/410)) ([4ebaa1f](https://github.com/zenstackhq/zenstack/commit/4ebaa1fa4aa8e762a11fb24700f5cb4e1bfbe688))
* RESTful style server API handler ([#405](https://github.com/zenstackhq/zenstack/issues/405)) ([f07ccdd](https://github.com/zenstackhq/zenstack/commit/f07ccdded01e232823e3955ab1ffc19b1c8f33a1))
* runtime support for custom `@[@auth](https://github.com/auth)` model ([#793](https://github.com/zenstackhq/zenstack/issues/793)) ([08b9677](https://github.com/zenstackhq/zenstack/commit/08b967735c938de1e770a2409c36c5a50173b01d))
* **security-defender-for-devops.yml:** add GitHub Actions workflow for Microsoft Defender For DevOps security checks ([545f668](https://github.com/zenstackhq/zenstack/commit/545f6688a5e85171255dfc75148a0b39ef450cb2))
* **security-dependency-review.yml:** add security dependency review workflow to scan and block PRs with known-vulnerable packages ([2b43adc](https://github.com/zenstackhq/zenstack/commit/2b43adc9fcfa5e7dd2e915c2ea9cc8efe6d7ba2b))
* **security-ossar.yml:** add GitHub workflow for security scanning using OSSAR ([2d8452d](https://github.com/zenstackhq/zenstack/commit/2d8452de270c6bde0f55a386500b8f61fb112847))
* **security-ossar.yml:** integrate open source static analysis tools with GitHub code scanning ([2d8452d](https://github.com/zenstackhq/zenstack/commit/2d8452de270c6bde0f55a386500b8f61fb112847))
* **security-ossar.yml:** schedule security scans on main, develop, and release branches ([2d8452d](https://github.com/zenstackhq/zenstack/commit/2d8452de270c6bde0f55a386500b8f61fb112847))
* **security-scorecard.yml:** add GitHub Actions workflow for security scorecard ([30e5a02](https://github.com/zenstackhq/zenstack/commit/30e5a02c7b84d93d23a0e00416b3382b56963c2c))
* support "Unsupported" field type ([#366](https://github.com/zenstackhq/zenstack/issues/366)) ([e232271](https://github.com/zenstackhq/zenstack/commit/e23227151d963b5a7d65ee31a4bddaf10d8db759))
* support `now()` function in policy rules ([#480](https://github.com/zenstackhq/zenstack/issues/480)) ([7de7623](https://github.com/zenstackhq/zenstack/commit/7de762341771752278105efc58c5bf04cbe4b500))
* support abstract model ([#308](https://github.com/zenstackhq/zenstack/issues/308)) ([2fa3aee](https://github.com/zenstackhq/zenstack/commit/2fa3aeefffd7b8425836107d4e0e69cfe0187921))
* support configuring what models to include for zod and trpc plugins ([#747](https://github.com/zenstackhq/zenstack/issues/747)) ([a5d15a3](https://github.com/zenstackhq/zenstack/commit/a5d15a30e7a22a3e875cc974391feb9ad6da7646))
* support multi-id-field models (@[@id](https://github.com/id)([f1, f2, ...])) ([#243](https://github.com/zenstackhq/zenstack/issues/243)) ([7e55e65](https://github.com/zenstackhq/zenstack/commit/7e55e652eceacec108dd4966ff08cfef184cd8ab))
* Support multiple levels inheritance ([#863](https://github.com/zenstackhq/zenstack/issues/863)) ([2d43692](https://github.com/zenstackhq/zenstack/commit/2d43692e591e2aaa48539991128846fc4a6a8b1c))
* support Prisma v5 ([#587](https://github.com/zenstackhq/zenstack/issues/587)) ([b0d9154](https://github.com/zenstackhq/zenstack/commit/b0d9154270a89c6c93c7a8f1aada85c413d16d6f))
* support Prisma view ([#579](https://github.com/zenstackhq/zenstack/issues/579)) ([af151b7](https://github.com/zenstackhq/zenstack/commit/af151b7b311ee96b626376b8a17103b18c261f65))
* support self relations ([#244](https://github.com/zenstackhq/zenstack/issues/244)) ([93cb6bf](https://github.com/zenstackhq/zenstack/commit/93cb6bfc847d8b97612e849cffcbfe7723630ad9))
* support using collection predicate expression with `auth()` ([#831](https://github.com/zenstackhq/zenstack/issues/831)) ([ff1e8a5](https://github.com/zenstackhq/zenstack/commit/ff1e8a5e98ec94337f08576a29ffbee07ba8fd88))
* Support ZModel format command in CLI ([#869](https://github.com/zenstackhq/zenstack/issues/869)) ([bf85ceb](https://github.com/zenstackhq/zenstack/commit/bf85ceb3ef84ca68a6c370c6d6349af1edb79428))
* swr plugin ([#419](https://github.com/zenstackhq/zenstack/issues/419)) ([3ee7821](https://github.com/zenstackhq/zenstack/commit/3ee7821498d96963a5fec89d9d19a88d28da51eb))
* tanstack-query v5 support ([#788](https://github.com/zenstackhq/zenstack/issues/788)) ([0d04d8e](https://github.com/zenstackhq/zenstack/commit/0d04d8e6dabd66ee06e98971cb4e1007c4ecd466))
* trpc plugin, add "generateModelActions" option to control what operations to generate ([#482](https://github.com/zenstackhq/zenstack/issues/482)) ([8693852](https://github.com/zenstackhq/zenstack/commit/8693852a36522baf44ff7eb3a8c76d839c8a8081))
* trpc plugin, generate client helpers to provide prisima-like typing ([#510](https://github.com/zenstackhq/zenstack/issues/510)) ([c41980d](https://github.com/zenstackhq/zenstack/commit/c41980dddbbeacd51c72d109e09a8c7b4c17617c))
* **workflows:** add actions/checkout and actions/setup-node for release job setup ([520b469](https://github.com/zenstackhq/zenstack/commit/520b4698d8bcb3615a837b0a3efb85ff9f363696))
* **workflows:** add management-changelog.yml file for release workflow ([520b469](https://github.com/zenstackhq/zenstack/commit/520b4698d8bcb3615a837b0a3efb85ff9f363696))
* **workflows:** add pnpm installation and publishing steps in release job ([520b469](https://github.com/zenstackhq/zenstack/commit/520b4698d8bcb3615a837b0a3efb85ff9f363696))
* **workflows:** add release-please-action for automated releases in release job ([520b469](https://github.com/zenstackhq/zenstack/commit/520b4698d8bcb3615a837b0a3efb85ff9f363696))
* **workflows:** add steps to harden runner for runtime security in release job ([520b469](https://github.com/zenstackhq/zenstack/commit/520b4698d8bcb3615a837b0a3efb85ff9f363696))
* **workflows:** configure release workflow to trigger on push to main, dev, and release branches ([520b469](https://github.com/zenstackhq/zenstack/commit/520b4698d8bcb3615a837b0a3efb85ff9f363696))
* **workflows:** set permissions for contents to read and write in release job ([520b469](https://github.com/zenstackhq/zenstack/commit/520b4698d8bcb3615a837b0a3efb85ff9f363696))
* zod plugin and zod validation for open-api requests ([#262](https://github.com/zenstackhq/zenstack/issues/262)) ([51c094e](https://github.com/zenstackhq/zenstack/commit/51c094e329df0d1ebb28239d5fe5ff4608065280))


### Bug Fixes

* [ZModelCodeGenerator] Remove the extra space between the collection predicate operator ([#839](https://github.com/zenstackhq/zenstack/issues/839)) ([9a0895b](https://github.com/zenstackhq/zenstack/commit/9a0895bedd82b429ddcc45db4cee0f9e82c54198))
* **#300:** handle invalid json in openapi query params gracefully ([#303](https://github.com/zenstackhq/zenstack/issues/303)) ([8bdc827](https://github.com/zenstackhq/zenstack/commit/8bdc82766812a764d1d7769d7756a4d5e59c507c))
* **#329:** normalize testtools workspace root path for win32 ([#330](https://github.com/zenstackhq/zenstack/issues/330)) ([15ab420](https://github.com/zenstackhq/zenstack/commit/15ab42098d9bdac762b65c5b3f233cc45e358a67))
* add "exports" to generated package.json, make trpc code-gen compatible with vite ([#677](https://github.com/zenstackhq/zenstack/issues/677)) ([df67f30](https://github.com/zenstackhq/zenstack/commit/df67f301119db23e5048464de2f73bff1a2adffc))
* add "interactiveTransactions" preview features for lower version of Prisma ([#569](https://github.com/zenstackhq/zenstack/issues/569)) ([bd5666a](https://github.com/zenstackhq/zenstack/commit/bd5666ae03110392e0fc578e37c6fcddba9cf50d))
* add `CheckSelect` type into code for Prisma version backward compatibility ([#619](https://github.com/zenstackhq/zenstack/issues/619)) ([3e09a3a](https://github.com/zenstackhq/zenstack/commit/3e09a3a6646ae0f6e393cc0f92991c9b5d0c4d29))
* add directUrl support to schema datasource decl ([#434](https://github.com/zenstackhq/zenstack/issues/434)) ([8b29eed](https://github.com/zenstackhq/zenstack/commit/8b29eedfa1f22e111b850419d826f588075d7eb5))
* add enum import to zod generation ([#528](https://github.com/zenstackhq/zenstack/issues/528)) ([2a4b5cc](https://github.com/zenstackhq/zenstack/commit/2a4b5cc328645387a604f2fdf7c8855804306243))
* add eslint ignore to generated trpc helper source ([#759](https://github.com/zenstackhq/zenstack/issues/759)) ([f7e8a08](https://github.com/zenstackhq/zenstack/commit/f7e8a08987da4f6af3ad5058209cdc22720dce8f))
* add IntField as a valid mapping to TinyInt ([#822](https://github.com/zenstackhq/zenstack/issues/822)) ([db9cc7f](https://github.com/zenstackhq/zenstack/commit/db9cc7f4e5028ac0342a8df9993260d134f37d18))
* add missing "/runtime" exports to tanstack-query ([#688](https://github.com/zenstackhq/zenstack/issues/688)) ([a3064dc](https://github.com/zenstackhq/zenstack/commit/a3064dc2ce9319977a01844fd0aac40bb92be7d9))
* add missing attribute parameters and loosen keyword restrictions ([#394](https://github.com/zenstackhq/zenstack/issues/394)) ([ef7acd7](https://github.com/zenstackhq/zenstack/commit/ef7acd7c069225775e83411a4dfd8c31b2bf0c00))
* add missing exports for the generated .zenstack package ([#760](https://github.com/zenstackhq/zenstack/issues/760)) ([8ac0915](https://github.com/zenstackhq/zenstack/commit/8ac091574892d14edb66baf447f8ea6c5f4907ba))
* add missing MSSQL related stdlib declarations and parameters ([#748](https://github.com/zenstackhq/zenstack/issues/748)) ([4e6531e](https://github.com/zenstackhq/zenstack/commit/4e6531ece28650844e9baad25d0d49395bfe931b))
* add missing parameters to `[@db](https://github.com/db).Decimal` ([#475](https://github.com/zenstackhq/zenstack/issues/475)) ([8b98e6b](https://github.com/zenstackhq/zenstack/commit/8b98e6b4bd36008508744ebea61fa03ebff599f1))
* add package.json exports ([#597](https://github.com/zenstackhq/zenstack/issues/597)) ([8ccfc93](https://github.com/zenstackhq/zenstack/commit/8ccfc93ba8135ced89754fbd912a02fe11962a53))
* add support for @[@schema](https://github.com/schema) attribute, and allow arbitrary fields in datasource ([#250](https://github.com/zenstackhq/zenstack/issues/250)) ([9d45384](https://github.com/zenstackhq/zenstack/commit/9d4538445600b856962b200ca0faa0bbfff68f8a))
* add the missing "count" schema/router for zod/trpc ([#667](https://github.com/zenstackhq/zenstack/issues/667)) ([6e9a3b3](https://github.com/zenstackhq/zenstack/commit/6e9a3b3ce4f306716234a9598e4aac3c89e1e0be))
* allow "view" and "import" as identifier ([#750](https://github.com/zenstackhq/zenstack/issues/750)) ([2e15dfb](https://github.com/zenstackhq/zenstack/commit/2e15dfb747fa871a5b25661e3e320a1a5f3cc92a))
* allow models without field declarations ([#749](https://github.com/zenstackhq/zenstack/issues/749)) ([43322e1](https://github.com/zenstackhq/zenstack/commit/43322e111adfc7d888aa8dc04445a5b0f8c2dbcc))
* auth() cannot be resolved if the auth model is marked @[@ignore](https://github.com/ignore) ([#844](https://github.com/zenstackhq/zenstack/issues/844)) ([73f2cec](https://github.com/zenstackhq/zenstack/commit/73f2cec82fea64cea05f7306523f7c6f9ac91f84))
* automatically enable "@core/zod" plugin when there're validation rules ([#535](https://github.com/zenstackhq/zenstack/issues/535)) ([0519421](https://github.com/zenstackhq/zenstack/commit/05194219f28e49ee11d1a1bd9a78146e9b76eada))
* avoid generating error log when getting machine id ([#977](https://github.com/zenstackhq/zenstack/issues/977)) ([c50e013](https://github.com/zenstackhq/zenstack/commit/c50e01346030406c7d1433863a6b7da1914ecdaf))
* avoid return loaded prisma if undefined ([#461](https://github.com/zenstackhq/zenstack/issues/461)) ([cfca402](https://github.com/zenstackhq/zenstack/commit/cfca4022dcb79ccab47d7a5fe8bb8b5c9521295e))
* batch bug fixes ([#273](https://github.com/zenstackhq/zenstack/issues/273)) ([e1600c8](https://github.com/zenstackhq/zenstack/commit/e1600c8bc69cb3cf51fb763a86b06834810236eb))
* better cli reporting of missing/invalid config file ([#354](https://github.com/zenstackhq/zenstack/issues/354)) ([ed99ea4](https://github.com/zenstackhq/zenstack/commit/ed99ea42aae2cce24f23283075c18f33e309f465))
* bug fixes for openapi plugin ([#432](https://github.com/zenstackhq/zenstack/issues/432)) ([e76ee35](https://github.com/zenstackhq/zenstack/commit/e76ee35bdb9fb1ae3d4d99e94ccfc40a3b59f373))
* bug in enhancement proxy for detecting nested transactions ([#941](https://github.com/zenstackhq/zenstack/issues/941)) ([85a0525](https://github.com/zenstackhq/zenstack/commit/85a052594c447120ecc8123d30c7b098afcc8841))
* bug with NOT clause reduction when condition is an array ([#848](https://github.com/zenstackhq/zenstack/issues/848)) ([debd35b](https://github.com/zenstackhq/zenstack/commit/debd35b3531262c4df453653cbee10dc85baf222))
* bugs related to model name casing ([#645](https://github.com/zenstackhq/zenstack/issues/645)) ([32d5b26](https://github.com/zenstackhq/zenstack/commit/32d5b262cacdd03209a56027e4c2cbda1bc408c0))
* build, lint and etc. ([#833](https://github.com/zenstackhq/zenstack/issues/833)) ([cccbc3c](https://github.com/zenstackhq/zenstack/commit/cccbc3c82ad522d40bc76ad7b84b1305d378b1db))
* canonicalize plugin's output folder detection; don't generate aux field unnecessarily ([#423](https://github.com/zenstackhq/zenstack/issues/423)) ([9eaf235](https://github.com/zenstackhq/zenstack/commit/9eaf2353e479a7c967af42a0cd6ed6b9afeded4a))
* change back to loading from literal ".zenstack" path otherwise Vercel breaks :( ([#701](https://github.com/zenstackhq/zenstack/issues/701)) ([2d41a9f](https://github.com/zenstackhq/zenstack/commit/2d41a9fcffab2fa228356a5cc45b4c2ecd62fd63))
* change openapi plugin's default flavor to "rpc" ([#439](https://github.com/zenstackhq/zenstack/issues/439)) ([ec65e53](https://github.com/zenstackhq/zenstack/commit/ec65e53f202e3e02ea98a9c88682c106dcbafc76))
* clean up zod generation ([#883](https://github.com/zenstackhq/zenstack/issues/883)) ([909281f](https://github.com/zenstackhq/zenstack/commit/909281f8090734322c0cab09d0187b6b5e813c9a))
* clean up zod generation ([#883](https://github.com/zenstackhq/zenstack/issues/883)) ([9d4a8ed](https://github.com/zenstackhq/zenstack/commit/9d4a8ede7d42d1966fd5a12d64a5992092f4bc7d))
* client-extension test failures ([#874](https://github.com/zenstackhq/zenstack/issues/874)) ([f2ab6a5](https://github.com/zenstackhq/zenstack/commit/f2ab6a521195c4981fd89a5d4094e4130c5b336c))
* condition error in zod generator ([#810](https://github.com/zenstackhq/zenstack/issues/810)) ([eb6ef1f](https://github.com/zenstackhq/zenstack/commit/eb6ef1f3e24988066d41cc16ad718d6379bfbfed))
* conditions hoisted from nested read overwrites toplevel where conditions ([#635](https://github.com/zenstackhq/zenstack/issues/635)) ([9a35f88](https://github.com/zenstackhq/zenstack/commit/9a35f88c059ff4e616d1f54b1e0e01c3c5ce6e19))
* deal with payload field value with undefined ([#778](https://github.com/zenstackhq/zenstack/issues/778)) ([e41fc74](https://github.com/zenstackhq/zenstack/commit/e41fc747c5a8389d820820c5f8fd95ee13717160))
* decimal field zod validation ([#660](https://github.com/zenstackhq/zenstack/issues/660)) ([522df7a](https://github.com/zenstackhq/zenstack/commit/522df7ac0d42aee1dbc29b42e8acfa431771bb3b))
* deprecated `cuid` dependency & clean up CI file ([#359](https://github.com/zenstackhq/zenstack/issues/359)) ([9f79e51](https://github.com/zenstackhq/zenstack/commit/9f79e51351b847e9da422144383613e7f0c2f063))
* deprecated import from "@prisma/client/runtime" ([#398](https://github.com/zenstackhq/zenstack/issues/398)) ([da7d88c](https://github.com/zenstackhq/zenstack/commit/da7d88c2bd60e58b32d6c6f0a613daca24f65375))
* disable eslint in generated hooks, refactor package inter-dependencies ([9e84126](https://github.com/zenstackhq/zenstack/commit/9e8412645e06f0bf63f85c8bb61ad00384fdef99))
* disable textmate bundle when JetBrains plugin is uninstalled ([#918](https://github.com/zenstackhq/zenstack/issues/918)) ([7e9cc35](https://github.com/zenstackhq/zenstack/commit/7e9cc35a68ed31e25e7c7eac764528f55a18ac7b))
* don't import unused enum when generating policy guards ([#686](https://github.com/zenstackhq/zenstack/issues/686)) ([a5c110b](https://github.com/zenstackhq/zenstack/commit/a5c110b41351d1d28cbe7f61264e04a890e752d8))
* duplicated zod schema imported when there're multiple fields with an enum type ([#633](https://github.com/zenstackhq/zenstack/issues/633)) ([4b70853](https://github.com/zenstackhq/zenstack/commit/4b70853868c8f456ed1fd3dd836f0f2e36ed3e11))
* enable auto completion inside attribute ([#949](https://github.com/zenstackhq/zenstack/issues/949)) ([20d5bfc](https://github.com/zenstackhq/zenstack/commit/20d5bfc506a42b520eb1cf390149b7afc7c38701))
* enhanced client doesn't work with client extensions that add new model methods ([7dec167](https://github.com/zenstackhq/zenstack/commit/7dec167b8c3bb03c3cae57e6566b223bfce57cca))
* enhanced client doesn't work with client extensions that add new model methods ([#851](https://github.com/zenstackhq/zenstack/issues/851)) ([ea564c9](https://github.com/zenstackhq/zenstack/commit/ea564c93e9ca2a888c0e53216633d66c733f6beb))
* expression context check issue on initial loading ([#544](https://github.com/zenstackhq/zenstack/issues/544)) ([05b5554](https://github.com/zenstackhq/zenstack/commit/05b55541f3ae55214318db4f0de20b8ba97bb2f8))
* fastify plugin correctly returning the reply [#684](https://github.com/zenstackhq/zenstack/issues/684) ([#685](https://github.com/zenstackhq/zenstack/issues/685)) ([7a04ce5](https://github.com/zenstackhq/zenstack/commit/7a04ce5ad0a208fb05887198b8b598742834a15b))
* fix policy generation for collection predicate expressions ([#706](https://github.com/zenstackhq/zenstack/issues/706)) ([b8a875e](https://github.com/zenstackhq/zenstack/commit/b8a875e6be6ce6cba7d2683cf8f71b840444601a))
* fix react-query code-gen and improve mutation options merging ([#314](https://github.com/zenstackhq/zenstack/issues/314)) ([51484a7](https://github.com/zenstackhq/zenstack/commit/51484a76f90e5efd0a651bab9f6aa864baab95f2))
* fix the incorrect query args reduction when there're mixed boolean operators ([#690](https://github.com/zenstackhq/zenstack/issues/690)) ([c0c5a16](https://github.com/zenstackhq/zenstack/commit/c0c5a164c50c15c8d1982f331cbcac4eae5138b7))
* generate .zenstack to the node_modules of the real path of runtime folder ([52e9f82](https://github.com/zenstackhq/zenstack/commit/52e9f82bb7c6e0b8467fd3b4cc72bc1a8b44667d))
* generate .zenstack with the same level of [@zenstackhq](https://github.com/zenstackhq) ([#464](https://github.com/zenstackhq/zenstack/issues/464)) ([2bb0b2b](https://github.com/zenstackhq/zenstack/commit/2bb0b2bfeeb51ada09ace5489b9e36bd09dd7e90))
* generate both cjs and esm builds for swr plugin ([#892](https://github.com/zenstackhq/zenstack/issues/892)) ([385839f](https://github.com/zenstackhq/zenstack/commit/385839f101941234c5293d70d07e064c1c458387))
* generate foreign key field in zod schemas ([#868](https://github.com/zenstackhq/zenstack/issues/868)) ([124a0a2](https://github.com/zenstackhq/zenstack/commit/124a0a2a15306022501f071beb855fe03de21aa3))
* handle @[@ignore](https://github.com/ignore) models properly in plugins ([#283](https://github.com/zenstackhq/zenstack/issues/283)) ([6f7cb0e](https://github.com/zenstackhq/zenstack/commit/6f7cb0e6513d606c98b097c65c0573ad1f006b2c))
* handle foreign key field-level access check during relation update ([#847](https://github.com/zenstackhq/zenstack/issues/847)) ([3c8cba7](https://github.com/zenstackhq/zenstack/commit/3c8cba71b283d6029087971fc3b160892d0d143e))
* handle invalid json in openapi query params gracefully ([68a08a3](https://github.com/zenstackhq/zenstack/commit/68a08a3613bd1e549178d9462d23185a740f099a))
* handle invalid request path properly in openapi handler ([bda4a4f](https://github.com/zenstackhq/zenstack/commit/bda4a4f31e99c3f4d572dd975f9a6b72b6c96503))
* handle invalid request path properly in openapi handler ([#305](https://github.com/zenstackhq/zenstack/issues/305)) ([955e657](https://github.com/zenstackhq/zenstack/commit/955e657e02cef8f85e6f78acd74c18c2e3ff7b87))
* hooks generation emits Provider export for backward compatibility ([#594](https://github.com/zenstackhq/zenstack/issues/594)) ([ca3ebda](https://github.com/zenstackhq/zenstack/commit/ca3ebdae4e213d3901bb5834fd9ebf1217da94a7))
* improve binary & unary expression applicability check ([#589](https://github.com/zenstackhq/zenstack/issues/589)) ([eb2d896](https://github.com/zenstackhq/zenstack/commit/eb2d896b415f5426944960a58cca7d2f028bf581))
* improve clarity of dealing with `auth()` during policy generation ([#293](https://github.com/zenstackhq/zenstack/issues/293)) ([c3b456a](https://github.com/zenstackhq/zenstack/commit/c3b456a3b6e841d7eedc7565ef87cafd90fca2d6))
* improve consistency of generated guard code ([#616](https://github.com/zenstackhq/zenstack/issues/616)) ([1b7b5bd](https://github.com/zenstackhq/zenstack/commit/1b7b5bda3f5106d31b7f5e70be27158fb8217600))
* improve error messages ([#502](https://github.com/zenstackhq/zenstack/issues/502)) ([c8e5724](https://github.com/zenstackhq/zenstack/commit/c8e572449b3ff464da0cb071cda40b9d27f8de53))
* improve generated typing for polymorphic models ([#1002](https://github.com/zenstackhq/zenstack/issues/1002)) ([7b453f7](https://github.com/zenstackhq/zenstack/commit/7b453f7745cad73fc81e7884faf473aecda99556))
* improve stacktrace of errors generated by proxied Prisma methods ([#484](https://github.com/zenstackhq/zenstack/issues/484)) ([1b67eba](https://github.com/zenstackhq/zenstack/commit/1b67ebadb89c5c443eacb9cf0be9ad56dbc42de4))
* incorrect policy code generated when the rule only contains a single field reference ([#511](https://github.com/zenstackhq/zenstack/issues/511)) ([0ea071b](https://github.com/zenstackhq/zenstack/commit/0ea071b74730ce5f7a337ed15f74774883b5f497))
* incorrect policy injection for nested to-one relation inside a to-many parent ([#777](https://github.com/zenstackhq/zenstack/issues/777)) ([876e013](https://github.com/zenstackhq/zenstack/commit/876e01392112ed369cde37cb77ca983126f2d881))
* incorrect relation owner analysis ([bb64b8a](https://github.com/zenstackhq/zenstack/commit/bb64b8a22c10032111d2c947c59e45e5995e6ed4))
* incorrect relation owner analysis ([#610](https://github.com/zenstackhq/zenstack/issues/610)) ([c89012b](https://github.com/zenstackhq/zenstack/commit/c89012bcb8d32588cc7f5a1df19088292e571cec))
* incorrect reverse query built for to-many relation ([d2ad3a5](https://github.com/zenstackhq/zenstack/commit/d2ad3a59f93a74189c29d3ee2960fc887b14851c))
* incorrect reverse query built for to-many relation ([#815](https://github.com/zenstackhq/zenstack/issues/815)) ([2c345e1](https://github.com/zenstackhq/zenstack/commit/2c345e1d4fe7274b7a08c1178afccede1d694327))
* Inherited fields from abstract model should be on the top ([#487](https://github.com/zenstackhq/zenstack/issues/487)) ([6d1afc1](https://github.com/zenstackhq/zenstack/commit/6d1afc1886d553250d4ad0e473c7978577d08b75)), closes [#486](https://github.com/zenstackhq/zenstack/issues/486)
* invalid query sent to Prisma when doing nested update with multi-id ([#553](https://github.com/zenstackhq/zenstack/issues/553)) ([24760be](https://github.com/zenstackhq/zenstack/commit/24760be0f6286089c58df893ec1ae9c192ba17e2))
* issue [#627](https://github.com/zenstackhq/zenstack/issues/627) ([#628](https://github.com/zenstackhq/zenstack/issues/628)) ([2ef93cb](https://github.com/zenstackhq/zenstack/commit/2ef93cb932e7aed6923cd3d7e69069d0c9ff161b))
* issue 599, throw error if the given user context doesn't contain full id fields ([#629](https://github.com/zenstackhq/zenstack/issues/629)) ([4bc72a8](https://github.com/zenstackhq/zenstack/commit/4bc72a8b93558059a80dc465dc408da33b0adba3))
* issue 961, incorrect policy injection for nested `updateMany` ([bf690a0](https://github.com/zenstackhq/zenstack/commit/bf690a072771ab95907a8f56079c4f6aaf655849))
* issue 961, incorrect policy injection for nested `updateMany` ([#962](https://github.com/zenstackhq/zenstack/issues/962)) ([2b2bfcf](https://github.com/zenstackhq/zenstack/commit/2b2bfcff965f9a70ff2764e6fbc7613b6f061685))
* issue with client typing generation in trpc plugin ([#673](https://github.com/zenstackhq/zenstack/issues/673)) ([576c4f7](https://github.com/zenstackhq/zenstack/commit/576c4f7a4858dfa2dcb9c1a7f75af8d1ca48a8ce))
* issue with connecting multiple relations ([#450](https://github.com/zenstackhq/zenstack/issues/450)) ([dd6be95](https://github.com/zenstackhq/zenstack/commit/dd6be9509c46fd4dfff500a53070259410b6a61f))
* lint issue in generated swr/tanstack hooks ([#877](https://github.com/zenstackhq/zenstack/issues/877)) ([4577232](https://github.com/zenstackhq/zenstack/commit/45772326c7980f5338452d4048c43f76a6b09bf0))
* Load plugin models in vscode extension ([#336](https://github.com/zenstackhq/zenstack/issues/336)) ([4e27a00](https://github.com/zenstackhq/zenstack/commit/4e27a009b0486c8768b935494bcd0f6b449e9e84))
* make core plugins compile generated ts files by default ([#373](https://github.com/zenstackhq/zenstack/issues/373)) ([4bf1304](https://github.com/zenstackhq/zenstack/commit/4bf1304c6518cc027b1a1f2d33fea70979d9d94b))
* make sure auxiliary fields in nested entities are stripped ([#387](https://github.com/zenstackhq/zenstack/issues/387)) ([5616c05](https://github.com/zenstackhq/zenstack/commit/5616c056aaee14d3b8566161493b2694c3c8e6ae))
* make sure Buffer is imported ([#596](https://github.com/zenstackhq/zenstack/issues/596)) ([76a0bac](https://github.com/zenstackhq/zenstack/commit/76a0bac9c63707baf34a072e398b63156c1e0640))
* make sure zod schemas are lazily loaded ([#265](https://github.com/zenstackhq/zenstack/issues/265)) ([b7548d1](https://github.com/zenstackhq/zenstack/commit/b7548d17999df1862bd15be470b611625e8e5445))
* make sure zod schemas have type annotations ([#574](https://github.com/zenstackhq/zenstack/issues/574)) ([51985b1](https://github.com/zenstackhq/zenstack/commit/51985b1279dca8e82a7275330a7b6597f37d15a4))
* merge errors in github workflow files and formatting issues ([6867e79](https://github.com/zenstackhq/zenstack/commit/6867e795d7a683da1db601bbf2de2c77d0d05ed3))
* merge errors in github workflow files and formatting issues ([#1022](https://github.com/zenstackhq/zenstack/issues/1022)) ([252151c](https://github.com/zenstackhq/zenstack/commit/252151c47aa670c1e9fc3b1a51e74b6a26c21f6a))
* misc fixes about server adapters and more tests ([#431](https://github.com/zenstackhq/zenstack/issues/431)) ([764ff2a](https://github.com/zenstackhq/zenstack/commit/764ff2ab50ebdb4665cde071dd366e3dad01260e))
* missing string quote during function arg gen ([#234](https://github.com/zenstackhq/zenstack/issues/234)) ([88828e3](https://github.com/zenstackhq/zenstack/commit/88828e309c8aab2a43bd06c7f9beaadcb070d3a6))
* more precise Zod refinement types ([#678](https://github.com/zenstackhq/zenstack/issues/678)) ([1564fe3](https://github.com/zenstackhq/zenstack/commit/1564fe3a72cfafd73702d6d092a53b685d681686))
* nullify field instead of reject when an optional relation field is not readable ([#588](https://github.com/zenstackhq/zenstack/issues/588)) ([fc16008](https://github.com/zenstackhq/zenstack/commit/fc16008ba20aba18f39948f3ff13ec3bc79729e3))
* number literal precision issue ([#659](https://github.com/zenstackhq/zenstack/issues/659)) ([6275701](https://github.com/zenstackhq/zenstack/commit/627570166f858488aa7fb6a6291fccfadb0d9f9f))
* open-api issues ([#446](https://github.com/zenstackhq/zenstack/issues/446)) ([2855647](https://github.com/zenstackhq/zenstack/commit/285564751094797da8484bf041a9d3a4eafafc9d))
* openapi - do not generate "id" field in create input if the field has default value ([#758](https://github.com/zenstackhq/zenstack/issues/758)) ([787a244](https://github.com/zenstackhq/zenstack/commit/787a24453c3a32250260ebc138c26a829074ae8f))
* openapi generator relation handling ([#320](https://github.com/zenstackhq/zenstack/issues/320)) ([f1c9765](https://github.com/zenstackhq/zenstack/commit/f1c9765b778f8fb476c015a2f3bbe72dd94ef6b0))
* openapi plugin - make sure components are generated even model is marked ignored ([#422](https://github.com/zenstackhq/zenstack/issues/422)) ([a5848ea](https://github.com/zenstackhq/zenstack/commit/a5848ea5ef85e4715d8618a67c427c8f2e081b3f))
* openapi plugin bugs - relation handling and spec version ([#317](https://github.com/zenstackhq/zenstack/issues/317)) ([dd62f8d](https://github.com/zenstackhq/zenstack/commit/dd62f8d13c97c56a4247245b619c1fce46b82f89))
* optimize generated trpc typing and fix "select" issue ([#972](https://github.com/zenstackhq/zenstack/issues/972)) ([c0d60a0](https://github.com/zenstackhq/zenstack/commit/c0d60a00eac9392cb061927126a41a5287467289))
* optimize the way how generated packages are loaded in test environment ([#549](https://github.com/zenstackhq/zenstack/issues/549)) ([18267f6](https://github.com/zenstackhq/zenstack/commit/18267f6377a926cc332bedab6cf74e8a9b9f2343))
* policy generation error when field-level rules contain "this" expression ([#670](https://github.com/zenstackhq/zenstack/issues/670)) ([dc106a9](https://github.com/zenstackhq/zenstack/commit/dc106a905f732c90c70f7622df5a1207b442e1ff))
* Policy generator error for Auth() with multiple level member access ([#922](https://github.com/zenstackhq/zenstack/issues/922)) ([ecf0c19](https://github.com/zenstackhq/zenstack/commit/ecf0c1975403a2b8b70300140b92518cbc34a886))
* policy generator fails on Windows for custom output path ([#583](https://github.com/zenstackhq/zenstack/issues/583)) ([32c7279](https://github.com/zenstackhq/zenstack/commit/32c727934456127470a53ed13ad65d33ff94e97d))
* post-update rules incorrectly reject update ([#826](https://github.com/zenstackhq/zenstack/issues/826)) ([d921a7c](https://github.com/zenstackhq/zenstack/commit/d921a7ca6bef0341ccf5bc50e195156695129e7f))
* post-update rules incorrectly reject update ([#826](https://github.com/zenstackhq/zenstack/issues/826)) ([e85831e](https://github.com/zenstackhq/zenstack/commit/e85831e98d08a433febb5a8fecf8d539150ced08))
* prisma schema generation issue with calling attribute function with literal ([#930](https://github.com/zenstackhq/zenstack/issues/930)) ([91fe8e7](https://github.com/zenstackhq/zenstack/commit/91fe8e71b513804de36d08b03c37b0c175580906))
* proceed with linking even if zmodel contains parsing error ([#327](https://github.com/zenstackhq/zenstack/issues/327)) ([9138da6](https://github.com/zenstackhq/zenstack/commit/9138da638b900f0d3252e60d42bf33b2edb777e1))
* properly handle nullable fields in openapi generator ([#906](https://github.com/zenstackhq/zenstack/issues/906)) ([0e422ad](https://github.com/zenstackhq/zenstack/commit/0e422adf1a7f274b850eeba09ef1781b13ce9f1b))
* query injection error when create (in array form) is nested inside an update ([#865](https://github.com/zenstackhq/zenstack/issues/865)) ([ca55bf6](https://github.com/zenstackhq/zenstack/commit/ca55bf61edff7a67765cd8a9eac2b97daaf33506))
* reference resolution issue inside collection predicate expressions ([#927](https://github.com/zenstackhq/zenstack/issues/927)) ([d8dce13](https://github.com/zenstackhq/zenstack/commit/d8dce13505e5753aa646fc3aa168da754b75e8aa))
* remove warning in vercel environment ([#954](https://github.com/zenstackhq/zenstack/issues/954)) ([0aa69d9](https://github.com/zenstackhq/zenstack/commit/0aa69d987d8a2eb60800d7ff76347ebf078b70f6))
* repl in pnpm environment, improve relative path module loading ([#866](https://github.com/zenstackhq/zenstack/issues/866)) ([e7d29fd](https://github.com/zenstackhq/zenstack/commit/e7d29fda6e80bee46c9e05ff5a2af5266478b9ad))
* report validation error when binary expressions have arrays ([#719](https://github.com/zenstackhq/zenstack/issues/719)) ([2e9fe67](https://github.com/zenstackhq/zenstack/commit/2e9fe67cf8e247bae7838417dd567de94adac39e))
* require with default ([#546](https://github.com/zenstackhq/zenstack/issues/546)) ([1e9fe1c](https://github.com/zenstackhq/zenstack/commit/1e9fe1cfcf50b691bf788021b8a460b1f3ecb29e))
* resolve member access expr only in the context of operand type ([#761](https://github.com/zenstackhq/zenstack/issues/761)) ([ccae413](https://github.com/zenstackhq/zenstack/commit/ccae413418d7f8259068e2668bdb8fdafb7305b6))
* resolve to the correct enum in field attribute when there's ambiguity ([#513](https://github.com/zenstackhq/zenstack/issues/513)) ([3b07a1e](https://github.com/zenstackhq/zenstack/commit/3b07a1e32700c7ff849a3c95e8e67b7a7be44a39))
* rest api should return error reason ([#507](https://github.com/zenstackhq/zenstack/issues/507)) ([4b389fb](https://github.com/zenstackhq/zenstack/commit/4b389fb648cc42a88c3a7628efebd7f438d110e7))
* rest-api, wrong links generated for to-one relationship ([#481](https://github.com/zenstackhq/zenstack/issues/481)) ([21affec](https://github.com/zenstackhq/zenstack/commit/21affec12da5b8bb31b774791405d2773dec9072))
* shadowDatabaseUrl typo in prisma generator ([#452](https://github.com/zenstackhq/zenstack/issues/452)) ([7ddeec5](https://github.com/zenstackhq/zenstack/commit/7ddeec5c5dfded0f195e2f978e4b9b2a87f653c4))
* short-circuit post-read check when policy rules don't depend on model fields ([#376](https://github.com/zenstackhq/zenstack/issues/376)) ([a54eba4](https://github.com/zenstackhq/zenstack/commit/a54eba45f64382ed070e5aeabe0c8dc263bebc0d))
* Show the correct incomplete error for multiple level inheritance  ([#916](https://github.com/zenstackhq/zenstack/issues/916)) ([b71c1c5](https://github.com/zenstackhq/zenstack/commit/b71c1c53983f77bcfe8f40a1f931547499c9d4ff))
* Show validation error for the field comparison not in the same model ([#912](https://github.com/zenstackhq/zenstack/issues/912)) ([8d5bfe4](https://github.com/zenstackhq/zenstack/commit/8d5bfe402e2219b69520dbd0b820c9f3ba16a2ea))
* stricter binary operation operand type compatibility check ([#846](https://github.com/zenstackhq/zenstack/issues/846)) ([03315cc](https://github.com/zenstackhq/zenstack/commit/03315cc9dfe19e5bf23b23178cba2dfbce89686e))
* Support code action of generating relation fields for both sides ([#281](https://github.com/zenstackhq/zenstack/issues/281)) ([be0a88d](https://github.com/zenstackhq/zenstack/commit/be0a88da7f316256a34666b0c093fad534cd38ac))
* support default values in generated zod schemas ([#914](https://github.com/zenstackhq/zenstack/issues/914)) ([0f73e56](https://github.com/zenstackhq/zenstack/commit/0f73e569b496da1dbedff61e1846af3b2bdc2b03))
* support for custom prisma client output path ([#514](https://github.com/zenstackhq/zenstack/issues/514)) ([5f3669e](https://github.com/zenstackhq/zenstack/commit/5f3669e53363bbfb035f100d0c6e2d14cef69c24))
* support for string escaping in ZModel ([#668](https://github.com/zenstackhq/zenstack/issues/668)) ([f034839](https://github.com/zenstackhq/zenstack/commit/f034839867fa438da866bd87548b4a18246dee21))
* Support implicit many-to-many ([#286](https://github.com/zenstackhq/zenstack/issues/286)) ([317ba8d](https://github.com/zenstackhq/zenstack/commit/317ba8db9df0d11ddf9085b8b1f30f9e10c13d97))
* support loading plugin.zmodel from a relative path ([#837](https://github.com/zenstackhq/zenstack/issues/837)) ([66ab915](https://github.com/zenstackhq/zenstack/commit/66ab915dc152259e74d12e12d23a95eea310ec86))
* support object literal in plugin fields processing ([#351](https://github.com/zenstackhq/zenstack/issues/351)) ([8284988](https://github.com/zenstackhq/zenstack/commit/8284988cf12c3c4f3983c36c3658201db5509b2c))
* support postgres extensions ([#718](https://github.com/zenstackhq/zenstack/issues/718)) ([cdc98e0](https://github.com/zenstackhq/zenstack/commit/cdc98e08224a23ea3f6e5d620c11c90a34ed6435))
* support string literal keys for object expressions in ZModel ([#752](https://github.com/zenstackhq/zenstack/issues/752)) ([22b1bf9](https://github.com/zenstackhq/zenstack/commit/22b1bf9ddd4062000f2cd7d183e004dd3d5917c6))
* swr hooks support no revalidation ([#871](https://github.com/zenstackhq/zenstack/issues/871)) ([673bdd3](https://github.com/zenstackhq/zenstack/commit/673bdd3a4d54db72cdb0561669801b7be633c904))
* tanstack-query build issues and bugs in optimistic update ([#843](https://github.com/zenstackhq/zenstack/issues/843)) ([08d317d](https://github.com/zenstackhq/zenstack/commit/08d317d150b99fc38b8e5fb56bb4ab27fe1b4470))
* tanstack-query, fix the incorrect query typing when user provides a custom selector ([#967](https://github.com/zenstackhq/zenstack/issues/967)) ([cc98e30](https://github.com/zenstackhq/zenstack/commit/cc98e306559d7729d96d4ed77cda2815454fbb8f))
* trpc client helper bugs ([#532](https://github.com/zenstackhq/zenstack/issues/532)) ([4097915](https://github.com/zenstackhq/zenstack/commit/40979154c88d31d3891c361caf4ab16a4888b178))
* trpc mutation route should return undefined when result is not readable ([#227](https://github.com/zenstackhq/zenstack/issues/227)) ([a3926c2](https://github.com/zenstackhq/zenstack/commit/a3926c2d69353c5f047f68d70f717db6872cce20))
* trpc plugin, generate schema for supporting unchecked input in mutation routes ([#512](https://github.com/zenstackhq/zenstack/issues/512)) ([304979f](https://github.com/zenstackhq/zenstack/commit/304979f4847258eff8b04675bc3e199ac0857173))
* typing generated for options parameter in the hooks method ([#946](https://github.com/zenstackhq/zenstack/issues/946)) ([acb23d1](https://github.com/zenstackhq/zenstack/commit/acb23d1d1e3f5ff1ce3452971ac7103c6a38326c))
* typing of policy definition ([#640](https://github.com/zenstackhq/zenstack/issues/640)) ([acd0753](https://github.com/zenstackhq/zenstack/commit/acd075392a2237e12ef88a55f13de701e172f57d))
* undefined field access when selecting with _count ([#403](https://github.com/zenstackhq/zenstack/issues/403)) ([d90d7c8](https://github.com/zenstackhq/zenstack/commit/d90d7c83e95d33c85e9c3b4b650e014ee76136c3))
* update langium version ([26dd30f](https://github.com/zenstackhq/zenstack/commit/26dd30f8a00e030d4ec605cf0b88261e2944c43a))
* update langium version ([#290](https://github.com/zenstackhq/zenstack/issues/290)) ([23180ce](https://github.com/zenstackhq/zenstack/commit/23180cee63fd5a140d154857c170d597224679e6))
* update rule check for connect with implicit many-to-many relation ([#565](https://github.com/zenstackhq/zenstack/issues/565)) ([ffdad27](https://github.com/zenstackhq/zenstack/commit/ffdad2713e71071b53ac3fd13b82b38673d7b6f6))
* Update start line of JsDoc comments in zmodel to start with two … ([#428](https://github.com/zenstackhq/zenstack/issues/428)) ([a3473ea](https://github.com/zenstackhq/zenstack/commit/a3473eaec2d32d06c2a51442fbd0d81a435e1197))
* use find-up to find correct package manager in mono repo ([#249](https://github.com/zenstackhq/zenstack/issues/249)) ([5e4e1d6](https://github.com/zenstackhq/zenstack/commit/5e4e1d6021a3faa6c2ac78a5bc4b54fd70d46982))
* User model not found when using policy in the imported model ([#457](https://github.com/zenstackhq/zenstack/issues/457)) ([dd36959](https://github.com/zenstackhq/zenstack/commit/dd36959140eaccc56036575255a274633d5416ab))
* Validation errors when using true or false as prefix of id ([#530](https://github.com/zenstackhq/zenstack/issues/530)) ([551b33d](https://github.com/zenstackhq/zenstack/commit/551b33d8bec622e445b5635ae4a147774c91c0fe))
* VsCode error textDocument/codeAction failed ([#915](https://github.com/zenstackhq/zenstack/issues/915)) ([3afe42f](https://github.com/zenstackhq/zenstack/commit/3afe42f9b0b1fda4dfbe18d359824d0f4829fc3b))
* vscode language accidentally bundles prisma packages  ([#625](https://github.com/zenstackhq/zenstack/issues/625)) ([f6b68da](https://github.com/zenstackhq/zenstack/commit/f6b68dabc9e089230bc6d8f8e802e8fbc43a8a69))
* vscode language accidentally bundles prisma packages ([#623](https://github.com/zenstackhq/zenstack/issues/623)) ([a81913e](https://github.com/zenstackhq/zenstack/commit/a81913e69d3533874c038279d1d4d226ad685d8d))
* when field policy only has deny rule, access should be allowed when the rule doesn't satisfy ([#818](https://github.com/zenstackhq/zenstack/issues/818)) ([62a8200](https://github.com/zenstackhq/zenstack/commit/62a82001cde1c8e0ac598035b8df77b9049fabaa))
* **workflows:** correct paths for config-file and manifest-file in release-please-action configuration ([b9b784c](https://github.com/zenstackhq/zenstack/commit/b9b784c2ba53ca51abfb5d0ea3b5e543cd7f7c9e))
* wrap generated trpc routes with error handling ([#338](https://github.com/zenstackhq/zenstack/issues/338)) ([7012ef5](https://github.com/zenstackhq/zenstack/commit/7012ef55afbf374ededaf23b6afb64afe497e592))
* wrong dev dependency in cli project ([#318](https://github.com/zenstackhq/zenstack/issues/318)) ([181f9ef](https://github.com/zenstackhq/zenstack/commit/181f9ef17899d11d23369f1d485c2d964e2d4561))
* wrong endpoint requested in generated SWR hooks ([#503](https://github.com/zenstackhq/zenstack/issues/503)) ([3078e12](https://github.com/zenstackhq/zenstack/commit/3078e1292d09b3f4b49bdea4ebbb50504fbc4c1b))
* wrong payload injected for nested create in update ([#715](https://github.com/zenstackhq/zenstack/issues/715)) ([d8f0954](https://github.com/zenstackhq/zenstack/commit/d8f0954fc15b6ea3df033a7c5fea414ff4aba8c9))
* wrong return type of generated `count` hook ([#347](https://github.com/zenstackhq/zenstack/issues/347)) ([2035319](https://github.com/zenstackhq/zenstack/commit/2035319a030369dc0c847eaac248f2d9acdc7c7b))
* wrong type generated for `groupBy` hook ([#344](https://github.com/zenstackhq/zenstack/issues/344)) ([83fd21e](https://github.com/zenstackhq/zenstack/commit/83fd21e5b2c55ca182386be61151386f0400bdd0))
* wrong validation error when relation field is marked [@id](https://github.com/id) instead of [@unique](https://github.com/unique) ([#395](https://github.com/zenstackhq/zenstack/issues/395)) ([9a18af6](https://github.com/zenstackhq/zenstack/commit/9a18af6c0665958f0cc5d1b948cef6db40d6e1ed))
* zenstack generate fails when path contains space ([#845](https://github.com/zenstackhq/zenstack/issues/845)) ([e99ad2c](https://github.com/zenstackhq/zenstack/commit/e99ad2cdd495251e15abc47172aa37814f55c7b4))
* zod and openapi generation error when "fullTextSearch" is enabled ([#658](https://github.com/zenstackhq/zenstack/issues/658)) ([0cb7cd1](https://github.com/zenstackhq/zenstack/commit/0cb7cd1ae5e8c5d4a72d0891c9624291aafcbcd8))
* zod plugin issue with lower-case model names ([#396](https://github.com/zenstackhq/zenstack/issues/396)) ([d6fba93](https://github.com/zenstackhq/zenstack/commit/d6fba93e2f0149c14f67d4cd0b4e9cdb6eee73a5))
* zod schema compilation errors in pnpm environment due to peer dependencies ([#568](https://github.com/zenstackhq/zenstack/issues/568)) ([858b075](https://github.com/zenstackhq/zenstack/commit/858b075ca193ae26673aaefc052cc7c029a26c08))
* zod typing for `DateTime` field, improve overall code generation ([#363](https://github.com/zenstackhq/zenstack/issues/363)) ([e93ca5b](https://github.com/zenstackhq/zenstack/commit/e93ca5bf10c6afdfd723961d3c91c2cd512eb8c8))


### Performance Improvements

* improve runtime performance by removing expensive verbose logging ([#371](https://github.com/zenstackhq/zenstack/issues/371)) ([0d7a2bf](https://github.com/zenstackhq/zenstack/commit/0d7a2bf417c6ea5cc5c6c3568593a0fbe7d7903e))

## 0.5.0 (2022-12-15)

### Features

-   Serialization between client (hooks) and server now uses [superjson](https://github.com/blitz-js/superjson), [[#139](https://github.com/zenstackhq/zenstack/issues/139)]

### Fixes and improvements

-   Fixed goto definition issue in VSCode extension, [[#69](https://github.com/zenstackhq/zenstack/issues/69)]

### Breaking changes

-   Next-auth adapter and helper are moved to a separate package `@zenstackhq/next-auth`.

## 0.4.0 (2022-12-01)

### Features

-   `zenstack init` command for initializing a project, [#109](https://github.com/zenstackhq/zenstack/issues/109), [doc](https://zenstack.dev/#/quick-start?id=adding-to-an-existing-project).

-   Field constraint suport, [#94](https://github.com/zenstackhq/zenstack/issues/94), [doc](https://zenstack.dev/#/zmodel-field-constraint).

-   Support for server-side CRUD with access policy check (SSR), [#126](https://github.com/zenstackhq/zenstack/issues/126), [doc](https://zenstack.dev/#/server-side-rendering).

-   Options for disabling fetching in hooks (useful when arguments are not ready), [#57](https://github.com/zenstackhq/zenstack/issues/57), [doc](https://zenstack.dev/#/runtime-api?id=requestoptions).

-   Telemetry in CLI, [#102](https://github.com/zenstackhq/zenstack/issues/102), [doc](https://zenstack.dev/#/telemetry).

-   Iron-session based starter, [#95](https://github.com/zenstackhq/zenstack/issues/95), [link](https://github.com/zenstackhq/nextjs-iron-session-starter).

-   Barebone starter (without authentication), [link](https://github.com/zenstackhq/nextjs-barebone-starter).

-   [Website](https://zenstack.dev) is live!

### Fixes and improvements

-   Merge `@zenstackhq/internal` into `@zenstackhq/runtime` so as to have a single runtime dependency, [#70](https://github.com/zenstackhq/zenstack/issues/70).

-   More accurate log for access policy violation, [#71](https://github.com/zenstackhq/zenstack/issues/71).

-   `auth()` function's return type is now resolved to `User` model in ZModel, instead of `Any`, [#65](https://github.com/zenstackhq/zenstack/issues/65).

-   Improved ZModel type checking, [#67](https://github.com/zenstackhq/zenstack/issues/67), [#46](https://github.com/zenstackhq/zenstack/issues/46), [#99](https://github.com/zenstackhq/zenstack/issues/99).

-   Upgraded to Prisma 4.7.

### Breaking changes

-   @zenstackhq/runtime doesn't export anything now.

    Use @zenstackhq/runtime/types for type definitions shared between client and server, @zenstackhq/runtime/client for client-specific libaries (like React hooks), and @zenstackhq/runtime/server for server-specific libraries.

## 0.3.0 (2022-11-08)

### Features

-   `@password` and `@omit` attribute support

-   Configurable logging (to stdout and emitting as events)

### Fixes and improvements

-   More robust policy checks

-   Properly handles complex types like BigInt, Date, Decimal, etc.

-   Makes sure Prisma schema is regenerated for related CLI commands

-   Lower VSCode engine version requirement for the extension

-   Better overall documentation

## 0.2.0 (2022-10-29)

### Features

-   `ZModel` data modeling schema (an extension to [Prisma Schema](https://www.prisma.io/docs/concepts/components/prisma-schema))

-   `zenstack` cli for generating RESTful services, auth adapters and React hooks from `ZModel`

-   Policy engine that transforms policy rules into Prisma query conditions

-   Runtime packages

-   An initial set of tests
