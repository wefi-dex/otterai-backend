#!/usr/bin/env node

/**
 * Zapier Integration Setup Script
 * 
 * This script helps you set up Zapier integration by:
 * 1. Generating a long-lived API key for Zapier
 * 2. Testing webhook endpoints
 * 3. Validating authentication
 */

const jwt = require('jsonwebtoken');
const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

/**
 * Generate a long-lived JWT token for Zapier
 */
function generateZapierToken(userData) {
  const payload = {
    id: userData.id,
    email: userData.email,
    role: userData.role,
    organizationId: userData.organizationId,
    type: 'zapier'
  };

  // Generate token with 1 year expiration
  const token = jwt.sign(payload, JWT_SECRET, { 
    expiresIn: '365d' 
  });

  return token;
}

/**
 * Test webhook endpoint
 */
async function testWebhook(webhookUrl, payload) {
  try {
    log(`Testing webhook: ${webhookUrl}`, 'blue');
    
    const response = await axios.post(webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    log(`✅ Webhook test successful! Status: ${response.status}`, 'green');
    log(`Response: ${JSON.stringify(response.data, null, 2)}`, 'green');
    return true;
  } catch (error) {
    log(`❌ Webhook test failed!`, 'red');
    if (error.response) {
      log(`Status: ${error.response.status}`, 'red');
      log(`Response: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    } else {
      log(`Error: ${error.message}`, 'red');
    }
    return false;
  }
}

/**
 * Test authenticated API endpoint
 */
async function testAPIEndpoint(endpoint, token) {
  try {
    log(`Testing API endpoint: ${endpoint}`, 'blue');
    
    const response = await axios.get(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    log(`✅ API test successful! Status: ${response.status}`, 'green');
    log(`Response: ${JSON.stringify(response.data, null, 2)}`, 'green');
    return true;
  } catch (error) {
    log(`❌ API test failed!`, 'red');
    if (error.response) {
      log(`Status: ${error.response.status}`, 'red');
      log(`Response: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    } else {
      log(`Error: ${error.message}`, 'red');
    }
    return false;
  }
}

/**
 * Main setup function
 */
async function setupZapier() {
  log('🚀 Zapier Integration Setup', 'blue');
  log('============================', 'blue');
  
  // Get user information
  log('\n📝 Please provide user information for Zapier API key:', 'yellow');
  
  const userId = await question('User ID (UUID): ');
  const email = await question('Email: ');
  const role = await question('Role (admin/super_admin): ');
  const organizationId = await question('Organization ID (UUID): ');
  
  // Generate Zapier token
  log('\n🔑 Generating Zapier API key...', 'blue');
  const userData = {
    id: userId,
    email,
    role,
    organizationId
  };
  
  const zapierToken = generateZapierToken(userData);
  
  log('✅ Zapier API key generated successfully!', 'green');
  log(`Token: ${zapierToken}`, 'green');
  log('\n⚠️  IMPORTANT: Store this token securely in Zapier!', 'yellow');
  
  // Test webhook endpoints
  log('\n🧪 Testing Webhook Endpoints', 'blue');
  log('============================', 'blue');
  
  const webhookBaseUrl = `${API_BASE_URL}/api/v1/zapier/webhook`;
  
  // Test sales call completed webhook
  const salesCallPayload = {
    salesCallId: '550e8400-e29b-41d4-a716-446655440000',
    organizationId: organizationId,
    eventType: 'completed',
    data: {
      performanceScore: 85,
      saleAmount: 5000,
      duration: 1800,
      strengths: ['good rapport', 'clear communication'],
      weaknesses: ['missed closing opportunity']
    }
  };
  
  await testWebhook(`${webhookBaseUrl}/sales-call-completed`, salesCallPayload);
  
  // Test performance alert webhook
  const performanceAlertPayload = {
    userId: userId,
    organizationId: organizationId,
    alertType: 'low_performance',
    metrics: {
      performanceScore: 65,
      scriptCompliance: 70,
      conversionRate: 0.15
    },
    threshold: 75
  };
  
  await testWebhook(`${webhookBaseUrl}/performance-alert`, performanceAlertPayload);
  
  // Test API endpoints
  log('\n🧪 Testing API Endpoints', 'blue');
  log('========================', 'blue');
  
  const apiBaseUrl = '/api/v1/zapier';
  
  // Test sales calls trigger
  await testAPIEndpoint(`${apiBaseUrl}/triggers/sales-calls?limit=5`, zapierToken);
  
  // Test performance alerts trigger
  await testAPIEndpoint(`${apiBaseUrl}/triggers/performance-alerts?limit=5`, zapierToken);
  
  // Test search endpoints
  await testAPIEndpoint(`${apiBaseUrl}/search/users?limit=5`, zapierToken);
  await testAPIEndpoint(`${apiBaseUrl}/search/organizations?limit=5`, zapierToken);
  
  // Generate configuration examples
  log('\n📋 Zapier Configuration Examples', 'blue');
  log('================================', 'blue');
  
  log('\n🔧 Webhook URLs for Zapier:', 'yellow');
  log(`Sales Call Completed: ${webhookBaseUrl}/sales-call-completed`, 'green');
  log(`Performance Alert: ${webhookBaseUrl}/performance-alert`, 'green');
  
  log('\n🔧 API Endpoints for Zapier:', 'yellow');
  log(`Sales Calls Trigger: ${API_BASE_URL}${apiBaseUrl}/triggers/sales-calls`, 'green');
  log(`Performance Alerts Trigger: ${API_BASE_URL}${apiBaseUrl}/triggers/performance-alerts`, 'green');
  log(`Create Sales Call: ${API_BASE_URL}${apiBaseUrl}/actions/create-sales-call`, 'green');
  log(`Send Notification: ${API_BASE_URL}${apiBaseUrl}/actions/send-notification`, 'green');
  
  log('\n🔧 Authentication Header:', 'yellow');
  log(`Authorization: Bearer ${zapierToken}`, 'green');
  
  log('\n✅ Setup complete!', 'green');
  log('📖 See ZAPIER_INTEGRATION.md for detailed documentation', 'blue');
  
  rl.close();
}

// Handle script errors
process.on('unhandledRejection', (error) => {
  log(`❌ Unhandled error: ${error.message}`, 'red');
  process.exit(1);
});

// Run setup
if (require.main === module) {
  setupZapier().catch((error) => {
    log(`❌ Setup failed: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = {
  generateZapierToken,
  testWebhook,
  testAPIEndpoint
};
