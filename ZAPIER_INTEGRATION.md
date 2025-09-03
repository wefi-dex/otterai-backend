# Zapier Integration Guide

This guide explains how to integrate your OtterAI Sales Analytics backend with Zapier to automate workflows and connect with other applications.

## Overview

Zapier allows you to create automated workflows (Zaps) that connect your OtterAI Sales Analytics system with thousands of other apps. This integration enables you to:

- **Automate notifications** when sales calls are completed
- **Sync data** with CRM systems (Salesforce, HubSpot, etc.)
- **Send alerts** via Slack, email, or SMS
- **Create reports** in Google Sheets or Excel
- **Trigger actions** based on performance metrics
- **Integrate with calendar systems** for appointment scheduling

## Authentication

### API Key Authentication

For Zapier integration, you'll need to use API key authentication. Create a dedicated API key for Zapier:

1. **Generate API Key**: Use your admin account to generate a JWT token
2. **Set Expiration**: Set a long expiration time (e.g., 1 year) for Zapier tokens
3. **Store Securely**: Store the API key securely in Zapier's authentication settings

### Authentication Headers

Include the following headers in all Zapier requests:

```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

## Available Endpoints

### Webhook Endpoints (Triggers)

These endpoints can be used as webhook triggers in Zapier:

#### 1. Sales Call Completed Webhook

**Endpoint**: `POST /api/v1/zapier/webhook/sales-call-completed`

**Purpose**: Triggered when a sales call is completed and analyzed

**Payload**:
```json
{
  "salesCallId": "uuid",
  "organizationId": "uuid",
  "eventType": "completed|analyzed|failed",
  "data": {
    "performanceScore": 85,
    "saleAmount": 5000,
    "duration": 1800,
    "strengths": ["good rapport", "clear communication"],
    "weaknesses": ["missed closing opportunity"]
  }
}
```

#### 2. Performance Alert Webhook

**Endpoint**: `POST /api/v1/zapier/webhook/performance-alert`

**Purpose**: Triggered when performance metrics fall below thresholds

**Payload**:
```json
{
  "userId": "uuid",
  "organizationId": "uuid",
  "alertType": "low_performance|high_performance|script_violation|objection_handling",
  "metrics": {
    "performanceScore": 65,
    "scriptCompliance": 70,
    "conversionRate": 0.15
  },
  "threshold": 75
}
```

### Polling Endpoints (Triggers)

These endpoints can be used for polling triggers in Zapier:

#### 1. Get Sales Calls

**Endpoint**: `GET /api/v1/zapier/triggers/sales-calls`

**Purpose**: Retrieve completed sales calls for processing

**Query Parameters**:
- `organizationId` (optional): Filter by organization
- `status` (default: "completed"): Filter by call status
- `startDate` (optional): Start date for filtering
- `endDate` (optional): End date for filtering
- `limit` (default: 50): Number of records to return

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "customerName": "John Doe",
      "customerEmail": "john@example.com",
      "customerPhone": "+1234567890",
      "appointmentDate": "2024-01-15T10:00:00Z",
      "callStartTime": "2024-01-15T10:00:00Z",
      "callEndTime": "2024-01-15T10:30:00Z",
      "duration": 1800,
      "status": "completed",
      "outcome": "sale",
      "saleAmount": 5000,
      "performanceScore": 85,
      "salesRepresentative": {
        "id": "uuid",
        "firstName": "Jane",
        "lastName": "Smith",
        "email": "jane@company.com"
      },
      "organization": {
        "id": "uuid",
        "name": "Klaus Roofing Systems"
      }
    }
  ]
}
```

#### 2. Get Performance Alerts

**Endpoint**: `GET /api/v1/zapier/triggers/performance-alerts`

**Purpose**: Retrieve performance alerts for processing

**Query Parameters**:
- `organizationId` (optional): Filter by organization
- `alertType` (optional): Filter by alert type
- `startDate` (optional): Start date for filtering
- `endDate` (optional): End date for filtering
- `limit` (default: 50): Number of records to return

### Action Endpoints

These endpoints can be used as actions in Zapier:

#### 1. Create Sales Call

**Endpoint**: `POST /api/v1/zapier/actions/create-sales-call`

**Purpose**: Create a new sales call from external systems

**Payload**:
```json
{
  "customerName": "John Doe",
  "customerEmail": "john@example.com",
  "customerPhone": "+1234567890",
  "appointmentDate": "2024-01-15T10:00:00Z",
  "salesRepresentativeId": "uuid",
  "organizationId": "uuid",
  "notes": "Initial consultation"
}
```

#### 2. Send Notification

**Endpoint**: `POST /api/v1/zapier/actions/send-notification`

**Purpose**: Send notifications to users

**Payload**:
```json
{
  "userId": "uuid",
  "organizationId": "uuid",
  "title": "Performance Alert",
  "message": "Your performance score is below the threshold",
  "priority": "high",
  "type": "performance_alert"
}
```

### Search Endpoints

These endpoints provide dynamic dropdown data for Zapier:

#### 1. Search Users

**Endpoint**: `GET /api/v1/zapier/search/users`

**Purpose**: Get users for dropdown selection

**Query Parameters**:
- `organizationId` (optional): Filter by organization
- `role` (optional): Filter by user role
- `query` (optional): Search query

#### 2. Search Organizations

**Endpoint**: `GET /api/v1/zapier/search/organizations`

**Purpose**: Get organizations for dropdown selection

**Query Parameters**:
- `query` (optional): Search query

## Common Zapier Workflows

### 1. Sales Call Completion → CRM Update

