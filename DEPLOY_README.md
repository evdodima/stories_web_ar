# WebAR Deployment Guide

Simple rsync-based deployment for the WebAR Image Tracking application.

## Quick Start

### 1. Setup Deployment Configuration

Copy the example config and customize it:

```bash
cp deploy.config.example deploy.config
nano deploy.config
```

Edit the configuration:
```bash
# Server details
DEPLOY_USER="your_username"
DEPLOY_HOST="your-server.com"
DEPLOY_PATH="/var/www/webar"

# Optional: Custom SSH port (default: 22)
DEPLOY_PORT="22"

# Optional: SSH key path
DEPLOY_KEY="~/.ssh/id_rsa"
```

### 2. Deploy

Run the deployment script:

```bash
./deploy.sh
```

The script will:
1. ✅ Check dependencies (Node.js, npm, rsync)
2. 📦 Install npm packages if needed
3. 🔨 Build the application (runs `npm run build`)
4. ✔️ Validate the build (syntax check, required files)
5. 🚀 Deploy to server with rsync
6. ✅ Verify deployment

## What Gets Deployed

The `dist/` directory contents:
- `index.html` - Main HTML file (mobile-optimized)
- `webar-bundle.js` - Obfuscated JavaScript bundle
- `styles.css` - Minified CSS
- `target_database.json` - AR target database
- `targets/` - Target images directory

## Server Requirements

### SSH Access
- SSH access to the server
- Public key authentication (recommended)
- User with write permissions to deployment path

### Web Server
Configure your web server to serve from the deployment path.

#### Nginx Example

```nginx
server {
    listen 80;
    server_name ar.yourdomain.com;

    root /var/www/webar;
    index index.html;

    # Handle SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Gzip compression
    gzip on;
    gzip_types application/javascript text/css application/json;
    gzip_min_length 1000;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|json)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
}
```

#### Apache Example

```apache
<VirtualHost *:80>
    ServerName ar.yourdomain.com
    DocumentRoot /var/www/webar

    <Directory /var/www/webar>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted

        # SPA routing
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>

    # Enable compression
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE application/javascript text/css
    </IfModule>

    # Cache static assets
    <IfModule mod_expires.c>
        ExpiresActive On
        ExpiresByType application/javascript "access plus 1 year"
        ExpiresByType text/css "access plus 1 year"
    </IfModule>
</VirtualHost>
```

## Advanced Usage

### Custom Configuration File

Use a different config file:

```bash
DEPLOY_CONFIG=deploy.staging.config ./deploy.sh
```

### Environment-Specific Configs

Create multiple configuration files:

```bash
cp deploy.config.example deploy.production.config
cp deploy.config.example deploy.staging.config
```

Deploy to different environments:

```bash
# Production
DEPLOY_CONFIG=deploy.production.config ./deploy.sh

# Staging
DEPLOY_CONFIG=deploy.staging.config ./deploy.sh
```

### Exclude Additional Files

Add to your `deploy.config`:

```bash
EXCLUDE_PATTERNS=".env .backup *.log"
```

## Troubleshooting

### Permission Denied

Ensure your SSH key is added to the server:

```bash
ssh-copy-id -i ~/.ssh/id_rsa user@your-server.com
```

Or manually add your public key to `~/.ssh/authorized_keys` on the server.

### Build Fails

Test the build locally:

```bash
npm run build
cd dist
python -m http.server 8000
```

Check the bundle syntax:

```bash
node -c dist/webar-bundle.js
```

### rsync Fails

Test SSH connection:

```bash
ssh user@your-server.com
```

Test rsync manually:

```bash
rsync -avz --dry-run dist/ user@your-server.com:/var/www/webar/
```

### Remote Path Doesn't Exist

Create the directory on the server:

```bash
ssh user@your-server.com 'mkdir -p /var/www/webar'
```

Set proper permissions:

```bash
ssh user@your-server.com 'sudo chown -R $USER:$USER /var/www/webar'
```

## Security Notes

1. **Never commit `deploy.config`** - It's already in `.gitignore`
2. **Use SSH keys** instead of passwords
3. **Restrict SSH access** - Use firewall rules
4. **Enable HTTPS** - Use Let's Encrypt for free SSL
5. **Keep server updated** - Regular security updates

## Build Validation

The deploy script automatically validates:

✅ Required files exist (`index.html`, `webar-bundle.js`, `styles.css`)
✅ JavaScript syntax is valid
✅ Bundle size is reported
✅ Remote files are verified after deployment

## Continuous Integration

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy WebAR

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Create deploy config
        run: |
          echo "DEPLOY_USER=${{ secrets.DEPLOY_USER }}" > deploy.config
          echo "DEPLOY_HOST=${{ secrets.DEPLOY_HOST }}" >> deploy.config
          echo "DEPLOY_PATH=${{ secrets.DEPLOY_PATH }}" >> deploy.config

      - name: Setup SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SSH_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          echo "DEPLOY_KEY=~/.ssh/deploy_key" >> deploy.config

      - name: Deploy
        run: ./deploy.sh
```

Add secrets in GitHub Settings → Secrets:
- `DEPLOY_USER`
- `DEPLOY_HOST`
- `DEPLOY_PATH`
- `SSH_KEY` (private key content)

## Support

For issues:
1. Check the script output for specific error messages
2. Test build locally with `npm run build`
3. Verify SSH access with `ssh user@server`
4. Check server logs

## Migration from Capistrano

If you were using Capistrano before:

1. Remove Capistrano files (already done):
   ```bash
   rm -rf .capistrano/ config/deploy/ Capfile Gemfile
   ```

2. Follow the Quick Start above to set up rsync deployment

3. The new deployment is simpler and doesn't require Ruby dependencies
