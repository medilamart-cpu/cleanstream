let currentResolvedData = null;
let currentMode = "proxy"; // "proxy" or "direct"
let hasSwitchedOnFail = false;

// DOM Elements
const videoInput = document.getElementById("videoUrlInput");
const pasteBtn = document.getElementById("pasteBtn");
const playBtn = document.getElementById("playBtn");
const statusAlert = document.getElementById("statusAlert");
const playerCard = document.getElementById("playerCard");
const cleanPlayer = document.getElementById("cleanPlayer");
const cleanSkin = document.getElementById("cleanSkin");
const iframePlayer = document.getElementById("cleanIframePlayer");
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
    currentMode = "proxy";

    // Update UI elements
    videoTitle.textContent = data.title || "Video Stream";
    hostBadge.textContent = data.host || "Unknown";
    streamTypeBadge.textContent = data.is_hls ? "HLS (.m3u8)" : "MP4";

    updateStreamModeUI();

    // Show card
    playerCard.style.display = "block";
    showStatus(`Successfully extracted ${data.host} stream! Starting playback...`, "success", 4000);

    // Play video
    loadVideoSource(data.is_hls, data.proxy_url, data.stream_url, data.embed_url);

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

function loadVideoSource(isHls, proxyUrl, directUrl, embedUrl) {
  // If host provides a sandboxed unblocked embed (e.g. Streamtape fallback):
  if (embedUrl) {
    if (cleanPlayer) cleanPlayer.style.display = "none";
    if (cleanSkin) cleanSkin.innerHTML = "";
    iframePlayer.style.display = "block";
    iframePlayer.src = embedUrl;
    proxyBadge.innerHTML = '<i class="fas fa-shield-alt"></i> Ad-Blocked Embed';
    streamToggleBtn.style.display = "none";
    openExternalBtn.href = embedUrl;
    return;
  }

  // Native Video.js 10 Player (MixDrop, Doodstream, StreamSB, VOE, direct MP4, HLS, etc.)
  iframePlayer.style.display = "none";
  iframePlayer.src = "";
  if (cleanPlayer) cleanPlayer.style.display = "block";
  streamToggleBtn.style.display = "inline-flex";

  const absProxyUrl = proxyUrl ? (proxyUrl.startsWith("http") ? proxyUrl : window.location.origin + proxyUrl) : "";
  const activeUrl = (currentMode === "proxy" && absProxyUrl) ? absProxyUrl : directUrl;
  openExternalBtn.href = directUrl || activeUrl;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (cleanSkin) {
    cleanSkin.innerHTML = (!isIOS && isHls)
      ? `<hlsjs-video id="cleanVideoPlayer" src="${activeUrl}" playsinline webkit-playsinline autoplay></hlsjs-video>`
      : `<video id="cleanVideoPlayer" src="${activeUrl}" playsinline webkit-playsinline autoplay></video>`;

    const mediaEl = cleanSkin.querySelector("#cleanVideoPlayer");
    if (mediaEl) {
      mediaEl.addEventListener("error", (e) => {
        console.log("Video.js 10 media element error:", e);
        const isDirectForbidden = currentResolvedData && (currentResolvedData.host === "MixDrop" || currentResolvedData.host === "Doodstream");
        if (currentResolvedData && !isDirectForbidden && !hasSwitchedOnFail) {
          hasSwitchedOnFail = true;
          currentMode = (currentMode === "proxy") ? "direct" : "proxy";
          updateStreamModeUI();
          showStatus(`Network issue detected. Retrying via ${currentMode} mode...`, "info", 3000);
          loadVideoSource(currentResolvedData.is_hls, currentResolvedData.proxy_url, currentResolvedData.stream_url);
        }
      });
      mediaEl.play().catch(err => {
        console.log("Autoplay policy prevented audio/play:", err);
      });
    }
  }
}

