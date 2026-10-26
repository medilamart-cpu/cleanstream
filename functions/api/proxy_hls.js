/**
 * CleanStream - Cloudflare Pages Edge HLS (.m3u8) Proxy
 * Proxies HLS playlists, rewrites relative chunk paths, and adds CORS headers.
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function onRequest(context) {
  const { request } = context;
  const urlObj = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const targetUrl = urlObj.searchParams.get("url");
  const referer = urlObj.searchParams.get("referer") || "";

  if (!targetUrl) {
    return new Response("Missing 'url' query parameter", { status: 400 });
  }

  const upstreamHeaders = new Headers();
  upstreamHeaders.set("User-Agent", USER_AGENT);
  if (referer) {
    upstreamHeaders.set("Referer", referer);
  }

  try {
    const upstreamResp = await fetch(targetUrl, {
      headers: upstreamHeaders,
      redirect: "follow",
    });

    const contentType = upstreamResp.headers.get("content-type") || "";

    // If it is an m3u8 playlist, rewrite relative segment paths
    if (contentType.includes("mpegurl") || targetUrl.includes(".m3u8") || targetUrl.includes(".txt")) {
      const text = await upstreamResp.text();
      const baseObj = new URL(targetUrl);
      const lines = text.split("\n");
      const rewritten = [];

      for (let line of lines) {
        line = line.trim();
        if (!line) {
          rewritten.push("");
          continue;
        }
        if (line.startsWith("#")) {
          rewritten.push(line);
          continue;
        }

        // Segment or sub-playlist URL
        let absUrl = line;
        if (!line.startsWith("http://") && !line.startsWith("https://")) {
          absUrl = new URL(line, baseObj).href;
        }

        if (absUrl.includes(".m3u8")) {
          rewritten.push(`/api/proxy_hls?url=${encodeURIComponent(absUrl)}&referer=${encodeURIComponent(referer)}`);
        } else {
          rewritten.push(`/api/proxy_stream?url=${encodeURIComponent(absUrl)}&referer=${encodeURIComponent(referer)}`);
        }
      }

      return new Response(rewritten.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        },
      });
    }

    // Direct chunk / segment pass-through
    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers: {
        "Content-Type": contentType || "video/MP2T",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response("HLS Proxy error: " + err.message, {
      status: 502,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}
