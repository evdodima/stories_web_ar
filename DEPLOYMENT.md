# WebAR Deployment Guide

This document explains how to deploy the WebAR Image Tracking application with JavaScript obfuscation using Capistrano.

> **⚡ Important:** For optimal OpenCV performance (3-4x faster), configure Cross-Origin Isolation headers on your server. See **[OPENCV_SETUP.md](OPENCV_SETUP.md)** for detailed instructions.

## Overview

The deployment process includes:
1. **Obfuscation**: All JavaScript files are obfuscated to protect the AR engine code
2. **Build**: Static files are copied to a distribution directory
3. **Deploy**: Capistrano deploys the obfuscated build to the server
4. **Server Config**: Configure headers for optimal OpenCV performance (see OPENCV_SETUP.md)

## Prerequisites

### Local Machine
- **Ruby** (2.7+) and **Bundler**
  ```bash
  gem install bundler
  ```
- **Node.js** (16+) and **npm**
  ```bash
  node --version
  npm --version
  ```

### Server
- SSH access with public key authentication
- Web server (nginx, Apache, etc.)
- Node.js installed (for build process on server)

## Initial Setup

### 1. Install Dependencies

```bash
# Install Ruby dependencies
bundle install

# Install Node.js dependencies
npm install
```

### 2. Configure Deployment

Edit `config/deploy.rb`:
```ruby
# Update your Git repository URL
set :repo_url, 'git@github.com:yourusername/yourrepo.git'

# Update deployment path
set :deploy_to, '/var/www/webar'
```

Edit `config/deploy/production.rb`:
```ruby
# Update server details
server 'your-server.example.com',
  user: 'deploy',
  roles: %w{app web}
```

### 3. Server Setup

On your server, create the deployment directory:
```bash
sudo mkdir -p /var/www/webar
sudo chown deploy:deploy /var/www/webar
```

Configure your web server to serve from:
```
/var/www/webar/current/
```

## Building Locally

Test the obfuscation build process:

```bash
npm run build
```

This creates a `dist/` directory with:
- Obfuscated JavaScript files
- Original HTML, CSS, and JSON files
- All asset directories

## Deployment

### Quick Deploy

Use the deployment script:

```bash
# Deploy to production
./deploy.sh production

# Deploy to staging
./deploy.sh staging
```

### Manual Deploy

```bash
# Deploy to production
bundle exec cap production deploy

# Deploy to staging
bundle exec cap staging deploy
```

### Deploy Specific Branch

```bash
BRANCH=develop bundle exec cap staging deploy
```

## Deployment Flow

1. **Checkout**: Capistrano checks out code from Git
2. **Dependencies**: `npm install` runs on the server
3. **Build**: `npm run build` creates obfuscated files
4. **Copy**: Built files are copied to release directory
5. **Permissions**: File permissions are set
6. **Symlink**: Current symlink points to new release

## Obfuscation Details

### Configuration

Obfuscation settings in `build.js`:
- **String Array Encoding**: Base64 encoding for strings
- **Control Flow Flattening**: Makes code flow harder to understand
- **Dead Code Injection**: Adds fake code paths
- **Self Defending**: Prevents code formatting/debugging
- **Transform Object Keys**: Obfuscates object property names

### Protected Files

All JavaScript files are obfuscated:
- `imageTracker.js` (main entry point)
- All files in `modules/` directory:
  - Core tracking logic
  - Feature detection
  - Optical flow algorithms
  - Camera management
  - UI components
  - Database handling

### Performance Impact

The obfuscation is configured for balanced protection:
- Control flow flattening: 50% threshold (moderate impact)
- Dead code injection: 20% threshold (low impact)
- File size increase: ~30-50%
- Runtime overhead: <10%

## Rollback

If a deployment fails, rollback to previous version:

```bash
bundle exec cap production deploy:rollback
```

## Directory Structure (Server)

```
/var/www/webar/
├── current/              # Symlink to latest release
├── releases/
│   ├── 20250124120000/   # Release directories
│   ├── 20250124130000/
│   └── ...
├── repo/                 # Git repository cache
└── revisions.log         # Deployment history
```

## Web Server Configuration

### Nginx Example

```nginx
server {
    listen 80;
    server_name webar.example.com;

    root /var/www/webar/current;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Enable gzip for JS files
    gzip on;
    gzip_types application/javascript;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|json)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Apache Example

```apache
<VirtualHost *:80>
    ServerName webar.example.com
    DocumentRoot /var/www/webar/current

    <Directory /var/www/webar/current>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # Enable compression
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE application/javascript
        AddOutputFilterByType DEFLATE text/css
    </IfModule>

    # Cache static assets
    <IfModule mod_expires.c>
        ExpiresActive On
        ExpiresByType application/javascript "access plus 1 year"
        ExpiresByType text/css "access plus 1 year"
        ExpiresByType image/png "access plus 1 year"
        ExpiresByType image/jpeg "access plus 1 year"
    </IfModule>
</VirtualHost>
```

## Troubleshooting

### Build Fails on Server

```bash
# SSH into server
ssh deploy@your-server.example.com

# Navigate to current release
cd /var/www/webar/current

# Check Node.js version
node --version

# Manually run build
npm install
npm run build
```

### Permission Issues

```bash
# On server, fix permissions
sudo chown -R deploy:deploy /var/www/webar
chmod -R 755 /var/www/webar/current
```

### Obfuscation Too Aggressive

Edit `build.js` and reduce these values:
```javascript
controlFlowFlatteningThreshold: 0.3,  // Reduce from 0.5
deadCodeInjectionThreshold: 0.1,      // Reduce from 0.2
```

Then rebuild and redeploy.

## Testing Obfuscated Code

After building, test locally:

```bash
npm run build
cd dist
python -m http.server 8080
```

Open http://localhost:8080 and verify AR tracking works correctly.

## Security Notes

1. **Source Code**: Never commit `dist/` directory to Git
2. **SSH Keys**: Use dedicated deployment keys
3. **Server Access**: Limit deployment user permissions
4. **HTTPS**: Always use SSL/TLS in production
5. **Obfuscation**: Not a replacement for proper security practices

## Advanced Configuration

### Custom Obfuscation Per File

Edit `build.js` to apply different settings:

```javascript
// Less aggressive for performance-critical files
const PERFORMANCE_OPTIONS = {
  ...OBFUSCATION_OPTIONS,
  controlFlowFlattening: false,
  deadCodeInjection: false
};

// Apply to specific files
if (sourcePath.includes('OpticalFlowTracker.js')) {
  obfuscated = JavaScriptObfuscator.obfuscate(code,
    PERFORMANCE_OPTIONS);
}
```

### Multiple Environments

Create additional environment configs:
```bash
cp config/deploy/production.rb config/deploy/demo.rb
```

Then deploy:
```bash
bundle exec cap demo deploy
```

## Monitoring

Check deployment logs:
```bash
# On server
tail -f /var/www/webar/current/cap.log

# View release history
cat /var/www/webar/revisions.log
```

## Support

For issues or questions:
1. Check the logs on the server
2. Test build process locally
3. Verify server configuration
4. Review Capistrano documentation: https://capistranorb.com/
