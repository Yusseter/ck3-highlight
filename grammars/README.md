# Grammar Sources

These files are development inputs. The extension loads the generated JSON in `syntaxes/`, not these source files.

The `paradox` source/namespace names describe the base syntax used by CK3. They do not register a generic Paradox language mode or support for other games.

| Edit                                                   | Source              |
| ------------------------------------------------------ | ------------------- |
| Shared script rules, comments, numbers and assignments | `paradox.json`      |
| CK3-specific rule structure                            | `ck3.json`          |
| Inline localization rules, colors and formatting       | `localization.json` |
| Existing/compatibility keyword alternatives            | `keywords/*.json`   |
| Imported Tiger function/type/keyword tables            | `tiger/*.json`      |

Keyword lists contain one complete regex fragment per array item. Preserve escaping and nested groups; a fragment can be more than a plain identifier. Rules refer to those lists with `match.patternBuilder` and `match.fragments`. The builder supplies the surrounding expression without changing token scopes.

The `tiger/` tables are canonical imported snapshots. Update them with the Tiger sync command. Persistent manual additions belong in the corresponding files under `scripts/tiger-sync/data/` so a later sync does not discard them. `tiger/upstream.json` records the imported revision/input hashes.

Some feed-dependent rules are assembled by `scripts/tiger-sync/lib/grammar-rules.js`, including localization function signatures and define references. Change that builder when changing their rule structure; change the source table/supplement when adding identifiers.

Run `pnpm run build:grammars` after editing sources. It requires no Tiger checkout. `pnpm run check` detects missing or stale outputs. Do not repair a compiled grammar by hand: the next build deliberately replaces it.

The namespaced YAML-derived family under `syntaxes/localization/` is maintained separately. Its version metadata and upstream notices must be retained.
