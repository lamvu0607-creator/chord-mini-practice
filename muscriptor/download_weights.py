"""Download and verify the gated MuScriptor medium weights into ckpts/muscriptor-medium/.

The repo is gated: accept the terms at https://huggingface.co/MuScriptor/muscriptor-medium and
run `hf auth login` first. Needs `huggingface_hub` on the host (it is not part of the image).

Usage: python download_weights.py [--from <dir with model.safetensors + config.json>]
"""

import argparse
import shutil
import sys
from pathlib import Path

from service import CKPT_DIR, FILES, MODEL_DIR_NAME, REPO_ID, REVISION, sha256_of


def verify(directory: Path) -> bool:
    for name, expected in FILES.items():
        path = directory / name
        if not path.is_file() or sha256_of(path) != expected:
            print(f"[-] {path} missing or checksum mismatch")
            return False
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from", dest="source", type=Path, help="copy from a local directory instead of downloading")
    args = parser.parse_args()
    target = CKPT_DIR / MODEL_DIR_NAME
    if verify(target):
        print(f"[+] {target} already present and verified")
        return 0

    target.mkdir(parents=True, exist_ok=True)
    if args.source:
        for name in FILES:
            shutil.copyfile(args.source / name, target / name)
    else:
        from huggingface_hub import hf_hub_download

        for name in FILES:
            cached = hf_hub_download(REPO_ID, name, revision=REVISION)
            shutil.copyfile(cached, target / name)

    if not verify(target):
        return 1
    print(f"[+] Saved {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