function toggleStreamMode() {
  if (!currentResolvedData) return;
  currentMode = currentMode === "proxy" ? "direct" : "proxy";
  updateStreamModeUI();
  loadVideoSource(currentResolvedData.is_hls, currentResolvedData.proxy_url, currentResolvedData.stream_url, null);
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

// =============================================================================
// NATIVE DEVICE PLAYER FULLSCREEN ENGINE (iOS AVPlayer & Android Native Video)
// =============================================================================
(function() {
  function detectPlatform() {
    const ua = navigator.userAgent || navigator.vendor || window.opera || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    return { isIOS, isAndroid };
  }

  function getActiveVideo() {
    const v = document.getElementById("cleanVideoPlayer") || document.getElementById("videoElement");
    if (v) {
      if (v.tagName && v.tagName.toLowerCase() === "video") return v;
      if (v.shadowRoot) {
        const sv = v.shadowRoot.querySelector("video");
        if (sv) return sv;
      }
      const iv = v.querySelector("video");
      if (iv) return iv;
    }
    return document.querySelector("video");
  }

  function openInNativeDevicePlayer(video) {
    if (!video) video = getActiveVideo();
    if (!video) return false;

    const { isIOS, isAndroid } = detectPlatform();

    if (!video.hasAttribute("playsinline")) video.setAttribute("playsinline", "");
    if (!video.hasAttribute("webkit-playsinline")) video.setAttribute("webkit-playsinline", "");

    const wasPlaying = !video.paused && !video.ended;

    // 1. iOS: Native AVPlayer Fullscreen Experience
    if (isIOS) {
      if (typeof video.webkitEnterFullscreen === "function") {
        try {
          const onBeginIOS = function() {
            video.removeEventListener("webkitbeginfullscreen", onBeginIOS);
            syncFullscreenUI(true);
            if (wasPlaying && video.paused) {
              video.play().catch(() => {});
            }
          };
          video.addEventListener("webkitbeginfullscreen", onBeginIOS);

          const onExitIOS = function() {
            video.removeEventListener("webkitendfullscreen", onExitIOS);
            syncFullscreenUI(false);
            if (!video.paused) {
              video.play().catch(() => {});
            }
          };
          video.addEventListener("webkitendfullscreen", onExitIOS);

          video.webkitEnterFullscreen();
          return true;
        } catch (err) {
          console.warn("[CleanStream] iOS webkitEnterFullscreen error:", err);
        }
      }
    }

    // 2. Android: Native Video Fullscreen Experience
    if (isAndroid) {
      const reqVideoFs = video.requestFullscreen ||
                         video.webkitRequestFullscreen ||
                         video.webkitEnterFullscreen;

      if (typeof reqVideoFs === "function") {
        try {
          const onFsChange = function() {
            const isFs = document.fullscreenElement === video ||
                         document.webkitFullscreenElement === video;
            syncFullscreenUI(isFs);
            if (!isFs) {
              document.removeEventListener("fullscreenchange", onFsChange);
              document.removeEventListener("webkitfullscreenchange", onFsChange);
              if (wasPlaying && video.paused) {
                video.play().catch(() => {});
              }
            }
          };
          document.addEventListener("fullscreenchange", onFsChange);
          document.addEventListener("webkitfullscreenchange", onFsChange);

          const promise = reqVideoFs.call(video);
          if (promise && typeof promise.catch === "function") {
            promise.catch((err) => {
              console.warn("[CleanStream] Android video.requestFullscreen rejected:", err);
              fallbackFullscreen(video);
            });
          }
          return true;
        } catch (err) {
          console.warn("[CleanStream] Android video fullscreen call failed:", err);
        }
      }
    }

    // 3. Fallback: Standard fullscreen on video or container
    return fallbackFullscreen(video);
  }

  function fallbackFullscreen(video) {
    if (!video) video = getActiveVideo();
    const req = video && (video.requestFullscreen || video.webkitRequestFullscreen || video.webkitEnterFullscreen);
    if (req) {
      try {
        const p = req.call(video);
        if (p && p.catch) {
          p.catch(() => fallbackContainer());
        }
        return true;
      } catch (e) {}
    }
    return fallbackContainer();

    function fallbackContainer() {
      const cont = document.getElementById("cleanPlayer") ||
                   document.getElementById("playerCard") ||
                   document.documentElement;
      const reqCont = cont && (cont.requestFullscreen || cont.webkitRequestFullscreen || cont.mozRequestFullScreen || cont.msRequestFullscreen);
      if (reqCont) {
        try {
          reqCont.call(cont);
          return true;
        } catch (e) {}
      }
      return false;
    }
  }

  function syncFullscreenUI(isFs) {
    const buttons = document.querySelectorAll("media-fullscreen-button, .media-fullscreen-button");
    buttons.forEach((btn) => {
      if (isFs) {
        btn.setAttribute("data-fullscreen", "");
      } else {
        btn.removeAttribute("data-fullscreen");
      }
    });
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "CLEANSTREAM_FULLSCREEN_CHANGE", isFullscreen: isFs }, "*");
      }
    } catch (e) {}
  }

  // Intercept click / pointer / touch on the fullscreen button before Video.js internal activate()
  function handleFullscreenTrigger(e) {
    const fsBtn = e.target.closest && e.target.closest(
      'media-fullscreen-button, .media-fullscreen-button, [data-action="toggleFullscreen"], [aria-label*="fullscreen" i], [title*="fullscreen" i], button.vjs-fullscreen-control, .vjs-fullscreen-control'
    );
    if (!fsBtn) return;

    const video = getActiveVideo();
    if (!video) return;

    const isCurrentlyFs = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      video.webkitDisplayingFullscreen
    );

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (isCurrentlyFs) {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (video.webkitExitFullscreen) {
        video.webkitExitFullscreen();
      }
    } else {
      openInNativeDevicePlayer(video);
    }
  }

  window.addEventListener("click", handleFullscreenTrigger, true);
  window.addEventListener("pointerup", handleFullscreenTrigger, true);
  window.addEventListener("touchend", handleFullscreenTrigger, true);

  window.addEventListener("message", (e) => {
    if (e.data && (e.data.type === "CLEANSTREAM_NATIVE_FULLSCREEN" || e.data === "CLEANSTREAM_NATIVE_FULLSCREEN")) {
      const video = getActiveVideo();
      if (video) openInNativeDevicePlayer(video);
    }
  });

  function hookContainer() {
    const cont = document.getElementById("cleanPlayer") || document.getElementById("playerCard");
    if (cont && !cont._nativeFsHooked) {
      cont._nativeFsHooked = true;
      const origFs = cont.requestFullscreen || cont.webkitRequestFullscreen;
      cont.requestFullscreen = function(opts) {
        const video = getActiveVideo();
        const { isIOS, isAndroid } = detectPlatform();
        if ((isIOS || isAndroid) && video) {
          return Promise.resolve(openInNativeDevicePlayer(video));
        }
        return origFs ? origFs.call(this, opts) : Promise.resolve();
      };
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hookContainer);
  } else {
    hookContainer();
  }
})();
