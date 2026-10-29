"""Download and verify SCNet checkpoints into ckpts/.

Usage: python download_weights.py [--model scnet_xl_ihf|scnet_small|all]
"""

import argparse
import hashlib
import sys
import urllib.request
from pathlib import Path

from service import CKPT_DIR, DEFAULT_MODEL, MODELS


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def fetch(name: str) -> bool:
    spec = MODELS[name]
    target = CKPT_DIR / spec.checkpoint
    if target.is_file() and sha256_of(target) == spec.sha256:
        print(f"[+] {spec.checkpoint} already present and verified")
        return True

    CKPT_DIR.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".part")
    print(f"[*] Downloading {spec.label} from {spec.url}")
    request = urllib.request.Request(spec.url, headers={"User-Agent": "ChordMini-stems/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response, open(temporary, "wb") as handle:
        while True:
            block = response.read(1024 * 1024)
            if not block:
                break
            handle.write(block)

    actual = sha256_of(temporary)
    if actual != spec.sha256:
        temporary.unlink(missing_ok=True)
        print(f"[-] Checksum mismatch for {spec.checkpoint}: {actual}")
        return False
    temporary.replace(target)
    print(f"[+] Saved {target}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default=DEFAULT_MODEL, choices=[*MODELS.keys(), "all"])
    args = parser.parse_args()
    names = list(MODELS.keys()) if args.model == "all" else [args.model]
    return 0 if all(fetch(name) for name in names) else 1


if __name__ == "__main__":
    sys.exit(main())
