"""BTC-PL detector: legacy id, same checkpoint as btc-cl. See btc_detector.py."""

from typing import Optional

from services.detectors.btc_detector import BTCDetectorService


class BTCPLDetectorService(BTCDetectorService):
    def __init__(self, model_dir: Optional[str] = None):
        super().__init__(model_dir, 'btc-pl')
