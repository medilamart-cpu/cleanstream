/**
 * CleanStream - Cloudflare Pages Edge Resolver
 * Resolves Streamtape, Mixdrop, Doodstream/Playmogo, StreamSB, StreamVO, 
 * StreamDD, jav.guru searcho gateway, and generic web streams on Cloudflare's Edge.
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function onRequest(context) {
  const { request } = context;
  const urlObj = new URL(request.url);

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const targetUrl = (urlObj.searchParams.get("url") || "").trim();
  if (!targetUrl) {
    return jsonResponse({ success: false, error: "Missing 'url' query parameter" }, 400);
  }

  try {
    const result = await resolveMediaUrl(targetUrl);
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ success: false, error: "Resolver exception: " + err.message }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "public, max-age=60",
    },
  });
}

async function resolveMediaUrl(url) {
  const lowerUrl = url.toLowerCase();

  // 1. Direct raw video or HLS link
  if (lowerUrl.includes(".m3u8") || lowerUrl.includes(".mp4")) {
    const isHls = lowerUrl.includes(".m3u8");
    return {
      success: true,
      stream_url: url,
      proxy_url: isHls ? `/api/proxy_hls?url=${encodeURIComponent(url)}` : `/api/proxy_stream?url=${encodeURIComponent(url)}`,
      title: "Direct Video Stream",
      host: isHls ? "Direct HLS" : "Direct MP4",
      is_hls: isHls,
    };
  }

  // 2. jav.guru searcho gateway (?xd=, ?td=, etc.) or redirect (?r=)
  if (lowerUrl.includes("jav.guru")) {
    const jg = await resolveJavGuru(url);
    if (jg) return jg;
  }

  // 3. Streamtape
  if (["streamtape", "strtape", "strcloud", "streamta.pe"].some(k => lowerUrl.includes(k))) {
    return await resolveStreamtape(url);
  }

  // 4. Mixdrop
  if (["mixdrop", "mxdrop", "mixdrp", "miiixdrop"].some(k => lowerUrl.includes(k))) {
    return await resolveMixdrop(url);
  }

  // 5. Doodstream / Playmogo / ds2play
  if (["dood", "playmogo", "ds2play", "d000d", "do0od"].some(k => lowerUrl.includes(k))) {
    return await resolveDoodstream(url);
  }

  // 6. STREAM DD (vide0.net)
  if (lowerUrl.includes("vide0.net")) {
    return await resolveVide0(url);
  }

  // 7. STREAM SB (javclan.com / streamsb)
  if (["javclan.com", "streamsb", "sbembed", "sbvideo"].some(k => lowerUrl.includes(k))) {
    return await resolveStreamsb(url);
  }

  // 8. STREAM VO (javlesbians.com / VOE)
  if (["javlesbians.com", "voe.sx", "jamespatterncamera"].some(k => lowerUrl.includes(k))) {
    return await resolveVoe(url);
  }

  // 9. STREAM JK (maxstream.org)
  if (lowerUrl.includes("maxstream.org")) {
    return await resolveMaxstream(url);
  }

  // 10. STREAM LU (streamhihi.com)
  if (["streamhihi.com", "luluvdo.com", "lulustream"].some(k => lowerUrl.includes(k))) {
    return await resolveLulustream(url);
  }

  // 11. STREAM EA (javplaya.com)
  if (lowerUrl.includes("javplaya.com")) {
    return await resolveJavplaya(url);
  }

  return {
    success: false,
    error: "Unsupported video host. Supported hosts: Streamtape, MixDrop, Doodstream/Playmogo, StreamSB, StreamVO, StreamDD, StreamJK, StreamLU, StreamEA, and jav.guru gateways.",
  };
}

// ----------------------------------------------------
// Unpacker & JavGuru Hex Utilities
// ----------------------------------------------------
function unpackPacker(packedJs) {
  const pattern = /}\s*\(\s*('[\s\S]*?'|"[\s\S]*?")\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*('[\s\S]*?'|"[\s\S]*?")\.split\('\|'\)/;
  const m = packedJs.match(pattern);
  if (!m) return "";
  const p = m[1].slice(1, -1);
  const a = parseInt(m[2], 10);
  const c = parseInt(m[3], 10);
  const k = m[4].slice(1, -1).split("|");

  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  function baseN(num, b) {
    if (num === 0) return "0";
    let res = "";
    while (num > 0) {
      res = chars[num % b] + res;
      num = Math.floor(num / b);
    }
    return res;
  }

  const lookup = {};
  for (let i = 0; i < c; i++) {
    const key = baseN(i, a);
    lookup[key] = (i < k.length && k[i]) ? k[i] : key;
  }

  return p.replace(/\b\w+\b/g, (w) => lookup[w] !== undefined ? lookup[w] : w);
}

function decodeJavGuruParam(hexStr) {
  try {
    const chars = [];
    for (let i = 0; i < hexStr.length; i += 2) {
      const pair = hexStr.substr(i, 2);
      if (pair.length === 2) {
        const swapped = pair[1] + pair[0];
        chars.push(String.fromCharCode(parseInt(swapped, 16)));
      }
    }
    return chars.reverse().join("");
  } catch (e) {
    return "";
  }
}

// ----------------------------------------------------
// Host: jav.guru searcho gateway & redirects
// ----------------------------------------------------
async function resolveJavGuru(url) {
  if (url.includes("jav.guru/?r=") || url.includes("jav.guru?r=")) {
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://jav.guru/" },
        redirect: "manual",
      });
      const dest = resp.headers.get("Location");
      if (dest) {
        const hostName = dest.includes("k2s") ? "Keep2Share" : (dest.includes("rapidgator") ? "Rapidgator" : "Direct Download");
        return {
          success: true,
          is_download: true,
          download_url: dest,
          title: `${hostName} File Download`,
          host: hostName,
        };
      }
    } catch (e) {
      return { success: false, error: `Failed to follow download redirect: ${e.message}`, host: "Direct Download" };
    }
  }

  if (url.includes("jav.guru/searcho/")) {
    const parsed = new URL(url);
    for (const [key, val] of parsed.searchParams.entries()) {
      const decoded = decodeJavGuruParam(val);
      if (!decoded) continue;
      if (key === "xd") return await resolveStreamsb(`https://javclan.com/e/${decoded}`);
      if (key === "td") return await resolveVoe(`https://javlesbians.com/e/${decoded}`);
      if (key === "hd") return await resolveVide0(`https://vide0.net/e/${decoded}`);
      if (key === "od") {
        const fileId = decoded.replace("embed-", "").replace(".html", "").trim();
        return await resolveMaxstream(`https://maxstream.org/embed-${fileId}.html`);
      }
      if (key === "ed") {
        const cleanPath = decoded.replace(/^e\//, "").trim();
        return await resolveLulustream(`https://streamhihi.com/e/${cleanPath}`);
      }
      if (key === "rd") {
        const cleanId = decoded.replace(/^embed\//, "").trim();
        return await resolveJavplaya(`https://javplaya.com/embed/${cleanId}`);
      }
    }
  }
  return null;
}

// ----------------------------------------------------
// Host: Streamtape
// ----------------------------------------------------
async function resolveStreamtape(url) {
  const mId = url.match(/\/(?:v|e)\/([A-Za-z0-9_-]+)/);
  let videoId = mId ? mId[1] : (url.trim().match(/^[A-Za-z0-9_-]{10,}$/) ? url.trim() : null);
  if (!videoId) {
    return { success: false, error: "Invalid Streamtape URL or missing video ID", host: "Streamtape" };
  }

  const domains = ["streamta.pe", "strtape.tech", "strcloud.link", "streamtape.net", "streamtape.com"];
  for (const dom of domains) {
    try {
      const embedUrl = `https://${dom}/v/${videoId}`;
      const resp = await fetch(embedUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": `https://${dom}/` },
      });
      if (resp.status !== 200) continue;
      const html = await resp.text();
      if (html.toLowerCase().includes("video not found") || html.toLowerCase().includes("video was deleted")) {
        continue;
      }

      let title = "Streamtape Video";
      const tMatch = html.match(/<meta name="og:title" content="([^"]+)"/) || html.match(/<title>([^<]+)<\/title>/);
      if (tMatch) {
        title = tMatch[1].replace(/\s*-\s*Streamtape.*$/, "").trim();
      }

      let videoPath = null;
      // Pattern 1: double substring
      const mSub2 = html.match(/document\.getElementById\('norobotlink'\)\.innerHTML\s*=\s*'([^']+)'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)\.substring\((\d+)\);/);
      if (mSub2) {
        const prefix = mSub2[1];
        const part = mSub2[2];
        const s1 = parseInt(mSub2[3], 10);
        const s2 = parseInt(mSub2[4], 10);
        videoPath = prefix + part.substring(s1).substring(s2);
      } else {
        // Pattern 2: single substring
        const mSub1 = html.match(/document\.getElementById\('norobotlink'\)\.innerHTML\s*=\s*'([^']+)'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\);/);
        if (mSub1) {
          videoPath = mSub1[1] + mSub1[2].substring(parseInt(mSub1[3], 10));
        }
      }

      if (videoPath) {
        const streamUrl = "https:" + videoPath + "&stream=1";
        const proxyUrl = `/api/proxy_stream?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent(`https://${dom}/`)}`;
        return {
          success: true,
          stream_url: streamUrl,
          proxy_url: proxyUrl,
          title,
          host: "Streamtape",
          is_hls: false,
        };
      }
    } catch (e) {
      continue;
    }
  }

  return { success: false, error: "Could not extract direct stream URL from Streamtape", host: "Streamtape" };
}

// ----------------------------------------------------
// Host: MixDrop
// ----------------------------------------------------
async function resolveMixdrop(url) {
  const mId = url.match(/\/(?:f|e|v|embed)\/([A-Za-z0-9_-]+)/);
  const rawId = mId ? mId[1] : (url.trim().match(/^[A-Za-z0-9_-]{8,}$/) ? url.trim() : null);
  if (!rawId) {
    return { success: false, error: "Invalid Mixdrop URL: missing video ID", host: "MixDrop" };
  }

  const candidateIds = [rawId];
  const mSub = rawId.match(/^([a-zA-Z0-9]{12,16})/);
  if (mSub && !candidateIds.includes(mSub[1])) candidateIds.push(mSub[1]);

  let parsedDom = "";
  try {
    parsedDom = new URL(url).hostname;
  } catch (e) {}

  const candidateDomains = [parsedDom, "mixdrp.click", "mxdrop.click", "mixdrop.ag", "miiixdrop.top", "mixdrop.co", "mxdrop.to", "mixdrop.is"].filter(Boolean);

  for (const currDomain of candidateDomains) {
    for (const vid of candidateIds) {
      try {
        const embedUrl = `https://${currDomain}/e/${vid}`;
        const resp = await fetch(embedUrl, {
          headers: { "User-Agent": USER_AGENT, "Referer": `https://${currDomain}/` },
        });
        if (resp.status !== 200) continue;
        const html = await resp.text();
        if (html.toLowerCase().includes("file not found") || html.toLowerCase().includes("file was deleted")) {
          continue;
        }

        let title = "Mixdrop Video";
        const tMatch = html.match(/<title>([^<]+)<\/title>/);
        if (tMatch) {
          title = tMatch[1].replace(/^(?:MixDrop\s*-\s*(?:Watch\s*)?)/, "").trim();
        }

        let unpacked = "";
        for (const line of html.split("\n")) {
          if (line.includes("eval(function(p,a,c,k,e,d)")) {
            unpacked = unpackPacker(line);
            if (unpacked) break;
          }
        }
        if (!unpacked) continue;

        const mWurl = unpacked.match(/(?:wurl|vurl)\s*=\s*["']([^"']+)["']/);
        if (mWurl) {
          let streamUrl = mWurl[1];
          if (streamUrl.startsWith("//")) streamUrl = "https:" + streamUrl;
          const proxyUrl = `/api/proxy_stream?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent(`https://${currDomain}/`)}`;
          return {
            success: true,
            stream_url: streamUrl,
            proxy_url: proxyUrl,
            title,
            host: "MixDrop",
            is_hls: false,
          };
        }
      } catch (e) {
        continue;
      }
    }
  }

  return { success: false, error: "Could not resolve Mixdrop stream link", host: "MixDrop" };
}

// ----------------------------------------------------
// Host: Doodstream / Playmogo
// ----------------------------------------------------
async function resolveDoodstream(url) {
  const mId = url.match(/\/(?:d|e|f|v)\/([A-Za-z0-9_-]+)/);
  const videoId = mId ? mId[1] : (url.trim().match(/^[A-Za-z0-9_-]{6,}$/) ? url.trim() : null);
  if (!videoId) {
    return { success: false, error: "Invalid Doodstream URL: missing video ID", host: "Doodstream" };
  }

  let domain = "playmogo.com";
  try {
    domain = new URL(url).hostname || "playmogo.com";
  } catch (e) {}

  const candidateDomains = [domain, "playmogo.com", "do0od.com", "dood.li", "dood.wf", "d000d.com", "ds2play.com", "dood.to"];

  for (const currDomain of candidateDomains) {
    try {
      const embedUrl = `https://${currDomain}/e/${videoId}`;
      const resp = await fetch(embedUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": `https://${currDomain}/` },
      });
      if (resp.status !== 200) continue;
      const html = await resp.text();

      if (html.includes("The resource you are looking for has been removed") || html.toLowerCase().includes("file not found") || html.toLowerCase().includes("file was deleted")) {
        return { success: false, error: "This video has been deleted or removed by Doodstream host.", host: "Doodstream" };
      }

      let title = "Doodstream Video";
      const tMatch = html.match(/<title>([^<]+)<\/title>/);
      if (tMatch) title = tMatch[1].replace(/\s*-\s*DoodStream.*$/, "").trim();

      const passMatch = html.match(/(\/pass_md5\/[^'"<>\s]+)/);
      if (!passMatch) continue;

      const passUrl = `https://${currDomain}${passMatch[1]}`;
      const passResp = await fetch(passUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": embedUrl },
      });
      if (passResp.status !== 200) continue;
      const baseStream = (await passResp.text()).trim();
      if (!baseStream || baseStream.includes("RELOAD")) continue;

      let streamUrl = "";
      if (baseStream.toLowerCase().includes("cloudflarestorage.")) {
        streamUrl = baseStream;
      } else {
        const tokenMatch = html.match(/token=([^&'"<>\s]+)/);
        const token = tokenMatch ? tokenMatch[1] : "123456789";
        const expiry = Date.now();
        streamUrl = `${baseStream}123456789?token=${token}&expiry=${expiry}`;
      }

      const proxyUrl = `/api/proxy_stream?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent(`https://${currDomain}/`)}`;
      return {
        success: true,
        stream_url: streamUrl,
        proxy_url: proxyUrl,
        title,
        host: "Doodstream",
        is_hls: false,
      };
    } catch (e) {
      continue;
    }
  }

  return { success: false, error: "Could not resolve Doodstream video stream", host: "Doodstream" };
}

// ----------------------------------------------------
// Host: STREAM DD (vide0.net)
// ----------------------------------------------------
async function resolveVide0(url) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "manual",
    });
    const target = r.headers.get("Location") || url;
    const res = await resolveDoodstream(target);
    if (res.success) {
      res.host = "StreamDD (Playmogo)";
    }
    return res;
  } catch (e) {
    return { success: false, error: `StreamDD resolver error: ${e.message}`, host: "StreamDD" };
  }
}

// ----------------------------------------------------
// Host: STREAM SB (javclan.com)
// ----------------------------------------------------
async function resolveStreamsb(url) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Referer": "https://jav.guru/" },
    });
    const html = await r.text();
    let title = "StreamSB Video";
    const tMatch = html.match(/<title>([^<]+)<\/title>/);
    if (tMatch) title = tMatch[1].trim();

    for (const line of html.split("\n")) {
      if (line.includes("eval(function(p,a,c,k,e,d)")) {
        const unp = unpackPacker(line);
        const m = unp.match(/["']hls4["']\s*:\s*["']([^"']+)["']/);
        if (m) {
          const m3u8 = m[1].startsWith("/") ? "https://javclan.com" + m[1] : m[1];
          const proxyUrl = `/api/proxy_hls?url=${encodeURIComponent(m3u8)}&referer=${encodeURIComponent("https://javclan.com/")}`;
          return {
            success: true,
            stream_url: m3u8,
            proxy_url: proxyUrl,
            is_hls: true,
            title,
            host: "StreamSB (javclan)",
          };
        }
      }
    }
    return { success: false, error: "Could not find StreamSB video stream", host: "StreamSB" };
  } catch (e) {
    return { success: false, error: `StreamSB resolver error: ${e.message}`, host: "StreamSB" };
  }
}

// ----------------------------------------------------
// Host: STREAM VO (javlesbians.com / VOE)
// ----------------------------------------------------
async function resolveVoe(url) {
  try {
    let r = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    let html = await r.text();
    let finalUrl = r.url || url;

    const mRed = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)/);
    if (mRed) {
      finalUrl = mRed[1];
      r = await fetch(finalUrl, { headers: { "User-Agent": USER_AGENT } });
      html = await r.text();
    }

    let title = "StreamVO Video";
    const tMatch = html.match(/<title>([^<]+)<\/title>/);
    if (tMatch) title = tMatch[1].replace(/\s*-\s*VOE.*$/, "").trim();

    // Check direct HLS in script
    const mDirect = html.match(/['"]hls['"]\s*:\s*['"]([^'"]+)['"]/);
    if (mDirect) {
      const m3u8 = mDirect[1];
      return {
        success: true,
        stream_url: m3u8,
        proxy_url: `/api/proxy_hls?url=${encodeURIComponent(m3u8)}`,
        is_hls: true,
        title,
        host: "StreamVO",
      };
    }

    return { success: false, error: "VOE encrypted stream signature not found", host: "StreamVO" };
  } catch (e) {
    return { success: false, error: `StreamVO resolver error: ${e.message}`, host: "StreamVO" };
  }
}

// ----------------------------------------------------
// Host: STREAM JK (maxstream.org)
// ----------------------------------------------------
async function resolveMaxstream(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": "https://jav.guru/" } });
    const html = await r.text();
    for (const line of html.split("\n")) {
      if (line.includes("eval(function(p,a,c,k,e,d)")) {
        const unp = unpackPacker(line);
        const m = unp.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/);
        if (m) {
          return {
            success: true,
            stream_url: m[1],
            proxy_url: `/api/proxy_hls?url=${encodeURIComponent(m[1])}&referer=${encodeURIComponent(url)}`,
            is_hls: true,
            title: "MaxStream Video",
            host: "StreamJK (MaxStream)",
          };
        }
      }
    }
    return { success: false, error: "Could not find MaxStream video link", host: "StreamJK" };
  } catch (e) {
    return { success: false, error: `MaxStream error: ${e.message}`, host: "StreamJK" };
  }
}

// ----------------------------------------------------
// Host: STREAM LU (streamhihi.com)
// ----------------------------------------------------
async function resolveLulustream(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": "https://jav.guru/" } });
    const html = await r.text();
    for (const line of html.split("\n")) {
      if (line.includes("eval(function(p,a,c,k,e,d)")) {
        const unp = unpackPacker(line);
        const m = unp.match(/sources\s*:\s*\[\{file:\s*["']([^"']+)["']/);
        if (m) {
          return {
            success: true,
            stream_url: m[1],
            proxy_url: `/api/proxy_hls?url=${encodeURIComponent(m[1])}&referer=${encodeURIComponent(url)}`,
            is_hls: true,
            title: "Lulustream Video",
            host: "StreamLU (Lulustream)",
          };
        }
      }
    }
    return { success: false, error: "Could not find Lulustream video source", host: "StreamLU" };
  } catch (e) {
    return { success: false, error: `Lulustream error: ${e.message}`, host: "StreamLU" };
  }
}

// ----------------------------------------------------
// Host: STREAM EA (javplaya.com)
// ----------------------------------------------------
async function resolveJavplaya(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": "https://jav.guru/" } });
    const html = await r.text();
    for (const line of html.split("\n")) {
      if (line.includes("eval(function(p,a,c,k,e,d)")) {
        const unp = unpackPacker(line);
        const m = unp.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/);
        if (m) {
          return {
            success: true,
            stream_url: m[1],
            proxy_url: `/api/proxy_hls?url=${encodeURIComponent(m[1])}&referer=${encodeURIComponent(url)}`,
            is_hls: true,
            title: "JavPlaya Video",
            host: "StreamEA (JavPlaya)",
          };
        }
      }
    }
    return { success: false, error: "Could not find JavPlaya video source", host: "StreamEA" };
  } catch (e) {
    return { success: false, error: `JavPlaya error: ${e.message}`, host: "StreamEA" };
  }
}
