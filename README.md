# OtterAI Sales Analytics Backend

A comprehensive Node.js Express backend API for the OtterAI Sales Analytics SaaS platform. This backend provides real-time sales call recording, analysis, and management capabilities for sales teams and managers.

## 🚀 Features

### Core Functionality
- **OtterAI Integration**: Seamless integration with OtterAI for recording and transcription
- **Real-time Analysis**: AI-powered sales call analysis against training scripts
- **Live Monitoring**: Real-time communication between managers and sales representatives
- **Multi-tenant Architecture**: Support for multiple organizations and branches
- **Role-based Access Control**: Different access levels for sales reps, managers, and admins
- **Comprehensive Analytics**: Detailed performance metrics and insights

### Key Capabilities
- Sales call recording and transcription
- Performance scoring and analysis
- Script compliance tracking
- Real-time manager interventions
- Advanced analytics and reporting
- User and organization management
- Notification system
- Webhook handling for OtterAI events

## 🏗️ Architecture

### Tech Stack
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL (production) / SQLite (development)
- **ORM**: Sequelize
- **Authentication**: JWT with refresh tokens
- **Real-time**: Socket.IO
- **Logging**: Winston
- **Validation**: Express-validator
- **Security**: Helmet, CORS, Rate limiting

### Project Structure
```
src/
├── database/
│   ├── connection.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Organization.js
│   │   ├── SalesCall.js
│   │   ├── SalesScript.js
│   │   ├── Analytics.js
│   │   ├── Notification.js
│   │   └── LiveSession.js
│   └── models/index.js
├── middleware/
│   ├── auth.js
│   ├── errorHandler.js
│   └── notFoundHandler.js
├── routes/
│   ├── auth.js
│   ├── users.js
│   ├── organizations.js
│   ├── salesCalls.js
│   ├── otterAI.js
│   ├── analytics.js
│   ├── notifications.js
│   └── admin.js
├── services/
│   └── otterAIService.js
├── socket/
│   └── socketHandler.js
├── utils/
│   └── logger.js
└── server.js
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL (for production)
- OtterAI API credentials

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd otterai-sales-analytics-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Environment Setup**
```bash
cp env.example .env
```

4. **Configure environment variables**
Edit `.env` file with your configuration:
```env
# Server Configuration
NODE_ENV=development
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=otterai_sales_analytics
DB_USER=postgres
DB_PASSWORD=your_password

# OtterAI Configuration
OTTERAI_API_KEY=your_otterai_api_key
OTTERAI_API_URL=https://api.otter.ai
OTTERAI_WEBHOOK_SECRET=your_webhook_secret

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=24h
```

5. **Database Setup**
```bash
# For development (SQLite)
npm run dev

# For production (PostgreSQL)
# Create database and run migrations
npm run migrate
```

6. **Start the server**
```bash
# Development
npm run dev

# Production
npm start
```

## 🔗 Integrations

### Zapier Integration

This backend includes comprehensive Zapier integration for automating workflows. See the [Zapier Integration Guide](ZAPIER_INTEGRATION.md) for detailed setup instructions and examples.

**Key Features:**
- **Webhook Triggers**: Automatically trigger actions when sales calls are completed or performance alerts are generated
- **Polling Triggers**: Retrieve sales calls and performance data for processing
- **Actions**: Create sales calls and send notifications from external systems
- **Search Endpoints**: Dynamic dropdown data for user and organization selection

**Common Use Cases:**
- Sales call completion → CRM update
- Performance alerts → Slack notifications
- Calendar events → Sales call creation
- Sales data → Google Sheets reporting

## 📚 API Documentation

#### POST `/api/v1/auth/login`
User login with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "sales_representative"
    },
    "accessToken": "jwt_token",
    "refreshToken": "refresh_token",
    "expiresIn": "24h"
  }
}
```

#### POST `/api/v1/auth/register`
Register new user.

**Request:**
```json
{
  "email": "newuser@example.com",
  "password": "password123",
  "firstName": "Jane",
  "lastName": "Smith",
  "organizationId": "org_uuid",
  "role": "sales_representative"
}
```

### OtterAI Integration Endpoints

#### POST `/api/v1/otterai/start-recording`
Start a new OtterAI recording session.

**Request:**
```json
{
  "salesCallId": "call_uuid",
  "options": {
    "language": "en-US"
  }
}
```

