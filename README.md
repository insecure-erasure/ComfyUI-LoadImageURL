# ComfyUI Load Image (URL/Path) - Robust Edition

A secure and feature-rich custom node for ComfyUI that loads images from URLs or from ComfyUI's temp directory with comprehensive security validation and live preview support.

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
- **Path traversal protection**: Temp file loading rejects path separators and validates resolved paths

### 🖼️ Image Loading
- **Dual source support**: Switch between URL and temp file via dropdown
- **Temp directory browsing**: Select images from ComfyUI's temp directory via combo widget
- **Protocol flexibility**: Auto-adds `https://` if protocol omitted in URLs
- **Safe image parsing**: Uses imageio (more secure) with PIL fallback
- **Multi-format support**: PNG, JPEG, WebP, BMP, GIF, TIFF, and more
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
   git clone https://github.com/insecure-erasure/ComfyUI-LoadImageURL.git
```
3. Restart ComfyUI

## Usage

### Basic Usage
1. Add "Load Image (URL/Path)" node from the `image` category
2. Select source type from the dropdown:
   - **url**: Load from web address
   - **temp_file**: Load from ComfyUI's temp directory
3. Depending on the source:
   - For **url**: Enter the image URL in the text field
   - For **temp_file**: Select an image from the dropdown (lists files in ComfyUI's temp directory)
4. Click "Load Preview" to preview without executing, or connect IMAGE and MASK outputs and run the workflow
5. Image preview appears in the node

### URL Examples
https://example.com/image.png
example.com/photo.jpg  (auto-adds https://)
https://domain.com/pic.webp?size=large

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
| `source` | Dropdown | Choose "url" or "temp_file" |
| `url` | String | Web address of image (visible when source=url) |
| `image` | Dropdown | Select from temp directory files (visible when source=temp_file) |

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

### Path Traversal Protection
When loading from temp directory, the node rejects any filename containing path separators and verifies the resolved path stays within the temp directory boundary.

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

### No Images in Temp File Dropdown
- The temp directory is populated by other nodes during workflow execution
- Run a workflow that generates images first, then refresh the node

## Technical Details

### Image Processing Pipeline
1. **Download/Read**: Fetch from URL or read from temp directory
2. **Magic Number Check**: Verify file type
3. **Content Validation**: Cross-check headers vs content (URL mode)
4. **Dimension Check**: Validate size and aspect ratio
5. **Safe Loading**: imageio → PIL → numpy → torch
6. **EXIF Rotation**: Auto-orient based on metadata
7. **Channel Conversion**: RGB + Alpha mask extraction
8. **Normalization**: Scale to 0-1 range
9. **Tensor Conversion**: Convert to torch tensors
10. **Preview Generation**: Save as PNG to temp for UI display

### Security Model
- **Defense in depth**: Multiple validation layers
- **Fail-safe defaults**: Conservative limits
- **Transparent operation**: Logs warnings and redirects
- **Graceful degradation**: Falls back safely on errors
- **No arbitrary paths**: Only temp directory access for local files

## Development

### Project Structure
ComfyUI-LoadImageURL/
├── init.py           # Node registration
├── nodes.py              # Main node implementation
├── js/
│   └── preview.js        # Frontend preview + widget toggle logic
├── README.md             # This file
├── CHANGELOG.md          # Version history
├── LICENSE               # MIT License
└── requirements.txt      # Python dependencies

## License

MIT License - see LICENSE file for details

## Credits & Acknowledgments

Built upon ideas from [comfyui-load-image-url](https://github.com/Braeden90000/comfyui-load-image-url) by Braeden90000, with enhancements:
- Comprehensive security validation (magic number verification, Content-Type validation, decompression bomb protection)
- imageio integration for safer image loading with PIL fallback
- Enhanced error handling and logging
- Multiple validation layers (size limits, aspect ratio checks, redirect protection)
- HTTPS downgrade detection
- Request timeout protection
- Path traversal protection for temp directory loading

Additional credits:
- Built for [ComfyUI](https://github.com/comfyanonymous/ComfyUI) by comfyanonymous
