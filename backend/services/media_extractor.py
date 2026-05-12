"""
Media extraction service using yt-dlp.
Handles media analysis and download for all supported platforms.
Also supports direct image URL downloads.
"""
import os
import re
import asyncio
import tempfile
import logging
import mimetypes
from urllib.parse import urlparse, unquote
from typing import Optional
from models.schemas import (
    Platform, MediaType, FormatInfo, AnalyzeResponse,
    PLATFORM_INFO
)
from services.platform_detector import detect_platform

logger = logging.getLogger(__name__)

# Common image extensions for direct URL detection
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".ico", ".tiff", ".avif"}


def _is_direct_image_url(url: str) -> bool:
    """Check if a URL points directly to an image file."""
    parsed = urlparse(url.lower().split('?')[0].split('#')[0])
    path = unquote(parsed.path)
    _, ext = os.path.splitext(path)
    return ext in IMAGE_EXTENSIONS


async def download_direct_image(url: str) -> tuple[str, str, str]:
    """
    Download an image directly from a URL using httpx.
    Returns (file_path, filename, content_type).
    """
    import httpx

    temp_dir = tempfile.mkdtemp(prefix="grabvid_img_")

    # Extract filename from URL
    parsed = urlparse(url)
    path = unquote(parsed.path)
    basename = os.path.basename(path) or "image.jpg"
    # Clean the filename
    safe_name = re.sub(r'[^\w\s.\-]', '', basename).strip()[:100]
    if not safe_name:
        safe_name = "image.jpg"

    file_path = os.path.join(temp_dir, safe_name)

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "image/*,*/*;q=0.8",
    }

    async with httpx.AsyncClient(follow_redirects=True, timeout=60) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()

        with open(file_path, "wb") as f:
            f.write(response.content)

    # Determine content type
    content_type = response.headers.get("content-type", "").split(";")[0].strip()
    if not content_type or content_type == "application/octet-stream":
        guessed, _ = mimetypes.guess_type(safe_name)
        content_type = guessed or "image/jpeg"

    return file_path, safe_name, content_type

MAX_DOWNLOAD_SIZE = int(os.getenv("MAX_DOWNLOAD_SIZE", str(2 * 1024 * 1024 * 1024)))  # 2GB
DOWNLOAD_TIMEOUT = int(os.getenv("DOWNLOAD_TIMEOUT", "300"))


def _classify_error(error_msg: str) -> dict:
    """
    Classify a yt-dlp error into a structured error code + user-friendly message.
    The mobile app maps these codes to localized strings.
    """
    msg = str(error_msg).lower()

    # Bot detection MUST come first (before "sign in" / "login" checks)
    if any(k in msg for k in ["not a bot", "confirm you're not a bot", "confirm you are not a bot", "bot detection", "automated requests"]):
        return {"code": "FORBIDDEN", "error": "Platform detected automated traffic. Please try again later or use a different video."}

    if any(k in msg for k in ["private", "is private", "private video"]):
        return {"code": "PRIVATE", "error": "This video is private. Only the owner can view it."}

    if any(k in msg for k in ["login", "sign in", "authentication", "cookies", "login required"]):
        return {"code": "LOGIN_REQUIRED", "error": "This content requires login. Try a different video."}

    if any(k in msg for k in ["age", "age-restricted", "confirm your age"]):
        return {"code": "AGE_RESTRICTED", "error": "Age-restricted content. Server cookies may be needed."}

    if any(k in msg for k in ["geo", "not available in your country", "geo restriction", "blocked in your"]):
        return {"code": "GEO_BLOCKED", "error": "This video is not available in your region."}

    if any(k in msg for k in ["copyright", "dmca", "taken down", "removed by"]):
        return {"code": "COPYRIGHT", "error": "This video was removed due to copyright."}

    if any(k in msg for k in ["not found", "404", "does not exist", "been deleted", "no video", "unavailable"]):
        return {"code": "NOT_FOUND", "error": "Video not found. It may have been deleted."}

    if any(k in msg for k in ["403", "forbidden", "blocked", "denied"]):
        return {"code": "FORBIDDEN", "error": "Platform blocked the request. Try again later."}

    if any(k in msg for k in ["429", "too many", "rate limit", "throttl"]):
        return {"code": "RATE_LIMITED", "error": "Too many requests. Please wait a moment and try again."}

    if any(k in msg for k in ["unsupported", "not supported", "no suitable", "requested format is not available"]):
        return {"code": "UNSUPPORTED", "error": "This URL or format is not supported."}

    # Generic fallback
    return {"code": "UNKNOWN", "error": str(error_msg)}


