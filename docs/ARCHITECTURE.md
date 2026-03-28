# Architecture Guide

This document explains the project in a more visual and operational way.

## Big Picture

The system is split into two major paths:

1. `Synchronous request path`
2. `Asynchronous business workflow path`

The synchronous path handles browser traffic, authentication, authorization, and request forwarding.

The asynchronous path handles the order workflow using Kafka events and local outbox tables.

## Representational View

```text
Browser
  |
  v
BFF (cookie session, Auth0 OIDC, CSRF, refresh)
  |
  v
API Gateway (JWT validation, RBAC, rate limits)
  |
  v
Order Service
  |
  +------------------------> Kafka <------------------------+
  |                                                         |
  v                                                         v
Inventory Service                                    Payment Service
```

## Security View

```text
Browser
  |
  | 1. /auth/login
  v
BFF -----------------------> Auth0
  <------------------------ Authorization code + tokens
  |
  | 2. Store tokens server-side in Postgres
  | 3. Send only secure cookies to browser
  v
Browser holds:
  - session cookie
  - csrf cookie

Browser never holds:
  - access token
  - refresh token
```

## Idempotency View

```text
Browser -> BFF /bff/orders + Idempotency-Key
        -> Gateway /orders + Idempotency-Key
        -> Order Service

Order Service:
  if (user_id + idempotency_key exists with same payload)
    return existing order
  if (user_id + idempotency_key exists with different payload)
    return 409 conflict
  else
    create new order
```

```text
Kafka message
  |- eventId in headers
  |- eventId in payload

Consumer transaction:
  1. insert eventId into processed_events
  2. if duplicate -> skip processing
  3. if new -> apply business logic
  4. commit
```

## Request Flow

### Login flow

```text
Browser -> BFF /auth/login
BFF -> Auth0 Universal Login
Auth0 -> BFF /auth/callback
BFF -> Auth0 /oauth/token
BFF -> Postgres identity.sessions
BFF -> Browser set-cookie(session + csrf)
```

### Authenticated API flow

```text
Browser -> BFF /bff/orders
BFF -> validate session from cookie
BFF -> refresh token if access token is near expiry
BFF -> API Gateway with Bearer token
Gateway -> verify JWT from Auth0
Gateway -> read groups/privileges from local DB
Gateway -> Order Service
```

## Order Saga Flow

### Success path

```text
1. User places order
2. Order Service creates order with PENDING_INVENTORY
3. Order Service writes event to orders.outbox
4. Outbox publisher sends Kafka event: inventory.reserve.requested
5. Inventory Service reserves stock
6. Inventory Service writes event to inventory.outbox
7. Outbox publisher sends Kafka event: inventory.reserved
8. Order Service consumes inventory.reserved
9. Order Service writes payment.process.requested to outbox
10. Payment Service processes payment
11. Payment Service emits payment.succeeded
12. Order Service marks order CONFIRMED
```

### Failure path

```text
1. Order created
2. Inventory reserved
3. Payment fails
4. Payment Service emits payment.failed
5. Order Service marks order FAILED
6. Order Service emits inventory.release.requested
7. Inventory Service releases reservation
```

## Why both Saga and Outbox

These two patterns are used together because they solve different problems.

### Saga

Saga handles business consistency across services.

Example:
- reserve inventory
- charge payment
- if payment fails, release inventory

### Outbox

Outbox handles technical consistency between:
- database commit
- Kafka publish

Without outbox, a service could save DB state successfully but fail before publishing the Kafka event.

## Why Idempotency Is Also Needed

Outbox prevents message loss between the database and Kafka.

Idempotency prevents duplicate business effects when:
- a client retries the same POST request
- Kafka redelivers the same event
- a consumer restarts while handling a message

So these patterns work together:

- `Outbox` avoids lost events
- `Idempotency` avoids duplicate side effects
- `Saga` keeps business consistency across services

## Service Responsibilities

### `apps/bff`

Purpose:
- browser-facing entry point
- Auth0 login/logout/callback
- secure cookie session management
- CSRF validation
- token refresh handling
- proxy safe browser requests to gateway

Key file:
- [apps/bff/src/app.ts](/Users/devendrakumar/Node_examples/Node_with_Aoth0/apps/bff/src/app.ts)

### `apps/api-gateway`

Purpose:
- validate Auth0 access tokens
- load local RBAC permissions from Postgres
- enforce authorization
- apply global and route-specific rate limits
- forward to internal services

Key file:
- [apps/api-gateway/src/app.ts](/Users/devendrakumar/Node_examples/Node_with_Aoth0/apps/api-gateway/src/app.ts)

### `apps/order-service`

Purpose:
- create orders
- orchestrate the saga
- react to inventory and payment events
- update order state
- enforce request idempotency for order creation

Key file:
- [apps/order-service/src/services/order.service.ts](/Users/devendrakumar/Node_examples/Node_with_Aoth0/apps/order-service/src/services/order.service.ts)

### `apps/inventory-service`

Purpose:
- reserve stock
- release stock during compensation
- publish reservation results

Key file:
- [apps/inventory-service/src/services/inventory.service.ts](/Users/devendrakumar/Node_examples/Node_with_Aoth0/apps/inventory-service/src/services/inventory.service.ts)

### `apps/payment-service`

Purpose:
- process payment attempts
- publish success or failure

Key file:
- [apps/payment-service/src/services/payment.service.ts](/Users/devendrakumar/Node_examples/Node_with_Aoth0/apps/payment-service/src/services/payment.service.ts)

## Layered App Structure

Each app now follows a layered structure so responsibilities are easier to split across a growing team.

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

