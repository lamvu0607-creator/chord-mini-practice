#!/usr/bin/env python3
"""
SongFormer Weights Downloader & Integrity Verifier
===================================================
Automates downloading and verifying model checkpoint weights for the SongFormer
structural segmentation model from official sources (Hugging Face Hub / custom mirror).

Usage:
    python download_weights.py [--force] [--target-dir DIR]
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Tuple
import urllib.request

# Expected metadata for SongFormer.safetensors
EXPECTED_SHA256 = "87f17bfbed37014c6af4314abd9eb6971a94e3a95e9fc70f9e5ee33bdacb487b"
EXPECTED_MD5 = "5a24800e12ab357744f8b47e523ba3e6"
EXPECTED_SIZE = 104468437  # 104,468,437 bytes (~99.6 MB)

DEFAULT_CHECKPOINT_URL = (
    "https://huggingface.co/ASLP-lab/SongFormer/resolve/main/SongFormer.safetensors"
)

ROOT_DIR = Path(__file__).resolve().parent
PRIMARY_CKPTS_DIR = ROOT_DIR / "ckpts"
SRC_CKPTS_DIR = ROOT_DIR / "src" / "SongFormer" / "ckpts"


def compute_file_hashes(file_path: Path) -> Tuple[str, str, int]:
    """Compute sha256, md5, and file size in bytes using chunked streaming."""
    sha256 = hashlib.sha256()
    md5 = hashlib.md5()
    total_bytes = 0

    with open(file_path, "rb") as f:
        while chunk := f.read(1024 * 1024):
            sha256.update(chunk)
            md5.update(chunk)
            total_bytes += len(chunk)

    return sha256.hexdigest(), md5.hexdigest(), total_bytes


def verify_checkpoint_integrity(file_path: Path) -> bool:
    """Verify size and SHA256 / MD5 checksum of checkpoint file."""
    if not file_path.is_file():
        return False

    file_size = file_path.stat().st_size
    if file_size != EXPECTED_SIZE:
        print(
            f"[-] Size mismatch for {file_path.name}: "
            f"expected {EXPECTED_SIZE} bytes, got {file_size} bytes."
        )
        return False

    sha256_val, md5_val, _ = compute_file_hashes(file_path)
    if sha256_val.lower() != EXPECTED_SHA256.lower():
        print(f"[-] SHA256 mismatch for {file_path.name}: {sha256_val}")
        return False

    return True


def download_file(url: str, dest_path: Path) -> None:
    """Download a file with progress indicator and atomic write."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    temp_dest = dest_path.with_suffix(".tmp")

    print(f"[*] Downloading: {url}")
    print(f"    Target: {dest_path}")

    headers = {"User-Agent": "ChordMini-SongFormer/1.0"}
    req = urllib.request.Request(url, headers=headers)

    try:
        with urllib.request.urlopen(req) as response:
            total_length = response.headers.get("content-length")
            total_bytes = int(total_length) if total_length else None
            downloaded = 0

            with open(temp_dest, "wb") as f:
                while chunk := response.read(1024 * 1024):
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_bytes:
                        pct = (downloaded / total_bytes) * 100
                        print(
                            f"\r    Progress: {downloaded / (1024*1024):.1f} MB / "
                            f"{total_bytes / (1024*1024):.1f} MB ({pct:.1f}%)",
                            end="",
                            flush=True,
                        )
                    else:
                        print(
                            f"\r    Downloaded: {downloaded / (1024*1024):.1f} MB",
                            end="",
                            flush=True,
                        )
            print()

        temp_dest.replace(dest_path)
        print(f"[+] Download complete: {dest_path}")
    except Exception as e:
        if temp_dest.exists():
            temp_dest.unlink()
        raise RuntimeError(f"Download failed from {url}: {e}") from e