def _format_duration(seconds: Optional[int]) -> Optional[str]:
    """Convert seconds to HH:MM:SS or MM:SS format."""
    if seconds is None:
        return None
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def _format_size(size_bytes: int) -> str:
    """Convert bytes to human-readable string."""
    if size_bytes <= 0:
        return "Unknown"
    units = ["B", "KB", "MB", "GB"]
    unit_index = 0
    size = float(size_bytes)
    while size >= 1024 and unit_index < len(units) - 1:
        size /= 1024
        unit_index += 1
    return f"{size:.1f} {units[unit_index]}"


def _get_platform_formats(platform: Platform) -> list[dict]:
    """
    Get the expected format configurations for each platform.
    These are the formats we try to extract or generate.
    """
    if platform in (Platform.YOUTUBE, Platform.VIMEO, Platform.TWITCH):
        return [
            {"format_id": "mp4_1080p", "label": "MP4 1080p", "type": MediaType.VIDEO, "quality": "1080p", "ext": "mp4",
             "height": 1080},
            {"format_id": "mp4_720p", "label": "MP4 720p", "type": MediaType.VIDEO, "quality": "720p", "ext": "mp4",
             "height": 720},
            {"format_id": "mp4_480p", "label": "MP4 480p", "type": MediaType.VIDEO, "quality": "480p", "ext": "mp4",
             "height": 480},
            {"format_id": "mp3_audio", "label": "MP3 Audio", "type": MediaType.AUDIO, "quality": "128kbps",
             "ext": "mp3"},
        ]
    elif platform == Platform.TIKTOK:
        return [
            {"format_id": "mp4_no_watermark", "label": "MP4 (No Watermark)", "type": MediaType.VIDEO,
             "quality": "HD", "ext": "mp4", "has_watermark": False},
            {"format_id": "mp4_watermark", "label": "MP4 (With Watermark)", "type": MediaType.VIDEO,
             "quality": "HD", "ext": "mp4", "has_watermark": True},
            {"format_id": "mp3_audio", "label": "MP3 Audio", "type": MediaType.AUDIO, "quality": "128kbps",
             "ext": "mp3"},
        ]
    elif platform in (Platform.INSTAGRAM, Platform.TWITTER, Platform.FACEBOOK, Platform.REDDIT):
        return [
            {"format_id": "mp4_hd", "label": "MP4 HD", "type": MediaType.VIDEO, "quality": "HD", "ext": "mp4"},
            {"format_id": "mp4_sd", "label": "MP4 SD", "type": MediaType.VIDEO, "quality": "SD", "ext": "mp4"},
            {"format_id": "jpeg_original", "label": "JPEG Original", "type": MediaType.IMAGE,
             "quality": "Original", "ext": "jpg"},
            {"format_id": "jpeg_compressed", "label": "JPEG Compressed", "type": MediaType.IMAGE,
             "quality": "Compressed", "ext": "jpg"},
            {"format_id": "gif", "label": "GIF", "type": MediaType.IMAGE, "quality": "Animated", "ext": "gif"},
        ]
    elif platform == Platform.SOUNDCLOUD:
        return [
            {"format_id": "mp3_320", "label": "MP3 320kbps", "type": MediaType.AUDIO, "quality": "320kbps",
             "ext": "mp3"},
            {"format_id": "mp3_128", "label": "MP3 128kbps", "type": MediaType.AUDIO, "quality": "128kbps",
             "ext": "mp3"},
            {"format_id": "wav", "label": "WAV Lossless", "type": MediaType.AUDIO, "quality": "Lossless",
             "ext": "wav"},
            {"format_id": "flac", "label": "FLAC Lossless", "type": MediaType.AUDIO, "quality": "Lossless",
             "ext": "flac"},
        ]
    elif platform == Platform.PINTEREST:
        return [
            {"format_id": "jpeg_original", "label": "JPEG Original", "type": MediaType.IMAGE,
             "quality": "Original", "ext": "jpg"},
            {"format_id": "jpeg_compressed", "label": "JPEG Compressed", "type": MediaType.IMAGE,
             "quality": "Compressed", "ext": "jpg"},
            {"format_id": "mp4_video", "label": "MP4 Video Pin", "type": MediaType.VIDEO, "quality": "HD",
             "ext": "mp4"},
        ]
    elif platform == Platform.SNAPCHAT:
        return [
            {"format_id": "mp4_hd", "label": "MP4 HD", "type": MediaType.VIDEO, "quality": "HD", "ext": "mp4"},
            {"format_id": "mp4_sd", "label": "MP4 SD", "type": MediaType.VIDEO, "quality": "SD", "ext": "mp4"},
            {"format_id": "jpeg_original", "label": "JPEG Original", "type": MediaType.IMAGE,
             "quality": "Original", "ext": "jpg"},
        ]
    return [
        {"format_id": "mp4_best", "label": "MP4 Best Quality", "type": MediaType.VIDEO, "quality": "Best",
         "ext": "mp4"},
    ]


