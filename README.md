# Crusader Kings III Highlight

Syntax highlighting and editing support for Crusader Kings III in VS Code 1.107 or newer.

## Features

- CK3 effects, triggers, scopes, modifiers and GUI/localization functions.
- **CK3 Localization** highlighting for `.yml` entries such as `event.title:0 "Text"`. The version number is optional.
- Localization macros, formatting, RGB colors, icons and inline comments.
- `$...$` auto-closing and surrounding pairs in CK3 script and localization.
- Script formatting that preserves quoted text, comments and line endings.
- Semantic highlighting for parameters in scripted CK3 calls.

## Opening Mods

Open your CK3 installation or mod folder in VS Code. Script and resource files are detected in recognized CK3 projects. Localization files such as `events_l_english.yml` open as **CK3 Localization**.

Use **Change Language Mode** to select **CK3 Script** or **CK3 Localization** manually when needed.

Supported CK3 resources include `.gui`, `.gfx`, `.asset`, `.font`, `.terrain`, `.heightmap`, `.lookup` and `.audio2` files.

## Localization

```yaml
l_english:
 title:0 "An event"
 description: "Text with $OTHER_KEY$ and #EMP emphasis#!" # comment
 color_text:1 "#color:{0.82,0.77,0.5};bold Any text or 녹색#!"
```

Numbers and separators in the color header have their own scopes. The text after the header keeps normal localization highlighting, including `$KEY$` and `[CHARACTER.GetName]`. Themes choose the displayed colors.

## Formatting

Use **Format Document**, **Format Selection**, or **Format CK3 Scripts** in script files. The formatter follows your indentation settings and preserves quoted text, comments and line endings.

## Semantic Highlighting

Parameters in scripted CK3 calls are highlighted using definitions from your project. To include vanilla and dependent-mod definitions, configure these options in the extension's VS Code settings:

- **Game Path**: your CK3 installation folder, containing the `game` subdirectory.
- **Mod Path**: your active mod folder or `.mod` descriptor file.

External game/mod indexing requires a trusted workspace. Highlighting updates as definitions and mod files change.

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

Edit grammar rules and keyword lists under `grammars/`, then run the build to update the compiled syntax files. VSIX packages are written to `dist/`.

Optional tests in an isolated VS Code profile:

```sh
pnpm run test:integration "<path-to-code>"
pnpm run test:project "<path-to-code>" "<CK3-installation>" "<mod-folder>"
```

The project test accepts a mod folder containing `descriptor.mod` or a repository containing `mod/descriptor.mod`. It uses temporary test files and leaves the game and mod sources unchanged.

To update keyword data from a Tiger source checkout:

```sh
pnpm run sync:ck3-tiger "<path-to-tiger>" --dry-run
pnpm run sync:ck3-tiger "<path-to-tiger>"
pnpm run sync:ck3-tiger "<path-to-tiger>" --check
```

## Sources And Licensing

See [NOTICE.md](NOTICE.md) for upstream sources and their licenses.

Project-specific contributions are licensed under **GPL-3.0-or-later**; copyright 2025-2026 Yusseter. See [LICENSE](LICENSE). Existing third-party copyrights and license terms remain applicable; MIT notices are retained in `NOTICE.md` and `licenses/`.
