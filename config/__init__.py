"""Root config package fallback - re-exports from python_backend.config."""
import sys
from pathlib import Path

_backend_dir = Path(__file__).resolve().parent.parent / "python_backend"
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

try:
    from python_backend.config import *  # type: ignore # noqa: F401, F403
    from python_backend.config import get_config, Config, DevelopmentConfig, ProductionConfig, TestingConfig  # noqa: F401
except ImportError:
    try:
        from config import *  # type: ignore # noqa: F401, F403
        from config import get_config, Config, DevelopmentConfig, ProductionConfig, TestingConfig  # noqa: F401
    except ImportError:
        pass