async def _analyze_direct_image(url: str) -> AnalyzeResponse:
    """Analyze a direct image URL and return download options."""
    import httpx

    parsed = urlparse(url)
    path = unquote(parsed.path)
    filename = os.path.basename(path) or "image"
    ext = os.path.splitext(filename)[1].lstrip(".").lower() or "jpg"

    # Do a HEAD request to get file size without downloading
    estimated_size = 0
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            resp = await client.head(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            })
            content_length = resp.headers.get("content-length")
            if content_length:
                estimated_size = int(content_length)
    except Exception:
        estimated_size = 1 * 1024 * 1024  # Default 1MB

    formats = [
        FormatInfo(
            format_id="direct_image",
            label=f"{ext.upper()} Original",
            type=MediaType.IMAGE,
            quality="Original",
            extension=ext,
            estimated_size=_format_size(estimated_size) if estimated_size else "Unknown",
            estimated_size_bytes=estimated_size,
        ),
    ]

    return AnalyzeResponse(
        platform=Platform.UNKNOWN,
        platform_name="Direct Image",
        platform_color="#6366F1",
        title=filename,
        thumbnail=url,
        duration=None,
        duration_formatted=None,
        author=parsed.netloc,
        formats=formats,
    )



async def analyze_url(url: str) -> AnalyzeResponse:
    """
    Analyze a URL and return platform info with available formats.
    Uses yt-dlp to extract metadata without downloading.
    Also supports direct image URLs from any website.
    """
    import yt_dlp

    # Check if this is a direct image URL first
    if _is_direct_image_url(url):
        return await _analyze_direct_image(url)

    platform = detect_platform(url)
    if platform == Platform.UNKNOWN:
        # Before giving up, try yt-dlp anyway — it supports 1000+ sites
        try:
            pass  # Fall through to the yt-dlp logic below
        except Exception:
            raise ValueError("Unsupported platform. Please provide a URL from a supported platform.")

    platform_info = PLATFORM_INFO.get(platform, {})
    
    # Base options
    base_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "no_color": True,
        "socket_timeout": 30,
        "geo_bypass": True,
        "age_limit": 100,
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        },
    }
    
    # Add cookies file if configured
    cookies_file = os.getenv("COOKIES_FILE")
    if cookies_file and os.path.exists(cookies_file):
        base_opts["cookiefile"] = cookies_file

    # For YouTube, try mobile/API clients to bypass datacenter IP blocks
    if platform == Platform.YOUTUBE:
        player_clients = ["android", "ios", "mweb", "web"]
    else:
        player_clients = [None]

    last_error = None
    info = None
    
    for client in player_clients:
        ydl_opts = {**base_opts}
        if client:
            ydl_opts["extractor_args"] = {"youtube": [f"player_client={client}"]}
        
        try:
            loop = asyncio.get_event_loop()
            info = await loop.run_in_executor(None, lambda opts=ydl_opts: _extract_info(url, opts))
            break  # Success — stop trying
        except Exception as e:
            last_error = e
            logger.warning(f"yt-dlp client '{client}' failed for {url}: {e}")
            continue
    
    if info is None:
        logger.error(f"All yt-dlp attempts failed for {url}")
        if last_error:
            raise last_error
        raise ValueError("Could not analyze this URL.")

    title = info.get("title", "Untitled")
    thumbnail = info.get("thumbnail")
    duration = info.get("duration")
    author = info.get("uploader") or info.get("channel") or info.get("creator")

    # Build available formats based on platform type and actual yt-dlp data
    available_formats = _build_formats(platform, info)

    return AnalyzeResponse(
        platform=platform,
        platform_name=platform_info.get("name", platform.value.title()),
        platform_color=platform_info.get("color", "#FFFFFF"),
        title=title,
        thumbnail=thumbnail,
        duration=int(duration) if duration else None,
        duration_formatted=_format_duration(int(duration)) if duration else None,
        author=author,
        formats=available_formats,
    )


