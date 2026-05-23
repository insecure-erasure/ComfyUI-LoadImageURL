# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-05-23

### Added
- Multi-source image loading via dropdown: `url`, `temp`, `input`, `output`
- URL loading with auto-protocol detection (adds `https://` if omitted)
- Directory browsing via combo widget for temp, input, and output folders
- Auto-hide of `url`/`image` widgets based on selected source
- Auto-load preview on URL widget confirm
- Named preview prefix to avoid collisions with other nodes
- Preview restored when switching between sources
- Live in-node image preview via canvas (`onDrawForeground`)
- EXIF-based automatic image rotation
- Alpha channel extraction as MASK output (normalized, inverted)
- Multi-format support: PNG, JPEG, WebP, BMP, GIF, TIFF and more
- Safe image loading via `imageio` with PIL fallback
- ComfyUI Manager metadata (`pyproject.toml`)

### Security
- Magic number verification to detect actual file type regardless of extension
- HTTP `Content-Type` cross-validation against detected file type
- Decompression bomb protection via pixel count limit (default: 100M pixels)
- File size limit enforced before download via `Content-Length` (default: 100 MB)
- Aspect ratio validation — rejects images with ratios exceeding 100:1
- Redirect limit (max 5) with per-redirect logging
- HTTPS-to-HTTP downgrade detection and warning
- Request timeout protection (default: 10 s)
- Path traversal protection for local directory loading: rejects filenames with
  path separators and verifies resolved path stays within the selected directory

## Credits

Based on [comfyui-load-image-url](https://github.com/Braeden90000/comfyui-load-image-url)
by [Braeden90000](https://github.com/Braeden90000).
