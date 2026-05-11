"""
GrabVid Backend API Server
FastAPI application for media analysis and download.
"""
import os
import base64
import logging
import tempfile
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.analyze import router as analyze_router
from routes.download import router as download_router
from routes.health import router as health_router

logger = logging.getLogger(__name__)

app = FastAPI(
    title="GrabVid API",
    description="Media analysis and download API for GrabVid mobile apps",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS configuration
allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health_router)
app.include_router(analyze_router, prefix="/api/v1")
app.include_router(download_router, prefix="/api/v1")


@app.on_event("startup")
async def startup_event():
    """
    On startup, decode multiple cookie env vars into a single cookies.txt file.
    This allows yt-dlp to authenticate across multiple platforms (YouTube, Instagram, etc)
    without storing cookies in the repo.
    """
    platforms = ["YOUTUBE", "INSTAGRAM", "SNAPCHAT", "TIKTOK", "PINTEREST"]
    cookies_path = os.path.join(tempfile.gettempdir(), "grabvid_cookies.txt")
    
    # Clear any old cookies file
    if os.path.exists(cookies_path):
        os.remove(cookies_path)
        
    combined_cookies_data = b""
    loaded_platforms = []
    
    for platform in platforms:
        env_var = f"{platform}_COOKIES_BASE64"
        cookies_b64 = os.getenv(env_var)
        
        cookies_data = None
        if cookies_b64:
            try:
                cookies_data = base64.b64decode(cookies_b64)
            except Exception as e:
                logger.error(f"Failed to decode {platform} cookies from ENV: {e}")
        else:
            # Fallback: check for local files like yt_cookies.txt or ig_cookies.txt
            # Try full name first, then common abbreviations
            variations = [f"{platform.lower()}_cookies.txt", f"{platform.lower()[:2]}_cookies.txt"]
            # Handle special cases
            if platform == "YOUTUBE": variations.append("yt_cookies.txt")
            if platform == "INSTAGRAM": variations.append("ig_cookies.txt")
            if platform == "PINTEREST": variations.append("pin_cookies.txt")

            for local_filename in variations:
                # Check root directory (one level up from backend)
                root_path = os.path.join(os.path.dirname(os.getcwd()), local_filename)
                # Check current directory (backend)
                local_path = os.path.join(os.getcwd(), local_filename)
                
                target_path = root_path if os.path.exists(root_path) else local_path
                
                if os.path.exists(target_path):
                    try:
                        with open(target_path, "rb") as f:
                            cookies_data = f.read()
                        logger.info(f"Loaded {platform} cookies from: {target_path}")
                        break # Found it
                    except Exception as e:
                        logger.error(f"Failed to read cookie file {target_path}: {e}")

        if cookies_data:
            try:
                if not combined_cookies_data and not cookies_data.startswith(b"# Netscape"):
                    combined_cookies_data += b"# Netscape HTTP Cookie File\n\n"
                    
                combined_cookies_data += cookies_data + b"\n\n"
                loaded_platforms.append(platform)
            except Exception as e:
                logger.error(f"Failed to process {platform} cookies: {e}")
    
    if combined_cookies_data:
        try:
            with open(cookies_path, "wb") as f:
                f.write(combined_cookies_data)
            os.environ["COOKIES_FILE"] = cookies_path
            msg = f"Successfully loaded cookies for: {', '.join(loaded_platforms)} ({len(combined_cookies_data)} bytes)"
            logger.info(msg)
            print(f"STARTUP: {msg}")
        except Exception as e:
            logger.error(f"Failed to write combined cookies file: {e}")
            print(f"STARTUP ERROR: Failed to write cookies: {e}")
    else:
        logger.info("No cookie env vars set — private videos will fail")
        print("STARTUP: No cookie env vars set")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
