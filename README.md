# Node.js Auth0 Microservices Starter

Production-oriented starter for a commerce-style platform with:

- `BFF` for browser-facing authentication and cookie-based sessions
- `API Gateway` for token validation and coarse-grained authorization
- `order-service`, `inventory-service`, and `payment-service`
- local RBAC tables with `ADMIN`, `MANAGER`, and `USER`
- orchestration-based `Saga` for order workflow
- `Transactional Outbox` for reliable event publication into Kafka
- API and consumer idempotency protection
- global and route-specific API rate limiting
- circuit breakers for synchronous HTTP dependencies

For a deeper explanation, read [docs/ARCHITECTURE.md](/Users/devendrakumar/Node_examples/Node_with_Aoth0/docs/ARCHITECTURE.md).

## Architecture At A Glance

```text
Browser
  |
  v
BFF
  |
  v
API Gateway
  |
  v
Order Service <----> Kafka <----> Inventory Service
      |
      +-----------------------> Kafka <----> Payment Service
```

```text
Postgres
  |- identity.users
  |- identity.user_group
  |- identity.sessions
  |- orders.orders + orders.outbox
  |- inventory.inventory_items + inventory.outbox
  |- payments.payment_attempts + payments.outbox
```

## Why this design

This stack uses two patterns together because they solve different problems:

- `Saga`: best for the cross-service order workflow where inventory and payment can succeed or fail independently.
- `Outbox`: best for making sure a DB commit and a Kafka publish do not drift apart.

For your use case, this combination is better than trying to use only one pattern. The order service acts as the saga orchestrator, while each service owns its own outbox table.

## Why Kafka here

Since you already have Kafka and you expect roughly 1M hits per day, Kafka is a good fit for the event backbone:

- durable event retention
- horizontal consumer scaling with consumer groups
- replay capability for recovery and future reporting pipelines
- better fit if this platform grows into analytics, audit, and async integrations

The tradeoff is higher operational complexity than RabbitMQ, but that is fine if Kafka is already part of your platform.

## Services

- `apps/bff`: handles Auth0 OIDC login, callback, logout, session refresh, secure cookies, and browser-safe proxy endpoints.
- `apps/api-gateway`: validates Auth0 access tokens and applies local privilege checks before forwarding to internal services.
- `apps/order-service`: starts orders and orchestrates the inventory/payment saga.
- `apps/inventory-service`: reserves or releases stock.
- `apps/payment-service`: simulates payment authorization and emits success/failure events.

## Layered Structure

Each app now follows a layered structure so the codebase scales better for a larger team:

```text
src/
  app.ts
  index.ts
  controllers/
  services/
  repositories/
  routes/
  consumers/
  utils/
  types/
```

Purpose of each layer:

- `controllers`: HTTP-facing handlers that validate request-level concerns and shape responses
- `services`: business logic and orchestration
- `repositories`: database access and persistence operations
- `routes`: route registration and route-level middleware
- `consumers`: Kafka message handlers and consumer startup
- `utils`: focused helpers such as event envelope builders
- `types`: app-local interfaces and request/session contracts

This is easier to scale than keeping all logic inside one `index.ts` per service.

## Security model

### Browser token handling

- Access tokens never go to the browser.
- The browser only gets an opaque signed session cookie plus a CSRF cookie.
- Refresh tokens are stored server-side in Postgres, encrypted at rest.
- Access tokens are also stored server-side in encrypted form.
- The frontend calls `POST /auth/refresh` when `GET /auth/session` says the token is close to expiry.

### Resilience controls

- Global rate limiting is enabled on the BFF and API gateway.
- Route-specific rate limits are applied for auth, order creation, and report endpoints.
- Circuit breakers protect synchronous HTTP dependencies such as Auth0, BFF to gateway, and gateway to order-service calls.
- Kafka flows continue to rely on retries, idempotency, and consumer-group behavior rather than circuit breakers.

### Idempotency

- `POST /bff/orders` requires an `Idempotency-Key` header.
- The same user and same idempotency key will return the original order instead of creating a duplicate.
- Reusing the same key with a different request body returns `409 Conflict`.
- Kafka consumers deduplicate messages using `eventId` stored in local `processed_events` tables.

### RBAC

RBAC is local and independent from Auth0 roles:

- `ADMIN` -> `READ`, `MODIFY`, `DELETE`, `ORDER_CREATE`
- `MANAGER` -> `READ`, `MODIFY`, `ORDER_CREATE`
- `USER` -> `READ`, `ORDER_CREATE`

That matches your requirement that users can read reports and create orders, but not modify or delete admin resources.

## Auth0 flow

The BFF uses Authorization Code Flow with PKCE:

