# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-25

### Added
- Initial release
- Load images from URLs with comprehensive security validation
- Load images from local file paths
- Live preview in node interface
- Magic number verification for file type validation
- Content-Type header validation against actual file type
- Decompression bomb protection
- Configurable size and pixel limits
- Aspect ratio validation
- HTTP redirect tracking and limits
- HTTPS downgrade detection
- Request timeout protection
- Auto-protocol detection (adds https:// if missing)
- imageio integration for safer image loading with PIL fallback
- EXIF orientation support
- Alpha channel mask generation
- Comprehensive error handling and logging
- Detailed README with security documentation
- MIT License

### Security
- Defense-in-depth approach with multiple validation layers
- Protection against malicious images
- Safe defaults for size and redirect limits
- Transparent logging of security events
