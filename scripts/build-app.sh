#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

echo "==> Building OpenMuse native macOS app..."

# 1. Compile Swift app binary
swiftc -O -target arm64-apple-macos13.0 native/OpenMuseApp.swift -o native/OpenMuse

# 2. Re-create icns if missing
if [ ! -f "OpenMuse.icns" ]; then
  mkdir -p OpenMuse.iconset
  sips -z 16 16     apps/mobile/assets/capybara.png --out OpenMuse.iconset/icon_16x16.png > /dev/null
  sips -z 32 32     apps/mobile/assets/capybara.png --out OpenMuse.iconset/icon_16x16@2x.png > /dev/null
  sips -z 32 32     apps/mobile/assets/capybara.png --out OpenMuse.iconset/icon_32x32.png > /dev/null
  sips -z 64 64     apps/mobile/assets/capybara.png --out OpenMuse.iconset/icon_32x32@2x.png > /dev/null
  sips -z 128 128   apps/mobile/assets/capybara.png --out OpenMuse.iconset/icon_128x128.png > /dev/null
  sips -z 256 256   apps/mobile/assets/capybara.png --out OpenMuse.iconset/icon_128x128@2x.png > /dev/null
  sips -z 256 256   apps/mobile/assets/capybara.png --out OpenMuse.iconset/icon_256x256.png > /dev/null
  sips -z 512 512   apps/mobile/assets/capybara.png --out OpenMuse.iconset/icon_256x256@2x.png > /dev/null
  sips -z 512 512   apps/mobile/assets/capybara.png --out OpenMuse.iconset/icon_512x512.png > /dev/null
  sips -z 1024 1024 apps/mobile/assets/capybara.png --out OpenMuse.iconset/icon_512x512@2x.png > /dev/null
  iconutil -c icns OpenMuse.iconset -o OpenMuse.icns
  rm -rf OpenMuse.iconset
fi

# 3. Create app bundle in ~/Applications
APP_PATH="$HOME/Applications/OpenMuse.app"
DESKTOP_PATH="$HOME/Desktop/OpenMuse.app"

rm -rf "$APP_PATH" "$DESKTOP_PATH"
mkdir -p "$APP_PATH/Contents/MacOS" "$APP_PATH/Contents/Resources"

cp native/OpenMuse "$APP_PATH/Contents/MacOS/OpenMuse"
chmod +x "$APP_PATH/Contents/MacOS/OpenMuse"
cp OpenMuse.icns "$APP_PATH/Contents/Resources/OpenMuse.icns"
cp native/Info.plist "$APP_PATH/Contents/Info.plist"

touch "$APP_PATH"
cp -R "$APP_PATH" "$DESKTOP_PATH"

echo "==> Installed OpenMuse.app to $APP_PATH and $DESKTOP_PATH"
