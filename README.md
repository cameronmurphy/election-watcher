# Election Watcher

A small always-on-top window showing the New York Times Senate and House needles, for macOS
and Windows. Built with [`deno desktop`](https://docs.deno.com/runtime/desktop/).

It loads NYT's live forecast page and shows only the two needles. If NYT asks you to log in,
it shows the full page so you can, then returns to the needles. Hover for the controls.

## Developing

```sh
mise install
deno task dev
deno task build:mac   # dist/mac/Election Watcher.app, ad-hoc signed
deno task build:win   # dist/windows/Election Watcher/
```

## Releasing

`.github/workflows/build.yml` builds and launch-tests both platforms on every push to `main`.
Pushing a `v*` tag also notarizes the Mac app and publishes both zips as a GitHub release.

A tag fails rather than publish a Mac build that Gatekeeper would refuse, so it needs these
repository secrets:

| Secret | What it is |
| --- | --- |
| `CERT_P12_BASE64` | Developer ID cert + key, exported as `.p12`, base64, unwrapped |
| `CERT_P12_PASSWORD` | password used for that `.p12` export |
| `SIGN_IDENTITY` | e.g. `Developer ID Application: Name (TEAMID)` |
| `AC_API_KEY_BASE64` | App Store Connect `.p8`, base64, unwrapped |
| `AC_API_KEY_ID` | that key's ID |
| `AC_API_ISSUER_ID` | the App Store Connect issuer ID |

```sh
base64 -i Certificates.p12 | tr -d '\n' | gh secret set CERT_P12_BASE64
gh secret set CERT_P12_PASSWORD
gh secret set SIGN_IDENTITY
base64 -i AuthKey_XXXXXXXXXX.p8 | tr -d '\n' | gh secret set AC_API_KEY_BASE64
gh secret set AC_API_KEY_ID
gh secret set AC_API_ISSUER_ID
```

Delete the exported `.p12` afterwards; it contains your private key.

Windows builds are currently unsigned, so SmartScreen warns before they run.
