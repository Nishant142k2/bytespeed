Bitespeed Identity Service
A customer identity tracking web service that consolidates contact information across multiple purchases on FluxKart.com. The service intelligently links contacts based on shared email addresses or phone numbers, maintaining a primary-secondary relationship structure.
Features

Contact Identity Resolution: Automatically links contacts with shared email or phone numbers
Primary-Secondary Linking: Maintains hierarchical contact relationships with the oldest contact as primary
Dynamic Contact Merging: Converts separate primary contacts into linked groups when connections are discovered
RESTful API: Simple HTTP POST endpoint for contact identification and consolidation
Database Persistence: Uses Prisma ORM with PostgreSQL/MySQL/SQLite support

Tech Stack

Backend: Node.js with Express.js
Language: TypeScript
Database: PostgreSQL (configurable for MySQL/SQLite)
ORM: Prisma
Runtime: tsx for development

Database Schema
prismamodel Contact {
  id             Int             @id @default(autoincrement())
  phoneNumber    String?
  email          String?
  linkedId       Int?            // References the primary contact ID
  linkPrecedence LinkPrecedence  // "primary" or "secondary"
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  deletedAt      DateTime?
}
Installation & Setup
Prerequisites

Node.js (v16 or higher)
PostgreSQL/MySQL/SQLite database
npm or yarn package manager

1. Clone and Install Dependencies
bashgit clone <repository-url>
cd bitespeed-identity-service
npm install
2. Environment Configuration
Create a .env file in the root directory:
envDATABASE_URL="postgresql://username:password@localhost:5432/bitespeed_db?schema=public"
PORT=3000
For other databases:
env# MySQL
DATABASE_URL="mysql://username:password@localhost:3306/bitespeed_db"

# SQLite (for development)
DATABASE_URL="file:./dev.db"
3. Database Setup
bash# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init

# (Optional) View database with Prisma Studio
npx prisma studio
4. Start the Service
bash# Development mode
npm run dev

# Production build
npm run build
npm start
The service will be available at http://localhost:3000
API Documentation
POST /identify
Identifies and consolidates customer contact information.
Request Body:
json{
  "email": "customer@example.com",     // optional
  "phoneNumber": "1234567890"          // optional
}
Note: At least one of email or phoneNumber is required
Response Format:
json{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["primary@example.com", "secondary@example.com"],
    "phoneNumbers": ["1111111111", "2222222222"],
    "secondaryContactIds": [2, 3, 4]
  }
}
Usage Examples
Example 1: New Customer
Request:
bashcurl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "lorraine@hillvalley.edu", "phoneNumber": "123456"}'
Response:
json{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["lorraine@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": []
  }
}
Example 2: Returning Customer with New Email
Request:
bashcurl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "mcfly@hillvalley.edu", "phoneNumber": "123456"}'
Response:
json{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [2]
  }
}
Example 3: Merging Separate Primary Contacts
When two separate customers are discovered to be the same person:
Initial State:

Contact 1: george@hillvalley.edu + 919191 (Primary)
Contact 2: biffsucks@hillvalley.edu + 717171 (Primary)

Link Request:
bashcurl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "george@hillvalley.edu", "phoneNumber": "717171"}'
Response:
json{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["george@hillvalley.edu", "biffsucks@hillvalley.edu"],
    "phoneNumbers": ["919191", "717171"],
    "secondaryContactIds": [2]
  }
}
Business Logic
Contact Linking Rules

New Contact: If no existing contacts match the email or phone, create a new primary contact
Existing Match: If contacts exist with matching email or phone, link them to the existing group
New Information: If a linked contact provides new email/phone information, create a secondary contact
Primary Merging: If two separate primary contacts are discovered to belong to the same person, convert the newer primary to secondary

Primary Contact Selection

The oldest contact (by createdAt) always remains as primary
When merging contact groups, all secondary contacts point to the oldest primary
Primary contacts can be converted to secondary, but never the reverse

Development
Available Scripts
bashnpm run dev          # Start development server with tsx
npm run build        # Build TypeScript to JavaScript
npm start           # Start production server
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run database migrations
npm run prisma:studio    # Open Prisma Studio
Database Management
bash# Reset database (caution: deletes all data)
npx prisma migrate reset

# Deploy migrations to production
npx prisma migrate deploy

# Generate optimized client for production
npx prisma generate --no-engine
Testing
Test the API endpoints using curl, Postman, or any HTTP client:
bash# Test new contact creation
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "phoneNumber": "9999999999"}'

# Test contact linking
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "test2@example.com", "phoneNumber": "9999999999"}'
Deployment
Production Considerations

Use a production-grade database (PostgreSQL recommended)
Set appropriate environment variables
Run prisma generate --no-engine for optimized client
Use process managers like PM2 for Node.js applications
Set up proper logging and monitoring
Configure CORS settings for your frontend domain

Docker Deployment (Optional)
dockerfileFROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate --no-engine
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
Error Handling
The service handles various error scenarios:

Invalid request format (400 Bad Request)
Missing required fields (400 Bad Request)
Database connection errors (500 Internal Server Error)
Concurrent request handling with proper transaction management

Contributing

Fork the repository
Create a feature branch: git checkout -b feature-name
Make your changes and add tests
Commit your changes: git commit -am 'Add some feature'
Push to the branch: git push origin feature-name
Submit a pull request

License
This project is licensed under the MIT License - see the LICENSE file for details.
Support
For support and questions, please open an issue in the repository or contact the development team.
