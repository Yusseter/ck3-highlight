# Changelog

## 0.0.4

- Replace the temporary mod icon with attributed MIT-licensed artwork from Paradox Modding Tools; keep all active artwork under `icons/`.
- Limit supported language modes to CK3 script and CK3 Localization; remove associations and editing providers for other games and generic Paradox mode.
- Standardize language names/IDs as CK3 Script (`ck3`) and CK3 Localization (`ck3-localization`), with light/dark file icons for both.
- Keep grammar rules and keyword lists in readable source files with an offline build; package only the compiled TextMate grammars.
- Add project-scoped support for additional vanilla `game/` text formats and maintain language associations from a shared file-type registry.
- Provide dedicated `.yml` localization syntax with optional numeric entry versions.
- Limit RGB header scopes to color components and preserve macros/escapes in formatted text.
- Preserve string content, indentation options and line endings when formatting.
- Keep scripted definitions current after edits, file changes and mod overrides.
- Resolve folder, internal descriptor and launcher descriptor mod paths consistently for automatic language detection.
- Give CK3 formatting its own command so it can coexist with Paradox Highlight.
- Scope CK3 semantic tokens to CK3 documents and avoid repeated child scans.
- Validate Tiger inputs before writing outputs and record source provenance.
- Add regression tests, CI checks and a runtime-only package file list.

## 0.0.3

- Extend script associations to `.gfx`, `.dlc` and `.sfx`.
- Update CK3, shared Paradox and inline localization grammar rules.

## 0.0.2

- Rename the extension package from `ybck3` to `ck3-highlight`.
- Provide shared Paradox syntax, CK3-specific rules and inline localization highlighting, including localization inside YAML strings.
- Add light/dark language icons, `#` line comments and script folding markers.

## 0.0.1

- Initial CK3 language registration and syntax highlighting.
- Register script file types and bracket/quote editing pairs.
