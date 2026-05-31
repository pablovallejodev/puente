#!/usr/bin/env bash
# Filter logcat for Puente bootstrap / ONNX / model download diagnostics.
# Usage: ./scripts/android-logcat-puente.sh
# Requires: adb, device or emulator connected.

set -euo pipefail

adb logcat -c
echo "Watching logcat for [puente], onnx, OrtApi, Onnxruntime, Protobuf… (Ctrl+C to stop)"
adb logcat | grep -E --line-buffered 'puente|onnx|OrtApi|Onnxruntime|Protobuf|Transformers|model-manager'
