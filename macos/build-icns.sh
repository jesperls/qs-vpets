#!/usr/bin/env bash
set -euo pipefail

svgPath="${1:?missing svg path}"
outIcns="${2:?missing output icns path}"

if ! command -v iconutil >/dev/null 2>&1 || ! command -v sips >/dev/null 2>&1; then
	exit 0
fi

tmpDir=$(mktemp -d)
trap 'rm -rf "$tmpDir"' EXIT

basePng="$tmpDir/base1024.png"
if command -v rsvg-convert >/dev/null 2>&1; then
	rsvg-convert -w 1024 -h 1024 "$svgPath" -o "$basePng" 2>/dev/null || true
fi
if [ ! -s "$basePng" ] && command -v qlmanage >/dev/null 2>&1; then
	qlmanage -t -s 1024 -o "$tmpDir" "$svgPath" >/dev/null 2>&1 || true
	if [ -f "$tmpDir/$(basename "$svgPath").png" ]; then
		mv "$tmpDir/$(basename "$svgPath").png" "$basePng"
	fi
fi
if [ ! -s "$basePng" ]; then
	sips -s format png -z 1024 1024 "$svgPath" --out "$basePng" >/dev/null 2>&1 || true
fi

if [ ! -s "$basePng" ]; then
	exit 0
fi

iconset="$tmpDir/AppIcon.iconset"
mkdir -p "$iconset"
for sz in 16 32 128 256 512; do
	sz2=$((sz * 2))
	sips -z "$sz" "$sz" "$basePng" --out "$iconset/icon_${sz}x${sz}.png" >/dev/null 2>&1
	sips -z "$sz2" "$sz2" "$basePng" --out "$iconset/icon_${sz}x${sz}@2x.png" >/dev/null 2>&1
done

mkdir -p "$(dirname "$outIcns")"
iconutil -c icns "$iconset" -o "$outIcns" >/dev/null 2>&1 || true
