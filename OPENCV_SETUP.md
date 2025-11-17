# OpenCV WebAssembly Setup Guide

This guide explains the server requirements for the optimized OpenCV builds and how to configure your web server for maximum performance.

## 📦 Build Types

The app includes three OpenCV builds that are automatically selected based on browser capabilities:

| Build | Size | Speed | Browser Support | Requires Headers |
|-------|------|-------|-----------------|------------------|
| **threadsSimd** | 13MB | ⚡⚡⚡ Fastest (3-4x) | Chrome, Firefox, Edge | ✅ **YES** |
| **simd** | 13MB | ⚡⚡ Fast (2-3x) | Safari, iOS Safari | ❌ No |
| **wasm** | 11MB | ⚡ Standard | All browsers | ❌ No |

## 🔒 Cross-Origin Isolation (Required for Threads)

The **threadsSimd** build requires `SharedArrayBuffer`, which needs Cross-Origin Isolation headers:

```http
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

### ⚠️ Without These Headers:
- threadsSimd build will **NOT** work
- App automatically falls back to **simd** or **wasm** build
- No errors shown to users
- Performance is slower (but still works)

### ✅ With These Headers:
- threadsSimd build works perfectly
- **3-4x faster** feature detection
- Best performance on Chrome, Firefox, Edge

## 🔧 Server Configuration

Choose your web server and follow the setup:

### Apache (.htaccess)

**File:** `.htaccess` (already included in project root)

```apache
<IfModule mod_headers.c>
    Header always set Cross-Origin-Embedder-Policy "require-corp"
    Header always set Cross-Origin-Opener-Policy "same-origin"
</IfModule>
```

**Setup:**
1. Ensure `mod_headers` is enabled:
   ```bash
   sudo a2enmod headers
   sudo systemctl restart apache2
   ```
2. Verify `.htaccess` files are allowed in your Apache config:
   ```apache
   <Directory /var/www/html>
       AllowOverride All
   </Directory>
   ```
3. The `.htaccess` file in the project root should work automatically

### Nginx

**File:** `nginx-opencv.conf` (already included in project root)

**Setup:**
1. Include the config in your server block:
   ```nginx
   server {
       listen 443 ssl http2;
       server_name your-domain.com;
       root /var/www/webar/current;

       # Include OpenCV-specific configuration
       include /var/www/webar/current/nginx-opencv.conf;
   }
   ```

2. Test configuration:
   ```bash
   sudo nginx -t
   ```

3. Reload nginx:
   ```bash
   sudo systemctl reload nginx
   ```

### Other Platforms

#### Netlify
Create `netlify.toml`:
```toml
[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Embedder-Policy = "require-corp"
    Cross-Origin-Opener-Policy = "same-origin"
```

#### Vercel
Create `vercel.json`:
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cross-Origin-Embedder-Policy",
          "value": "require-corp"
        },
        {
          "key": "Cross-Origin-Opener-Policy",
          "value": "same-origin"
        }
      ]
    }
  ]
}
```

#### Cloudflare Workers
```javascript
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const response = await fetch(request)
  const newResponse = new Response(response.body, response)

  newResponse.headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
  newResponse.headers.set('Cross-Origin-Opener-Policy', 'same-origin')

  return newResponse
}
```

## 🧪 Testing & Verification

### 1. Check Headers
Open your deployed app and check headers in browser DevTools:

```bash
# Using curl
curl -I https://your-domain.com

# Expected output:
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

### 2. Check Console Logs
Open browser console and look for:

```
✅ CORRECT (with headers):
[OpenCV] The OpenCV.js with simd and threads optimization is loaded now

❌ FALLBACK (without headers):
[OpenCV] The OpenCV.js with simd optimization is loaded now
[OpenCV] The OpenCV.js for wasm is loaded now
```

### 3. Verify in Console
Type in browser console:
```javascript
// Check if SharedArrayBuffer is available
typeof SharedArrayBuffer !== 'undefined'  // Should be true with headers

// Check OpenCV build info
console.log(cv.getBuildInformation());
```

## 📊 Performance Comparison

| Operation | WASM | SIMD | Threads+SIMD |
|-----------|------|------|--------------|
| Feature Detection | 40ms | 15ms | 10ms |
| Descriptor Extraction | 30ms | 12ms | 8ms |
| **Speed Improvement** | 1x | 2.5x | **4x** |

## 🚨 Troubleshooting

### Problem: threadsSimd not loading

**Solution 1: Check HTTPS**
- SharedArrayBuffer requires HTTPS (or localhost)
- HTTP won't work in production

**Solution 2: Check Headers**
```bash
curl -I https://your-domain.com | grep -i "cross-origin"
```

**Solution 3: Check Browser Console**
- Look for console warnings about SharedArrayBuffer
- Check which build actually loaded

### Problem: External resources not loading

If you load external images/videos and get CORS errors:

**Add crossorigin attribute:**
```html
<img src="external-image.jpg" crossorigin="anonymous">
<video src="external-video.mp4" crossorigin="anonymous"></video>
```

**Or relax CORP policy:**
```http
Cross-Origin-Embedder-Policy: credentialless
```

### Problem: Works locally but not in production

- **Local testing:** `python -m http.server` or `npx serve` don't add headers by default
- **Test headers locally:**
  ```bash
  npx serve -C  # Enables CORS headers
  ```
- **Production:** Must configure web server as shown above

## 🔍 Local Development

For local testing **without** threads support:
```bash
python -m http.server 8000
# Opens at http://localhost:8000
# Will use simd or wasm build (still fast!)
```

For local testing **with** threads support:
```bash
# Install a server that supports custom headers
npm install -g http-server

# Start with CORS headers
http-server -p 8000 --cors -C path/to/cert.pem -K path/to/key.pem
```

Or use the production web server (nginx/Apache) locally.

## 📚 Additional Resources

- [SharedArrayBuffer and Cross-Origin Isolation](https://web.dev/cross-origin-isolation-guide/)
- [OpenCV.js Documentation](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html)
- [WebAssembly Threads Proposal](https://github.com/WebAssembly/threads)

## ✅ Quick Checklist

- [ ] HTTPS enabled (required for SharedArrayBuffer)
- [ ] Cross-Origin headers configured on server
- [ ] `.htaccess` or nginx config included
- [ ] Server restarted after configuration
- [ ] Headers verified with curl or DevTools
- [ ] Console shows "threads optimization is loaded"
- [ ] App performance is significantly faster

---

**Note:** Even without threads support, the app works perfectly fine with the simd or wasm fallback builds. The automatic fallback ensures compatibility across all browsers and server configurations.
