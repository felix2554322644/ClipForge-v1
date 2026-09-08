#!/usr/bin/env bash
set -e

echo "=== PIPER TTS SETUP ==="

mkdir -p bin/piper models

ARCH=$(uname -m)
echo "Detected architecture: $ARCH"

if [ "$ARCH" = "x86_64" ]; then
  if [ ! -f "bin/piper/piper" ]; then
    echo "Downloading Piper x86_64 binary release..."
    curl -L -s https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz | tar -xz -C bin/
    chmod +x bin/piper/piper
    echo "Piper binary installed to bin/piper/piper"
  else
    echo "Piper binary already exists at bin/piper/piper"
  fi
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  if [ ! -f "bin/piper/piper" ]; then
    echo "Downloading Piper aarch64 binary release..."
    curl -L -s https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_aarch64.tar.gz | tar -xz -C bin/
    chmod +x bin/piper/piper
    echo "Piper binary installed to bin/piper/piper"
  fi
else
  echo "Unsupported architecture for prebuilt binary: $ARCH. Please install Piper using your package manager or pip: pip install piper-tts"
fi

# Download voice model if not present
if [ ! -f "models/en_US-lessac-medium.onnx" ]; then
  echo "Downloading voice model: en_US-lessac-medium.onnx..."
  curl -L -s -o models/en_US-lessac-medium.onnx https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
  curl -L -s -o models/en_US-lessac-medium.onnx.json https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
  echo "Voice model downloaded to models/en_US-lessac-medium.onnx"
else
  echo "Voice model already exists at models/en_US-lessac-medium.onnx"
fi

echo "Verifying Piper installation..."
if [ -f "bin/piper/piper" ]; then
  ./bin/piper/piper --version
  echo "=== Piper TTS setup successful! ==="
else
  echo "Note: Piper binary not in bin/piper/piper, checking PATH..."
  piper --version || true
fi
