# ComfyUI Load Image (URL/Path) - Robust Edition

A secure and feature-rich custom node for ComfyUI that loads images from URLs or local file paths with comprehensive security validation and live preview support.

## Features

### 🔒 Security First
- **Magic number verification**: Validates actual file type, not just extension
- **Content-Type validation**: Cross-checks HTTP headers with file content
- **Decompression bomb protection**: Prevents malicious compressed images
- **Size limits**: Configurable maximum file size (default: 100MB)
- **Pixel limits**: Protects against extremely large images (default: 100M pixels)
- **Aspect ratio validation**: Detects suspicious image dimensions
- **Redirect protection**: Limits and logs HTTP redirects (max: 5)
- **HTTPS downgrade detection**: Warns when redirected from HTTPS to HTTP
- **Timeout protection**: Prevents hanging on unresponsive servers

### 🖼️ Image Loading
- **Dual source support**: Switch between URL and local file
- **Protocol flexibility**: Auto-adds `https://` if protocol omitted
- **Safe image parsing**: Uses imageio (more secure) with PIL fallback
- **Multi-format support**: PNG, JPEG, WebP, BMP, GIF, and more
- **EXIF orientation**: Automatic rotation based on EXIF data
- **Alpha channel handling**: Proper mask generation from transparency

### 👁️ Live Preview
- **In-node preview**: See loaded image directly in the node
- **Auto-resize**: Node adjusts to fit image preview
- **Responsive display**: Scales to node width
- **Error handling**: Graceful fallback on preview failures

## Installation

### Via ComfyUI Manager (Recommended)
1. Open ComfyUI Manager
2. Search for "Load Image URL Path Robust"
3. Click Install
4. Restart ComfyUI

### Manual Installation
1. Navigate to `ComfyUI/custom_nodes/`
2. Clone or extract this repository:
```bash
   cd ComfyUI/custom_nodes/
   git clone https://github.com/yourusername/comfyui-load-image-url-robust.git
```
3. Restart ComfyUI

## Usage

### Basic Usage
1. Add "Load Image (URL/Path)" node from the `image` category
2. Select source type:
   - **url**: Load from web address
   - **file**: Load from ComfyUI input folder
3. Enter URL or select file
4. Connect IMAGE and MASK outputs to other nodes
5. Execute workflow - image preview appears in node

### URL Examples
```
https://example.com/image.png
example.com/photo.jpg  (auto-adds https://)
https://domain.com/pic.webp?size=large
```

### Advanced Configuration

The node accepts these parameters in `nodes.py`:
```python
load_image_from_url(
    url="https://example.com/image.png",
    timeout=10,           # Request timeout (seconds)
    max_size_mb=100,      # Maximum file size (MB)
    max_redirects=5,      # Maximum HTTP redirects
    max_pixels=100000000  # Maximum total pixels
)
```

## Inputs

| Input | Type | Description |
|-------|------|-------------|
| `source` | Dropdown | Choose "url" or "file" |
| `url` | String | Web address of image (when source=url) |
| `image` | Dropdown | Select from uploaded files (when source=file) |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| `IMAGE` | IMAGE | Loaded image tensor (RGB, normalized 0-1) |
| `MASK` | MASK | Alpha channel mask (inverted, 1=opaque) |

## Security Features Explained

### Magic Number Verification
Checks file header bytes to verify actual file type, preventing malicious files disguised with fake extensions.

### Content-Type Validation
When loading from URL, compares HTTP `Content-Type` header against actual file type detected by magic numbers.

### Decompression Bomb Protection
Limits total pixel count to prevent specially crafted images that expand to consume all memory.

### Size Validation
- **File size**: Checks `Content-Length` before download
- **Pixel count**: Validates dimensions don't exceed limits
- **Aspect ratio**: Rejects images with suspicious ratios (>100:1)

### Network Security
- **Timeout**: Prevents hanging on slow/dead servers
- **Redirect limits**: Stops infinite redirect loops
- **HTTPS downgrade warnings**: Alerts if redirected to HTTP
- **User-Agent**: Identifies as ComfyUI for server logs

## Dependencies

### Required
- `torch` - Tensor operations
- `pillow` (PIL) - Image processing
- `numpy` - Array operations
- `requests` - HTTP downloads

### Optional (Recommended)
- `imageio` - Safer image loading (auto-fallback to PIL if missing)

Install missing dependencies:
```bash
pip install torch pillow numpy requests imageio
```

## Troubleshooting

### Preview Not Showing
- Ensure JavaScript is enabled in browser
- Clear browser cache and refresh
- Check browser console for errors
- Verify image saved to temp directory

### Download Failures
- Check URL is accessible in browser
- Verify firewall/proxy settings
- Ensure server supports User-Agent header
- Try adding explicit `https://` protocol

### Type Mismatch Errors
- Server may return incorrect `Content-Type`
- File may be corrupted during transfer
- Try downloading and using as local file

### Image Too Large
- Reduce `max_size_mb` or `max_pixels` in code
- Use image resizing service (e.g., Cloudinary)
- Download and resize before loading

## Technical Details

### Image Processing Pipeline
1. **Download/Read**: Fetch from URL or read from disk
2. **Magic Number Check**: Verify file type
3. **Content Validation**: Cross-check headers vs content
4. **Dimension Check**: Validate size and aspect ratio
5. **Safe Loading**: imageio → PIL → numpy → torch
6. **EXIF Rotation**: Auto-orient based on metadata
7. **Channel Conversion**: RGB + Alpha mask extraction
8. **Normalization**: Scale to 0-1 range
9. **Tensor Conversion**: Convert to torch tensors
10. **Preview Generation**: Save to temp for UI display

### Security Model
- **Defense in depth**: Multiple validation layers
- **Fail-safe defaults**: Conservative limits
- **Transparent operation**: Logs warnings and redirects
- **Graceful degradation**: Falls back safely on errors

## Development

### Project Structure
```
comfyui-load-image-url-robust/
├── __init__.py           # Node registration
├── nodes.py              # Main node implementation
├── js/
│   └── preview.js        # Frontend preview logic
├── README.md             # This file
├── LICENSE               # MIT License
└── requirements.txt      # Python dependencies
```

### Testing
```python
# Test URL loading
from nodes import load_image_from_url
img, name = load_image_from_url("https://example.com/test.png")
print(f"Loaded: {name}, Size: {img.size}")

# Test file loading
from nodes import load_image_from_path
img, name = load_image_from_path("/path/to/image.jpg")
print(f"Loaded: {name}, Size: {img.size}")
```

## License

MIT License - see LICENSE file for details

## Credits & Acknowledgments

Built upon ideas from [comfyui-load-image-url](https://github.com/Braeden90000/comfyui-load-image-url) by Braeden90000, with some enhancements:
- Comprehensive security validation (magic number verification, Content-Type validation, decompression bomb protection)
- imageio integration for safer image loading with PIL fallback
- Enhanced error handling and logging
- Multiple validation layers (size limits, aspect ratio checks, redirect protection)
- HTTPS downgrade detection
- Request timeout protection

Additional credits:
- Built for [ComfyUI](https://github.com/comfyanonymous/ComfyUI) by comfyanonymous

## Changelog

### Version 1.0.0 (2026-01-25)
- Initial release
- URL and file path loading
- Comprehensive security validation
- Live preview support
- imageio integration for safer loading
- Auto-protocol detection
- Redirect tracking and limits