How to think about the layers:

- `app.ts`: framework and plugin bootstrapping
- `index.ts`: process startup only
- `controllers`: transport-level handlers for HTTP requests
- `services`: business logic and orchestration
- `repositories`: SQL and persistence logic
- `routes`: Fastify route registration
- `consumers`: Kafka subscription entrypoints
- `utils`: focused helpers that do not belong to a business service
- `types`: local contracts and app-specific interfaces

## Shared Packages

### `packages/config`

Loads and validates environment variables using Zod.

### `packages/auth`

Contains:
- Auth0 token exchange
- refresh token handling
- token revocation
- JWT validation
- local RBAC lookup

### `packages/database`

Contains:
- Postgres pool
- transaction helper

### `packages/messaging`

Contains:
- Kafka producer
- Kafka consumer-group wrapper
- event header propagation

### `packages/resilience`

Contains:
- circuit breaker wrapper
- HTTP timeout helper

### `packages/shared`

Contains:
- logger
- validation schemas
- Kafka topic and routing-key constants

## Local RBAC Model

The project keeps authorization in the local database instead of depending on Auth0 roles.

```text
users ----< user_group >---- groups ----< group_privileges >---- privileges
```

Current privilege model:

- `ADMIN` -> `READ`, `MODIFY`, `DELETE`, `ORDER_CREATE`
- `MANAGER` -> `READ`, `MODIFY`, `ORDER_CREATE`
- `USER` -> `READ`, `ORDER_CREATE`

That means a normal user can still create orders but cannot perform manager/admin operations.

## Resilience Model

### Rate limiting

Applied in BFF and Gateway:

- global limiter for all routes
- stricter limiter for auth endpoints
- route-specific limits for order creation and reports

### Circuit breakers

Used for synchronous HTTP dependencies:

- BFF -> Auth0 token endpoints
- BFF -> API Gateway
- API Gateway -> Order Service

Not used for Kafka consumers because Kafka needs retry, offset, idempotency, and dead-letter strategies instead.

## Idempotency Model

### API idempotency

Order creation requires `Idempotency-Key`.

Storage model:

```text
orders.orders
  - user_id
  - idempotency_key
  - request_hash
```

Rule:

- same `user_id` + same `idempotency_key` + same body -> return original order
- same `user_id` + same `idempotency_key` + different body -> reject with `409`

### Consumer idempotency

Each consuming service stores handled event IDs:

- `orders.processed_events`
- `inventory.processed_events`
- `payments.processed_events`

This protects the services from duplicate Kafka deliveries.

## Environment Variables You Should Care About

### Database

- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`

### Kafka

- `KAFKA_BROKERS`
- `KAFKA_CLIENT_ID`
- `KAFKA_SSL`
- `KAFKA_SASL_MECHANISM`
- `KAFKA_SASL_USERNAME`
- `KAFKA_SASL_PASSWORD`

### Auth0

- `AUTH0_DOMAIN`
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET`
- `AUTH0_AUDIENCE`
- `AUTH0_REDIRECT_URI`
- `AUTH0_POST_LOGOUT_REDIRECT_URI`

### Session security

- `SESSION_SECRET`
- `REFRESH_TOKEN_ENCRYPTION_KEY`
- `CSRF_COOKIE_NAME`

### Resilience tuning

- `HTTP_TIMEOUT_MS`
- `GLOBAL_RATE_LIMIT_MAX`
- `AUTH_RATE_LIMIT_MAX`
- `ORDER_RATE_LIMIT_MAX`
- `REPORT_RATE_LIMIT_MAX`
- `CIRCUIT_BREAKER_TIMEOUT_MS`
- `CIRCUIT_BREAKER_ERROR_THRESHOLD_PERCENTAGE`
- `CIRCUIT_BREAKER_RESET_TIMEOUT_MS`

## How To Read The Code

If you want to understand the system quickly, read in this order:

1. [README.md](/Users/devendrakumar/Node_examples/Node_with_Aoth0/README.md)
2. [docs/ARCHITECTURE.md](/Users/devendrakumar/Node_examples/Node_with_Aoth0/docs/ARCHITECTURE.md)
3. [apps/bff/src/app.ts](/Users/devendrakumar/Node_examples/Node_with_Aoth0/apps/bff/src/app.ts)
4. [apps/bff/src/routes/index.ts](/Users/devendrakumar/Node_examples/Node_with_Aoth0/apps/bff/src/routes/index.ts)
5. [apps/api-gateway/src/app.ts](/Users/devendrakumar/Node_examples/Node_with_Aoth0/apps/api-gateway/src/app.ts)
6. [apps/order-service/src/services/order.service.ts](/Users/devendrakumar/Node_examples/Node_with_Aoth0/apps/order-service/src/services/order.service.ts)
7. [apps/inventory-service/src/services/inventory.service.ts](/Users/devendrakumar/Node_examples/Node_with_Aoth0/apps/inventory-service/src/services/inventory.service.ts)
8. [apps/payment-service/src/services/payment.service.ts](/Users/devendrakumar/Node_examples/Node_with_Aoth0/apps/payment-service/src/services/payment.service.ts)
9. [infra/postgres/init/001_init.sql](/Users/devendrakumar/Node_examples/Node_with_Aoth0/infra/postgres/init/001_init.sql)

## Current Limitations

This starter is strong structurally, but still needs more production hardening before a real launch:

- request/correlation IDs are not implemented yet
- no distributed tracing yet
- no dead-letter topics yet
- no Redis-backed distributed rate limiting yet
- payment service still uses mock approval logic
