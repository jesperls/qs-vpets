#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
	echo "usage: $0 <version>" >&2
	exit 2
fi

raw="$1"
ver="${raw#[vV]}"
if ! printf '%s' "$ver" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$'; then
	echo "bump-version: invalid version '$raw' (expected semver like 0.9.0 or v0.9.0)" >&2
	exit 2
fi

cmakeVer="${ver%%[-+]*}"
today=$(date -u +%Y-%m-%d)
repoRoot=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

replaceInFile() {
	local file="$1"
	local expr="$2"
	local tmp
	tmp=$(mktemp)
	sed -E "$expr" "$file" >"$tmp"
	cat "$tmp" >"$file"
	rm -f "$tmp"
}

printf '%s\n' "$ver" >"$repoRoot/VERSION"

replaceInFile "$repoRoot/macos/CMakeLists.txt" \
	"s|set\\(QS_VPETS_VERSION \"[^\"]+\"\\)|set(QS_VPETS_VERSION \"${ver}\")|g"
replaceInFile "$repoRoot/macos/CMakeLists.txt" \
	"s|set\\(QS_VPETS_CMAKE_VERSION \"[^\"]+\"\\)|set(QS_VPETS_CMAKE_VERSION \"${cmakeVer}\")|g"

replaceInFile "$repoRoot/macos/src/main.mm" \
	"s|#define QS_VPETS_VERSION_STR \"[^\"]+\"|#define QS_VPETS_VERSION_STR \"${ver}\"|g"

replaceInFile "$repoRoot/scripts/qs-vpets.sh" \
	"s|^([[:space:]]*)version=\"[0-9]+\\.[0-9]+\\.[0-9]+[^\"]*\"|\\1version=\"${ver}\"|"

replaceInFile "$repoRoot/scripts/qs-vpets-macos.sh" \
	"s|^([[:space:]]*)version=\"[0-9]+\\.[0-9]+\\.[0-9]+[^\"]*\"|\\1version=\"${ver}\"|"

replaceInFile "$repoRoot/packaging/aur/PKGBUILD" \
	"s|^pkgver=[^[:space:]]+|pkgver=${ver}.r0.g0000000|"
replaceInFile "$repoRoot/packaging/aur/PKGBUILD" \
	"s|^([[:space:]]*local base_ver=)\"[^\"]+\"|\\1\"${ver}\"|"

metainfo="$repoRoot/packaging/desktop/io.github.jesperls.qs_vpets.metainfo.xml"
if ! grep -Fq "version=\"${ver}\"" "$metainfo"; then
	tmp=$(mktemp)
	awk -v v="$ver" -v d="$today" '
		/<releases>/ && !done {
			print
			printf "    <release version=\"%s\" date=\"%s\"/>\n", v, d
			done = 1
			next
		}
		{ print }
	' "$metainfo" >"$tmp"
	mv "$tmp" "$metainfo"
fi

echo "Bumped version to ${ver}"
