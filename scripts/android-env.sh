#!/usr/bin/env bash
# Android cross-compilation environment.
#
# `cargo check --target aarch64-linux-android` fails with
#
#   cc-rs: failed to find tool "aarch64-linux-android-clang"
#
# when run from a plain shell. Nothing is wrong with the toolchain: the Gradle plugin sets
# these variables for `tauri android build`, and a bare cargo command does not get them. This
# script is the missing half, so the cross-compile gate is reproducible outside Gradle.
#
#   source scripts/android-env.sh
#   cargo check --target aarch64-linux-android -p edapex-desktop
#
# Deliberately `source`-able and side-effect free beyond exports: no builds, no writes.

set -euo pipefail

: "${ANDROID_HOME:=$HOME/Android/Sdk}"
: "${ANDROID_NDK_HOME:=$(ls -d "$ANDROID_HOME"/ndk/* 2>/dev/null | sort -V | tail -1)}"

if [ ! -d "$ANDROID_NDK_HOME" ]; then
  echo "No NDK under $ANDROID_HOME/ndk. Install one with sdkmanager." >&2
  return 1 2>/dev/null || exit 1
fi

# Must match `minSdk` in gen/android/app/build.gradle.kts. An NDK wrapper for a lower API is
# legal but silently links against a smaller libc surface than the app declares.
API=24
TOOLCHAIN="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin"

if [ ! -x "$TOOLCHAIN/aarch64-linux-android${API}-clang" ]; then
  echo "Missing API-$API clang in $TOOLCHAIN. Is this NDK complete?" >&2
  return 1 2>/dev/null || exit 1
fi

export ANDROID_HOME ANDROID_NDK_HOME NDK_HOME="$ANDROID_NDK_HOME"
# Gradle writes this into tauri.properties; the Rust build reads it from the environment.
export NDK="$ANDROID_NDK_HOME"

export CC_aarch64_linux_android="$TOOLCHAIN/aarch64-linux-android${API}-clang"
export AR_aarch64_linux_android="$TOOLCHAIN/llvm-ar"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$CC_aarch64_linux_android"

export CC_armv7_linux_androideabi="$TOOLCHAIN/armv7a-linux-androideabi${API}-clang"
export AR_armv7_linux_androideabi="$TOOLCHAIN/llvm-ar"
export CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER="$CC_armv7_linux_androideabi"

export CC_i686_linux_android="$TOOLCHAIN/i686-linux-android${API}-clang"
export AR_i686_linux_android="$TOOLCHAIN/llvm-ar"
export CARGO_TARGET_I686_LINUX_ANDROID_LINKER="$CC_i686_linux_android"

export CC_x86_64_linux_android="$TOOLCHAIN/x86_64-linux-android${API}-clang"
export AR_x86_64_linux_android="$TOOLCHAIN/llvm-ar"
export CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER="$CC_x86_64_linux_android"

# A JAVA_HOME pointing nowhere is worse than none: Gradle reports "JAVA_HOME is set to an
# invalid directory" and exits, which looks like a build failure rather than a stale shell
# profile. Validate it, and fall back to a JDK 17 the Gradle plugin accepts.
if [ -n "${JAVA_HOME:-}" ] && [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "android-env: JAVA_HOME=$JAVA_HOME has no bin/java — falling back" >&2
  unset JAVA_HOME
fi

if [ -z "${JAVA_HOME:-}" ]; then
  for candidate in /usr/lib/jvm/java-17-openjdk-amd64 /usr/lib/jvm/*-17-*; do
    if [ -x "$candidate/bin/java" ]; then
      export JAVA_HOME="$candidate"
      break
    fi
  done
fi

if [ -z "${JAVA_HOME:-}" ]; then
  echo "android-env: no JDK 17 found; Gradle needs one. Install openjdk-17-jdk." >&2
  return 1 2>/dev/null || exit 1
fi

echo "android-env: NDK $(basename "$ANDROID_NDK_HOME"), API $API, clang $(basename "$CC_aarch64_linux_android")"
