#!/usr/bin/env python3
"""ingest - download -> stage -> file -> scan -> identify, in one command.

    python3 ingest.py URL [URL ...]               # videos via yt-dlp
    python3 ingest.py --images URL [URL ...]      # image sets via gallery-dl
    python3 ingest.py --cookies cookies.txt URL   # content you are logged in to
    python3 ingest.py --batch urls.txt            # one URL per line, '#' comments allowed
    python3 ingest.py --file-only                 # just move whatever is finished in staging/

Only download what you have the right to keep (your purchases, creator-permitted
downloads, freely licensed material). See README "Ground rules".

Files land in STAGING first (partial downloads never touch the library), are
renamed "Studio - YYYY-MM-DD - Title [id].ext" so Stash's filename parser and
scrapers have something to work with, then moved into the library and scanned.
A download archive prevents re-downloading the same video twice.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import stashctl  # noqa: E402  (loads .env as a side effect)

ROOT = Path(os.environ.get("MEDIAVAULT_ROOT", Path.home() / "MediaVault")).expanduser()
STAGING = ROOT / "staging"
LIB_VIDEOS = ROOT / "library" / "videos"
LIB_IMAGES = ROOT / "library" / "images"
ARCHIVE = ROOT / "stash" / "download-archive.txt"

VIDEO_EXT = {".mp4", ".mkv", ".webm", ".mov", ".m4v", ".avi", ".wmv", ".flv", ".ts"}
PARTIAL_EXT = {".part", ".ytdl", ".tmp", ".temp"}

# %(uploader)s works on most tube-style extractors; falls back to the site name.
TEMPLATE = "%(uploader,channel,extractor_key)s - %(upload_date>%Y-%m-%d,NA)s - %(title).150B [%(id)s].%(ext)s"


def find(tool: str) -> str:
    path = shutil.which(tool)
    if not path:
        sys.exit(f"{tool} not found. Install it: pipx install {tool}  (or: pip install --user {tool})")
    return path


def ytdlp(urls: list[str], cookies: str | None, max_height: int, rate: str | None) -> int:
    cmd = [
        find("yt-dlp"),
        "--paths", f"home:{STAGING}", "--paths", f"temp:{STAGING / '.tmp'}",
        "-o", TEMPLATE,
        "--download-archive", str(ARCHIVE),
        "-f", f"bv*[height<={max_height}]+ba/b[height<={max_height}]/bv*+ba/b",
        "--merge-output-format", "mp4",
        "--embed-metadata", "--embed-thumbnail", "--embed-chapters",
        # --windows-filenames keeps names portable across NTFS/exFAT drives; we deliberately do NOT
        # use --restrict-filenames, which mangles spaces and non-ASCII titles that scrapers match on.
        "--windows-filenames",
        "--no-overwrites", "--continue", "--retries", "10", "--fragment-retries", "10",
        "--ignore-errors", "--no-mtime",
    ]
    if shutil.which("aria2c"):
        cmd += ["--downloader", "aria2c", "--downloader-args", "aria2c:-x8 -s8 -k1M"]
    if cookies:
        cmd += ["--cookies", cookies]
    if rate:
        cmd += ["--limit-rate", rate]
    return subprocess.call(cmd + urls)


def gallerydl(urls: list[str], cookies: str | None) -> int:
    dest = LIB_IMAGES  # gallery-dl writes complete files atomically; each set gets its own folder
    cmd = [find("gallery-dl"), "-d", str(dest), "--download-archive", str(ARCHIVE.with_suffix(".gallery.sqlite"))]
    if cookies:
        cmd += ["--cookies", cookies]
    return subprocess.call(cmd + urls)


def file_staged() -> list[Path]:
    """Move finished videos out of staging into library/videos/<uploader>/."""
    moved = []
    for f in sorted(STAGING.iterdir()):
        if not f.is_file() or f.suffix.lower() in PARTIAL_EXT or f.suffix.lower() not in VIDEO_EXT:
            continue
        if any((f.parent / (f.name + s)).exists() for s in (".part", ".ytdl")):
            continue  # still downloading
        folder = LIB_VIDEOS / (f.name.split(" - ", 1)[0] if " - " in f.name else "_unsorted")
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / f.name
        if target.exists():
            print(f"skip (already in library): {target}")
            continue
        shutil.move(str(f), target)
        moved.append(target)
        print(f"filed: {target.relative_to(ROOT)}")
    return moved


def read_batch(path: str) -> list[str]:
    return [ln.strip() for ln in Path(path).read_text().splitlines() if ln.strip() and not ln.startswith("#")]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("urls", nargs="*")
    p.add_argument("--batch", help="file with one URL per line")
    p.add_argument("--images", action="store_true", help="use gallery-dl (image sets) instead of yt-dlp")
    p.add_argument("--cookies", help="Netscape cookies.txt exported from your own browser session")
    p.add_argument("--max-height", type=int, default=2160, help="cap resolution (default 2160)")
    p.add_argument("--limit-rate", help="e.g. 5M - be polite to the host")
    p.add_argument("--file-only", action="store_true", help="skip downloading; just file + scan staging")
    p.add_argument("--no-scan", action="store_true", help="don't call Stash afterwards")
    p.add_argument("--no-identify", action="store_true", help="scan only; skip StashDB/TPDB matching")
    a = p.parse_args()

    for d in (STAGING, LIB_VIDEOS, LIB_IMAGES, ARCHIVE.parent):
        d.mkdir(parents=True, exist_ok=True)

    urls = a.urls + (read_batch(a.batch) if a.batch else [])
    if not urls and not a.file_only:
        p.error("give at least one URL, --batch FILE, or --file-only")

    if urls:
        rc = gallerydl(urls, a.cookies) if a.images else ytdlp(urls, a.cookies, a.max_height, a.limit_rate)
        if rc:
            print(f"downloader exited {rc} (some items may have failed; finished ones are still filed)")

    scan_paths = [LIB_IMAGES] if a.images else sorted({m.parent for m in file_staged()})
    if a.no_scan or not scan_paths:
        print("nothing new to scan" if not scan_paths else "skipping scan (--no-scan)")
        return

    stashctl.cmd_scan(argparse.Namespace(paths=[str(x) for x in scan_paths], rescan=False))
    if not a.no_identify and not a.images:
        try:
            stashctl.cmd_identify(argparse.Namespace(paths=[str(x) for x in scan_paths], scraper=[]))
        except SystemExit as e:  # no stash-box configured yet is not fatal
            print(f"identify skipped: {e}")
    stashctl.cmd_autotag(argparse.Namespace(paths=[str(x) for x in scan_paths]))


if __name__ == "__main__":
    main()