def _extract_info(url: str, opts: dict) -> dict:
    """Synchronous yt-dlp info extraction."""
    import yt_dlp
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False)


def _build_formats(platform: Platform, info: dict) -> list[FormatInfo]:
    """Build format list from platform config and actual yt-dlp data."""
    platform_formats = _get_platform_formats(platform)
    
    # Always allow downloading the thumbnail regardless of platform
    platform_formats.append({
        "format_id": "thumbnail", 
        "label": "Download Thumbnail", 
        "type": MediaType.IMAGE, 
        "quality": "HD", 
        "ext": "jpg"
    })
    
    ydl_formats = info.get("formats", [])
    has_video = False
    for f in ydl_formats:
        vcodec = f.get("vcodec")
        if vcodec != "none" and vcodec is not None:
            has_video = True
        if f.get("ext") in ("mp4", "webm"):
            has_video = True
            
    is_image_only = not has_video
    
    max_height = 0
    for f in ydl_formats:
        h = f.get("height", 0) or 0
        if h > max_height:
            max_height = h
    
    result = []
    for pf in platform_formats:
        # Smart filtering to prevent offering image formats on video posts, and vice versa
        if pf["type"] == MediaType.IMAGE and not is_image_only and pf["format_id"] != "thumbnail":
            continue
        if pf["type"] in (MediaType.VIDEO, MediaType.AUDIO) and is_image_only:
            continue
            
        # Skip video resolutions that are higher than the actual source video
        if pf["type"] == MediaType.VIDEO and max_height > 0:
            target_height = pf.get("height", 0)
            if target_height > 0 and target_height > max_height + 60:
                continue
            
        # Try to estimate file size from yt-dlp format data
        estimated_bytes = _estimate_size(pf, ydl_formats, info)
        
        format_info = FormatInfo(
            format_id=pf["format_id"],
            label=pf["label"],
            type=pf["type"],
            quality=pf["quality"],
            extension=pf["ext"],
            estimated_size=_format_size(estimated_bytes),
            estimated_size_bytes=estimated_bytes,
            has_watermark=pf.get("has_watermark"),
        )
        result.append(format_info)
        
    # Enforce realistic scaling: Higher resolutions should always be larger than lower resolutions
    # result is ordered descending (1080p -> 720p -> 480p)
    for i in range(len(result) - 2, -1, -1):
        curr = result[i]
        lower = result[i+1]
        if curr.type == MediaType.VIDEO and lower.type == MediaType.VIDEO:
            if curr.estimated_size_bytes < lower.estimated_size_bytes:
                # Estimate it realistically based on the lower resolution's actual bloated size
                curr.estimated_size_bytes = int(lower.estimated_size_bytes * 1.4)
                curr.estimated_size = _format_size(curr.estimated_size_bytes)
    
    return result


