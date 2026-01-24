# Release Workflow Troubleshooting Notes

## Issue: GitHub Actions Release Workflow Not Triggering Build Jobs

**Problem**: The Release workflow's `build-release` job shows a matrix placeholder (`${{ matrix.name }}`) in the GitHub UI and skips all build jobs, despite detecting version changes correctly.

**Root Cause**: Multiple factors contributed to this issue:

1. The GitHub Actions workflow uses the `.yml` file from the commit being tagged, not the latest on `main`. When pushing a tag to an older commit, it uses the older workflow file which may not have the fixes.

2. The logic to check for existing tags was falsely detecting tag existence.

3. When using `workflow_run` triggers, job conditions weren't properly evaluating whether to run builds.

**Solutions We Tried**:

1. **Updated the Release Workflow**:
   - Added support for both automatic (`workflow_run` after CI) and manual (`push:tags`) triggers
   - Added proper conditionals to bypass CI check for manual tag pushes
   - Fixed tag detection logic

2. **Created v0.3.1**:
   - Bumped version in all 3 config files
   - Updated CHANGELOG.md with workflow fixes
   - Pushed to trigger CI → Release sequence

3. **Direct GitHub Release Creation**:
   - Used `gh release create` to manually create GitHub release
   - Added formatted release notes
   - Tagged the correct commit

## Reliable Release Methods

### Method 1: Version Bump + Push (Recommended for Normal Releases)
```bash
# 1. Update all 3 version files to a new version
# 2. Update CHANGELOG.md with release notes
# 3. Commit and push
git add -A 
git commit -m "release: Version X.Y.Z - Description"
git push origin main
```
This will:
- Run CI workflow (tests, type check, build verification)
- If CI passes, trigger Release workflow
- Create tag, installers, and GitHub release

### Method 2: Manual Tag + Release (For Emergency Fixes)
```bash
# 1. Create and push a tag on a specific commit
git tag vX.Y.Z [commit-hash]
git push origin vX.Y.Z

# 2. Manually create GitHub release
gh release create vX.Y.Z --title "Invariant Accounting vX.Y.Z" --notes-file release-notes.md
```

### Method 3: Local Build Script (If GitHub Actions Fails)
```bash
# Use the local build script for cross-platform builds
./scripts/build-release.sh
```
This creates builds for:
- Windows
- Linux
- macOS (Intel)
- macOS (Apple Silicon)

## Future Improvements

1. **Add Direct Release Workflow**:
   - Create a separate workflow specifically for manual releases
   - Skip all version checks and CI dependencies
   - Directly create builds when manually triggered
   
2. **Simplify Tag Handling**:
   - Don't use both tag + GitHub release (choose one approach)
   - Consider auto-tagging on version bumps only

3. **Add Debugging Output**:
   - More verbose logging in workflow runs
   - Clear indication of which path is being taken
   - Better error handling for common failure cases