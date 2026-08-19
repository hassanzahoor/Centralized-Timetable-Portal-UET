# University Centralized Timetable Deployment & Hosting Guide

This guide explains how to buy a domain & web hosting, configure the server, deploy the application live, and link your custom domain (e.g. `timetable.university.edu` or `univtimetable.com`).

---

## 1. Domain Name & Hosting Setup

### Step A: Purchasing a Domain Name
1. Go to a domain registrar (e.g., Namecheap, GoDaddy, Cloudflare, Google Domains/Porkbun).
2. Register your desired domain name (e.g., `universitytimetable.org` or your official university subdomain `timetable.youruniv.edu`).

### Step B: Choosing Web Hosting
Select one of the following two standard hosting options:

#### Option 1: Shared Web Hosting with cPanel (Easiest - e.g., Hostinger, Namecheap, Bluehost)
- Look for hosting that supports **Node.js Selector** (cPanel Setup Node.js App).
- Cost: ~$3 - $10 / month.

#### Option 2: Cloud VPS Hosting (Recommended for Universities - e.g., DigitalOcean, AWS EC2, Linode, Hetzner)
- Operating System: **Ubuntu 22.04 LTS or 24.04 LTS**.
- Cost: ~$5 - $12 / month.

---

## 2. Deployment Instructions (Cloud VPS / Ubuntu Server)

### Step 1: Install Node.js & Git on Server
Run the following commands on your Ubuntu VPS terminal:
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git build-essential nginx
```

### Step 2: Upload or Clone the Project
Upload the project files to `/var/www/timetable` or clone via Git:
```bash
cd /var/www
git clone <your-repository-url> timetable
cd timetable
npm install --production
```

### Step 3: Create Environment Configuration
Create the `.env` file:
```bash
nano .env
```
Paste the configuration:
```env
PORT=3000
SESSION_SECRET=create_a_strong_random_secret_here_12345
DB_PATH=./db/timetable.sqlite
NODE_ENV=production
```

### Step 4: Run Application with PM2 Process Manager
Install PM2 to keep the server running 24/7 in the background:
```bash
sudo npm install -y -g pm2
pm2 start server.js --name "university-timetable"
pm2 save
pm2 startup
```

---

## 3. Configuring Custom Domain & SSL (HTTPS)

### Step 1: Point Domain DNS to Server IP
In your domain registrar dashboard (Cloudflare / Namecheap):
- Add an **A Record**:
  - Name: `@` (or `timetable`)
  - Value: `YOUR_SERVER_PUBLIC_IP`
  - TTL: Auto

### Step 2: Nginx Reverse Proxy Setup
Edit `/etc/nginx/sites-available/timetable`:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/timetable /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 3: Enable Free SSL Certificate (HTTPS)
Use Certbot:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 4. Deployment via cPanel (Shared Hosting Alternative)

If using cPanel shared hosting:
1. Log into **cPanel**.
2. Click **"Setup Node.js App"**.
3. Click **"Create Application"**:
   - Node.js Version: 20.x or higher
   - Application mode: Production
   - Application root: `timetable`
   - Application URL: `yourdomain.com`
   - Application startup file: `server.js`
4. Upload project zip file to File Manager into `timetable` folder.
5. Click **"Run NPM Install"** in the cPanel Node.js dashboard.
6. Click **"Restart Application"**.

---

## 5. Security & Maintenance

- **Database Backup**: The entire database is stored safely in `db/timetable.sqlite`. You can set up a daily cron job to copy `db/timetable.sqlite` to a backup location.
- **Default Credentials**: Change default passwords after initial login!
