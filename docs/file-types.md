# CK3 File Coverage

The October 28, 2026 inventory covers only the installed game's `game/` directory: 51,541 files and 46 extensions. `clausewitz/` and `jomini/` are excluded. Counts describe this installation, not a permanent engine specification.

## CK3 Script

Existing script associations remain supported. The following additional formats were confirmed in `game/` and are detected in CK3 installation, Workshop or mod context rather than claimed globally:

| Extension           | Files | Example under `game/`                          |
| ------------------- | ----: | ---------------------------------------------- |
| `.audio2`           |     1 | `sound/init.audio2`                            |
| `.compound`         |     4 | `gfx/compound_nodes/particle_killer.compound`  |
| `.font`             |     1 | `fonts/fonts.font`                             |
| `.heightmap`        |     1 | `map_data/heightmap.heightmap`                 |
| `.lines`            |     1 | `gfx/lines/lines.lines`                        |
| `.lookup`           |     3 | `common/landed_titles/title_conversion.lookup` |
| `.particle`         |     1 | `gfx/particles/smoke.particle`                 |
| `.skin`             |     7 | `gfx/skins/asia.skin`                          |
| `.terrain`          |     1 | `gfx/map/terrain/settings.terrain`             |
| `.vertical_borders` |     1 | `gfx/map/borders/settings.vertical_borders`    |

`ck3-tiger.conf` is recognized by its exact filename. Arbitrary `.conf` files are not associated with Paradox Script. `.curves` and `.layout` occurred only in the excluded engine directories and have not been added.

The authoritative extension/path lists are in `src/file-types.json`. Run `pnpm run build:file-types` after changing them; `pnpm run check` rejects stale manifest associations. User `files.associations` remain authoritative.

## Other Formats

- `.yml` localization entries use the separate CK3 Localization language.
- `.json` and `.csv` retain their own format; they are not Paradox scripts.
- `.meta` is JSON in the observed example; `.fnt` is a bitmap-font description. Neither is relabeled as Paradox Script.
- `.fxh` contains shader code/includes and needs shader-aware support, not CK3 event/effect rules. Its existing language is left unchanged. Existing `.shader` support is retained for compatibility, not advertised as full HLSL.
- The observed `.disabled` file is `test_map_object_output.txt.disabled`, an inactive example rather than a new script format.
- The two observed `.ini` files are Windows `desktop.ini` metadata.
- `.anim`, `.bank`, `.bk2`, `.bmp`, `.cur`, `.dat`, `.dds`, `.dll`, `.dylib`, `.mesh`, `.otf`, `.pdf`, `.png`, `.tga` and `.ttf` are binary/assets, not new text grammar targets.

Syntax recognition does not validate the engine semantics of every resource format. Script formatting and semantic highlighting retain their existing scope.
