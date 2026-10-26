# CleanStream - Cloudflare Pages

> **Ad-Free Multi-Host Video Player & Gateway Resolver** hosted 100% on **Cloudflare Pages & Edge Functions**.

---

## ⚡ Features

- **Zero Ads, Zero Popups**: Bypasses aggressive ad traps, redirects, and click-hijackers.
- **Edge Resolver Functions (`/api/resolve`)**: Runs on Cloudflare's global edge network (300+ locations).
- **Edge Video Proxy (`/api/proxy_stream` & `/api/proxy_hls`)**:
  - Handles HTTP `Range` requests for smooth seeking and scrubbing.
  - Bypasses ISP DNS/IP blocks and CORS restrictions.
  - Works on iOS Safari, Android Chrome, and all desktop browsers.
- **Supported Platforms**:
  - **Streamtape** (`streamtape.com`, `streamta.pe`, `strtape.tech`, `strcloud.link`)
  - **MixDrop** (`mixdrop.co`, `mxdrop.click`, `mixdrp.click`, `miiixdrop.top`)
  - **DoodStream / Playmogo** (`playmogo.com`, `doodstream.com`, `dood.to`, `ds2play.com`)
  - **StreamSB** (`javclan.com`)
  - **StreamVO / VOE** (`javlesbians.com`, `voe.sx`)
  - **StreamDD** (`vide0.net`)
  - **StreamJK** (`maxstream.org`)
  - **StreamLU** (`streamhihi.com`, `luluvdo.com`)
  - **StreamEA** (`javplaya.com`)
  - **jav.guru Searcho Gateways** (`?xd=`, `?td=`, `?hd=`, `?od=`, `?ed=`, `?rd=`) & Download redirects (`?r=`)
  - Direct `.mp4` and `.m3u8` video URLs.

---

## 🚀 How to Deploy on Cloudflare Pages (2 Minutes)

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/) and navigate to **Workers & Pages**.
2. Click **Create Application** ➔ **Pages** tab ➔ **Connect to Git**.
3. Select your GitHub repository: **`medilamart-cpu/cleanstream`**.
4. Configure Build Settings:
   - **Framework preset**: `None`
   - **Build command**: *(leave blank)*
   - **Build output directory**: `public` (or leave as `/`)
5. Click **Save and Deploy**.

Cloudflare will deploy your site in less than 30 seconds! You will get an instant `https://cleanstream-xxx.pages.dev` URL, and you can add your custom domain with 1 click.

---

## 💻 Local Testing (Optional)

You can run and test this locally using Wrangler:

```bash
npx wrangler pages dev public
```