def _estimate_size(platform_format: dict, ydl_formats: list, info: dict) -> int:
    """Estimate file size based on yt-dlp format data."""
    target_height = platform_format.get("height")
    media_type = platform_format["type"]
    duration = info.get("duration", 0) or 0
    
    if media_type == MediaType.VIDEO and target_height:
        # Find the largest stream matching this resolution
        best_size = 0
        for fmt in ydl_formats:
            height = fmt.get("height", 0) or 0
            if abs(height - target_height) <= 60:
                filesize = fmt.get("filesize") or fmt.get("filesize_approx")
                if filesize and int(filesize) > best_size:
                    best_size = int(filesize)
        
        if best_size > 0:
            # Add audio size estimate (128kbps = 16KB/s) since we merge streams
            audio_size = int(16 * 1024 * duration) if duration > 0 else (2 * 1024 * 1024)
            return best_size + audio_size
        
        # Estimate based on bitrate and duration
        bitrate_map = {1080: 4000, 720: 2500, 480: 1000}
        bitrate_kbps = bitrate_map.get(target_height, 2000)
        if duration > 0:
            return int(bitrate_kbps * 1000 / 8 * duration)
    
    elif media_type == MediaType.AUDIO:
        quality = platform_format.get("quality", "128kbps")
        bitrate_match = re.search(r"(\d+)", quality)
        bitrate_kbps = int(bitrate_match.group(1)) if bitrate_match else 128
        if duration > 0:
            return int(bitrate_kbps * 1000 / 8 * duration)
        return 5 * 1024 * 1024  # Default 5MB
    
    elif media_type == MediaType.IMAGE:
        if platform_format["quality"] == "Original":
            return 2 * 1024 * 1024  # ~2MB
        return 500 * 1024  # ~500KB
    
    # Fallback: check any filesize from yt-dlp
    for fmt in ydl_formats:
        filesize = fmt.get("filesize") or fmt.get("filesize_approx")
        if filesize:
            return int(filesize)
    
    return 10 * 1024 * 1024  # Default 10MB


async def download_media(url: str, format_id: str) -> tuple[str, str, str]:
    """
    Download media in the specified format.
    Supports both yt-dlp platforms and direct image URLs.
    
    Returns:
        Tuple of (file_path, filename, content_type)
    """
    import yt_dlp

    # Handle direct image downloads
    if _is_direct_image_url(url) or format_id == "direct_image":
        return await download_direct_image(url)

    platform = detect_platform(url)
    temp_dir = tempfile.mkdtemp(prefix="grabvid_")
    
    # Parse format_id to determine yt-dlp options
    ydl_opts = _build_download_opts(format_id, platform, temp_dir)
    
    # Add cookies if available
    cookies_file = os.getenv("COOKIES_FILE")
    if cookies_file and os.path.exists(cookies_file):
        ydl_opts["cookiefile"] = cookies_file

    # Add a Referer header – many platforms (Instagram, TikTok, Snapchat) require it
    ydl_opts.setdefault('http_headers', {})
    if platform == Platform.TIKTOK:
        ydl_opts['http_headers']['Referer'] = 'https://www.tiktok.com/'
    elif platform == Platform.INSTAGRAM:
        ydl_opts['http_headers']['Referer'] = 'https://www.instagram.com/'
    else:
        ydl_opts['http_headers']['Referer'] = url
    
    # Proceed with download as before
    try:
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(None, lambda: _download_with_ytdlp(url, ydl_opts))
    except Exception as e:
        logger.error(f"Download failed for {url} with format {format_id}: {e}")
        raise ValueError(f"Download failed: {str(e)}")
    
    # Find the downloaded file
    title = info.get("title", "download")
    safe_title = re.sub(r'[^\w\s-]', '', title).strip()[:100]
    
    # Determine extension and content type
    ext, content_type = _get_file_info(format_id)
    
    # Find the actual downloaded file in temp_dir
    downloaded_file = None
    # First try exact extension match
    for f in os.listdir(temp_dir):
        if not f.startswith('.'):
            downloaded_file = os.path.join(temp_dir, f)
            # Update extension based on actual file
            actual_ext = f.rsplit('.', 1)[-1] if '.' in f else ext
            if actual_ext != ext:
                ext = actual_ext
                _, content_type = _get_file_info_by_ext(actual_ext)
            break
    
    if not downloaded_file:
        raise ValueError("Download completed but no file was produced.")
    
    filename = f"{safe_title}.{ext}"
    return downloaded_file, filename, content_type


