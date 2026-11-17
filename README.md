# AI Travel Companion ✈️ 🏨 🧭

An autonomous AI-powered travel planning and booking platform built with senior agentic AI engineering, state machine orchestration (LangGraph), deterministic budget solvers, verified inventory providers (Amadeus / Duffel), and human-in-the-loop booking execution.

---

## 🌟 Key Features

1. **Autonomous Conversational Orchestration**: Multi-turn dialog that understands natural travel requests, extracts complex constraints, and clarifies missing parameters.
2. **Deterministic Budget Solver**: Hard mathematical optimization allocating and enforcing budget limits without LLM hallucination.
3. **Dual-Mode Provider Integration**: Real-world flight and hotel queries with live provider capabilities (Amadeus Self-Service) and verified, transparent sandbox mock fallbacks.
4. **Human-In-The-Loop Booking Safety**: Strict cryptographic approval tokens, price freezes, and idempotency guarantees preventing unauthorized or duplicate transactions.
5. **Geographical Itinerary Proximity Clustering**: Day-by-day plans grouping attractions geographically to minimize transit friction.

---

## 🏗️ Architecture Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, React Router.
- **Backend**: Node.js 22 LTS, Express, TypeScript, Helmet, Rate Limiting, JWT Authentication.
- **Database & ORM**: PostgreSQL / SQLite dev mode, Prisma ORM (14 normalized entities).
- **AI & State Machine**: LangGraph, OpenAI Function Calling, Structured Zod Schemas.
- **DevOps**: Docker, Docker Compose (PostgreSQL 16, Redis 7, Adminer).

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Node.js `v20+` or `v22+`
- npm `10+`
- (Optional) Docker for PostgreSQL & Redis

### 2. Environment Setup

Copy example environment files:
```bash
# Backend environment
cp backend/.env.example backend/.env

# Frontend environment
cp frontend/.env.example frontend/.env
```

### 3. Install Dependencies
```bash
npm run install:all
```

### 4. Database Initialization & Seeding
```bash
cd backend
# Generate Prisma Client
npm run prisma:generate

# Push schema to database
npm run prisma:push

# Seed demo user & sample 5-day Goa trip
npm run prisma:seed
```

### 5. Running the Application
In separate terminal sessions:
```bash
# Terminal 1: Backend API (port 5000)
npm run dev:backend

# Terminal 2: Frontend Client (port 5173)
npm run dev:frontend
```

Open your browser at `http://localhost:5173`.

### 🔑 Demo Account Credentials
- **Email**: `demo@travelcompanion.ai`
- **Password**: `Password123!`
*(Or click the "Fill Demo Credentials" button on the Sign In page)*

---

## 🧪 Running Automated Tests
```bash
npm run test:backend
```
