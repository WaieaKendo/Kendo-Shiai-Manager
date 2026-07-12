# Repository Structure

## Files kept in source control

```text
public/              Deployable application and assets
tests/               Maintained regression tests
docs/                Maintained documentation
README.md             Project overview
CHANGELOG.md          Consolidated release history
package.json          Scripts and development dependency metadata
wrangler.jsonc        Cloudflare deployment configuration
.gitignore            Generated-file exclusions
```

## Files kept outside source control

The following are release or working artifacts and should be downloaded, archived, or attached to a GitHub Release rather than committed to `main`:

- `KSM_v*_GitHub_Repository_Upload.zip`
- complete release ZIPs
- generated `MANIFEST.json` files
- per-release `RELEASE_SUMMARY.md` files
- generated regression reports
- screenshots and temporary test output
- extracted release directories

Git history and `CHANGELOG.md` provide the permanent release record. A downloadable source snapshot can always be generated from a Git tag or GitHub Release.
