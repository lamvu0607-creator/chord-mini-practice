"""BTC-SL detector: the original BTC checkpoint. See btc_detector.py."""

from typing import Optional

from services.detectors.btc_detector import BTCDetectorService


class BTCSLDetectorService(BTCDetectorService):
    def __init__(self, model_dir: Optional[str] = None):
        super().__init__(model_dir, 'btc-sl')
