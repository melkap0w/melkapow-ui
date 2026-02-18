#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${FRONTEND_OUT_DIR:-$ROOT_DIR/dist}"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# Copy only the static site, not backend/tests.
for f in index.html art.html favicon.ico robots.txt _headers CNAME; do
  if [ -f "$ROOT_DIR/$f" ]; then
    cp "$ROOT_DIR/$f" "$OUT_DIR/"
  fi
done

cp -R "$ROOT_DIR/assets" "$OUT_DIR/"
cp -R "$ROOT_DIR/images" "$OUT_DIR/"

# Generate the runtime API base config into the build output.
MELKAPOW_FRONTEND_OUT_ROOT="$OUT_DIR" bash "$ROOT_DIR/scripts/generate-runtime-config.sh"

if [ ! -f "$OUT_DIR/index.html" ]; then
  echo "ERROR: dist/index.html missing (build output looks wrong)." >&2
  exit 1
fi

echo "Frontend build output ready: $OUT_DIR"

