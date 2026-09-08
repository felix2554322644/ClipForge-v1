#!/usr/bin/env bash
set -euo pipefail

echo "====================================================="
echo "       PIPER LOCAL TTS AUTOMATED SETUP               "
echo "====================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p bin/piper models

ARCH="$(uname -m)"
echo "[1/4] Detecting architecture: $ARCH (OS: $(uname -s))"

PIPER_BIN="bin/piper/piper"
NEED_DOWNLOAD_BIN=true

if [ -f "$PIPER_BIN" ] && [ -x "$PIPER_BIN" ]; then
  if "$PIPER_BIN" --version >/dev/null 2>&1; then
    echo "  ✔ Found existing working Piper binary at $PIPER_BIN ($("$PIPER_BIN" --version 2>&1))"
    NEED_DOWNLOAD_BIN=false
  else
    echo "  ⚠️ Existing Piper binary at $PIPER_BIN is broken or non-executable, re-downloading..."
  fi
fi

if [ "$NEED_DOWNLOAD_BIN" = true ]; then
  PIPER_VERSION="2023.11.14-2"
  TAR_URL=""

  if [ "$ARCH" = "x86_64" ]; then
    TAR_URL="https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_x86_64.tar.gz"
  elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    TAR_URL="https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_aarch64.tar.gz"
  else
    echo "ERROR: Unsupported architecture for prebuilt Piper binary: $ARCH"
    echo "Please compile or install piper-tts for this platform."
    exit 1
  fi

  echo "  ⬇️ Downloading Piper release ${PIPER_VERSION} from: $TAR_URL"
  TMP_TAR="/tmp/piper_${PIPER_VERSION}_${ARCH}.tar.gz"
  curl -fsSL --retry 3 --retry-delay 2 -o "$TMP_TAR" "$TAR_URL"

  echo "  📦 Extracting Piper bundle into bin/..."
  tar -xzf "$TMP_TAR" -C bin/
  rm -f "$TMP_TAR"

  if [ ! -f "$PIPER_BIN" ]; then
    echo "ERROR: Extraction succeeded but $PIPER_BIN was not found!"
    exit 1
  fi

  chmod +x "$PIPER_BIN"
  echo "  ✔ Piper binary installed to $PIPER_BIN"
fi

MODEL_FILE="models/en_US-lessac-medium.onnx"
CONFIG_FILE="models/en_US-lessac-medium.onnx.json"
NEED_DOWNLOAD_MODEL=true

echo "[2/4] Verifying voice model at $MODEL_FILE"

if [ -f "$MODEL_FILE" ] && [ -f "$CONFIG_FILE" ]; then
  # Ensure size is at least 10MB (10485760 bytes)
  FILE_SIZE=$(wc -c < "$MODEL_FILE" 2>/dev/null || stat -c %s "$MODEL_FILE" 2>/dev/null || echo "0")
  if [ "$FILE_SIZE" -gt 10485760 ]; then
    echo "  ✔ Voice model exists and has valid size ($(( FILE_SIZE / 1024 / 1024 )) MB)"
    NEED_DOWNLOAD_MODEL=false
  else
    echo "  ⚠️ Model file at $MODEL_FILE is too small (${FILE_SIZE} bytes), re-downloading..."
  fi
fi

if [ "$NEED_DOWNLOAD_MODEL" = true ]; then
  echo "  ⬇️ Downloading Piper ONNX voice model: en_US-lessac-medium.onnx (~61MB)..."
  MODEL_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
  CONFIG_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"

  TMP_MODEL="/tmp/en_US-lessac-medium.onnx.$$"
  TMP_CONFIG="/tmp/en_US-lessac-medium.onnx.json.$$"

  curl -fsSL --retry 3 --retry-delay 2 -o "$TMP_MODEL" "$MODEL_URL"
  curl -fsSL --retry 3 --retry-delay 2 -o "$TMP_CONFIG" "$CONFIG_URL"

  mv -f "$TMP_MODEL" "$MODEL_FILE"
  mv -f "$TMP_CONFIG" "$CONFIG_FILE"
  chmod 644 "$MODEL_FILE" "$CONFIG_FILE"
  echo "  ✔ Voice model downloaded successfully."
fi

echo "[3/4] Verifying permissions and basic execution..."
if [ ! -x "$PIPER_BIN" ]; then
  chmod +x "$PIPER_BIN"
fi

PIPER_VER=$("$PIPER_BIN" --version 2>&1 || true)
if [ -z "$PIPER_VER" ]; then
  echo "ERROR: Failed to run $PIPER_BIN --version"
  exit 1
fi
echo "  ✔ Piper version: $PIPER_VER"

echo "[4/4] Executing synthesis smoke test..."
TEST_OUT="/tmp/piper_smoke_test_$$.wav"
if echo "Piper runtime functional check." | "$PIPER_BIN" --model "$MODEL_FILE" --output_file "$TEST_OUT" 2>/dev/null; then
  if [ -s "$TEST_OUT" ]; then
    TEST_SIZE=$(wc -c < "$TEST_OUT")
    echo "  ✔ Functional smoke test generated audio (${TEST_SIZE} bytes)"
    rm -f "$TEST_OUT"
  else
    echo "ERROR: Piper smoke test produced an empty output file!"
    rm -f "$TEST_OUT"
    exit 1
  fi
else
  echo "ERROR: Piper failed during functional smoke test!"
  rm -f "$TEST_OUT"
  exit 1
fi

echo "====================================================="
echo "       PIPER TTS SETUP COMPLETED SUCCESSFULLY        "
echo "====================================================="
