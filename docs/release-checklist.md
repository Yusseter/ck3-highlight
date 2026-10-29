# Release Checklist

## Verified Locally

- CK3-only script/localization registrations; no global generic-text association.
- Stable language names/IDs: CK3 Script (`ck3`) and CK3 Localization (`ck3-localization`), both with light/dark file icons.
- Root GPL-3.0-or-later declaration and retained third-party MIT/GPL notices.
- MIT-licensed extension icon with pinned upstream source, verified file hash and bundled attribution/license; owner-confirmed authorship of the language artwork.
- Local development history and archive/source inventories are ignored; public provenance remains in the notices, licensing guide and grammar metadata.
- Unit, TextMate and native editor regression suites.
- All 14 native editor scenarios passed on VS Code 1.144.0, including source JSON/schema diagnostics, comment-toggle round trips and folder/descriptor path equivalence. The selected real-project suite passed all seven checks without modifying game/mod sources.
- The bounded origin inventory covers every distributed source/artwork group, including the runtime history and retained upstream notices.
- A fresh whole-worktree review found one descriptor-path detection regression. Shared parsing, containment guards and regression tests address it; the follow-up review found no remaining issue.
- Opt-in real-project test using the user's selected graphics mod and vanilla definitions. Measurements and machine-specific paths stay in the ignored `.cache/project-test.json`, not in portable test sources.
- Source files are only read. Format edits are previewed in memory; watcher and unsaved-edit tests operate in an owned temporary overlay that loads the real mod as a dependency.
- The editor-test launcher treats timeout, signal and missing/nonzero process status as failures, even if assertions already wrote a success report.
- The owner confirmed that the reported Problems panel warnings are no longer visible. Formatter and configuration regression tests cover their causes.

## Before Publication

- [ ] Require successful Windows/Linux CI for the exact source revision selected for publication.
- [ ] Gather manual feedback on the installed build with normal themes/extensions.
- [ ] Publish the VSIX and matching preferred editable sources, build inputs, notices and license information together. Do not publish a local VSIX whose corresponding source revision has not been made available as required.

Local test success and choosing a license do not by themselves mean a public release has been approved or all upstream obligations have been cleared.
