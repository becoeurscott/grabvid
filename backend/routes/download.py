"""
Media download route.
Accepts a URL and format, streams the downloaded file back to the client.
Supports both POST (JSON body) and GET (query params) for mobile compatibility.
"""
import os
import shutil
import logging
import hashlib
import time
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse, FileResponse
from models.schemas import DownloadRequest, ErrorResponse
from services.media_extractor import download_media, _classify_error, _get_file_info_by_ext
from services.platform_detector import detect_platform

CACHE_DIR = os.path.join(os.getcwd(), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)

def _cleanup_cache():
    """Delete cached files older than 1 hour to save storage space."""
    now = time.time()
    for f in os.listdir(CACHE_DIR):
        fpath = os.path.join(CACHE_DIR, f)
        if os.path.isfile(fpath) and os.stat(fpath).st_mtime < now - 3600:
            try:
                os.remove(fpath)
            except Exception:
                pass

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/download",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request"},
        500: {"model": ErrorResponse, "description": "Download failed"},
    },
    summary="Download media (POST)",
    description="Downloads media from the specified URL in the requested format and streams it back.",
)
async def download_post(request: DownloadRequest):
    """Download media via POST with JSON body."""
    return await _do_download(request.url.strip(), request.format_id.strip())


@router.get(
    "/download",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request"},
        500: {"model": ErrorResponse, "description": "Download failed"},
    },
    summary="Download media (GET)",
    description="Downloads media via GET with query params. Used by mobile apps for progress tracking.",
)
async def download_get(
    url: str = Query(..., description="The media URL to download"),
    format_id: str = Query(..., description="The format ID to download"),
):
    """Download media via GET with query params (for expo-file-system compatibility)."""
    return await _do_download(url.strip(), format_id.strip())


async def _do_download(url: str, format_id: str):
    """Core download logic shared by GET and POST endpoints."""
    if not url or not format_id:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_request", "code": "INVALID", "message": "URL and format_id are required."},
        )
    
    # Ensure URL has a protocol
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    # Detect platform for richer error info
    platform = detect_platform(url)
    
    # Clean up old cache
    _cleanup_cache()
    
    # Check Cache
    url_hash = hashlib.md5(f"{url}_{format_id}".encode()).hexdigest()
    cached_files = [f for f in os.listdir(CACHE_DIR) if f.startswith(url_hash + "_")]
    
    if cached_files:
        cached_filename = cached_files[0]
        file_path = os.path.join(CACHE_DIR, cached_filename)
        # Reconstruct original filename from cache name: {hash}_{filename}
        filename = cached_filename[len(url_hash) + 1:]
        ext = filename.split(".")[-1] if "." in filename else "mp4"
        _, content_type = _get_file_info_by_ext(ext)
        
        file_size = os.path.getsize(file_path)
        logger.info(f"Serving {url} from CACHE!")
        
        def iterfile_cached():
            with open(file_path, "rb") as f:
                while chunk := f.read(8192):
                    yield chunk
                    
        return StreamingResponse(
            iterfile_cached(),
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(file_size),
                "X-File-Name": filename,
                "Accept-Ranges": "bytes",
            },
        )
    
    try:
        file_path, filename, content_type = await download_media(url, format_id)
    except Exception as e:
        # First attempt failed – try generic "best" as a fallback
        logger.warning(f"Initial download attempt failed for {url} with format {format_id}: {e}. Retrying with generic best format.")
        try:
            file_path, filename, content_type = await download_media(url, "best")
        except Exception as e2:
            # Still failed – classify the error and return structured response
            logger.error(f"Fallback download also failed: {e2}")
            classified = _classify_error(str(e2))
            raise HTTPException(
                status_code=400,
                detail={
                    "error": classified["error"],
                    "code": classified["code"],
                    "message": classified["error"],
                    "platform": platform.value,
                },
            )
    # If we get here, we have a valid file_path

    
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=500,
            detail={"error": "file_not_found", "message": "Downloaded file was not found."},
        )
    
    # Move to cache
    cached_filename = f"{url_hash}_{filename}"
    cached_filepath = os.path.join(CACHE_DIR, cached_filename)
    shutil.move(file_path, cached_filepath)
    
    temp_dir = os.path.dirname(file_path)
    file_size = os.path.getsize(cached_filepath)
    
    def iterfile():
        """Stream file in chunks and clean up after."""
        try:
            with open(cached_filepath, "rb") as f:
                while chunk := f.read(8192):
                    yield chunk
        finally:
            # Clean up temp directory
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass
    
    return StreamingResponse(
        iterfile(),
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(file_size),
            "X-File-Name": filename,
            "Accept-Ranges": "bytes",
            "Connection": "keep-alive",
            "Cache-Control": "no-cache",
        },
    )
