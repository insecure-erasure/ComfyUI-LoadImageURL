"""
ComfyUI Load Image (URL/Path) - Robust Edition

A secure and robust custom node for loading images from URLs or local paths
with comprehensive validation and live preview support.
"""

from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

# Required for ComfyUI to load frontend extensions
WEB_DIRECTORY = "./js"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
