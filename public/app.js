let currentResolvedData = null;
let currentMode = "proxy"; // "proxy" or "direct"
let hlsInstance = null;

// DOM Elements
const videoInput = document.getElementById("videoUrlInput");
const pasteBtn = document.getElementById("pasteBtn");
const playBtn = document.getElementById("playBtn");
const statusAlert = document.getElementById("statusAlert");
const playerCard = document.getElementById("playerCard");
const videoPlayer = document.getElementById("cleanVideoPlayer");
const videoTitle = document.getElementById("videoTitle");
const hostBadge = document.getElementById("hostBadge");
const streamTypeBadge = document.getElementById("streamTypeBadge");
const proxyBadge = document.getElementById("proxyBadge");
const streamToggleBtn = document.getElementById("streamToggleBtn");
const streamToggleText = document.getElementById("streamToggleText");
const openExternalBtn = document.getElementById("openExternalBtn");

// 1. Paste Button handler
pasteBtn.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text && text.trim()) {
      videoInput.value = text.trim();
      videoInput.focus();
      showStatus("Pasted link from clipboard!", "info", 2000);
    } else {
      showStatus("Clipboard is empty.", "info", 2000);
    }
  } catch (err) {
    showStatus("Could not access clipboard. Please paste manually (Ctrl+V / long press).", "info", 3000);
    videoInput.focus();
  }
});

// 2. Set Demo Links
function setDemo(url) {
  videoInput.value = url;
  resolveAndPlay();
}

// 3. Resolve and Play
async function resolveAndPlay() {
  const url = videoInput.value.trim();
  if (!url) {
    showStatus("Please paste a valid video URL first.", "error");
    videoInput.focus();
    return;
  }

  setLoading(true);
  hideStatus();
  hasSwitchedOnFail = false;

  try {
    const resp = await fetch(`/api/resolve?url=${encodeURIComponent(url)}`);
    const data = await resp.json();

    if (!data.success) {
      showStatus(data.error || "Could not resolve stream from this link.", "error");
      setLoading(false);
      return;
    }

    if (data.is_download) {
      showStatus(`Resolved ${data.host} file download link!`, "success");
      setLoading(false);
      window.open(data.download_url, "_blank");
      return;
    }

    currentResolvedData = data;
    // Streamtape works directly in browsers; MixDrop/others prefer edge proxy
    currentMode = (data.host === "Streamtape") ? "direct" : "proxy";

    // Update UI elements
    videoTitle.textContent = data.title || "Video Stream";
    hostBadge.textContent = data.host || "Unknown";
    streamTypeBadge.textContent = data.is_hls ? "HLS (.m3u8)" : "MP4";

    updateStreamModeUI();

    // Show card
    playerCard.style.display = "block";
    showStatus(`Successfully extracted ${data.host} stream! Starting playback...`, "success", 4000);

    // Play video
    loadVideoSource(data.is_hls, data.proxy_url, data.stream_url);

    // Smooth scroll to player
    setTimeout(() => {
      playerCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 150);

  } catch (err) {
    showStatus("Failed to contact resolver API: " + err.message, "error");
  } finally {
    setLoading(false);
  }
}

function loadVideoSource(isHls, proxyUrl, directUrl) {
  const activeUrl = (currentMode === "proxy" && proxyUrl) ? proxyUrl : directUrl;
  openExternalBtn.href = directUrl || activeUrl;

  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  if (isHls) {
    if (Hls.isSupported()) {
      hlsInstance = new Hls({
        debug: false,
        enableWorker: true,
      });
      hlsInstance.loadSource(activeUrl);
      hlsInstance.attachMedia(videoPlayer);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        videoPlayer.play().catch(e => console.log("Autoplay policy:", e));
      });
    } else if (videoPlayer.canPlayType("application/vnd.apple.mpegurl")) {
      // Native Safari HLS
      videoPlayer.src = activeUrl;
      videoPlayer.play().catch(e => console.log("Autoplay policy:", e));
    }
  } else {
    videoPlayer.src = activeUrl;
    videoPlayer.play().catch(e => console.log("Autoplay policy:", e));
  }
}

let hasSwitchedOnFail = false;
videoPlayer.addEventListener("error", () => {
  if (currentResolvedData && !hasSwitchedOnFail) {
    hasSwitchedOnFail = true;
    currentMode = (currentMode === "proxy") ? "direct" : "proxy";
    updateStreamModeUI();
    showStatus(`Playback issue detected. Auto-switched to ${currentMode} mode...`, "info", 3000);
    loadVideoSource(currentResolvedData.is_hls, currentResolvedData.proxy_url, currentResolvedData.stream_url);
  }
});

function toggleStreamMode() {
  if (!currentResolvedData) return;
  currentMode = currentMode === "proxy" ? "direct" : "proxy";
  updateStreamModeUI();
  loadVideoSource(currentResolvedData.is_hls, currentResolvedData.proxy_url, currentResolvedData.stream_url);
}

function updateStreamModeUI() {
  if (currentMode === "proxy") {
    proxyBadge.style.display = "inline-block";
    streamToggleText.textContent = "Switch to Direct";
    streamToggleBtn.title = "Currently streaming via Cloudflare Edge proxy. Click to try direct CDN.";
  } else {
    proxyBadge.style.display = "none";
    streamToggleText.textContent = "Switch to Proxy";
    streamToggleBtn.title = "Currently streaming direct CDN. Click to use Cloudflare Edge proxy.";
  }
}

function copyStreamUrl() {
  if (!currentResolvedData) return;
  const link = currentResolvedData.stream_url || currentResolvedData.proxy_url;
  if (navigator.clipboard && link) {
    navigator.clipboard.writeText(link);
    showStatus("Direct stream URL copied to clipboard!", "success", 2500);
  }
}

function setLoading(loading) {
  playBtn.disabled = loading;
  const text = playBtn.querySelector(".btn-text");
  const loader = playBtn.querySelector(".btn-loader");
  if (loading) {
    text.style.display = "none";
    loader.style.display = "inline-flex";
  } else {
    text.style.display = "inline-flex";
    loader.style.display = "none";
  }
}

let statusTimeout = null;
function showStatus(message, type = "info", duration = 0) {
  if (statusTimeout) clearTimeout(statusTimeout);
  statusAlert.className = `status-alert ${type}`;
  
  let icon = "fa-info-circle";
  if (type === "error") icon = "fa-exclamation-triangle";
  if (type === "success") icon = "fa-check-circle";

  statusAlert.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
  statusAlert.style.display = "flex";

  if (duration > 0) {
    statusTimeout = setTimeout(() => {
      hideStatus();
    }, duration);
  }
}

function hideStatus() {
  statusAlert.style.display = "none";
}

// Enter key submission
videoInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    resolveAndPlay();
  }
});
