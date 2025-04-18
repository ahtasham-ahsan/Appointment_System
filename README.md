# 🗓️ GraphQL Appointment Management System

A full-featured appointment scheduling backend built with Apollo Server, GraphQL, MongoDB, and WebSocket subscriptions. It supports user authentication, real-time updates, file attachments via Cloudinary, and timezone-aware scheduling.

---

## 🚀 Features

- ✅ User registration and login with JWT authentication  
- 🧠 Create, update, reschedule, cancel, and delete appointments  
- 🧾 Attach documents (PDF, DOC, TXT) using Cloudinary  
- 📬 Email notifications on appointment events  
- 🌐 Timezone support for accurate scheduling  
- 🔔 Real-time updates with GraphQL subscriptions  
- 🛡️ Authorization checks for secure data access  

---

## 📦 Tech Stack

- **Backend Framework**: Node.js, Apollo Server v4  
- **Database**: MongoDB (via Mongoose)  
- **GraphQL Subscriptions**: `graphql-ws`  
- **File Uploads**: Cloudinary  
- **Emails**: Nodemailer  
- **Authentication**: JWT  
- **Timezone Handling**: `moment-timezone`  

---

## 📁 Folder Structure
├── models/
│   ├── User.js
│   └── Appointment.js
├── graphql/
│   ├── typeDefs.mjs
│   ├── resolvers.mjs
│   ├── resolvers/
│   │   ├── mutations.mjs
│   │   ├── queries.mjs
│   │   ├── subscriptions.mjs
│   │   └── helpers.mjs
├── utils/
│   ├── cloudinary.mjs
│   ├── emailService.js
│   └── errorLogger.js
├── server.mjs
└── .env

## 🛠️ Getting Started
1. Clone the Repo
```
git clone https://github.com/your-username/appointment-graphql-server.git
cd appointment-graphql-server
```
2. Install Dependencies
```
npm install
```
3. Set Up Environment Variables
Create a .env file:
```
PORT=4000
MONGODB_URI=mongodb+srv://<your-db-uri>
JWT_SECRET_KEY=your_jwt_secret
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_password_or_app_password
```
4. Run the Server
```
npm start
```
Visit http://localhost:4000/graphql to open the Apollo Playground.

### 📡 Subscriptions
This project uses graphql-ws for real-time updates:
```
subscription {
  appointmentsUpdated(userEmail: "user@example.com") {
    id
    title
    date
    time
    status
  }
}
```
## 📤 File Uploads
Appointments can include document uploads. Supported file types:
```
.pdf

.doc / .docx

.txt
```
These are uploaded to Cloudinary and stored under the appointments folder.

## 📧 Email Notifications
Users receive emails for:
```
Appointment creation

Updates

Reschedules

Cancellations

Deletions
```
## 🧪 Sample Queries
```
Create User
graphql
Copy
Edit
mutation {
  createUser(name: "Alice", email: "alice@example.com", password: "password", timezone: "Asia/Kolkata") {
    user {
      id
      name
    }
    token
  }
}
```
```
Get Appointments
query {
  getAppointments(userEmail: "alice@example.com") {
    id
    title
    date
    time
  }
}
```

## 👨‍💻 Author
Made with ❤️ by Muhammad Ahtasham