**Trigger**: Sales Call Completed Webhook
**Action**: Update CRM (Salesforce, HubSpot, etc.)

**Setup**:
1. Use the webhook endpoint as trigger
2. Map sales call data to CRM fields
3. Create or update customer records
4. Log the interaction

### 2. Performance Alert → Slack Notification

**Trigger**: Performance Alert Webhook
**Action**: Send Slack message

**Setup**:
1. Use the performance alert webhook as trigger
2. Format message with performance metrics
3. Send to appropriate Slack channel
4. Include action buttons for follow-up

### 3. Low Performance → Email to Manager

**Trigger**: Performance Alert (low_performance)
**Action**: Send email via Gmail/Outlook

**Setup**:
1. Filter for low performance alerts
2. Get manager email from user data
3. Send detailed performance report
4. Include improvement suggestions

### 4. Calendar Event → Create Sales Call

**Trigger**: New Google Calendar event
**Action**: Create Sales Call

**Setup**:
1. Monitor calendar for new events
2. Extract customer information from event
3. Create sales call record
4. Assign to appropriate sales rep

### 5. Sales Call Data → Google Sheets Report

**Trigger**: Sales Call Completed (polling)
**Action**: Add row to Google Sheets

**Setup**:
1. Poll for completed sales calls
2. Extract key metrics
3. Add row to spreadsheet
4. Include performance scores and outcomes

## Error Handling

### Common Error Responses

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "details": []
  }
}
```

### Error Codes

- `VALIDATION_ERROR`: Invalid input data
- `AUTHENTICATION_FAILED`: Invalid or expired token
- `PERMISSION_DENIED`: Insufficient permissions
- `RESOURCE_NOT_FOUND`: Requested resource doesn't exist
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTERNAL_SERVER_ERROR`: Server error

### Retry Logic

Zapier will automatically retry failed requests with exponential backoff. Configure retry settings based on your needs:

- **Immediate retries**: 3 attempts
- **Delayed retries**: Up to 24 hours
- **Maximum retries**: 10 attempts

## Security Considerations

### API Key Management

1. **Rotate regularly**: Change API keys every 6-12 months
2. **Scope permissions**: Use role-based access control
3. **Monitor usage**: Track API key usage and revoke if compromised
4. **Secure storage**: Store API keys securely in Zapier

### Data Privacy

1. **PII handling**: Be careful with customer data in external systems
2. **Data retention**: Follow your organization's data retention policies
3. **Audit trails**: Log all Zapier interactions for compliance

## Testing Your Integration

### 1. Test Webhook Endpoints

Use tools like Postman or curl to test webhook endpoints:

```bash
curl -X POST https://your-api.com/api/v1/zapier/webhook/sales-call-completed \
  -H "Content-Type: application/json" \
  -d '{
    "salesCallId": "test-uuid",
    "organizationId": "test-org-uuid",
    "eventType": "completed",
    "data": {
      "performanceScore": 85,
      "saleAmount": 5000
    }
  }'
```

### 2. Test API Endpoints

Test authenticated endpoints with your API key:

```bash
curl -X GET https://your-api.com/api/v1/zapier/triggers/sales-calls \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

### 3. Monitor Logs

Check your application logs for Zapier events:

```bash
tail -f logs/app.log | grep "Zapier Event"
```

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify API key is valid and not expired
   - Check user permissions and role
   - Ensure proper Authorization header format

2. **Webhook Failures**
   - Verify webhook URL is accessible
   - Check payload format matches expected schema
   - Monitor server logs for errors

3. **Rate Limiting**
   - Implement proper retry logic
   - Monitor API usage limits
   - Contact support if limits are too restrictive

4. **Data Mapping Issues**
   - Verify field names match exactly
   - Check data types (string vs number)
   - Test with sample data first

### Getting Help

1. **Check logs**: Review application logs for detailed error information
2. **Test endpoints**: Use Postman or curl to test individual endpoints
3. **Verify data**: Ensure data format matches expected schema
4. **Contact support**: Reach out with specific error messages and logs

## Best Practices

### 1. Start Simple

Begin with basic workflows and gradually add complexity:
- Start with simple notifications
- Add data synchronization
- Implement complex business logic

### 2. Monitor Performance

- Track webhook response times
- Monitor API usage and limits
- Set up alerts for failures

### 3. Document Workflows

- Document each Zap's purpose and configuration
- Include troubleshooting steps
- Keep track of field mappings

### 4. Test Thoroughly

- Test with real data before going live
- Verify error handling works correctly
- Test edge cases and boundary conditions

### 5. Plan for Scale

- Consider rate limits and quotas
- Plan for data volume growth
- Design for reliability and redundancy

## Example Zap Configurations

### Sales Call to Slack Notification

**Trigger**: Webhook (Sales Call Completed)
**Action**: Slack (Send Channel Message)

**Field Mapping**:
- Channel: `#sales-alerts`
- Message: `New sales call completed for {{customerName}} by {{salesRepresentative.firstName}} {{salesRepresentative.lastName}}. Performance Score: {{performanceScore}}/100. Sale Amount: ${{saleAmount}}`

### Performance Alert to Email

**Trigger**: Webhook (Performance Alert)
**Action**: Gmail (Send Email)

**Field Mapping**:
- To: `{{user.email}}`
- Subject: `Performance Alert: {{alertType}}`
- Body: `Dear {{user.firstName}}, your performance metrics have triggered an alert. Please review your dashboard for details.`

This integration guide provides everything you need to connect your OtterAI Sales Analytics backend with Zapier for powerful automation workflows.
