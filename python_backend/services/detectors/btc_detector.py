"""
BTC (Bi-directional Transformer for Chord recognition) detector service.

One wrapper for every BTC checkpoint shipped in models/ChordMini:
    btc-cl  BTC CL (continual learning, arXiv 2602.19778), the default
    btc-sl  original BTC (Park et al., ISMIR 2019), the paper's teacher
    btc-pl  legacy id; same checkpoint as btc-cl (kept so cached results and
            old clients keep working)

When beat times are passed, chords are decoded per beat (changes land on
beats, cheaper on downbeats) and a key estimated from the chord posteriors is
returned with the chords.
"""

import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from utils.logging import log_debug, log_error

BTC_VARIANTS = {
    'btc-cl': {
        'variant': 'cl',
        'name': 'BTC CL (Continual Learning)',
        'description': 'BTC transformer trained with pseudo-labels then continual learning on labelled data '
                       '(arXiv 2602.19778), 170-chord vocabulary',
    },
    'btc-sl': {
        'variant': 'sl',
        'name': 'BTC (original)',
        'description': 'Original BTC transformer (ISMIR 2019), 170-chord vocabulary',
    },
    'btc-pl': {
        'variant': 'pl',
        'name': 'BTC CL (legacy id btc-pl)',
        'description': 'Legacy alias of btc-cl (same checkpoint)',
    },
}


class BTCDetectorService:
    """Service wrapper for one BTC checkpoint with the normalized detector interface."""

    def __init__(self, model_dir: Optional[str] = None, model_id: str = 'btc-cl'):
        if model_id not in BTC_VARIANTS:
            raise ValueError(f"Unknown BTC model id: {model_id}")
        self.model_dir = Path(model_dir) if model_dir else None
        self.model_id = model_id
        self.variant = BTC_VARIANTS[model_id]['variant']
        self.display_name = BTC_VARIANTS[model_id]['name']
        self._available: Optional[bool] = None

    def _import_btc(self):
        if self.model_dir and str(self.model_dir) not in sys.path:
            sys.path.insert(0, str(self.model_dir))
        import btc_chord_recognition
        return btc_chord_recognition

    def is_available(self) -> bool:
        if self._available is not None:
            return self._available
        try:
            if not self.model_dir or not self.model_dir.exists():
                log_error(f"{self.model_id}: model directory not found")
                self._available = False
                return False
            if not (self.model_dir / 'config' / 'btc_config.yaml').exists():
                log_debug(f"{self.model_id}: btc_config.yaml not found")
                self._available = False
                return False
            btc = self._import_btc()
            checkpoint = Path(btc.checkpoint_path(self.variant))
            if not checkpoint.exists():
                log_debug(f"{self.model_id}: checkpoint not found: {checkpoint}")
                self._available = False
                return False
            self._available = True
        except Exception as e:
            log_error(f"{self.model_id} availability check failed: {e}")
            self._available = False
        return self._available

    def recognize_chords(self, file_path: str, chord_dict: str = 'large_voca',
                         beats: Optional[List[float]] = None, downbeats: Optional[List[float]] = None,
                         **kwargs) -> Dict[str, Any]:
        base = {'model_used': self.model_id, 'model_name': self.display_name, 'chord_dict': 'large_voca'}
        if not self.is_available():
            return {'success': False, 'error': f"{self.display_name} is not available", **base}

        start_time = time.time()
        try:
            btc = self._import_btc()
            frames = btc.btc_frame_probabilities(file_path, self.variant)
            result = btc.decode_chords(frames, beats, downbeats)
            chords = [{'start': float(s), 'end': float(e), 'chord': label, 'confidence': 1.0}
                      for s, e, label in result['segments']]
            log_debug(f"{self.model_id}: {len(chords)} chords, decoding={result['decoding']}, key={result['key']}")
            return {
                'success': True,
                'chords': chords,
                'total_chords': len(chords),
                'duration': chords[-1]['end'] if chords else 0.0,
                'key': result['key'],
                'key_confidence': result['key_confidence'],
                'decoding': result['decoding'],
                'processing_time': time.time() - start_time,
                **base,
            }
        except Exception as e:
            error_msg = f"{self.display_name} recognition error: {e}"
            log_error(error_msg)
            return {'success': False, 'error': error_msg, 'processing_time': time.time() - start_time, **base}

    def get_supported_chord_dicts(self) -> List[str]:
        return ['large_voca']

    def get_model_info(self) -> Dict[str, Any]:
        return {
            'name': self.display_name,
            'description': BTC_VARIANTS[self.model_id]['description'],
            'supported_chord_dicts': self.get_supported_chord_dicts(),
            'model_dir': str(self.model_dir) if self.model_dir else None,
            'available': self.is_available(),
        }
