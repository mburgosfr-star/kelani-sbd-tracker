# Release workflow

Always build releases from a clean tree at the exact commit the release tag points to.

## Steps

```bash
git status
git add .
git commit -m "..."
git push
git tag vX.Y.Z
git push origin vX.Y.Z
