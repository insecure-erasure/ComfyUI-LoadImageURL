from PIL import Image, ImageSequence, ImageOps
import torch
import requests
from io import BytesIO
import os
import numpy as np
import folder_paths
import hashlib
import server

try:
    import imageio.v3 as iio
    HAS_IMAGEIO = True
except ImportError:
    HAS_IMAGEIO = False

# Configure PIL security limits
Image.MAX_IMAGE_PIXELS = 178956970


def detect_image_type(content):
    """
    Detect image type from bytes using PIL instead of deprecated imghdr.
    Returns format string like 'jpeg', 'png', 'webp', etc. or None if invalid.
    """
    try:
        img = Image.open(BytesIO(content))
        return img.format.lower() if img.format else None
    except Exception:
        return None


def pil2tensor(img):
    """Convert PIL image to tensor format used by ComfyUI"""
    output_images = []
    output_masks = []

    for i in ImageSequence.Iterator(img):
        i = ImageOps.exif_transpose(i)
        if i.mode == 'I':
            i = i.point(lambda i: i * (1 / 255))
        image = i.convert("RGB")
        image = np.array(image).astype(np.float32) / 255.0
        image = torch.from_numpy(image)[None,]

        if 'A' in i.getbands():
            mask = np.array(i.getchannel('A')).astype(np.float32) / 255.0
            mask = 1. - torch.from_numpy(mask)
        else:
            mask = torch.ones((image.shape[1], image.shape[2]), dtype=torch.float32, device="cpu")

        output_images.append(image)
        output_masks.append(mask.unsqueeze(0))

    if len(output_images) > 1:
        output_image = torch.cat(output_images, dim=0)
        output_mask = torch.cat(output_masks, dim=0)
    else:
        output_image = output_images[0]
        output_mask = output_masks[0]

    return (output_image, output_mask)


def normalize_image_type(type_str):
    """Normalize image type names to standard format"""
    type_str = type_str.lower().strip()
    if type_str in ['jpg', 'jpeg']:
        return 'jpeg'
    return type_str



def normalize_url(url):
    """Add https:// protocol if missing from URL"""
    url = url.strip()
    if not url.startswith(('http://', 'https://')):
        return 'https://' + url
    return url


def validate_image_dimensions(width, height, max_pixels=100000000):
    """Validate image dimensions for safety"""
    total_pixels = width * height

    if total_pixels > max_pixels:
        return False, f"Image too large: {width}x{height} ({total_pixels} pixels, max {max_pixels})"

    aspect_ratio = max(width, height) / min(width, height) if min(width, height) > 0 else 0
    if aspect_ratio > 100:
        return False, f"Suspicious aspect ratio: {width}x{height}"

    return True, None


def load_image_safe(content_or_path, max_pixels=100000000):
    """Load image using imageio (safer) or PIL as fallback"""
    if HAS_IMAGEIO:
        try:
            img_array = iio.imread(content_or_path)

            if len(img_array.shape) == 2:
                height, width = img_array.shape
                channels = 1
            elif len(img_array.shape) == 3:
                height, width, channels = img_array.shape
            else:
                raise ValueError(f"Unsupported shape: {img_array.shape}")

            is_valid, error_msg = validate_image_dimensions(width, height, max_pixels)
            if not is_valid:
                raise ValueError(error_msg)

            if channels == 1:
                img = Image.fromarray(img_array, mode='L')
            elif channels == 3:
                img = Image.fromarray(img_array, mode='RGB')
            elif channels == 4:
                img = Image.fromarray(img_array, mode='RGBA')
            else:
                raise ValueError(f"Unsupported channels: {channels}")

            return img
        except Exception as e:
            print(f"imageio failed, falling back to PIL: {str(e)[:80]}")

    # Fallback to PIL
    img = Image.open(content_or_path)
    width, height = img.size
    is_valid, error_msg = validate_image_dimensions(width, height, max_pixels)
    if not is_valid:
        raise ValueError(error_msg)
    return img


