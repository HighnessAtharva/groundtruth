# Releasing

Publishing happens in CI, never from a laptop. An Automation token bypasses 2FA, so
the publish cannot stall waiting for a one-time password. CI is also the only place
`--provenance` works, and provenance links the tarball on npm to the commit that
produced it.

## One-time setup

1. Create an **Automation** token at [npmjs.com/settings/~/tokens](https://www.npmjs.com/settings/~/tokens).
   Automation is the type that bypasses two-factor auth. A Publish token does not, and
   a CI job cannot type an authenticator code.
2. Add it as a repository secret named `NPM_TOKEN`:
   `Settings -> Secrets and variables -> Actions -> New repository secret`.

That is all. `.github/workflows/release.yml` needs nothing else.

## Cutting a release

```bash
# 1. Bump the version. This also creates the v-prefixed tag.
npm version patch      # or minor, or major

# 2. Push the commit and the tag.
git push --follow-tags
```

Then on GitHub: **Releases -> Draft a new release**, pick the tag you just pushed,
write the notes, and **Publish release**.

The workflow fires on that publish and does, in order:

1. Checks the tag matches `package.json`. `v0.2.0` against a manifest saying `0.1.0`
   fails here rather than shipping the wrong version under the right name.
2. Checks the version is not already on the registry.
3. Runs the tests, the example regression check, and the offline check.
4. Packs, and prints every file that would ship.
5. Publishes with `--provenance`.
6. Waits for the registry to report the new version.
7. Installs the **published** package into a scratch directory and runs
   `init` and `check` against a real document.

Step 7 is the one that matters. Everything before it proves the code is good. Step 7
proves the artifact people actually download works.

## Dry run

To exercise the whole path without publishing:

**Actions -> release -> Run workflow**, leave `dry-run` checked.

Everything runs except the publish and the two post-publish steps, and the tarball is
attached to the run as an artifact so you can inspect exactly what would have shipped.

## Which version number

| Change | Bump |
|---|---|
| Wording of a message, a typo, a comment | patch |
| A new rule, a new adapter, a new flag, a new preset | minor |
| A rule id renamed, a config key removed, an exit code changed, a `--json` field removed or retyped, an adapter method added to the required set | **major** |

Semver here covers the `--json` `schemaVersion` and finding shape, rule ids, config
keys, verdict names, exit codes, the adapter interface, and the `defineRule` contract.

It does not cover the HTML markup, the report layout, CSS class names, the SEO score
formula, or the exact wording of a message. Those can change in a patch.

## If a publish goes wrong

npm allows unpublishing a version within 72 hours. After that the version is
permanent, and the name is reserved forever either way.

```bash
npm unpublish groundtruth@0.1.1
```

Prefer publishing a fixed patch over unpublishing. Anyone who installed the bad
version already has it in a lockfile, and unpublishing breaks their build rather than
fixing it.

## Publishing by hand, if you have to

Only when CI is unavailable. You lose provenance and you will need an OTP.

```bash
npm test && npm run test:examples && npm run test:offline
npm publish --otp=123456
```

`prepublishOnly` runs the tests and the examples again regardless, so a broken
publish cannot happen by accident.
