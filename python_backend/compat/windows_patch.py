"""
Windows environment compatibility patches.

Handles:
1. UTF-8 console output (avoiding UnicodeEncodeError on emojis in Windows cp1252 consoles).
2. Safe os.add_dll_directory (preventing pyfluidsynth crashes on missing C:\\tools\\fluidsynth\\bin).
3. Runtime discovery of ffmpeg and ffprobe binaries into PATH.
4. Auto-adding ChordMini to sys.path for BTC chord model loading.
"""

import os
import sys
from pathlib import Path


def patch_windows_compatibility():
    """Apply Windows runtime and environment patches."""
    # 1. UTF-8 stdio encoding to prevent charmap UnicodeEncodeError with emojis
    try:
        if sys.platform == 'win32':
            if hasattr(sys.stdout, 'reconfigure'):
                sys.stdout.reconfigure(encoding='utf-8', errors='replace')
            if hasattr(sys.stderr, 'reconfigure'):
                sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    # 2. Safe os.add_dll_directory to prevent FileNotFoundError on missing dirs (e.g. pyfluidsynth)
    try:
        if hasattr(os, 'add_dll_directory'):
            orig_add_dll_directory = os.add_dll_directory

            def safe_add_dll_directory(path):
                try:
                    if os.path.exists(path):
                        return orig_add_dll_directory(path)
                except Exception:
                    pass
                return None

            os.add_dll_directory = safe_add_dll_directory
    except Exception:
        pass

    # 3. Add ffmpeg / ffprobe binaries into PATH
    try:
        backend_dir = Path(__file__).resolve().parent.parent
        repo_root = backend_dir.parent
        search_paths = [
            Path(sys.prefix) / 'Library' / 'bin',
            Path(sys.prefix) / 'Scripts',
            repo_root / 'node_modules' / 'ffmpeg-static',
            repo_root / 'node_modules' / 'ffprobe-static' / 'bin' / 'win32' / 'x64',
        ]
        current_path = os.environ.get('PATH', '')
        for p in search_paths:
            if p.exists() and str(p) not in current_path:
                os.environ['PATH'] = str(p) + os.pathsep + os.environ.get('PATH', '')
    except Exception:
        pass

    # 4. Add ChordMini submodule to sys.path
    try:
        backend_dir = Path(__file__).resolve().parent.parent
        chordmini_dir = backend_dir / 'models' / 'ChordMini'
        if chordmini_dir.exists() and str(chordmini_dir) not in sys.path:
            sys.path.insert(0, str(chordmini_dir))
    except Exception:
        pass
