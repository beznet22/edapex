# EdApex Work desktop

Tauri 2 shell for the shared `apps/web` workspace. Desktop commands own local OCR, capture, keychain auth and the native API proxy.

## Browser assistance

Desktop browser assistance uses the official Chrome DevTools MCP server. EdApex does not install, fork or auto-launch it.

1. Install Node.js and run the server yourself:

```bash
npx -y chrome-devtools-mcp@latest --slim --no-usage-statistics
```

2. Create `mcp.json` in the Tauri app config directory:

```json
{
  "chrome-devtools": {
    "enabled": true,
    "command": "npx",
    "args": ["-y", "chrome-devtools-mcp@latest", "--slim", "--no-usage-statistics"]
  }
}
```

3. Restart the desktop app. Browser assistance is advertised only when this file validates and the native agent host is connected.

PWA and mobile never advertise browser control. The `browserAssistance` flag stays false there.

## Local OCR models

```bash
node ../../scripts/fetch-rusto-models.mjs
```

Models are pinned, checksum-verified and gitignored. Missing models fail closed with `model_missing`.

## Android

The Android project is generated at `src-tauri/gen/android` and committed. It uses the Tauri-recommended SDK/NDK setup:

- JDK 17
- Android SDK platform 37, build-tools 37
- NDK 29.0.13113456
- Rust targets: `aarch64-linux-android`, `armv7-linux-androideabi`, `i686-linux-android`, `x86_64-linux-android`

Set the environment before building:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/29.0.13113456"
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
node ../../scripts/fetch-rusto-models.mjs
pnpm android:build
```

The APK is written to `src-tauri/gen/android/app/build/outputs/apk/universal/debug/`. The baseline universal debug build is ~1.30 GB because it contains four debug ABIs; release size is measured separately against the 50 MB/120 MB gate.

For device installs, enable USB debugging or pair wireless debugging with `adb pair`, then `adb connect`. Tauri has no QR pairing flow; Android Studio's QR code is an ADB pairing UI.

## Verification

```bash
cargo check -p edapex-desktop
pnpm --dir ../web check
```
