# Upstream Sources

## Project Changes

Project-specific contributions are copyright 2025-2026 Yusseter and are licensed under GPL-3.0-or-later. This development revision was modified through 2026-10-29. Local changes include CK3-only language detection, a private localization dialect, lexical formatting, scripted-parameter indexing, readable grammar inputs and reproducible builds. Upstream material retains the notices and terms below.

## Paradox, CK3 And Inline Localization Grammars

The shared Paradox, CK3 and inline localization grammars were adapted from [dragon-archer/paradox-highlight](https://github.com/dragon-archer/paradox-highlight/tree/main/syntaxes). `grammars/paradox.json`, `grammars/ck3.json` and `grammars/localization.json` and their compiled `syntaxes/` files retain the upstream UUIDs. The original local versions also retain matching rule bodies. Local changes include CK3 localization/define handling, assignment rules, and extracted keyword inputs. The project owner confirmed the base was the installed extension version 1.9.0; the exact original Git import revision has not been established.

The upstream MIT notice applies to that material, not automatically to the entire extension:

```text
MIT License

Copyright (c) 2024-2025 dragon-archer

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## YAML Grammar

`syntaxes/localization/` contains a modified, namespaced copy of the YAML TextMate grammars distributed with Microsoft's VS Code YAML extension. The original scopes are retained for theme compatibility. The grammar metadata records the upstream source revisions.

- VS Code source: <https://github.com/microsoft/vscode/tree/main/extensions/yaml>
- Original grammar project: <https://github.com/RedCMD/YAML-Syntax-Highlighter>
- VS Code source license: MIT; see `licenses/VSCode-MIT.txt`.
- Local changes: private grammar scope/include names and optional decimal entry versions after map separators. These rules apply to CK3 Localization.

## Tiger Data

CK3 keyword and localization tables, including function/type relationships, are extracted from the local CK3 1.20 adaptation of [pharaox/tiger](https://github.com/pharaox/tiger/tree/f063dca03ea444c6acfd903a2abcccda9c84cad5), derived from <https://github.com/amtep/tiger>. The source project declares GPL-3.0-or-later. See `licenses/Tiger-GPL-3.0.txt` and `grammars/tiger/upstream.json` for the imported revision and input hashes. Tiger is not linked to or executed by the extension runtime.

Readable grammar inputs live under `grammars/`; syntax JSON files are runtime artifacts. Upstream revisions and input hashes are retained in the grammar metadata and `grammars/tiger/upstream.json`.

Generated intermediate feeds are development inputs and are excluded from the VSIX. The generated grammar rules are included in the VSIX. Project-specific contributions are GPL-3.0-or-later under the root `LICENSE`; the third-party copyrights and license terms above remain applicable.

## Artwork

The extension icon `icons/icon.png` is an unchanged copy of `frontend/src/assets/PMT-SquareIcon-Mint.png` from [Paradox Modding Tools](https://github.com/idodavis/paradox-modding-tools/blob/592de33034ffffd2beed64ccd95a6620051f03ad/frontend/src/assets/PMT-SquareIcon-Mint.png), revision `592de33034ffffd2beed64ccd95a6620051f03ad`. Copyright (c) 2025 Ian Davis. It is distributed under the upstream MIT license, retained in `licenses/ParadoxModdingTools-MIT.txt`. Reusing this artwork does not imply affiliation with or endorsement by Paradox Modding Tools.

The light/dark language icons `icons/ck3-light.png` and `icons/ck3-dark.png` were created by Yusseter, as confirmed by the owner on 2026-10-29. They are distributed under the project's GPL-3.0-or-later license. The former extension icon belonged to the owner's CK3 mods and is no longer shipped.

See `docs/licensing-status.md` in the source repository for remaining owner distribution checks. This notice does not replace `LICENSE` or confirm that all release obligations are met.