1. Browser opens `GET /auth/login`
2. BFF redirects to Auth0 Universal Login
3. Auth0 redirects to `GET /auth/callback`
4. BFF exchanges the code for tokens
5. BFF creates a local session and sets secure cookies
6. Browser calls BFF routes only

### Required Auth0 application setup

Create a Regular Web Application in Auth0 and configure:

- Allowed Callback URLs: `http://localhost:3000/auth/callback`
- Allowed Logout URLs: `http://localhost:3000`
- Allowed Web Origins: `http://localhost:3000`
- Token Endpoint Authentication Method: `Post`
- Refresh Token Rotation: `Enabled`
- OIDC Conformant: `Enabled`

Create an API in Auth0:

- Identifier: use your API audience, for example `https://api.example.local`
- Signing Algorithm: `RS256`

## Local database model

Main identity tables:

- `identity.users`
- `identity.groups`
- `identity.privileges`
- `identity.group_privileges`
- `identity.user_group`
- `identity.sessions`

The exact local group membership table you asked for is `identity.user_group`.

## Run locally

1. Copy `.env.example` to `.env` if you do not already have one
2. Fill in your Auth0 tenant values
3. For PostgreSQL, this project can use your local Postgres instance on `localhost:5432`
4. Start infra if you want containerized Postgres fallback:

```bash
docker compose up -d
```

Kafka is assumed to already exist outside this compose stack. Set `KAFKA_BROKERS` in `.env` to your broker list. The compose file only provisions Postgres as a fallback. Since your machine already has local Postgres, you do not need Docker Postgres unless you want isolation.

5. Install dependencies:

```bash
npm install
```

6. Start the services:

```bash
npm run dev
```

7. Seed a local group assignment for your Auth0 user:

```bash
npm run db:seed -- "auth0|123456789" "you@example.com" ADMIN
```

8. When creating orders, send an idempotency header:

```bash
curl -X POST http://localhost:3000/bff/orders \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-001-demo" \
  -H "x-csrf-token: <csrf-cookie-value>" \
  --cookie "app_session=<session-cookie>; app_csrf=<csrf-cookie-value>" \
  -d '{"itemSku":"SKU-CHAIR-001","quantity":1,"totalAmount":99.99,"currency":"USD"}'
```

## Important endpoints

### BFF

- `GET /auth/login`
- `GET /auth/callback`
- `GET /auth/session`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /admin/group-memberships`
- `POST /bff/orders`
- `GET /bff/reports/orders`

### Gateway

- `POST /orders`
- `GET /reports/orders`

## Frontend refresh example

The frontend can poll session state and refresh just before expiry:

```ts
async function refreshIfNeeded() {
  const session = await fetch("/auth/session", {
    credentials: "include"
  }).then((r) => r.json());

  if (session.shouldRefresh) {
    await fetch("/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: {
        "x-csrf-token": readCsrfCookie("app_csrf")
      }
    });
  }
}
```

## Recommended Reading Order

1. [docs/ARCHITECTURE.md](/Users/devendrakumar/Node_examples/Node_with_Aoth0/docs/ARCHITECTURE.md)
2. [apps/bff/src/app.ts](/Users/devendrakumar/Node_examples/Node_with_Aoth0/apps/bff/src/app.ts)
3. [apps/bff/src/routes/index.ts](/Users/devendrakumar/Node_examples/Node_with_Aoth0/apps/bff/src/routes/index.ts)
4. [apps/api-gateway/src/app.ts](/Users/devendrakumar/Node_examples/Node_with_Aoth0/apps/api-gateway/src/app.ts)
5. [apps/order-service/src/services/order.service.ts](/Users/devendrakumar/Node_examples/Node_with_Aoth0/apps/order-service/src/services/order.service.ts)
6. [apps/inventory-service/src/services/inventory.service.ts](/Users/devendrakumar/Node_examples/Node_with_Aoth0/apps/inventory-service/src/services/inventory.service.ts)
7. [apps/payment-service/src/services/payment.service.ts](/Users/devendrakumar/Node_examples/Node_with_Aoth0/apps/payment-service/src/services/payment.service.ts)
8. [infra/postgres/init/001_init.sql](/Users/devendrakumar/Node_examples/Node_with_Aoth0/infra/postgres/init/001_init.sql)

## Notes for production hardening

- Put the BFF and gateway behind TLS and a reverse proxy such as NGINX or Envoy.
- Replace the mock payment logic with a real PSP integration.
- Use separate databases or at least separate database users per service in production.
- Add dead-letter queues, retries, idempotency keys, and distributed tracing.
- Tune Kafka partitions and replication factor based on expected throughput and ordering needs.
- Add automated tests and secret management before going live.
