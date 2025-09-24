# OtterAI Alma Linux Deployment Guide

## 🚀 Quick Fix for Database Connection Issues

Based on your error logs, here are the **immediate fixes** needed:

### 1. **Password Issue Fix**
The error `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` means your password is not properly set.

**Fix:**
```bash
# Create .env file with proper password
cd /path/to/otterai-backend
cp env.example .env

# Edit .env file and set actual password
nano .env
```

**Update these lines in .env:**
```env
DB_PASSWORD="your_actual_password_here"
DB_USER=otterai_user
```

### 2. **PostgreSQL Authentication Fix**
The error `no pg_hba.conf entry` means PostgreSQL is rejecting connections.

**Fix:**
```bash
# Edit pg_hba.conf
sudo nano /var/lib/pgsql/data/pg_hba.conf

# Add these lines at the end:
local   otterai_sales_analytics    otterai_user                    md5
host    otterai_sales_analytics    otterai_user    127.0.0.1/32   md5
host    otterai_sales_analytics    otterai_user    ::1/128        md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### 3. **Create Database and User**
```bash
# Connect as postgres user
sudo -u postgres psql

# Run these commands:
CREATE DATABASE otterai_sales_analytics;
CREATE USER otterai_user WITH PASSWORD 'your_actual_password';
GRANT ALL PRIVILEGES ON DATABASE otterai_sales_analytics TO otterai_user;
\c otterai_sales_analytics
GRANT ALL ON SCHEMA public TO otterai_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO otterai_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO otterai_user;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
\q
```

## 🔧 Complete Alma Linux Setup

### Prerequisites
- Alma Linux 8/9
- Root or sudo access
- Internet connection

### Step 1: Run Setup Script
```bash
# Make script executable
chmod +x scripts/setup-alma-linux.sh

# Run setup script
./scripts/setup-alma-linux.sh
```

### Step 2: Deploy Application
```bash
# Create application directory
sudo mkdir -p /opt/otterai
sudo chown $USER:$USER /opt/otterai

# Copy your application files
cp -r otterai-backend /opt/otterai/
cp -r otterai-admin-frontend /opt/otterai/

# Install dependencies
cd /opt/otterai/otterai-backend
npm install

cd /opt/otterai/otterai-admin-frontend
npm install
```

### Step 3: Configure Environment
```bash
# Update .env file with production values
cd /opt/otterai/otterai-backend
nano .env
```

**Required .env settings:**
```env
NODE_ENV=production
DB_HOST=localhost
DB_PORT=5432
DB_NAME=otterai_sales_analytics
DB_USER=otterai_user
DB_PASSWORD=your_secure_password
CORS_ORIGIN=https://yourdomain.com
SOCKET_CORS_ORIGIN=https://yourdomain.com
```

### Step 4: Setup Database
```bash
cd /opt/otterai/otterai-backend

# Test database connection
npm run db:fix

# Run migrations
npm run migrate

# Check migration status
npm run migrate:status
```

### Step 5: Build Frontend
```bash
cd /opt/otterai/otterai-admin-frontend
npm run build
```

### Step 6: Start with PM2
```bash
cd /opt/otterai/otterai-backend

# Start applications
npm run pm2:start

# Check status
npm run pm2:status

# View logs
npm run pm2:logs
```

## 🔍 Troubleshooting

### Database Connection Issues
```bash
# Run diagnostic script
npm run db:fix

# Test connection manually
psql -h localhost -U otterai_user -d otterai_sales_analytics

# Check PostgreSQL status
sudo systemctl status postgresql

# Check PostgreSQL logs
sudo journalctl -u postgresql -f
```

### Common Issues and Solutions

#### 1. Password Authentication Failed
```bash
# Reset user password
sudo -u postgres psql -c "ALTER USER otterai_user PASSWORD 'new_password';"
```

#### 2. Database Does Not Exist
```bash
# Create database
sudo -u postgres createdb otterai_sales_analytics
```

#### 3. Permission Denied
```bash
# Grant permissions
sudo -u postgres psql -d otterai_sales_analytics -c "GRANT ALL ON SCHEMA public TO otterai_user;"
```

#### 4. Extensions Not Found
```bash
# Enable extensions
sudo -u postgres psql -d otterai_sales_analytics -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
sudo -u postgres psql -d otterai_sales_analytics -c "CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";"
```

## 🚀 Production Deployment

### Nginx Configuration
Create `/etc/nginx/sites-available/otterai`:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### SSL Setup (Let's Encrypt)
```bash
# Install certbot
sudo dnf install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### Firewall Configuration
```bash
# Allow HTTP/HTTPS
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## 📊 Monitoring and Maintenance

### PM2 Commands
```bash
# View status
npm run pm2:status

# View logs
npm run pm2:logs

# Restart services
npm run pm2:restart

# Stop services
npm run pm2:stop

# Reload without downtime
npm run pm2:reload
```

### Database Maintenance
```bash
# Backup database
pg_dump -h localhost -U otterai_user otterai_sales_analytics > backup.sql

# Restore database
psql -h localhost -U otterai_user otterai_sales_analytics < backup.sql
```

### Log Monitoring
```bash
# View application logs
tail -f /opt/otterai/logs/backend.log
tail -f /opt/otterai/logs/frontend.log

# View system logs
sudo journalctl -u postgresql -f
sudo journalctl -u redis -f
```

## ✅ Verification Checklist

- [ ] PostgreSQL service running
- [ ] Redis service running
- [ ] Database connection successful
- [ ] Migrations completed
- [ ] Frontend built successfully
- [ ] PM2 processes running
- [ ] Nginx configuration working
- [ ] SSL certificate installed
- [ ] Firewall configured
- [ ] Logs being written
- [ ] Health check endpoint responding

## 🆘 Emergency Recovery

### If Database is Corrupted
```bash
# Stop application
npm run pm2:stop

# Restore from backup
psql -h localhost -U otterai_user otterai_sales_analytics < backup.sql

# Restart application
npm run pm2:start
```

### If Application Won't Start
```bash
# Check logs
npm run pm2:logs

# Check database connection
npm run db:fix

# Restart services
sudo systemctl restart postgresql
sudo systemctl restart redis
npm run pm2:restart
```

---

**Need Help?** Run `npm run db:fix` for automated diagnostics!