def load_image_from_url(url, timeout=10, max_size_mb=100, max_redirects=5, max_pixels=100000000):
    """
    Load image from URL with comprehensive security validation

    Args:
        url: URL to download image from
        timeout: Request timeout in seconds
        max_size_mb: Maximum allowed file size in MB
        max_redirects: Maximum number of redirects to follow
        max_pixels: Maximum allowed total pixels

    Returns:
        tuple: (PIL Image object, temporary filename)
    """
    url = normalize_url(url)

    session = requests.Session()
    session.max_redirects = max_redirects

    response = session.get(
        url,
        timeout=timeout,
        stream=True,
        headers={'User-Agent': 'ComfyUI'},
        allow_redirects=True
    )
    response.raise_for_status()

    # Security check: HTTPS downgrade
    if response.url.startswith('http://') and url.startswith('https://'):
        print(f"Warning: Redirected from HTTPS to HTTP: {response.url}")

    # Log redirects
    if response.history:
        print(f"Followed {len(response.history)} redirect(s)")
        for i, r in enumerate(response.history, 1):
            print(f"  Redirect {i}: {r.status_code} -> {r.url}")
        print(f"  Final URL: {response.url}")

    # Check file size
    content_length = response.headers.get('Content-Length')
    if content_length and int(content_length) > max_size_mb * 1024 * 1024:
        raise ValueError(f"Image too large: {int(content_length)/(1024*1024):.1f}MB")

    # Download content
    content = response.content

    # Verify file is a valid image using PIL
    img_type = detect_image_type(content)
    if img_type is None:
        raise ValueError("File is not a valid image")

    # Verify Content-Type matches actual file type
    content_type = response.headers.get('Content-Type', '')
    if content_type:
        declared_type = content_type.split('/')[-1].split(';')[0]

        if normalize_image_type(declared_type) != normalize_image_type(img_type):
            raise ValueError(
                f"Type mismatch: Content-Type indicates '{declared_type}' "
                f"but file is '{img_type}'"
            )

    # Load image safely
    img = load_image_safe(BytesIO(content), max_pixels)

    # Generate filename from URL
    file_name = response.url.split('/')[-1].split('?')[0]
    if not file_name or '.' not in file_name:
        file_name = f"downloaded_image.{img_type}"

    session.close()
    return img, file_name


def list_temp_images():
    """List image files in ComfyUI's temp directory"""
    temp_dir = folder_paths.get_temp_directory()
    if not os.path.isdir(temp_dir):
        return []

    valid_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tiff', '.tif'}
    files = []
    for f in os.listdir(temp_dir):
        if os.path.isfile(os.path.join(temp_dir, f)):
            _, ext = os.path.splitext(f)
            if ext.lower() in valid_extensions:
                files.append(f)
    return sorted(files)


def load_image_from_temp(filename, max_pixels=100000000):
    """
    Load image from ComfyUI's temp directory with validation.

    Only accepts plain filenames (no path separators). Resolves against
    the temp directory and verifies the result does not escape it.

    Args:
        filename: Image filename (basename only, no path components)
        max_pixels: Maximum allowed total pixels

    Returns:
        tuple: (PIL Image object, filename)
    """
    # Reject any path separators to prevent traversal
    if os.sep in filename or '/' in filename or '\\' in filename:
        raise ValueError(f"Invalid filename (path separators not allowed): {filename}")

    temp_dir = folder_paths.get_temp_directory()
    file_path = os.path.normpath(os.path.join(temp_dir, filename))

    # Verify resolved path is still inside temp directory
    if not file_path.startswith(os.path.normpath(temp_dir) + os.sep) and file_path != os.path.normpath(temp_dir):
        raise ValueError(f"Path traversal detected: {filename}")

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found in temp directory: {filename}")

    # Read file for validation
    with open(file_path, 'rb') as f:
        content = f.read()

    # Verify file is a valid image using PIL
    img_type = detect_image_type(content)
    if img_type is None:
        raise ValueError("File is not a valid image")

    # Load image safely
    img = load_image_safe(BytesIO(content), max_pixels)

    return img, filename


