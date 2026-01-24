# Release Workflow Troubleshooting Notes

## Solution: Two Separate Workflows (Implemented)

**Problem**: Single workflow trying to handle both automatic (`workflow_run`) and manual (`push:tags`) triggers was too complex and unreliable. Bash conditions and GitHub Actions expressions were mixing, causing matrix expansion failures.

**Solution Implemented**: Two dedicated workflows:

1. **`.github/workflows/release.yml`** - Automatic releases
   - Triggered by `workflow_run` after CI completes successfully
   - Checks for version changes between commits
   - Creates tags and releases
   - Matrix builds for all platforms

2. **`.github/workflows/release-manual.yml`** - Manual releases (NEW!)
   - Triggered by `push:tags` (git push origin v*)
   - No version checking (tags imply intentional release)
   - Version extracted from git tag name
   - Matrix builds directly for all platforms
   - Much simpler and more reliable

## How to Create a Release

### Method 1: Automatic Release (Recommended for Normal Development)

```bash
# 1. Update all 3 version files to a new version
# 2. Update CHANGELOG.md with release notes
# 3. Commit and push
git add -A 
git commit -m "release: Version X.Y.Z - Description"
git push origin main
```

What happens:
- CI workflow runs (tests, type check, build verification)
- Release workflow triggers automatically after CI passes
- Version change detected, tag created, installers built
- GitHub release created with all artifacts

### Method 2: Manual Tag Push (For Emergency Fixes)

```bash
# 1. Commit any changes (optional)
git commit -m "Fix something important"

# 2. Create and push tag
git tag vX.Y.Z
git push origin vX.Y.Z
```

What happens:
- `release-manual.yml` workflow triggers immediately
- Builds installers for all platforms
- Creates GitHub release with all artifacts
- Uses version from tag name

### Method 3: GitHub CLI Direct Release (Fastest)

```bash
# Create release directly (skips all builds)
gh release create vX.Y.Z --title "Invariant Accounting vX.Y.Z" --notes-file release-notes.md
```

What happens:
- Creates GitHub release with notes
- No installers built
- Use only for releases that have already been built

## Troubleshooting Issues Fixed

### Issue 1: Matrix Not Expanding
**Symptom**: Build job shows `Build (${{ matrix.name }})` literal instead of expanded job names

**Root Cause**: Bash condition using GitHub Actions expression syntax instead of bash pattern matching
```bash
# WRONG - GitHub Actions expression, not bash
if [ "${{ startsWith(github.ref, 'refs/tags/') }}" = "true" ]; then

# CORRECT - Bash pattern matching
if [[ "${{ github.ref }}" == refs/tags/* ]]; then
```

### Issue 2: Complex Conditional Logic
**Symptom**: Jobs running but being skipped despite version changes

**Root Cause**: Single workflow trying to handle both `workflow_run` and `push:tags` triggers with complex nested conditions

**Solution**: Two separate workflows, each with a single clear trigger

## Summary

Release system is now split into two clear workflows:
- Automatic releases via version bump + push to main
- Manual releases via tag push
- Both use Tauri action to build for all platforms
- Both create GitHub releases with installers
