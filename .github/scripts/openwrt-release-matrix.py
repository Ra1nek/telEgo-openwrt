#!/usr/bin/env python3
"""Discover stable patch releases for one OpenWrt release series."""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request


RELEASES_URL = "https://downloads.openwrt.org/releases/"


def version_key(value: str) -> tuple[int, ...]:
    return tuple(int(part) for part in value.split("."))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--series", required=True, help="Release series, for example 25.12")
    parser.add_argument("--minimum", required=True, help="Oldest supported release, for example 25.12.0")
    args = parser.parse_args()

    if not re.fullmatch(r"\d+\.\d+", args.series):
        parser.error("--series must use MAJOR.MINOR form")
    if not re.fullmatch(rf"{re.escape(args.series)}\.\d+", args.minimum):
        parser.error("--minimum must belong to --series")

    request = urllib.request.Request(
        RELEASES_URL,
        headers={"User-Agent": "telEgo-openwrt-ci/1"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            html = response.read().decode("utf-8", errors="replace")
    except OSError as exc:
        print(f"Failed to fetch {RELEASES_URL}: {exc}", file=sys.stderr)
        return 1

    pattern = rf'href=["\']({re.escape(args.series)}\.\d+)/["\']'
    versions = sorted(set(re.findall(pattern, html)), key=version_key)
    versions = [version for version in versions if version_key(version) >= version_key(args.minimum)]

    if not versions or versions[0] != args.minimum:
        print(
            f"Could not discover stable OpenWrt {args.series}.x releases starting at {args.minimum}",
            file=sys.stderr,
        )
        return 1

    print(json.dumps({"version": versions}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
