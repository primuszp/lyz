# Contributing to LyZ

## Supported scope

LyZ currently targets Zotero 7-10 and communicates with LyX through LyXServer. Changes should preserve existing document-to-bibliography and Zotero-item-to-citation-key mappings unless a migration is explicit and tested.

The preferred architecture is one canonical implementation for each responsibility:

- `settings-service.js`: preferences, portable paths, and pipe discovery;
- `lyx-server.js`: LyXServer transport and response parsing;
- `bibtex-service.js`: BibTeX text and file helpers;
- `database-service.js`: SQLite schema and mapping transactions;
- `locale-service.js` and `locale/*/lyz.ftl`: user-visible messages;
- `lyz.js`: application workflow orchestration;
- `bootstrap-ui.js`: Zotero UI integration.

Avoid adding compatibility paths that duplicate a current public workflow. Prefer extending these services and adding focused regression coverage.

## Local development

Requirements:

- a current Node.js release;
- `make`, `zip`, and `unzip`;
- Zotero and LyX for installed runtime tests.

Run the complete local gate:

```sh
npm test
npm run check
make clean all
unzip -t build/lyz.xpi
git diff --check
```

Install `build/lyz.xpi` through **Zotero > Tools > Plugins > Tools for all plugins > Install Plugin From File**. Increment the extension version when reinstalling changed code because Zotero may retain a same-version add-on package.

## Testing expectations

- Reproduce the affected Zotero-LyX lifecycle, not only the individual helper.
- Add a regression test for correctness, mapping, path, or response-parsing changes.
- Use isolated LyX and BibTeX files for destructive runtime checks.
- Verify that a failed file write does not leave database mappings describing data that was never written.
- For citation-key changes, verify the `.bib` output, LyX document rewrite, `.lyz` backup, and database mappings together.
- Test English, German, and Hungarian strings when adding dialogs or settings.

## Pull requests

Keep each change focused. Describe the user-visible problem, reproduction, implementation boundary, and exact validation evidence. Do not include generated `build/lyz.xpi` in commits; attach it to a release instead.

## Release checklist

1. Update `CHANGELOG.md`, compatibility documentation, runtime evidence, and version metadata.
2. Run the complete local gate and an installed Zotero/LyX smoke test.
3. Build `build/lyz.xpi` and record its SHA-256.
4. Commit only release files and create an annotated `vX.Y.Z` tag.
5. Push `master`, the update-manifest `release` branch, and the tag to the maintained fork.
6. Publish `lyz.xpi` as a GitHub release asset.
7. Download the published asset and verify its checksum.
8. Confirm that the public update manifest points to the new version and asset.
