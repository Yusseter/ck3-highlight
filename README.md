# Crusader Kings III Highlight

Syntax highlighting and editing support for Crusader Kings III in VS Code 1.107 or newer. Other Paradox games are not supported.

## Features

- CK3 effects, triggers, scopes, modifiers and GUI/localization functions.
- A bundled **CK3 Localization** language for `.yml` and `.yaml` entries such as `event.title:0 "Text"`. The version number is optional.
- Localization macros, formatting, RGB colors, icons and inline comments.
- `$...$` auto-closing and surrounding pairs in CK3 script and localization.
- Script formatting that preserves quoted text, comments and line endings.
- Semantic highlighting for parameters in scripted CK3 calls.

The extension does not patch VS Code's built-in YAML files. Ordinary YAML and text files keep their normal language behavior.

## Opening Mods

Files named `*_l_*.yml` or `*_l_*.yaml`, and files starting with an `l_english:` style header, open as **CK3 Localization**. Detection also accepts a BOM, blank lines and comments before the header.

Script files under recognized CK3 installation/mod paths use **CK3 Script**. Opening a workspace containing `descriptor.mod` enables detection for mods stored in other folders when CK3-specific markers are present. A descriptor-only project with no CK3-specific markers is left unchanged. Set `ck3Highlight.modPath` or choose **CK3 Script** from **Change Language Mode** for an otherwise unrecognized CK3 mod. No global `*.txt` association is installed. Shared resource extensions such as `.gui`, `.gfx` and `.asset` are also detected only in CK3 context. Outside a recognized project, select the CK3 language mode manually; unrelated applications and other games keep their existing mode.

Additional resource formats such as `.font`, `.terrain`, `.heightmap`, `.lookup` and `.audio2` are detected only in game/mod context. See [CK3 file coverage](docs/file-types.md) for the `game/` inventory and exclusions.

Set `ck3Highlight.autoDetect` to `false` to control language selection manually. The optional Tiger configuration filename `ck3-tiger.conf` uses CK3 script highlighting; other `.conf` files are not claimed. Tiger itself is not required.

### Language Names And IDs

| Language         | ID                 |
| ---------------- | ------------------ |
| CK3 Script       | `ck3`              |
| CK3 Localization | `ck3-localization` |

Use these IDs in `files.associations`, language-specific settings and snippets. The old generic `paradox` mode is no longer registered; use `ck3` for CK3 scripts. The `paradox-localization` ID from earlier unreleased builds has been replaced by `ck3-localization`. Update any explicit settings that used the development ID. `ParadoxScript CK3` remains a secondary display alias for scripts; internal TextMate scope names are unchanged so existing theme rules still apply.

Both languages provide light/dark file icons. A file icon theme can override these fallback icons; the extension does not replace the selected icon theme.

## Localization

```yaml
l_english:
 title:0 "An event"
 description: "Text with $OTHER_KEY$ and #EMP emphasis#!" # comment
 color_text:1 "#color:{0.82,0.77,0.5};bold Any text or 녹색#!"
```

Numbers and separators in the color header have their own scopes. The text after the header keeps normal localization highlighting, including `$KEY$` and `[CHARACTER.GetName]`. Themes choose the displayed colors.

Existing explicit YAML associations may require selecting **CK3 Localization** manually. This language does not register a YAML schema validator or change third-party YAML extensions.

## Formatting

Use **Format Document**, **Format Selection**, or **Format CK3 Scripts** in script files. The formatter uses the document's indentation options. It does not format localization values or replace text inside quoted strings.

## Semantic Highlighting

Local scripted definitions work without an external tool. To include vanilla and dependent-mod definitions, configure the active CK3 game and mod:

```json
{
  "ck3Highlight.gamePath": "C:/Games/Crusader Kings III",
  "ck3Highlight.modPath": "C:/Mods/MyMod"
}
```

`gamePath` is the installation root containing the `game` subdirectory. `modPath` accepts a mod directory or descriptor file. Existing `ck3tiger.ck3Path` and `ck3tiger.modPath` settings are compatibility fallbacks; installing Tiger is not required to run the extension. Each VS Code window uses one active CK3 load order. `ck3-tiger.conf` supplies dependent mods.

Set `ck3Highlight.semantic.enabled` to `false` to disable semantic tokens. External mod indexing requires a trusted workspace; syntax highlighting and formatting are available in Restricted Mode. Indexing errors are reported; global highlighting pauses until a successful rebuild. Local scripted definitions remain available.

## Development

Use Node.js 24 and pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm run format
pnpm run build
pnpm run check
pnpm test
pnpm run package
```

To run the native editor tests in an isolated temporary profile:

```sh
pnpm run test:integration "C:/path/to/Code.exe"
```

To check a real installation/mod without editing its files:

```sh
pnpm run test:project "C:/path/to/Code.exe" "C:/Games/Crusader Kings III" "C:/Mods/MyMod"
```

The last argument accepts either a mod folder containing `descriptor.mod` or a repository with `mod/descriptor.mod`. The test uses a temporary VS Code profile and empty workspace so project tasks/settings cannot run or override the test. It samples real source files, measures index construction and exercises native file watchers in a temporary overlay mod. No game/mod source file is edited. The machine-local report is written to `.cache/project-test.json` and is not tracked or packaged. This opt-in test is not part of CI, which has no CK3 installation.

Tests cover real TextMate/Oniguruma tokenization, formatter content preservation, mod indexing and Tiger extraction. CI runs the checks on Windows and Linux. The VSIX includes runtime sources, grammar files and notices; development archives, tests and generated intermediate feeds are excluded. Packages are written to `dist/`. Grammar and file-type builds work offline; `check` rejects stale generated files rather than silently updating them.

Readable grammar rules and keyword lists live under `grammars/`. Edit those sources or the Tiger supplements, not the compiled syntax files. See [repository layout](docs/repository-layout.md) for the source/build split and formatting rules. `pnpm run format` applies the shared two-space style; run `pnpm run build` afterward to refresh generated provenance. `pnpm run check` checks formatting without modifying files.

Update the keyword data from a local Tiger source checkout:

```sh
pnpm run sync:ck3-tiger "<path-to-tiger>" --dry-run
pnpm run sync:ck3-tiger "<path-to-tiger>"
pnpm run sync:ck3-tiger "<path-to-tiger>" --check
```

The source used for the current update is the CK3 1.20 adaptation. The generated manifest records its revision and input hashes. Keyword updates retain existing entries for compatibility with earlier game versions. Review generated changes and rerun the tests before packaging.

## Sources And Licensing

See [NOTICE.md](NOTICE.md) for upstream sources and their licenses. The bundled localization grammar is a namespaced YAML dialect; its changes belong in this repository, not in VS Code's installation directory.

Project-specific contributions are licensed under **GPL-3.0-or-later**; copyright 2025-2026 Yusseter. See [LICENSE](LICENSE). Existing third-party copyrights and license terms remain applicable; MIT notices are retained in `NOTICE.md` and `licenses/`.

See [licensing status](docs/licensing-status.md) for the recorded source origins and distribution checks. The remaining publishing steps are in the [release checklist](docs/release-checklist.md).
