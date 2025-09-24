#!/bin/bash

# OtterAI Alma Linux Setup Script
# This script sets up PostgreSQL, Redis, and Node.js for OtterAI deployment

set -e

echo "🚀 Setting up OtterAI on Alma Linux..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root for security reasons"
   exit 1
fi

# Update system packages
print_status "Updating system packages..."
sudo dnf update -y

# Install Node.js 18+
print_status "Installing Node.js 18..."
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs

# Verify Node.js installation
node_version=$(node --version)
print_status "Node.js version: $node_version"

# Install PostgreSQL 15+
print_status "Installing PostgreSQL 15..."
sudo dnf install -y postgresql15-server postgresql15-contrib postgresql15-devel

# Initialize PostgreSQL
print_status "Initializing PostgreSQL..."
sudo postgresql-setup --initdb

# Enable and start PostgreSQL
print_status "Starting PostgreSQL service..."
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Install Redis
print_status "Installing Redis..."
sudo dnf install -y redis

# Enable and start Redis
print_status "Starting Redis service..."
sudo systemctl enable redis
sudo systemctl start redis

# Install PM2 globally
print_status "Installing PM2 process manager..."
sudo npm install -g pm2

# Install additional dependencies
print_status "Installing additional dependencies..."
sudo dnf install -y git curl wget unzip

# Configure PostgreSQL
print_status "Configuring PostgreSQL..."

# Create database and user
sudo -u postgres psql << EOF
-- Create database
CREATE DATABASE otterai_sales_analytics;

-- Create user
CREATE USER otterai_user WITH PASSWORD 'your_secure_password_here';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE otterai_sales_analytics TO otterai_user;

-- Grant schema privileges
\c otterai_sales_analytics
GRANT ALL ON SCHEMA public TO otterai_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO otterai_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO otterai_user;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

\q
EOF

# Configure pg_hba.conf for local connections
print_status "Configuring PostgreSQL authentication..."
sudo cp /var/lib/pgsql/data/pg_hba.conf /var/lib/pgsql/data/pg_hba.conf.backup

# Add local connection rules
sudo tee -a /var/lib/pgsql/data/pg_hba.conf > /dev/null << EOF

# OtterAI local connections
local   otterai_sales_analytics    otterai_user                    md5
host    otterai_sales_analytics    otterai_user    127.0.0.1/32   md5
host    otterai_sales_analytics    otterai_user    ::1/128        md5
EOF

# Configure postgresql.conf
print_status "Configuring PostgreSQL settings..."
sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = 'localhost'/" /var/lib/pgsql/data/postgresql.conf

# Restart PostgreSQL to apply changes
print_status "Restarting PostgreSQL..."
sudo systemctl restart postgresql

# Test database connection
print_status "Testing database connection..."
sudo -u postgres psql -d otterai_sales_analytics -c "SELECT version();" > /dev/null
if [ $? -eq 0 ]; then
    print_status "✅ Database connection successful"
else
    print_error "❌ Database connection failed"
    exit 1
fi

# Test Redis connection
print_status "Testing Redis connection..."
redis-cli ping > /dev/null
if [ $? -eq 0 ]; then
    print_status "✅ Redis connection successful"
else
    print_error "❌ Redis connection failed"
    exit 1
fi

# Create application directory
print_status "Creating application directory..."
sudo mkdir -p /opt/otterai
sudo chown $USER:$USER /opt/otterai

# Set up firewall
print_status "Configuring firewall..."
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=4000/tcp
sudo firewall-cmd --reload

print_status "🎉 Alma Linux setup completed successfully!"
print_status ""
print_status "📋 Next steps:"
print_status "1. Copy your application files to /opt/otterai"
print_status "2. Update the .env file with your actual passwords"
print_status "3. Run: cd /opt/otterai/otterai-backend && npm install"
print_status "4. Run: npm run db:setup"
print_status "5. Run: npm run migrate"
print_status "6. Start the application with PM2"
print_status ""
print_warning "⚠️  Remember to:"
print_warning "- Change the database password in .env file"
print_warning "- Update CORS_ORIGIN with your domain"
print_warning "- Set up SSL certificates"
print_warning "- Configure proper backup strategy"