def _build_download_opts(format_id: str, platform: Platform, output_dir: str) -> dict:
    """Build yt-dlp options based on format_id."""
    output_template = os.path.join(output_dir, "%(title)s.%(ext)s")
    
    base_opts = {
        "quiet": True,
        "no_warnings": True,
        "no_color": True,
        "outtmpl": output_template,
        "socket_timeout": 30,
        "max_filesize": MAX_DOWNLOAD_SIZE,
        "geo_bypass": True,
        "age_limit": 100,
        "updatetime": False,
        "format_sort": ["vcodec:h264", "ext:mp4:m4a"],
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        },
    }

    # Find ffmpeg for local Windows environments
    if os.name == 'nt':
        local_ffmpeg = os.path.join(os.getcwd(), "ffmpeg.exe")
        if os.path.exists(local_ffmpeg):
            base_opts["ffmpeg_location"] = local_ffmpeg

    # Add YouTube extractor args to bypass blocks
    if platform == Platform.YOUTUBE:
        base_opts["extractor_args"] = {"youtube": ["player_client=android,ios,mweb"]}
    
    # Add proxy if available
    proxy = os.getenv("HTTP_PROXY") or os.getenv("http_proxy") or os.getenv("PROXY")
    if proxy:
        base_opts["proxy"] = proxy
    if format_id.startswith("mp4_"):
        # Video formats: Relax strict MP4 check, format_sort and postprocessors will handle remuxing
        if platform in (Platform.INSTAGRAM, Platform.SNAPCHAT):
            base_opts["format"] = "best"
        elif "1080" in format_id:
            base_opts["format"] = "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"
        elif "720" in format_id:
            base_opts["format"] = "bestvideo[height<=720]+bestaudio/best[height<=720]/best"
        elif "480" in format_id:
            base_opts["format"] = "bestvideo[height<=480]+bestaudio/best[height<=480]/best"
        elif "sd" in format_id:
            base_opts["format"] = "worst[ext=mp4]/worst"
        else:
            # hd, no_watermark, watermark, video, best — all grab best available
            base_opts["format"] = "bestvideo+bestaudio/best"
        
        base_opts["merge_output_format"] = "mp4"
        base_opts["postprocessors"] = [{
            "key": "FFmpegVideoConvertor",
            "preferedformat": "mp4"
        }]
        
    elif format_id.startswith("mp3_") or format_id == "mp3_audio":
        base_opts["format"] = "bestaudio/best"
        base_opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "320" if "320" in format_id else "128",
        }]
        
    elif format_id == "wav":
        base_opts["format"] = "bestaudio/best"
        base_opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "wav",
            "preferredquality": "0",
        }]
        
    elif format_id == "flac":
        base_opts["format"] = "bestaudio/best"
        base_opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "flac",
            "preferredquality": "0",
        }]
        
    elif format_id.startswith("jpeg_") or format_id == "gif":
        base_opts["format"] = "best"
        
    elif format_id == "thumbnail":
        base_opts["skip_download"] = True
        base_opts["writethumbnail"] = True
        base_opts["postprocessors"] = [{
            "key": "FFmpegThumbnailsConvertor",
            "format": "jpg",
        }]
    
    else:
        base_opts["format"] = "best"
    
    return base_opts


def _download_with_ytdlp(url: str, opts: dict) -> dict:
    """Synchronous yt-dlp download."""
    import yt_dlp
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=True)


def _get_file_info(format_id: str) -> tuple[str, str]:
    """Get file extension and content type from format_id."""
    format_map = {
        "mp4": ("mp4", "video/mp4"),
        "mp3": ("mp3", "audio/mpeg"),
        "wav": ("wav", "audio/wav"),
        "flac": ("flac", "audio/flac"),
        "jpeg": ("jpg", "image/jpeg"),
        "gif": ("gif", "image/gif"),
    }
    
    for key, (ext, content_type) in format_map.items():
        if key in format_id:
            return ext, content_type
    
    return "mp4", "video/mp4"


def _get_file_info_by_ext(ext: str) -> tuple[str, str]:
    """Get file extension and content type from actual file extension."""
    ext_map = {
        "mp4": ("mp4", "video/mp4"),
        "webm": ("webm", "video/webm"),
        "mkv": ("mkv", "video/x-matroska"),
        "mp3": ("mp3", "audio/mpeg"),
        "m4a": ("m4a", "audio/mp4"),
        "wav": ("wav", "audio/wav"),
        "flac": ("flac", "audio/flac"),
        "jpg": ("jpg", "image/jpeg"),
        "jpeg": ("jpeg", "image/jpeg"),
        "png": ("png", "image/png"),
        "gif": ("gif", "image/gif"),
    }
    return ext_map.get(ext.lower(), (ext, "application/octet-stream"))
