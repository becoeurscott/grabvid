# Hosting GrabVid on Hostinger

To host GrabVid and start generating revenue, follow these steps.

## 1. Deploy the Frontend (Web App)
The frontend is a static React application. It can be hosted on any Hostinger plan (Shared, Cloud, or VPS).

1.  **Build the project**:
    ```bash
    cd web
    npm run build
    ```
2.  **Upload to Hostinger**:
    - Log in to your Hostinger hPanel.
    - Go to **File Manager**.
    - Open `public_html`.
    - Upload all files from the `web/dist` folder.
3.  **Configure API URL**:
    - Before building, create a `.env` file in the `web` directory:
      ```
      VITE_API_URL=https://api.grabvid.io/api/v1
      ```

## 2. Deploy the Backend (API)
The backend requires Python 3.10+ and FFmpeg. This **requires a Hostinger VPS** (Shared hosting will NOT work).

1.  **Set up VPS**:
    - Choose an Ubuntu 22.04 or 24.04 image.
2.  **Install Dependencies**:
    ```bash
    sudo apt update
    sudo apt install python3-pip ffmpeg -y
    ```
3.  **Upload Backend Code**:
    - Upload the `backend` folder to your VPS.
4.  **Install Python Packages**:
    ```bash
    cd backend
    pip install -r requirements.txt
    ```
5.  **Run with Systemd (for 24/7 availability)**:
    Create a service file `/etc/systemd/system/grabvid.service`:
    ```ini
    [Unit]
    Description=GrabVid FastAPI Backend
    After=network.target

    [Service]
    User=root
    WorkingDirectory=/path/to/grabvid/backend
    ExecStart=/usr/local/bin/uvicorn main:app --host 0.0.0.0 --port 8000
    Restart=always

    [Install]
    WantedBy=multi-user.target
    ```
6.  **Start the Service**:
    ```bash
    sudo systemctl enable grabvid
    sudo systemctl start grabvid
    ```

## 3. Adding Ads (Revenue)
1.  **Google AdSense**:
    - Once your site is live and has some traffic, apply for Google AdSense.
    - Replace the `<AdPlaceholder />` components in `App.jsx` with your AdSense `<ins>` code.
2.  **Alternative Ad Networks**:
    - Consider networks like **Adsterra** or **PropellerAds** if you want faster approval for a downloader site.

## 4. Monetization Tips
- **SEO**: Use keywords like "Instagram Video Downloader", "TikTok No Watermark", etc., in your meta tags.
- **Social Sharing**: Share your site on forums and social media to drive initial traffic.
- **Pop-unders**: Can be added for additional revenue (though they may affect user experience).
