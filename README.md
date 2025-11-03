# License Management & Reseller System

A comprehensive backend system for managing applications, licenses, resellers, and payments. Built with Node.js, Express.js, MongoDB, and Razorpay integration.

## 🚀 Features

### Core Features
- **User Management**: Registration, login with JWT authentication
- **Email Validation**: Blocks temporary/fake email addresses
- **Plan System**: Free (limited) and Premium (unlimited) plans
- **App Management**: Auto-generated AppId and AppSecret, customizable settings
- **License Management**: Create, manage, ban/unban, update expiry, revoke licenses
- **Reseller System**: Dashboard with controlled permissions for license management
- **Client System**: Registration and login with HWID validation
- **Payment Integration**: Razorpay for premium plan upgrades
- **Payment Tracking**: Complete payment history and analytics stored in MongoDB
- **Webhook Support**: Real-time payment status updates via Razorpay webhooks
- **Refund Processing**: Handle refunds with automatic record updates
- **Custom Error Messages**: Editable per-app error messages
- **Rate Limiting**: Protection against abuse
- **Security**: Helmet, CORS, input validation, password hashing

### Plan Limitations
| Feature | Free Plan | Premium Plan |
|---------|-----------|--------------|
| Apps | 2 max | Unlimited |
| Licenses per App | 30 max | Unlimited |
| Resellers per User | 1 max | Unlimited |
| Custom Error Messages | ✅ | ✅ |
| HWID Lock | ✅ | ✅ |
| Payment Features | ❌ | ✅ |

## 📋 Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or MongoDB Atlas)
- Razorpay account (for payment integration)

## 🛠️ Installation & Setup

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd license-management-system
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and configure the following variables:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/license_management

# JWT Secret (change this!)
JWT_SECRET=your_super_secret_jwt_key_here_change_in_production

# Server Port
PORT=3000

# Node Environment
NODE_ENV=development

# Razorpay Configuration
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret

# Email Configuration (Optional)
EMAIL_SERVICE=gmail
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Premium Plan Pricing (in paisa for Razorpay)
PREMIUM_PLAN_MONTHLY_PRICE=49900  # ₹499/month
PREMIUM_PLAN_YEARLY_PRICE=499900   # ₹4999/year (save 17%)
```

### 3. Start MongoDB

Make sure MongoDB is running locally or update `MONGODB_URI` for MongoDB Atlas.

### 4. Start the Server

```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000`

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api
```

### Authentication
Most endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## 🧪 Testing with Postman

### Step 1: User Registration
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "Password123"
}
```

### Step 2: User Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "Password123"
}
```

Copy the `token` from the response for subsequent requests.

### Step 3: Create an App
```http
POST /api/apps
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "name": "My First App"
}
```

The response will include auto-generated `appId` and `appSecret`.

### Step 4: Create a License
```http
POST /api/licenses
Authorization: Bearer <your_token>
Content-Type: application/json

  {
    "app": "<app_id_from_previous_step>",
    "expiresAt": "2024-12-31T23:59:59.000Z",
    "note": "Test license"
  }
```

### Step 5: Create a Reseller
```http
POST /api/resellers
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "user": "<user_id_of_reseller>",
  "app": "<app_id>",
  "licenseLimit": 10
}
```

### Step 6: Test Razorpay Integration
```http
POST /api/payments/razorpay/create-order
Authorization: Bearer <your_token>
```

### Step 7: Update Error Messages
```http
PUT /api/apps/<app_id>/error-messages
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "keyNotFound": "Custom message: Invalid license key",
  "usernameTaken": "Custom message: Username already exists"
}
```

### Step 8: Test Client Registration
```http
POST /api/clients/register
Content-Type: application/json

{
  "username": "testuser",
  "password": "password123",
  "licenseKey": "<license_key_from_step_4>",
  "hwid": "unique-hardware-id"
}
```

### Step 9: Test Client Login
```http
POST /api/clients/login
Content-Type: application/json

{
  "username": "testuser",
  "password": "password123",
  "hwid": "unique-hardware-id",
  "appId": "<app_id>",
  "appSecret": "<app_secret>"
}
```

## 📊 API Endpoints Reference

### Authentication Routes
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get user profile

