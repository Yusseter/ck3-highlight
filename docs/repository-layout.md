# Repository Layout

| Path | Responsibility |
| --- | --- |
| `src/` | Extension runtime, formatter, project detection and semantic indexing |
| `src/file-types.json` | Shared file-type registry for detection and manifest associations |
| `grammars/` | Readable grammar source rules and keyword/compatibility lists |
| `syntaxes/` | Runtime TextMate grammars shipped in the VSIX |
| `syntaxes/localization/` | Private YAML-derived localization grammar family |
| `icons/` | Extension and language artwork referenced by the manifest |
| `scripts/` | Offline builds, validation, editor tests and Tiger synchronization |
| `generated/tiger/` | Deterministic Tiger feed snapshots and source provenance |
| `test/` | Regression fixtures and native VS Code integration tests |
| `docs/` | File coverage, development guides, provenance and release checks |
| `docs/development/` | Ignored local plans, history and archive/source inventories |
| `licenses/` | Upstream license texts |
| `dist/` | Ignored current and previous versioned VSIX packages |
| `dist/history/` | Earlier development builds that share a version with a newer build |

## Project Scope

Only Crusader Kings III script and localization are supported. The internal `source.paradox` grammar and its scope names are the CK3 lexical foundation, not a separate public language or support for other games. Retaining those names preserves existing theme rules.

`ck3-tiger.conf` is an optional, exact-name script association. It does not require installing Tiger and does not associate arbitrary `.conf` files.

`docs/` contains persistent project documentation. Local execution plans, development chronology, archive inventories and the working source CSV live under `docs/development/`. The whole folder is ignored by Git and excluded from the VSIX; individual files need no ignore rules. These records are not project dependencies or required build inputs. Public source/license information belongs in `NOTICE.md`, `docs/licensing-status.md` and the grammar provenance metadata.

`pnpm run build` updates manifest associations and compiled grammars without a Tiger checkout. `pnpm run check` verifies generated outputs and runtime paths. Tiger synchronization is a separate source-update operation; its local 1.20 checkout is not a runtime dependency.

## Formatting Conventions

| Content | Project convention |
| --- | --- |
| JavaScript, JSON and JSONC | Two spaces per level |
| YAML configuration | Spaces, two per level |
| Markdown | One physical line per paragraph; spaces for list indentation |
| Fenced code examples | Follow the embedded language rather than Markdown's list indentation |

The project follows [Prettier's common two-space, spaces-only indentation defaults](https://prettier.io/docs/options#tab-width). `.editorconfig` and `.prettierrc.json` keep editor and command-line formatting aligned. `pnpm run format` applies the style; `pnpm run format:check` verifies it. The normal `check` and package commands also reject formatting drift. Generated grammar/feed JSON uses the same expanded two-space layout through the generator rather than a separate formatter pass.

JSON code examples use the same two spaces as repository JSON. Markdown paragraphs stay on one physical line. Automatic embedded-language formatting is disabled because CK3 localization is not ordinary YAML: its example retains the game's one-space entry indentation. Preserve quoted text, regex strings, test fixtures, license blocks and local historical reports rather than blindly replacing their whitespace. Lockfiles and third-party license texts remain owned by their respective tools or upstream sources.

## Historical Material

Historical patches, unused reference copies and older packages are preserved locally outside active runtime directories. Git history retains tracked source history; machine-local archive inventories are not required to build or test a fresh checkout. Do not restore historical working copies to fix a stale import.

`dist/` contains ignored, versioned VSIX packages. Earlier development builds that share a version with the current build are kept under `dist/history/`. `pnpm run package` replaces the current `dist/ck3-highlight-0.0.4.vsix`.
