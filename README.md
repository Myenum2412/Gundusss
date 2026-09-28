# Fees — Next.js + Fastify + Postgres

Monorepo with workspaces:

```
fees/
  frontend/  Next.js 14 App Router (port 3000)
  backend/   Fastify 5 + node-postgres (port 4000)
  docker-compose.yml  Postgres 16
```

## Quick start (local dev)

1. Start Postgres:
```bash
docker compose up -d postgres
# or: psql postgres://fees:fees@localhost:5432/fees -f backend/sql/init.sql
```

2. Backend:
```bash
cd backend
cp .env.example .env
npm install
npm run dev
# health: http://localhost:4000/api/health
# fees:   http://localhost:4000/api/fees
```

3. Frontend:
```bash
cd frontend
npm install
npm run dev
# http://localhost:3000
```

## Docker (full stack)

```bash
docker compose up --build
# frontend http://localhost:3000
# backend  http://localhost:4000/api/health
```

## API

- `GET /api/health`
- `GET /api/fees`
- `GET /api/fees/:id`
- `POST /api/fees` `{ student_name, amount, status, due_date: "YYYY-MM-DD" }`
- `PUT /api/fees/:id`
- `DELETE /api/fees/:id`
