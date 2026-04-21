# Digital Banking API Project (FastAPI + PostgreSQL + React)

## Project Overview
This project is a full-stack digital banking system that simulates real-world wallet/banking operations.  
It includes secure authentication, account management, balance checking, fund transfers, deposits, withdrawals, and transaction history.

## Tech Stack

### Backend
- FastAPI
- PostgreSQL
- SQLAlchemy
- JWT Authentication
- Passlib (Password Hashing)
- Pydantic
- Uvicorn

### Frontend
- React JS
- Vite
- Tailwind CSS
- Axios
- React Router DOM

---

## Features

### Authentication
- User Registration
- User Login
- JWT-based Authentication
- Protected Routes

### Account Management
- Auto-create account during registration
- View account details
- View account balance

### Transactions
- Fund Transfer
- Deposit
- Withdraw
- Transaction History
- Transaction Details API


===============================
Database Tables
Users
id
full_name
email
hashed_password
is_active
created_at
updated_at
Accounts
id
user_id
account_number
balance
currency
created_at
updated_at
Transactions
id
sender_account_id
receiver_account_id
amount
transaction_type
reference
status
created_at


API Endpoints
Authentication
POST /auth/register
POST /auth/login
GET /auth/me
Accounts
GET /accounts/me
GET /accounts/balance
Transactions
POST /transactions/transfer
POST /transactions/deposit
POST /transactions/withdraw
GET /transactions/history
GET /transactions/{transaction_id}

=========================
Backend Setup
=========================
cd backend
python -m venv venv
.\venv\Scripts\Activate
pip install -r requirements.txt
Create .env---------(Use .env.example as reference)
Run backend server - uvicorn app.main:app --reload
Swagger UI - http://127.0.0.1:8000/docs

======================
Frontend Setup
======================
cd frontend
npm install
Create .env-------(Use .env.example as reference)
Run frontend -- npm run dev
Open frontend - http://localhost:5173
-------------------------------------------------------

Environment Variables:
Backend\.env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/digital_banking_db
SECRET_KEY=your_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000

Frontend \.env
VITE_API_BASE_URL=http://localhost:8000

Notes:
Passwords are securely hashed before storing in the database.
JWT is used for authentication.
Sensitive values are stored in .env.
Tailwind CSS is used for frontend styling.
PostgreSQL is managed through pgAdmin.

Submission Checklist:
 FastAPI backend
 PostgreSQL database
 React frontend
 Tailwind CSS styling
 JWT Authentication
 Fund Transfer
 Transaction History
 Deposit and Withdraw
 Swagger tested APIs
 Modular architecture

Final frontend package check
cd C:\Users\ASDMIN\digital-banking-project\frontend
npm install
npm run dev

In backend:
cd C:\Users\ASDMIN\digital-banking-project\backend
.\venv\Scripts\Activate
uvicorn app.main:app --reload

