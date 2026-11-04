# Election Watcher

A small always-on-top window showing the New York Times Senate and House needles, for macOS
and Windows. Built with [`deno desktop`](https://docs.deno.com/runtime/desktop/).

It loads NYT's live forecast page and shows only the two needles. If NYT asks you to log in,
it shows the full page so you can, then returns to the needles. Hover for the controls.

Windows builds are deliberately unsigned. SmartScreen warns on first launch: choose
**More info**, then **Run anyway**.

## Developing

```sh
mise install
deno task dev
deno task build:mac   # dist/mac/Election Watcher.app, ad-hoc signed
deno task build:win   # dist/windows/Election Watcher/
```