#### POST `/api/v1/otterai/analyze/:salesCallId`
Analyze a sales call against training scripts.

**Request:**
```json
{
  "recordingId": "otterai_recording_id"
}
```

### Sales Calls Endpoints

#### GET `/api/v1/sales-calls`
Get all sales calls for organization.

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)
- `status`: Filter by status
- `outcome`: Filter by outcome
- `startDate`: Start date filter
- `endDate`: End date filter

#### POST `/api/v1/sales-calls`
Create new sales call.

**Request:**
```json
{
  "customerName": "John Customer",
  "customerPhone": "+1234567890",
  "customerEmail": "customer@example.com",
  "appointmentDate": "2024-01-15T10:00:00Z",
  "salesRepresentativeId": "user_uuid",
  "notes": "Initial consultation"
}
```

### Analytics Endpoints

#### GET `/api/v1/analytics/overview`
Get analytics overview for organization.

**Query Parameters:**
- `startDate`: Start date for analysis
- `endDate`: End date for analysis

**Response:**
```json
{
  "success": true,
  "data": {
    "totalCalls": 150,
    "completedCalls": 120,
    "successfulSales": 45,
    "totalRevenue": 125000,
    "averageCallDuration": 1800,
    "averagePerformanceScore": 0.85,
    "conversionRate": 37.5,
    "topPerformers": [...]
  }
}
```

### Real-time Communication

The backend supports real-time communication via Socket.IO for:
- Live session management
- Manager interventions
- Real-time messaging
- Audio streaming

**Socket Events:**
- `join_live_session`: Join a live monitoring session
- `manager_intervention`: Send intervention to sales rep
- `sales_rep_response`: Sales rep response to manager
- `audio_stream`: Real-time audio streaming

## 🔐 Authentication & Authorization

### JWT Token Structure
```json
{
  "userId": "user_uuid",
  "email": "user@example.com",
  "role": "sales_representative",
  "organizationId": "org_uuid",
  "iat": 1642234567,
  "exp": 1642320967
}
```

### Role-based Access Control
- **sales_representative**: Can manage own sales calls and view own analytics
- **sales_manager**: Can manage team members, view team analytics, and provide live interventions
- **admin**: Can manage organization settings and users
- **super_admin**: Full system access across all organizations

## 🗄️ Database Schema

### Core Tables
- **users**: User accounts and profiles
- **organizations**: Multi-tenant organization data
- **sales_calls**: Sales call records and analysis
- **sales_scripts**: Training scripts for AI analysis
- **analytics**: Aggregated performance data
- **notifications**: User notifications and alerts
- **live_sessions**: Real-time monitoring sessions

## 🔧 Configuration

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |
| `DB_HOST` | Database host | `localhost` |
| `DB_NAME` | Database name | `otterai_sales_analytics` |
| `OTTERAI_API_KEY` | OtterAI API key | Required |
| `JWT_SECRET` | JWT signing secret | Required |
| `REDIS_URL` | Redis connection URL | Optional |

### Rate Limiting
- **Default**: 100 requests per 15 minutes per IP
- **Configurable**: Via `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_MS`

## 🚀 Deployment

### Production Deployment
1. Set `NODE_ENV=production`
2. Configure PostgreSQL database
3. Set up Redis for caching (optional)
4. Configure OtterAI webhook URL
5. Set up SSL/TLS certificates
6. Use PM2 or similar process manager

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 📊 Monitoring & Logging

### Logging
- **Winston**: Structured logging with multiple transports
- **Log Levels**: error, warn, info, debug
- **Log Files**: app.log, error.log, exceptions.log

### Health Check
```bash
GET /health
```

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "uptime": 3600,
  "environment": "production"
}
```

## 🔒 Security Features

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: DDoS protection
- **Input Validation**: Request validation
- **SQL Injection Protection**: Sequelize ORM
- **JWT Authentication**: Secure token-based auth
- **Password Hashing**: bcrypt with salt rounds

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation

## 🔄 API Versioning

The API uses versioning in the URL path:
- Current version: `/api/v1/`
- Future versions: `/api/v2/`, etc.

## 📈 Performance Considerations

- Database indexing on frequently queried fields
- Connection pooling for database connections
- Caching for analytics data
- Pagination for large datasets
- Compression middleware for responses
- Rate limiting to prevent abuse
