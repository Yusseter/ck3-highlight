# Licensing status

Reviewed on 2026-10-29. This is a provenance and release checklist, not legal advice or a project license grant.

## Current decision

On 2026-10-29 Yusseter selected `GPL-3.0-or-later` for project-specific contributions. The root `LICENSE`, README grant and `package.json` license field record that choice. Existing third-party licenses and copyrights remain applicable. The package command no longer skips license validation. Public release should still wait for the provenance/distribution checks below.

[GitHub's licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository) explains that publishing source without a license does not grant general reuse rights. Existing third-party licenses still apply to their respective material. Only material Yusseter owns can receive a new license from Yusseter; this review does not establish ownership of every runtime file, grammar, or image.

## Verified provenance

| Material | Evidence and license | Local use |
| --- | --- | --- |
| Runtime and project configuration | The repository's tracked `src/` and `scripts/` history lists Yusseter as author. `src/extension.js` originates in `ad7735a`; the original semantic modules were added in `8574448`. New runtime modules and editing configuration were developed in this repository. | Project-specific contributions use GPL-3.0-or-later. The ten current runtime JavaScript files import only Node.js built-ins, the VS Code API and local modules. No npm runtime dependencies are bundled. |
| Tiger CK3 1.20 adaptation | [pharaox/tiger at f063dca](https://github.com/pharaox/tiger/tree/f063dca03ea444c6acfd903a2abcccda9c84cad5), derived from [amtep/tiger](https://github.com/amtep/tiger). Pinned [Cargo.toml](https://github.com/pharaox/tiger/blob/f063dca03ea444c6acfd903a2abcccda9c84cad5/Cargo.toml) declares `GPL-3.0-or-later`; [LICENSE](https://github.com/pharaox/tiger/blob/f063dca03ea444c6acfd903a2abcccda9c84cad5/LICENSE) contains GPLv3. | `scripts/tiger-sync/lib/feeds.js` and `rust.js` extract Rust identifiers, tables, and function/type relationships into `grammars/tiger/`, intermediate feeds, and compiled syntax rules. The extension does not link to or run Tiger. |
| Private YAML grammar family | Microsoft's [YAML extension metadata](https://github.com/microsoft/vscode/blob/main/extensions/yaml/package.json) declares MIT; see the [VS Code license](https://github.com/microsoft/vscode/blob/main/LICENSE.txt). The [distributed grammar](https://github.com/microsoft/vscode/blob/main/extensions/yaml/syntaxes/yaml.tmLanguage.json) identifies RedCMD's original source. | Modified, namespaced copies in `syntaxes/localization/`; each file retains a RedCMD revision URL. Preserve these and `licenses/VSCode-MIT.txt`. This records the VS Code distribution route, not an independently verified license grant from every historical RedCMD revision. |
| Shared Paradox, CK3 and inline localization grammars | [dragon-archer/paradox-highlight grammars](https://github.com/dragon-archer/paradox-highlight/tree/main/syntaxes), with [MIT license](https://github.com/dragon-archer/paradox-highlight/blob/main/LICENSE), copyright 2024-2025 dragon-archer. | `grammars/paradox.json`, `grammars/ck3.json`, `grammars/localization.json` and their compiled outputs retain the upstream UUIDs. The earliest local grammars retain matching rule bodies. `NOTICE.md` retains the upstream copyright and permission text. |
| Extension artwork | [Paradox Modding Tools icon at 592de330](https://github.com/idodavis/paradox-modding-tools/blob/592de33034ffffd2beed64ccd95a6620051f03ad/frontend/src/assets/PMT-SquareIcon-Mint.png), with the repository's [MIT license](https://github.com/idodavis/paradox-modding-tools/blob/592de33034ffffd2beed64ccd95a6620051f03ad/LICENSE), copyright 2025 Ian Davis. No separate license or exception was found under the asset path. | Unmodified `icons/icon.png`; SHA-256 `bf5130a296b30ef203f76f158706c0d437d5bc45f840c6b560ea1213ea074c3f` matches the pinned source bytes. The full MIT notice is included in `licenses/ParadoxModdingTools-MIT.txt`. This asset retains its upstream terms, not an ownership claim by Yusseter. |
| Language artwork | On 2026-10-29 Yusseter confirmed authorship of the original light/dark language images. | Renamed without image changes to `icons/ck3-light.png` and `icons/ck3-dark.png`. The owner-created language artwork is covered by the project's GPL-3.0-or-later grant. The former mod-specific extension icon is retained only in the ignored local development archive. |

Tiger provenance is pinned in `grammars/tiger/upstream.json`; all 138 recorded input hashes matched the local `pharaox tiger` checkout during this review. Use those hashes as well as the revision: the generator permits locally modified inputs. Intermediate feeds are excluded from the VSIX, but compiled rules are included, so exclusion alone does not settle their licensing.

On 2026-10-29 the owner confirmed this project was based on the installed dragon-archer extension 1.9.0. The comparison used that installed extension and the published source. Of its 32 base repository rules, 31 matched the earliest local grammar (`fb67d24`) exactly after JSON parsing; 16 still match the current canonical grammar. This establishes shared source material beyond the UUID, and supports the owner-confirmed ancestry, but does not identify the precise Git import revision. The same comparison also found all 12 inline localization rules and four of five CK3 rules identical in the earliest local versions. Their UUIDs match the installed 1.9.0 grammars as well. The CK3 rules now draw from the separately attributed Tiger inputs, but the original grammar ancestry is still credited.

The runtime-source review covered all ten `src/` JavaScript files, their local imports and the earlier tracked versions. The shared `src/modDescriptor.js` helper was extracted from this project's resolver so detection and indexing use the same descriptor parsing. No additional vendored runtime library or unrecorded third-party copyright/license header was identified. The inventory above now covers every shipped source/artwork group. Git authorship and these checks record the available origin evidence; they are not independent proof of ownership of every underlying work or trademark.

## Tiger licensing boundary

The [GNU FAQ on generated output](https://www.gnu.org/licenses/gpl-faq.en.html#GPLOutput) and [its output examples](https://www.gnu.org/licenses/gpl-faq.en.html#WhatCaseIsOutputGPL) distinguish using GPL tooling from copying protected material into output. Here Tiger source tables are the extractor's input; this is not simply running a GPL tool over independently authored input. If the result incorporates protected source expression or table selection/arrangement, conversion into JSON or regex does not itself remove the upstream conditions.

This review does not determine which individual identifiers or relationships are copyrightable, whether a substantial protected portion was copied, or whether the resulting extension is one combined work. Neither "everything is GPL" nor "all generated data is exempt" follows from the technical facts.

## Distribution Checks

The project follows the selected GPL-3.0-or-later route for project contributions and Tiger-derived material, while preserving MIT notices. `NOTICE.md` records the local modifications and their date; the root license and package metadata agree.

- Check the actual VSIX for the root license, `NOTICE.md` and all retained upstream license texts; do not rely only on the packaging configuration.
- Publish the VSIX with matching preferred editable sources: runtime code, canonical grammar/keyword/Tiger inputs, build scripts, dependency manifests and lockfile. Builds work from these repository inputs without a local Tiger checkout.
- Identify optional extraction inputs by the recorded upstream revision and file hashes. Keep the original upstream references when updating those inputs.
- Follow the source-access and notice requirements in [GPLv3 sections 4-6](https://www.gnu.org/licenses/gpl-3.0.html). A matching source archive or an accessible matching source revision should be available with binary distribution.

This closes the previously open runtime-origin inventory item. Public release remains a separate approval step after the final editor, source-commit and CI checks; see the [release checklist](release-checklist.md).
