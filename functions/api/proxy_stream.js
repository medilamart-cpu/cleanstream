/**
 * CleanStream - Cloudflare Pages Edge Video Proxy
 * Proxies direct MP4 video streams with Range headers,
 * bypassing CORS, Referer checks, and ISP blocking.
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
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const targetUrl = urlObj.searchParams.get("url");
  const referer = urlObj.searchParams.get("referer") || "";

  if (!targetUrl) {
    return new Response("Missing 'url' query parameter", {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const upstreamHeaders = new Headers();
  upstreamHeaders.set("User-Agent", USER_AGENT);
  if (referer) {
    upstreamHeaders.set("Referer", referer);
  }

  // Forward Range header if client requested byte range (crucial for video scrub/seek & mobile Safari/Chrome)
  const rangeHeader = request.headers.get("Range");
  if (rangeHeader) {
    upstreamHeaders.set("Range", rangeHeader);
  }

  try {
    const upstreamResp = await fetch(targetUrl, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: upstreamHeaders,
      redirect: "follow",
    });

    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges, Content-Type");
    responseHeaders.set("Accept-Ranges", "bytes");

    const copyHeaders = ["content-type", "content-length", "content-range", "last-modified", "etag"];
    for (const h of copyHeaders) {
      const v = upstreamResp.headers.get(h);
      if (v) responseHeaders.set(h, v);
    }

    if (!responseHeaders.get("content-type")) {
      responseHeaders.set("content-type", "video/mp4");
    }

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response("Proxy streaming error: " + err.message, {
      status: 502,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}
