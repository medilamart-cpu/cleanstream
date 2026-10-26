/**
 * CleanStream - Dedicated Streamtape Streamer
 * Resolves and streams in a SINGLE edge worker session, guaranteeing
 * the outbound IP matches Streamtape's token validation.
 * Supports Range headers for seamless mobile scrub/seek.
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

  const videoId = (urlObj.searchParams.get("id") || "").trim();
  if (!videoId) {
    return new Response("Missing 'id' query parameter", { status: 400 });
  }

  const domains = ["strtape.tech", "streamta.pe", "strcloud.link", "streamtape.net"];

  for (const dom of domains) {
    try {
      const embedUrl = `https://${dom}/v/${videoId}`;
      const embedResp = await fetch(embedUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": `https://${dom}/` },
      });
      if (embedResp.status !== 200) continue;
      const html = await embedResp.text();

      let videoPath = null;
      const mSub2 = html.match(/document\.getElementById\('norobotlink'\)\.innerHTML\s*=\s*'([^']+)'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)\.substring\((\d+)\);/);
      if (mSub2) {
        const prefix = mSub2[1];
        const part = mSub2[2];
        const s1 = parseInt(mSub2[3], 10);
        const s2 = parseInt(mSub2[4], 10);
        videoPath = prefix + part.substring(s1).substring(s2);
      } else {
        const mSub1 = html.match(/document\.getElementById\('norobotlink'\)\.innerHTML\s*=\s*'([^']+)'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\);/);
        if (mSub1) {
          videoPath = mSub1[1] + mSub1[2].substring(parseInt(mSub1[3], 10));
        }
      }

      if (!videoPath) continue;

      const streamUrl = "https:" + videoPath + "&stream=1";

      const upstreamHeaders = new Headers();
      upstreamHeaders.set("User-Agent", USER_AGENT);
      upstreamHeaders.set("Referer", `https://${dom}/`);

      const rangeHeader = request.headers.get("Range");
      if (rangeHeader) {
        upstreamHeaders.set("Range", rangeHeader);
      }

      const streamResp = await fetch(streamUrl, {
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
        const v = streamResp.headers.get(h);
        if (v) responseHeaders.set(h, v);
      }

      if (!responseHeaders.get("content-type")) {
        responseHeaders.set("content-type", "video/mp4");
      }

      return new Response(streamResp.body, {
        status: streamResp.status,
        statusText: streamResp.statusText,
        headers: responseHeaders,
      });

    } catch (e) {
      continue;
    }
  }

  return new Response("Could not stream Streamtape video", { status: 502, headers: { "Access-Control-Allow-Origin": "*" } });
}