class LoadImageByUrlOrPath:
    """
    ComfyUI node to load images from URL or ComfyUI temp directory with live preview
    """

    @classmethod
    def INPUT_TYPES(cls):
        temp_files = list_temp_images()
        return {
            "required": {
                "source": (["url", "temp_file"],),
                "url": ("STRING", {
                    "multiline": False,
                    "default": "",
                    "placeholder": "https://example.com/image.png"
                }),
                "image": (temp_files if temp_files else ["(no images found)"],),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "load"
    CATEGORY = "image"
    OUTPUT_NODE = False

    def load(self, source, url, image):
        """
        Load image from URL or temp file and return with UI preview data
        """
        try:
            if source == "url":
                if not url or not url.strip():
                    raise ValueError("URL is required")
                print(f"Loading image from URL: {url.strip()}")
                img, name = load_image_from_url(url.strip())
                source_key = url.strip()
            else:
                if not image or image == "(no images found)":
                    raise ValueError("No temp image selected")
                print(f"Loading image from temp: {image}")
                img, name = load_image_from_temp(image)
                source_key = image

            # Convert to tensors
            img_out, mask_out = pil2tensor(img)

            # Save to temp directory for preview
            source_hash = hashlib.md5(source_key.encode()).hexdigest()[:10]
            temp_filename = f"preview_{source_hash}_{name}"

            temp_dir = folder_paths.get_temp_directory()
            temp_path = os.path.join(temp_dir, temp_filename)

            # Save image for UI preview (as PNG to avoid format-specific kwarg issues)
            preview_img = img.convert("RGB") if img.mode not in ("RGB", "RGBA") else img
            preview_img.save(temp_path + ".png", format="PNG")
            temp_filename = temp_filename + ".png"

            print(f"Image loaded successfully: {img.size[0]}x{img.size[1]}, mode: {img.mode}")

            # Return with UI preview metadata
            return {
                "ui": {
                    "images": [{
                        "filename": temp_filename,
                        "subfolder": "",
                        "type": "temp"
                    }]
                },
                "result": (img_out, mask_out)
            }

        except requests.TooManyRedirects:
            raise RuntimeError("Too many redirects (max: 5)")
        except requests.RequestException as e:
            raise RuntimeError(f"Error downloading image: {str(e)}")
        except Image.DecompressionBombError as e:
            raise RuntimeError(f"Potential decompression bomb detected: {str(e)}")
        except Exception as e:
            raise RuntimeError(f"Error loading image: {str(e)}")

    @classmethod
    def IS_CHANGED(cls, source, url, image):
        """Force re-execution when source or selection changes"""
        if source == "url":
            return url
        return image


# API endpoint to load preview without executing workflow
from aiohttp import web

@server.PromptServer.instance.routes.post("/load_image_preview")
async def load_image_preview(request):
    """Endpoint to load image preview without executing workflow"""
    try:
        data = await request.json()
        source = data.get("source", "").strip()
        url = data.get("url", "").strip()
        image = data.get("image", "").strip()

        if source == "url":
            if not url:
                return web.json_response({"error": "URL is required"}, status=400)
            img, name = load_image_from_url(url)
            source_key = url
        elif source == "temp_file":
            if not image or image == "(no images found)":
                return web.json_response({"error": "No temp image selected"}, status=400)
            img, name = load_image_from_temp(image)
            source_key = image
        else:
            return web.json_response({"error": "Invalid source type"}, status=400)

        # Save to temp directory for preview
        source_hash = hashlib.md5(source_key.encode()).hexdigest()[:10]
        temp_filename = f"preview_{source_hash}_{name}"

        temp_dir = folder_paths.get_temp_directory()
        temp_path = os.path.join(temp_dir, temp_filename)

        preview_img = img.convert("RGB") if img.mode not in ("RGB", "RGBA") else img
        preview_img.save(temp_path + ".png", format="PNG")
        temp_filename = temp_filename + ".png"

        return web.json_response({
            "success": True,
            "image": {
                "filename": temp_filename,
                "subfolder": "",
                "type": "temp"
            },
            "dimensions": {
                "width": img.size[0],
                "height": img.size[1]
            }
        })

    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/load_image_list_temp")
async def list_temp_images_endpoint(request):
    """Endpoint to list available images in temp directory"""
    try:
        files = list_temp_images()
        return web.json_response({"files": files})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

# Node registration
NODE_CLASS_MAPPINGS = {
    "LoadImageByUrlOrPath": LoadImageByUrlOrPath
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoadImageByUrlOrPath": "Load Image (URL/Path)"
}
