class KadadPlayer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.audio = null;
    this.isPlaying = false;
    this.currentSpeed = 1;
    this.showRemaining = false;
    this.isMuted = false;
    this.previousVolume = 0.8;
    this.rewindSeconds = 10;
    this.forwardSeconds = 30;
    this.playlist = [];
    this.currentIndex = 0;
    this.playlistVisible = false;
    this.isLoadingPlaylist = false;
  }

  static get observedAttributes() {
    return ['src', 'cover', 'theme', 'speed', 'loop', 'autoplay', 
            'show-time', 'show-volume', 'show-progress', 'show-download',
            'show-speed', 'show-cover', 'show-playlist', 'mini', 'playlist'];
  }

  connectedCallback() {
    this.render();
    this.setupAudio();
    this.setupEventListeners();
    
    // بارگذاری پلی‌لیست اگر وجود داشته باشه
    const playlistUrl = this.getAttr('playlist', '');
    if (playlistUrl && this.getAttr('show-playlist', false)) {
      this.loadPlaylist(playlistUrl);
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      if (name === 'playlist' && newValue) {
        this.loadPlaylist(newValue);
      }
      this.render();
      this.setupAudio();
      this.setupEventListeners();
    }
  }

  getAttr(attr, defaultValue) {
    const val = this.getAttribute(attr);
    if (val === 'false') return false;
    if (val === 'true') return true;
    return val || defaultValue;
  }

  async loadPlaylist(url) {
    if (this.isLoadingPlaylist) return;
    this.isLoadingPlaylist = true;

    try {
      const response = await fetch(url);
      const text = await response.text();
      
      // پشتیبانی از فرمت‌های M3U و PLS
      if (url.endsWith('.m3u') || url.endsWith('.m3u8')) {
        this.parseM3U(text);
      } else if (url.endsWith('.pls')) {
        this.parsePLS(text);
      } else {
        // تلاش برای تشخیص خودکار
        if (text.includes('#EXTM3U')) {
          this.parseM3U(text);
        } else if (text.includes('[playlist]')) {
          this.parsePLS(text);
        }
      }
      
      this.updatePlaylistUI();
    } catch (error) {
      console.error('خطا در بارگذاری پلی‌لیست:', error);
      this.showToast('❌ خطا در بارگذاری پلی‌لیست');
    } finally {
      this.isLoadingPlaylist = false;
    }
  }

  parseM3U(content) {
    const lines = content.split('\n');
    this.playlist = [];
    let currentTitle = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('#EXTINF:')) {
        // استخراج عنوان
        const titleMatch = line.match(/#EXTINF:.*?,(.*)$/);
        if (titleMatch) {
          currentTitle = titleMatch[1].trim();
        }
      } else if (line && !line.startsWith('#')) {
        // فایل آهنگ
        this.playlist.push({
          title: currentTitle || `Track ${this.playlist.length + 1}`,
          src: line.trim()
        });
        currentTitle = '';
      }
    }
  }

  parsePLS(content) {
    const lines = content.split('\n');
    this.playlist = [];
    const fileMap = {};
    const titleMap = {};
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // استخراج File و Title
      const fileMatch = trimmed.match(/^File(\d+)=(.*)$/);
      const titleMatch = trimmed.match(/^Title(\d+)=(.*)$/);
      
      if (fileMatch) {
        fileMap[fileMatch[1]] = fileMatch[2].trim();
      }
      if (titleMatch) {
        titleMap[titleMatch[1]] = titleMatch[2].trim();
      }
    }
    
    // ساخت لیست بر اساس Fileها
    for (const [index, src] of Object.entries(fileMap)) {
      this.playlist.push({
        title: titleMap[index] || `Track ${parseInt(index)}`,
        src: src
      });
    }
  }

  updatePlaylistUI() {
    const playlistContainer = this.shadowRoot.querySelector('#playlist-container');
    const playlistItems = this.shadowRoot.querySelector('#playlist-items');
    
    if (!playlistItems || this.playlist.length === 0) {
      if (playlistContainer) {
        playlistContainer.style.display = 'none';
      }
      return;
    }

    if (playlistContainer) {
      playlistContainer.style.display = 'block';
    }

    playlistItems.innerHTML = '';
    
    this.playlist.forEach((track, index) => {
      const item = document.createElement('div');
      item.className = `playlist-item ${index === this.currentIndex ? 'active' : ''}`;
      item.dataset.index = index;
      
      const isCurrent = index === this.currentIndex;
      
      item.innerHTML = `
        <span class="playlist-index">${index + 1}.</span>
        <span class="playlist-title">${this.escapeHtml(track.title)}</span>
        <span class="playlist-badge">${isCurrent ? '▶' : ''}</span>
      `;
      
      item.addEventListener('click', () => {
        this.playTrack(index);
      });
      
      playlistItems.appendChild(item);
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  playTrack(index) {
    if (index < 0 || index >= this.playlist.length) return;
    
    this.currentIndex = index;
    const track = this.playlist[index];
    
    if (this.audio) {
      this.audio.src = track.src;
      this.audio.load();
      
      if (this.isPlaying) {
        this.audio.play().catch(err => console.log('Play error:', err));
      }
      
      // به‌روزرسانی عنوان
      const titleEl = this.shadowRoot.querySelector('.title');
      if (titleEl) {
        titleEl.textContent = track.title;
      }
      
      // به‌روزرسانی کاور (اگر در پلی‌لیست نباشه، همون قبلی میمونه)
      this.updatePlaylistUI();
      this.showToast(`▶ ${track.title}`);
    }
  }

  playNext() {
    if (this.playlist.length === 0) return;
    const nextIndex = (this.currentIndex + 1) % this.playlist.length;
    this.playTrack(nextIndex);
  }

  playPrevious() {
    if (this.playlist.length === 0) return;
    const prevIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    this.playTrack(prevIndex);
  }

  togglePlaylist() {
    this.playlistVisible = !this.playlistVisible;
    const container = this.shadowRoot.querySelector('#playlist-container');
    if (container) {
      container.style.display = this.playlistVisible && this.playlist.length > 0 ? 'block' : 'none';
    }
    const toggleBtn = this.shadowRoot.querySelector('#playlist-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = this.playlistVisible ? '📋 ✕' : '📋';
    }
  }

  showToast(message) {
    const toast = this.shadowRoot.querySelector('#toast');
    if (toast) {
      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(this.toastTimeout);
      this.toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
      }, 2000);
    }
  }

  render() {
    const src = this.getAttr('src', '');
    const cover = this.getAttr('cover', '');
    const theme = this.getAttr('theme', 'rgb');
    const mini = this.getAttr('mini', false);
    const showCover = this.getAttr('show-cover', true);
    const showTime = this.getAttr('show-time', true);
    const showVolume = this.getAttr('show-volume', true);
    const showProgress = this.getAttr('show-progress', true);
    const showDownload = this.getAttr('show-download', true);
    const showSpeed = this.getAttr('show-speed', true);
    const showPlaylist = this.getAttr('show-playlist', false);
    const title = this.textContent.trim() || 'بی‌عنوان';

    const themes = {
      rgb: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      dark: '#2d2d2d',
      light: '#ffffff',
      blue: '#2196F3'
    };

    const bgColor = themes[theme] || themes.rgb;
    const hasPlaylist = this.playlist.length > 0;

    this.shadowRoot.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          user-select: none;
        }

        .player {
          background: ${bgColor};
          border-radius: 20px;
          padding: 25px;
          color: ${theme === 'light' ? '#333' : '#fff'};
          width: ${mini ? '280px' : '420px'};
          max-width: 100%;
          box-shadow: 0 20px 60px rgba(0,0,0,0.4);
          transition: all 0.3s ease;
          font-family: inherit;
          position: relative;
        }

        .cover-container {
          text-align: center;
          margin-bottom: 15px;
          cursor: pointer;
          position: relative;
        }

        .cover {
          width: ${mini ? '150px' : '220px'};
          height: ${mini ? '150px' : '220px'};
          border-radius: 16px;
          object-fit: cover;
          box-shadow: 0 8px 30px rgba(0,0,0,0.3);
          transition: transform 0.3s ease;
        }

        .cover:hover {
          transform: scale(1.03);
        }

        .mute-indicator {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(0,0,0,0.75);
          border-radius: 50%;
          width: 70px;
          height: 70px;
          display: none;
          align-items: center;
          justify-content: center;
          font-size: 35px;
          color: white;
          pointer-events: none;
          backdrop-filter: blur(5px);
          border: 2px solid rgba(255,255,255,0.2);
        }

        .mute-indicator.active {
          display: flex;
        }

        .title {
          font-size: ${mini ? '16px' : '20px'};
          font-weight: bold;
          text-align: center;
          margin: 10px 0 15px 0;
          text-shadow: 0 2px 10px rgba(0,0,0,0.2);
          letter-spacing: 0.5px;
        }

        .progress-container {
          margin: 15px 0 5px 0;
        }

        .progress-bar {
          width: 100%;
          height: 6px;
          -webkit-appearance: none;
          background: rgba(255,255,255,0.2);
          border-radius: 3px;
          outline: none;
          cursor: pointer;
        }

        .progress-bar::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          background: #fff;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 10px rgba(0,0,0,0.3);
          transition: transform 0.2s;
        }

        .progress-bar::-webkit-slider-thumb:hover {
          transform: scale(1.1);
        }

        .time-info {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          opacity: 0.9;
          margin-top: 6px;
          cursor: pointer;
          padding: 4px 0;
          border-radius: 4px;
          transition: background 0.2s;
        }

        .time-info:hover {
          background: rgba(255,255,255,0.05);
        }

        .time-display {
          font-weight: 500;
          letter-spacing: 0.5px;
        }

        .controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin: 15px 0 10px 0;
          flex-wrap: wrap;
        }

        .control-btn {
          background: rgba(255,255,255,0.15);
          border: none;
          color: ${theme === 'light' ? '#333' : '#fff'};
          width: 42px;
          height: 42px;
          border-radius: 50%;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
        }

        .control-btn:hover {
          background: rgba(255,255,255,0.25);
          transform: scale(1.05);
        }

        .control-btn:active {
          transform: scale(0.95);
        }

        .control-btn.primary {
          width: 54px;
          height: 54px;
          font-size: 24px;
          background: rgba(255,255,255,0.25);
          box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }

        .control-btn.primary:hover {
          background: rgba(255,255,255,0.35);
        }

        .control-btn.rewind, .control-btn.forward {
          font-size: 13px;
          background: rgba(255,255,255,0.1);
        }

        .control-btn.playlist-btn {
          font-size: 18px;
          background: rgba(255,255,255,0.1);
          width: 42px;
          height: 42px;
        }

        .volume-control {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          max-width: 130px;
          min-width: 80px;
        }

        .volume-icon {
          cursor: pointer;
          font-size: 18px;
          opacity: 0.8;
          transition: opacity 0.2s;
        }

        .volume-icon:hover {
          opacity: 1;
        }

        .volume-slider {
          flex: 1;
          height: 4px;
          -webkit-appearance: none;
          background: rgba(255,255,255,0.2);
          border-radius: 2px;
          outline: none;
          cursor: pointer;
        }

        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          background: #fff;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }

        .speed-controls {
          display: flex;
          gap: 5px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .speed-btn {
          background: rgba(255,255,255,0.1);
          border: 2px solid transparent;
          color: ${theme === 'light' ? '#333' : '#fff'};
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          opacity: 0.6;
        }

        .speed-btn:hover {
          background: rgba(255,255,255,0.2);
          opacity: 0.8;
        }

        .speed-btn.active {
          background: rgba(255,255,255,0.25);
          border-color: rgba(255,255,255,0.5);
          opacity: 1;
          transform: scale(1.05);
        }

        .download-btn {
          background: rgba(255,255,255,0.15);
          border: none;
          color: ${theme === 'light' ? '#333' : '#fff'};
          padding: 6px 14px;
          border-radius: 12px;
          font-size: 13px;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.2s;
          font-weight: 500;
        }

        .download-btn:hover {
          background: rgba(255,255,255,0.25);
          transform: scale(1.05);
        }

        .hidden {
          display: none !important;
        }

        /* پلی‌لیست */
        #playlist-container {
          display: none;
          margin-top: 15px;
          border-top: 1px solid rgba(255,255,255,0.15);
          padding-top: 15px;
          max-height: 250px;
          overflow-y: auto;
        }

        #playlist-container::-webkit-scrollbar {
          width: 4px;
        }

        #playlist-container::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
        }

        #playlist-container::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.3);
          border-radius: 2px;
        }

        .playlist-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 2px;
        }

        .playlist-item:hover {
          background: rgba(255,255,255,0.1);
        }

        .playlist-item.active {
          background: rgba(255,255,255,0.15);
          font-weight: bold;
        }

        .playlist-index {
          opacity: 0.5;
          font-size: 12px;
          min-width: 24px;
        }

        .playlist-title {
          flex: 1;
          font-size: 14px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .playlist-badge {
          font-size: 14px;
          opacity: 0.7;
        }

        .playlist-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
          font-size: 14px;
          opacity: 0.7;
        }

        .playlist-count {
          font-size: 12px;
        }

        .mini-mode .controls {
          gap: 6px;
        }

        .mini-mode .control-btn {
          width: 34px;
          height: 34px;
          font-size: 13px;
        }

        .mini-mode .control-btn.primary {
          width: 44px;
          height: 44px;
          font-size: 20px;
        }

        .mini-mode .cover {
          width: 120px;
          height: 120px;
        }

        .bottom-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 10px;
          gap: 10px;
          flex-wrap: wrap;
        }

        /* Toast Notification */
        #toast {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%) translateY(20px);
          background: rgba(0,0,0,0.85);
          color: white;
          padding: 10px 20px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 500;
          opacity: 0;
          transition: all 0.3s ease;
          pointer-events: none;
          white-space: nowrap;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.1);
          z-index: 200;
        }

        #toast.show {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .playing .cover {
          animation: pulse 2s ease-in-out infinite;
        }

        /* Responsive */
        @media (max-width: 480px) {
          .player {
            padding: 15px;
            width: 100%;
          }
          .controls {
            gap: 6px;
          }
          .control-btn {
            width: 36px;
            height: 36px;
            font-size: 14px;
          }
          .control-btn.primary {
            width: 46px;
            height: 46px;
            font-size: 20px;
          }
          .volume-control {
            max-width: 80px;
            min-width: 60px;
          }
          .speed-btn {
            font-size: 10px;
            padding: 2px 8px;
          }
        }
      </style>

      <div class="player ${mini ? 'mini-mode' : ''} ${this.isPlaying ? 'playing' : ''}">
        ${showCover ? `
          <div class="cover-container" id="cover-container">
            <img class="cover" src="${cover || 'https://via.placeholder.com/220'}" alt="cover" 
                 onerror="this.src='https://via.placeholder.com/220/666/fff?text=No+Cover'">
            <div class="mute-indicator ${this.isMuted ? 'active' : ''}" id="mute-indicator">
              🔇
            </div>
          </div>
        ` : ''}
        
        <div class="title">${title}</div>

        ${showProgress ? `
          <div class="progress-container">
            <input type="range" class="progress-bar" id="progress" min="0" max="100" value="0">
            ${showTime ? `
              <div class="time-info" id="time-info">
                <span class="time-display" id="current-time">0:00</span>
                <span class="time-display" id="duration-time">0:00</span>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <div class="controls">
          ${showPlaylist ? `
            <button class="control-btn playlist-btn" id="playlist-toggle" title="پلی‌لیست">📋</button>
          ` : ''}
          
          <button class="control-btn rewind" id="rewind" title="عقب ۱۰ ثانیه">⏪ 10</button>
          <button class="control-btn primary" id="play-btn">▶</button>
          <button class="control-btn forward" id="forward" title="جلو ۳۰ ثانیه">30 ⏩</button>
          
          ${showVolume ? `
            <div class="volume-control">
              <span class="volume-icon" id="volume-icon">🔊</span>
              <input type="range" class="volume-slider" id="volume" min="0" max="100" value="80">
            </div>
          ` : ''}
        </div>

        <div class="bottom-row">
          ${showSpeed ? `
            <div class="speed-controls" id="speed-controls">
              <button class="speed-btn" data-speed="0.5">0.5×</button>
              <button class="speed-btn active" data-speed="1">1×</button>
              <button class="speed-btn" data-speed="1.5">1.5×</button>
              <button class="speed-btn" data-speed="2">2×</button>
            </div>
          ` : ''}

          ${showDownload ? `
            <a class="download-btn" id="download-btn" href="${src}" download>⬇ دانلود</a>
          ` : ''}
        </div>

        ${showPlaylist ? `
          <div id="playlist-container">
            <div class="playlist-header">
              <span>📋 پلی‌لیست</span>
              <span class="playlist-count" id="playlist-count">${this.playlist.length} آهنگ</span>
            </div>
            <div id="playlist-items"></div>
          </div>
        ` : ''}

        <div id="toast"></div>

        <audio id="audio" style="display:none">
          <source src="${src}" type="audio/mpeg">
        </audio>
      </div>
    `;
  }

  setupAudio() {
    this.audio = this.shadowRoot.querySelector('#audio');
    if (!this.audio) return;

    const src = this.getAttr('src', '');
    if (src) {
      this.audio.src = src;
    }

    this.audio.loop = this.getAttr('loop', false);
    this.audio.autoplay = this.getAttr('autoplay', false);
    this.audio.volume = 0.8;
    this.currentSpeed = parseFloat(this.getAttr('speed', 1));
    this.audio.playbackRate = this.currentSpeed;

    this.audio.addEventListener('timeupdate', () => this.updateProgress());
    this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
    this.audio.addEventListener('ended', () => this.handleEnded());
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.updatePlayButton();
      this.shadowRoot.querySelector('.player')?.classList.add('playing');
    });
    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.updatePlayButton();
      this.shadowRoot.querySelector('.player')?.classList.remove('playing');
    });
  }

  setupEventListeners() {
    // دکمه پلی
    const playBtn = this.shadowRoot.querySelector('#play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => this.togglePlay());
    }

    // نوار پیشرفت
    const progress = this.shadowRoot.querySelector('#progress');
    if (progress) {
      progress.addEventListener('input', (e) => {
        if (this.audio && this.audio.duration) {
          const time = (e.target.value / 100) * this.audio.duration;
          this.audio.currentTime = time;
        }
      });
    }

    // کلیک روی زمان
    const timeInfo = this.shadowRoot.querySelector('#time-info');
    if (timeInfo) {
      timeInfo.addEventListener('click', () => {
        this.showRemaining = !this.showRemaining;
        this.updateProgress();
      });
    }

    // کلیک روی کاور - میوت
    const coverContainer = this.shadowRoot.querySelector('#cover-container');
    if (coverContainer) {
      coverContainer.addEventListener('click', () => {
        this.toggleMute();
      });
    }

    // کنترل صدا
    const volume = this.shadowRoot.querySelector('#volume');
    const volumeIcon = this.shadowRoot.querySelector('#volume-icon');
    if (volume) {
      volume.addEventListener('input', (e) => {
        const val = e.target.value / 100;
        if (this.audio) {
          this.audio.volume = val;
          this.isMuted = false;
          this.updateMuteIndicator();
          this.updateVolumeIcon();
        }
      });
    }

    if (volumeIcon) {
      volumeIcon.addEventListener('click', () => this.toggleMute());
    }

    // دکمه‌های REW و FF
    const rewindBtn = this.shadowRoot.querySelector('#rewind');
    const forwardBtn = this.shadowRoot.querySelector('#forward');
    
    if (rewindBtn) {
      rewindBtn.addEventListener('click', () => {
        if (this.audio) {
          this.audio.currentTime = Math.max(0, this.audio.currentTime - this.rewindSeconds);
          this.showFeedback('⏪ -10s');
        }
      });
    }

    if (forwardBtn) {
      forwardBtn.addEventListener('click', () => {
        if (this.audio && this.audio.duration) {
          this.audio.currentTime = Math.min(this.audio.duration, this.audio.currentTime + this.forwardSeconds);
          this.showFeedback('+30s ⏩');
        }
      });
    }

    // دکمه‌های سرعت
    const speedBtns = this.shadowRoot.querySelectorAll('.speed-btn');
    speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.dataset.speed);
        this.changeSpeed(speed);
        speedBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // دکمه دانلود
    const downloadBtn = this.shadowRoot.querySelector('#download-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', (e) => {
        const link = e.currentTarget;
        const url = link.getAttribute('href');
        const filename = url.split('/').pop() || 'music.mp3';
        link.setAttribute('download', filename);
      });
    }

    // دکمه پلی‌لیست
    const playlistToggle = this.shadowRoot.querySelector('#playlist-toggle');
    if (playlistToggle) {
      playlistToggle.addEventListener('click', () => this.togglePlaylist());
    }

    // کلیدهای صفحه‌کلید
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        const activeElement = document.activeElement;
        if (activeElement?.tagName !== 'INPUT') {
          e.preventDefault();
          this.togglePlay();
        }
      }
      if (e.code === 'ArrowRight' && e.ctrlKey) {
        e.preventDefault();
        this.playNext();
      }
      if (e.code === 'ArrowLeft' && e.ctrlKey) {
        e.preventDefault();
        this.playPrevious();
      }
    });

    // رویداد پایان آهنگ برای رفتن به آهنگ بعدی
    if (this.audio) {
      this.audio.addEventListener('ended', () => {
        if (this.playlist.length > 0) {
          this.playNext();
        }
      });
    }
  }

  togglePlay() {
    if (!this.audio) return;
    
    if (this.isPlaying) {
      this.audio.pause();
    } else {
      this.audio.play().catch(err => console.log('Play error:', err));
    }
  }

  updatePlayButton() {
    const playBtn = this.shadowRoot.querySelector('#play-btn');
    if (playBtn) {
      playBtn.textContent = this.isPlaying ? '⏸' : '▶';
    }
  }

  updateProgress() {
    if (!this.audio) return;
    const progress = this.shadowRoot.querySelector('#progress');
    const currentTime = this.shadowRoot.querySelector('#current-time');
    const durationTime = this.shadowRoot.querySelector('#duration-time');
    
    if (progress && this.audio.duration) {
      const value = (this.audio.currentTime / this.audio.duration) * 100;
      progress.value = value || 0;
    }
    
    if (currentTime && this.audio.duration) {
      if (this.showRemaining) {
        const remaining = this.audio.duration - this.audio.currentTime;
        currentTime.textContent = `-${this.formatTime(remaining)}`;
      } else {
        currentTime.textContent = this.formatTime(this.audio.currentTime);
      }
    }
    
    if (durationTime && this.audio.duration) {
      durationTime.textContent = this.formatTime(this.audio.duration);
    }
  }

  updateDuration() {
    const duration = this.shadowRoot.querySelector('#duration-time');
    if (duration && this.audio) {
      duration.textContent = this.formatTime(this.audio.duration);
    }
  }

  handleEnded() {
    this.isPlaying = false;
    this.updatePlayButton();
    this.shadowRoot.querySelector('.player')?.classList.remove('playing');
  }

  changeSpeed(speed) {
    this.currentSpeed = speed;
    if (this.audio) {
      this.audio.playbackRate = speed;
    }
    this.setAttribute('speed', speed);
  }

  toggleMute() {
    if (!this.audio) return;
    
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.previousVolume = this.audio.volume;
      this.audio.volume = 0;
    } else {
      this.audio.volume = this.previousVolume || 0.8;
    }
    
    this.updateMuteIndicator();
    this.updateVolumeIcon();
    this.updateVolumeSlider();
  }

  updateMuteIndicator() {
    const indicator = this.shadowRoot.querySelector('#mute-indicator');
    if (indicator) {
      if (this.isMuted) {
        indicator.classList.add('active');
      } else {
        indicator.classList.remove('active');
      }
    }
  }

  updateVolumeIcon() {
    const icon = this.shadowRoot.querySelector('#volume-icon');
    if (icon) {
      if (this.isMuted || (this.audio && this.audio.volume === 0)) {
        icon.textContent = '🔇';
      } else if (this.audio && this.audio.volume < 0.3) {
        icon.textContent = '🔈';
      } else if (this.audio && this.audio.volume < 0.7) {
        icon.textContent = '🔉';
      } else {
        icon.textContent = '🔊';
      }
    }
  }

  updateVolumeSlider() {
    const volume = this.shadowRoot.querySelector('#volume');
    if (volume && this.audio) {
      volume.value = this.audio.volume * 100;
    }
  }

  showFeedback(text) {
    const feedback = document.createElement('div');
    feedback.textContent = text;
    feedback.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 12px 24px;
      border-radius: 12px;
      font-size: 18px;
      font-weight: bold;
      pointer-events: none;
      z-index: 100;
      animation: fadeOut 1s forwards;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.1);
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeOut {
        0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -80%) scale(0.9); }
      }
    `;
    this.shadowRoot.appendChild(style);
    
    const player = this.shadowRoot.querySelector('.player');
    if (player) {
      player.style.position = 'relative';
      player.appendChild(feedback);
    }

    setTimeout(() => {
      feedback.remove();
      style.remove();
    }, 1000);
  }

  formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

// ثبت کامپوننت
customElements.define('kadad-player', KadadPlayer);