### App Management Routes
- `POST /api/apps` - Create new app
- `GET /api/apps` - Get user's apps
- `GET /api/apps/:id` - Get single app
- `PUT /api/apps/:id` - Update app
- `DELETE /api/apps/:id` - Delete app
- `GET /api/apps/:id/error-messages` - Get app error messages
- `PUT /api/apps/:id/error-messages` - Update error messages
- `GET /api/apps/:id/stats` - Get app statistics

### License Management Routes
- `POST /api/licenses` - Create new license
- `GET /api/licenses` - Get licenses (with pagination)
- `GET /api/licenses/:id` - Get single license
- `PUT /api/licenses/:id` - Update license
- `DELETE /api/licenses/:id` - Delete license
- `PATCH /api/licenses/:id/toggle-ban` - Ban/unban license

### Reseller Management Routes
- `POST /api/resellers` - Create new reseller
- `GET /api/resellers` - Get resellers
- `GET /api/resellers/:id` - Get single reseller
- `PUT /api/resellers/:id` - Update reseller
- `DELETE /api/resellers/:id` - Delete reseller
- `GET /api/resellers/dashboard/data` - Get reseller dashboard

### Client Routes (for end-users)
- `POST /api/clients/register` - Register new client
- `POST /api/clients/login` - Client login
- `POST /api/clients/validate-session` - Validate session
- `GET /api/clients` - Get clients (owner only)
- `PATCH /api/clients/:id/toggle-ban` - Ban/unban client
- `PATCH /api/clients/:id/extend` - Extend subscription

### Payment Routes
- `POST /api/payments/razorpay/create-order` - Create payment order
- `POST /api/payments/razorpay/verify` - Verify payment
- `GET /api/payments/history` - Get payment history
- `GET /api/payments/pricing` - Get pricing info
- `POST /api/payments/cancel-subscription` - Cancel subscription

## 🔧 Configuration Options

### App Settings
- **HWID Lock**: Lock licenses to specific hardware IDs
- **Custom License Keys**: Allow custom license key generation
- **Pause/Unpause**: Temporarily disable app functionality

### Error Message Customization
Each app can customize the following error messages:
- App disabled message
- Username taken message
- Invalid license key message
- HWID mismatch message
- And many more...

### Reseller Permissions
- **Create**: Can create new licenses
- **Ban/Unban**: Can ban/unban licenses
- **Edit Expiry**: Can modify license expiration dates
- **Delete**: Cannot delete licenses (owner only)

## 🔒 Security Features

- JWT-based authentication
- Rate limiting on all endpoints
- Input validation and sanitization
- Password hashing with bcrypt
- CORS protection
- Helmet security headers
- MongoDB injection protection

## 🛡️ Rate Limiting

- General API: 100 requests per 15 minutes
- Authentication: 5 requests per 15 minutes
- Client Login: 10 requests per 5 minutes
- License Creation: 20 requests per minute

## 📝 Data Models

### User Model
- Name, email, password (hashed)
- Role (owner/reseller)
- Plan (free/premium)
- Usage limits based on plan
- Payment status

### App Model
- Name, version, owner
- Auto-generated appId and appSecret
- Settings (HWID lock, custom keys)
- Customizable error messages
- Pause/unpause functionality

### License Model
- Linked to app and creator
- Unique license key (auto-generated or custom)
- Status (ACTIVE/REVOKED/EXPIRED/BANNED)
- Expiration date and usage tracking

### Reseller Model
- User and app association
- License creation limits
- Configurable permissions
- Usage tracking

### Client Model
- Username, password (hashed), HWID
- Linked to app and license
- Ban status and expiration tracking

## 🚨 Error Handling

The API uses standardized error responses:

```json
{
  "success": false,
  "message": "Error description",
  "errors": [] // Validation errors if applicable
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `429`: Too Many Requests
- `500`: Internal Server Error

## 🔄 Pagination

List endpoints support pagination:

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "current": 1,
      "pages": 5,
      "total": 100,
      "limit": 20
    }
  }
}
```

## 📈 Monitoring & Health Check

- Health check endpoint: `GET /health`
- API documentation: `GET /api`
- Built-in error logging
- Request/response logging in development

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 📞 Support

For support and questions:
- Create an issue in the repository
- Check the API documentation at `/api`
- Review the Postman collection for example requests

---

**Happy coding! 🚀**