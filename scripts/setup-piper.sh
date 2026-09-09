#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

BIN_DIR="${ROOT_DIR}/bin/piper"
MODELS_DIR="${ROOT_DIR}/models"
PIPER_EXEC="${BIN_DIR}/piper"
MODEL_FILE="${MODELS_DIR}/en_US-lessac-medium.onnx"
CONFIG_FILE="${MODELS_DIR}/en_US-lessac-medium.onnx.json"

mkdir -p "${BIN_DIR}"
mkdir -p "${MODELS_DIR}"

# 1. Setup Piper Executable
if [ -x "${PIPER_EXEC}" ] && "${PIPER_EXEC}" --version >/dev/null 2>&1; then
  echo "Piper executable already exists and functions: ${PIPER_EXEC}"
else
  echo "Downloading and installing Piper TTS executable..."
  ARCH=$(uname -m)
  case "${ARCH}" in
    x86_64)
      PIPER_TAR="piper_linux_x86_64.tar.gz"
      ;;
    aarch64|arm64)
      PIPER_TAR="piper_linux_aarch64.tar.gz"
      ;;
    *)
      echo "Unsupported architecture: ${ARCH}" >&2
      exit 1
      ;;
  esac

  PIPER_URL="https://github.com/rhasspy/piper/releases/download/2023.11.14-2/${PIPER_TAR}"
  TEMP_TAR="/tmp/${PIPER_TAR}"

  curl -sSL --retry 3 --retry-connrefused -o "${TEMP_TAR}" "${PIPER_URL}"
  tar -xzf "${TEMP_TAR}" -C "${ROOT_DIR}/bin"
  rm -f "${TEMP_TAR}"
  chmod +x "${PIPER_EXEC}"
fi

# 2. Setup ONNX Voice Model & Config
MODEL_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
CONFIG_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"

if [ -f "${MODEL_FILE}" ] && [ $(wc -c < "${MODEL_FILE}") -gt 10000000 ]; then
  echo "Piper voice model already exists: ${MODEL_FILE} ($(wc -c < "${MODEL_FILE}") bytes)"
else
  echo "Downloading Piper voice model (en_US-lessac-medium.onnx)..."
  curl -sSL --retry 3 --retry-connrefused -o "${MODEL_FILE}" "${MODEL_URL}"
fi

if [ -f "${CONFIG_FILE}" ] && [ $(wc -c < "${CONFIG_FILE}") -gt 100 ]; then
  echo "Piper model config already exists: ${CONFIG_FILE}"
else
  echo "Downloading Piper voice model config (en_US-lessac-medium.onnx.json)..."
  curl -sSL --retry 3 --retry-connrefused -o "${CONFIG_FILE}" "${CONFIG_URL}"
fi

echo "Piper setup completed successfully."
"${PIPER_EXEC}" --version
