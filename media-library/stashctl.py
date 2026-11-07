#!/usr/bin/env python3
"""stashctl - drive a local Stash instance from the command line (stdlib only).

    python3 stashctl.py stats
    python3 stashctl.py scan [PATH ...]            # scan + covers/previews/sprites/phash
    python3 stashctl.py identify [PATH ...]        # match via StashDB/TPDB by pHash, then scrapers
    python3 stashctl.py autotag [PATH ...]         # tag from filenames using existing performers/studios/tags
    python3 stashctl.py generate                   # fill in any missing previews/sprites/phashes
    python3 stashctl.py clean                      # drop DB entries for files that no longer exist (dry run unless --apply)
    python3 stashctl.py backup                     # SQLite backup into the backups folder
    python3 stashctl.py dupes [--distance N]       # list pHash duplicate groups
    python3 stashctl.py jobs

Config comes from env or media-library/.env:
    STASH_URL=http://127.0.0.1:9999   STASH_API_KEY=...
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


def load_env() -> None:
    env = Path(__file__).with_name(".env")
    if env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
URL = os.environ.get("STASH_URL", "http://127.0.0.1:9999").rstrip("/") + "/graphql"
API_KEY = os.environ.get("STASH_API_KEY", "")


def gql(query: str, variables: dict | None = None) -> dict:
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(URL, data=body, headers={"Content-Type": "application/json"})
    if API_KEY:
        req.add_header("ApiKey", API_KEY)
    # Never route localhost traffic through a system proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=60) as r:
            out = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"Stash returned HTTP {e.code}. If you set a password, put STASH_API_KEY in .env.")
    except urllib.error.URLError as e:
        sys.exit(f"Cannot reach Stash at {URL}: {e.reason}. Is it running?")
    if out.get("errors"):
        sys.exit("GraphQL error: " + "; ".join(err.get("message", "?") for err in out["errors"]))
    return out["data"]


def wait(job_id: str, label: str) -> None:
    q = "query($id:ID!){findJob(input:{id:$id}){status progress description error}}"
    last = None
    while True:
        job = gql(q, {"id": job_id})["findJob"]
        if job is None:  # finished jobs age out of the queue
            print(f"{label}: done")
            return
        status, prog = job["status"], job.get("progress")
        line = f"{label}: {status}" + (f" {prog * 100:.0f}%" if prog is not None else "")
        if line != last:
            print(line, flush=True)
            last = line
        if status in ("FINISHED", "CANCELLED", "FAILED"):
            if job.get("error"):
                print("  error:", job["error"])
            return
        time.sleep(2)


def paths_or_none(paths: list[str]) -> list[str] | None:
    return [str(Path(p).expanduser().resolve()) for p in paths] or None


def cmd_stats(_: argparse.Namespace) -> None:
    s = gql("{stats{scene_count image_count gallery_count performer_count studio_count tag_count"
            " scenes_size scenes_duration total_play_count}}")["stats"]
    print(f"Scenes     {s['scene_count']:>8}   {s['scenes_size'] / 1e9:,.1f} GB   "
          f"{s['scenes_duration'] / 3600:,.1f} h")
    for k, label in (("image", "Images"), ("gallery", "Galleries"), ("performer", "Performers"),
                     ("studio", "Studios"), ("tag", "Tags")):
        print(f"{label:<10} {s[k + '_count']:>8}")
    print(f"Plays      {s['total_play_count']:>8}")


def cmd_scan(a: argparse.Namespace) -> None:
    inp = {"paths": paths_or_none(a.paths), "rescan": a.rescan,
           "scanGenerateCovers": True, "scanGeneratePreviews": True,
           "scanGenerateSprites": True, "scanGeneratePhashes": True,
           "scanGenerateImagePreviews": False, "scanGenerateThumbnails": True}
    wait(gql("mutation($i:ScanMetadataInput!){metadataScan(input:$i)}", {"i": inp})["metadataScan"], "scan")


def cmd_identify(a: argparse.Namespace) -> None:
    cfg = gql("{configuration{general{stashBoxes{endpoint name}}}}")["configuration"]["general"]
    sources = [{"source": {"stash_box_endpoint": b["endpoint"]}} for b in cfg["stashBoxes"]]
    sources += [{"source": {"scraper_id": s}} for s in a.scraper]
    if not sources:
        sys.exit("No stash-box endpoints configured. Add StashDB/TPDB under Settings > Metadata Providers.")
    print("sources (in priority order):", ", ".join([b["name"] for b in cfg["stashBoxes"]] + a.scraper))
    inp = {"sources": sources, "paths": paths_or_none(a.paths),
           "options": {"setCoverImage": True, "setOrganized": False, "includeMalePerformers": True,
                       "fieldOptions": [{"field": f, "strategy": "MERGE", "createMissing": True}
                                        for f in ("performers", "studio", "tags")]}}
    wait(gql("mutation($i:IdentifyMetadataInput!){metadataIdentify(input:$i)}", {"i": inp})["metadataIdentify"],
         "identify")


def cmd_autotag(a: argparse.Namespace) -> None:
    inp = {"paths": paths_or_none(a.paths), "performers": ["*"], "studios": ["*"], "tags": ["*"]}
    wait(gql("mutation($i:AutoTagMetadataInput!){metadataAutoTag(input:$i)}", {"i": inp})["metadataAutoTag"],
         "autotag")


def cmd_generate(_: argparse.Namespace) -> None:
    inp = {"covers": True, "previews": True, "sprites": True, "phashes": True,
           "imageThumbnails": True, "markers": True, "overwrite": False}
    wait(gql("mutation($i:GenerateMetadataInput!){metadataGenerate(input:$i)}", {"i": inp})["metadataGenerate"],
         "generate")


def cmd_clean(a: argparse.Namespace) -> None:
    inp = {"dryRun": not a.apply}
    if not a.apply:
        print("dry run - see Stash logs for what would be removed; re-run with --apply to delete DB entries")
    wait(gql("mutation($i:CleanMetadataInput!){metadataClean(input:$i)}", {"i": inp})["metadataClean"], "clean")


def cmd_backup(_: argparse.Namespace) -> None:
    gql("mutation{backupDatabase(input:{download:false})}")
    print("backup written to the configured backups folder")


def cmd_dupes(a: argparse.Namespace) -> None:
    q = ("query($d:Int){findDuplicateScenes(distance:$d){id title files{path size width height duration}}}")
    groups = gql(q, {"d": a.distance})["findDuplicateScenes"]
    if not groups:
        print("no duplicates found (pHashes must be generated first: stashctl.py generate)")
    for n, g in enumerate(groups, 1):
        print(f"--- group {n}")
        for s in g:
            for f in s["files"]:
                print(f"  #{s['id']:<6} {f['width']}x{f['height']} {f['size'] / 1e6:8.1f} MB  {f['path']}")


def cmd_jobs(_: argparse.Namespace) -> None:
    for j in gql("{jobQueue{id status description progress}}")["jobQueue"] or []:
        print(j)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("stats").set_defaults(fn=cmd_stats)
    s = sub.add_parser("scan"); s.add_argument("paths", nargs="*"); s.add_argument("--rescan", action="store_true")
    s.set_defaults(fn=cmd_scan)
    s = sub.add_parser("identify"); s.add_argument("paths", nargs="*")
    s.add_argument("--scraper", action="append", default=[], help="extra scraper id fallback (repeatable)")
    s.set_defaults(fn=cmd_identify)
    s = sub.add_parser("autotag"); s.add_argument("paths", nargs="*"); s.set_defaults(fn=cmd_autotag)
    sub.add_parser("generate").set_defaults(fn=cmd_generate)
    s = sub.add_parser("clean"); s.add_argument("--apply", action="store_true"); s.set_defaults(fn=cmd_clean)
    sub.add_parser("backup").set_defaults(fn=cmd_backup)
    s = sub.add_parser("dupes"); s.add_argument("--distance", type=int, default=0,
                                                help="0 = exact pHash match; 4-8 catches re-encodes")
    s.set_defaults(fn=cmd_dupes)
    sub.add_parser("jobs").set_defaults(fn=cmd_jobs)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
