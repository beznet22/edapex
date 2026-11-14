# Local Codex / MXC patches for mobile builds

The final 2026-11-12 build linked the Codex crates from a local worktree
because the upstream crates are not Android-cross-compilable as-is.

## Worktrees (external, outside this repo)

| Path | Upstream | Commit |
|---|---|---|
| `/home/beznet/codex-mobile` | `https://github.com/openai/codex` | `6bfdc75f0d9e6fae313234f694839866d7c63c39` |
| `/home/beznet/mxc-mobile` | `https://github.com/microsoft/mxc` | `b2112016` |

They were created with:

```bash
git -C ~/.cargo/git/checkouts/codex-*/* worktree add --detach /home/beznet/codex-mobile 6bfdc75f0d
git -C ~/.cargo/git/checkouts/mxc-*/* worktree add --detach /home/beznet/mxc-mobile b2112016
```

## Patch contents

`codex-mobile.patch`
- `codex-rs/Cargo.toml`: reqwest defaults off, rustls + native roots enabled.
- `codex-rs/http-client/Cargo.toml`: `native-tls` moved to a
  `cfg(not(android/ios))` dependency.
- `route_aware_client_pool.rs`: `native_tls::Error` downcast gated out on
  Android/iOS.

`mxc-mobile.patch`
- `dispatch.rs`: `log_policy_hash` calls gated to desktop OSes (the sandbox
  log API is not available on Android/iOS).

## How the repo consumes them

- `crates/agent/Cargo.toml` points the nine `codex-*` dependencies at
  `/home/beznet/codex-mobile/codex-rs/*` (this matches the final local state
  from 2026-11-12 06:29).
- Root `Cargo.toml` patches `mxc-sdk` to
  `/home/beznet/mxc-mobile/src/mxc-sdk`.

If a worktree is recreated, re-apply the patches:

```bash
git -C /home/beznet/codex-mobile apply /path/to/repo/docs/desktop/patches/codex-mobile.patch
git -C /home/beznet/mxc-mobile apply /path/to/repo/docs/desktop/patches/mxc-mobile.patch
```

## Android cross-compilation

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/29.0.13113456"
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android24-clang"
export CC_aarch64_linux_android="$CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER"
export AR_aarch64_linux_android="$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-ar"
cargo check --target aarch64-linux-android -p edapex-agent
```

Full APK: `pnpm --dir apps/desktop run android:build` (SDK 37, build-tools 37,
NDK 29.0.13113456, Rust Android targets installed).
