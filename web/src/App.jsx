import React, { useState, useRef, useEffect } from 'react';
import { Search, Download, Shield, Zap, Info, Play, Music, Camera, AlertCircle, ExternalLink, Clapperboard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { analyzeUrl } from './api';
import './App.css';

const ReelsIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="m3 9 3-3" /><path d="m9 3 3 3" /><path d="m15 3 3 3" /><path d="m21 9-3-3" />
    <path d="M3 9h18" /><path d="M21 15H3" /><path d="m12 12 5 3-5 3V12Z" />
  </svg>
);

const AdPlaceholder = ({ height = "90px", label = "Advertisement" }) => (
  <div className="ad-slot" style={{ height }}>
    <span className="ad-label">{label}</span>
    {/* Google AdSense code would go here */}
  </div>
);

function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [detectedPlatform, setDetectedPlatform] = useState(null);
  const resultsRef = useRef(null);

  useEffect(() => {
    if (result && resultsRef.current) {
      setTimeout(() => {
        resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [result]);

  const detectPlatform = (inputUrl) => {
    if (!inputUrl) return null;
    const lower = inputUrl.toLowerCase();
    if (lower.includes('instagram.com/reels') || lower.includes('instagram.com/reel')) return 'reels';
    if (lower.includes('instagram.com')) return 'instagram';
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
    if (lower.includes('tiktok.com')) return 'tiktok';
    if (lower.includes('snapchat.com')) return 'snapchat';
    return null;
  };

  const handleUrlChange = (e) => {
    const val = e.target.value;
    setUrl(val);
    setDetectedPlatform(detectPlatform(val));
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const data = await analyzeUrl(url);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please check the link and try again.');
    } finally {
      setLoading(false);
    }
  };

  const getPlatformIcon = (platform) => {
    switch (platform) {
      case 'instagram': return <Camera size={20} />;
      case 'youtube': return <Play size={20} />;
      default: return <ExternalLink size={20} />;
    }
  };

  const handleDownload = (formatId) => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
    const downloadUrl = `${apiBase}/download?url=${encodeURIComponent(url)}&format_id=${encodeURIComponent(formatId)}`;
    window.open(downloadUrl, '_blank');
  };

  return (
    <div className="app-container">
      {/* Header */}
      <nav className="navbar glass">
        <div className="container nav-content">
          <div className="logo">
            <span className="logo-icon"><Zap fill="currentColor" /></span>
            <span className="logo-text">Grab<span className="gradient-text">Vid</span></span>
          </div>
          <div className="nav-links">
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
          </div>
        </div>
      </nav>

      <main className="container main-content">
        {/* Hero Section */}
        <section className="hero">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="hero-title"
          >
            Download Videos from <span className="gradient-text">Anywhere</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="hero-subtitle"
          >
            High-speed, premium video downloader for Instagram, TikTok, YouTube, and more.
          </motion.p>

          <motion.form 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            onSubmit={handleAnalyze} 
            className="search-container glass"
          >
            <div className="input-wrapper">
              <Search className="search-icon" size={20} />
              <input 
                type="text" 
                placeholder="Paste video link here (Instagram, YouTube, TikTok...)" 
                value={url}
                onChange={handleUrlChange}
              />
            </div>
            <motion.button 
              type="submit" 
              disabled={loading} 
              className="btn-primary"
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05 }}
            >
              {loading ? <div className="loader"></div> : 'Download'}
            </motion.button>
          </motion.form>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="supported-platforms"
          >
            <span className="supported-label">Supported:</span>
            <div className="platform-icons">
              <div className={`p-icon ${detectedPlatform === 'instagram' ? 'active' : ''}`} title="Instagram"><Camera size={18} /></div>
              <div className={`p-icon ${detectedPlatform === 'reels' ? 'active' : ''}`} title="Instagram Reels"><ReelsIcon size={18} /></div>
              <div className={`p-icon ${detectedPlatform === 'youtube' ? 'active' : ''}`} title="YouTube"><Play size={18} /></div>
              <div className={`p-icon ${detectedPlatform === 'tiktok' ? 'active' : ''}`} title="TikTok"><Music size={18} /></div>
              <div className={`p-icon ${detectedPlatform === 'snapchat' ? 'active' : ''}`} title="Snapchat"><Shield size={18} /></div>
              <div className="p-icon" title="And more..."><Info size={18} /></div>
            </div>
          </motion.div>
        </section>

        {/* Ad Placement Top */}
        <AdPlaceholder height="120px" label="Banner Advertisement" />

        {/* Error State */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="error-box"
            >
              <AlertCircle size={20} />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result Section */}
        <AnimatePresence>
          {result && (
            <motion.section 
              ref={resultsRef}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="result-section glass"
            >
              <div className="result-grid">
                <div className="video-preview">
                  <img src={result.thumbnail} alt={result.title} className="thumbnail" />
                  <div className="platform-tag" style={{ backgroundColor: result.platform_color }}>
                    {getPlatformIcon(result.platform)}
                    {result.platform_name}
                  </div>
                </div>
                
                <div className="video-info">
                  <h2 className="video-title">{result.title}</h2>
                  <p className="video-author">By {result.author || 'Unknown'}</p>
                  <p className="video-duration">{result.duration_formatted}</p>

                  <div className="download-options">
                    <h3>Available Formats</h3>
                    <div className="format-list">
                      {result.formats.map((format) => (
                        <div key={format.format_id} className="format-card">
                          <div className="format-meta">
                            <span className="format-quality">{format.quality}</span>
                            <span className="format-ext">{format.extension.toUpperCase()}</span>
                            <span className="format-size">{format.estimated_size}</span>
                          </div>
                          <button 
                            className="btn-download"
                            onClick={() => handleDownload(format.format_id)}
                          >
                            <Download size={16} />
                            Get Link
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Features Section */}
        <section id="features" className="features-grid">
          <div className="feature-card glass">
            <Zap className="feature-icon" />
            <h3>Lightning Fast</h3>
            <p>Our servers process your requests in milliseconds for the fastest download experience.</p>
          </div>
          <div className="feature-card glass">
            <Shield className="feature-icon" />
            <h3>Secure & Private</h3>
            <p>We don't track your downloads or store your personal data. Your privacy is our priority.</p>
          </div>
          <div className="feature-card glass">
            <Info className="feature-icon" />
            <h3>High Quality</h3>
            <p>Download videos in the highest resolution available, up to 4K where supported.</p>
          </div>
        </section>

        {/* Ad Placement Bottom */}
        <AdPlaceholder height="250px" label="Responsive Display Ad" />

      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="seo-text">
              <h4>About GrabVid Video Downloader</h4>
              <p>GrabVid is the ultimate free online video downloader. Save high-quality MP4 videos and MP3 audio from platforms like Instagram, YouTube, TikTok, Snapchat, Twitter, and more. Our tool is fast, requires no software installation, and ensures your downloads are secure and private.</p>
            </div>
            <p>&copy; 2026 GrabVid. All rights reserved.</p>
            <div className="footer-links">
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
              <a href="#">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