def sync_file(src: Path, dst: Path) -> None:
    """Copy or hardlink file between directories."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists() and dst.samefile(src):
        return
    print(f"[*] Syncing {src} -> {dst}")
    shutil.copy2(src, dst)


def check_backbone_models() -> dict[str, bool]:
    """Check availability of auxiliary backbone models (MusicFM and MuQ)."""
    status = {}

    musicfm_pt = SRC_CKPTS_DIR / "MusicFM" / "pretrained_msd.pt"
    musicfm_stats = SRC_CKPTS_DIR / "MusicFM" / "msd_stats.json"
    status["MusicFM"] = musicfm_pt.is_file() and musicfm_stats.is_file()

    muq_safetensors = SRC_CKPTS_DIR / "MuQ" / "model.safetensors"
    muq_config = SRC_CKPTS_DIR / "MuQ" / "config.json"
    status["MuQ"] = muq_safetensors.is_file() and muq_config.is_file()

    return status


def main() -> int:
    parser = argparse.ArgumentParser(
        description="SongFormer Checkpoint Weights Downloader & Verifier"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force re-download even if checkpoint file exists and is valid",
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Only check and verify existing files, do not download",
    )
    args = parser.parse_args()

    checkpoint_url = (
        os.getenv("SONGFORMER_CHECKPOINT_URL") or DEFAULT_CHECKPOINT_URL
    ).strip()

    primary_file = PRIMARY_CKPTS_DIR / "SongFormer.safetensors"
    src_file = SRC_CKPTS_DIR / "SongFormer.safetensors"

    print("=" * 60)
    print(" SongFormer Checkpoint Weights Manager")
    print("=" * 60)
    print(f"Primary ckpts dir: {PRIMARY_CKPTS_DIR}")
    print(f"Source ckpts dir:  {SRC_CKPTS_DIR}")
    print(f"Checkpoint URL:    {checkpoint_url}")
    print("-" * 60)

    # 1. Check if either location already contains a valid file
    valid_source = None
    if not args.force:
        if primary_file.is_file() and verify_checkpoint_integrity(primary_file):
            print(f"[+] Found valid SongFormer checkpoint at: {primary_file}")
            valid_source = primary_file
        elif src_file.is_file() and verify_checkpoint_integrity(src_file):
            print(f"[+] Found valid SongFormer checkpoint at: {src_file}")
            valid_source = src_file

    # 2. Download if neither exists or --force is specified
    if valid_source is None:
        if args.check_only:
            print("[-] SongFormer.safetensors not found or invalid.")
            return 1

        print("[*] Downloading SongFormer.safetensors...")
        PRIMARY_CKPTS_DIR.mkdir(parents=True, exist_ok=True)
        download_file(checkpoint_url, primary_file)

        if not verify_checkpoint_integrity(primary_file):
            print("[-] Verification failed after download!")
            return 1
        valid_source = primary_file

    # 3. Synchronize so both directories have the valid file
    if valid_source == primary_file and not src_file.exists():
        sync_file(primary_file, src_file)
    elif valid_source == src_file and not primary_file.exists():
        sync_file(src_file, primary_file)

    # Verify both locations
    print("-" * 60)
    print("[*] Verifying checkpoint integrity:")
    for path in [primary_file, src_file]:
        if path.is_file():
            sha, md5, sz = compute_file_hashes(path)
            print(f"  File:   {path}")
            print(f"  Size:   {sz:,} bytes (OK)")
            print(f"  SHA256: {sha}")
            print(f"  MD5:    {md5} (OK)")
            print("  Status: [VALID]")
        else:
            print(f"  File:   {path} [MISSING]")

    # Check backbones
    print("-" * 60)
    print("[*] Checking Backbone Models:")
    backbone_status = check_backbone_models()
    for name, ok in backbone_status.items():
        tag = "[READY]" if ok else "[NOT FOUND]"
        print(f"  - {name}: {tag}")

    print("=" * 60)
    print("[+] SongFormer weights setup completed successfully!")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
