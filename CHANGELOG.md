# Changelog

## Version 1.1.0 (2026-05-06)
- **Breaking change**: Replaced free-text `url_or_path` input with structured inputs
  - New `source` dropdown: `url` / `temp_file`
  - `url`: string field for URLs (visible in url mode)
  - `image`: combo dropdown listing images from ComfyUI's temp directory (visible in temp_file mode)
- Removed support for arbitrary filesystem paths (security hardening)
- Added `list_temp_images()` to enumerate image files in temp directory
- Added `load_image_from_temp()` with path traversal protection
- Removed `is_url()` auto-detection (no longer needed with explicit source selector)
- Frontend widget toggle: `preview.js` now hides/shows `url` and `image` widgets based on `source` value
- Preview now always saved as PNG to avoid format-specific kwarg issues (e.g. `quality` on BMP)
- Updated `/load_image_preview` endpoint to accept `source`, `url`, and `image` parameters

## Version 1.0.0 (2026-01-25)
- Initial release
- URL and file path loading
- Comprehensive security validation
- Live preview support
- imageio integration for safer loading
- Auto-protocol detection
- Redirect tracking and limits
