#!/bin/sh
# Signs a built .app for distribution: sign.sh <path to .app> <signing identity>
#
# `desktop.macos.codesignIdentity` in deno.json can't do this. It enables the hardened
# runtime but adds no entitlements, so the signed app crashes as soon as V8 starts.
set -eu

app=$1
identity=$2
entitlements=$(dirname "$0")/entitlements.plist

# Inside out: signing the bundle seals whatever is in it at that moment.
codesign --force --timestamp --options runtime --sign "$identity" \
  "$app/Contents/MacOS/libruntime.dylib"
codesign --force --timestamp --options runtime --entitlements "$entitlements" --sign "$identity" \
  "$app/Contents/MacOS/laufey_webview"
codesign --force --timestamp --options runtime --entitlements "$entitlements" --sign "$identity" \
  "$app"

codesign --verify --deep --strict --verbose=2 "$app"
