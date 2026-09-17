# SXO PAY

UPI payment links powered by FamApi — Node/Express backend, key stays server-side.

## Setup

```bash
npm install
FAMAPI_KEY=fam_live_xxxxxxxx npm start
```

Then open http://localhost:3000

## Structure

- `server.js` — Express backend. All FamApi calls (connect-tokens, create order,
  order status) go through here, using `FAMAPI_KEY` from the environment.
  The browser never sees the key.
- `public/index.html` — frontend (Connect / Create Payment / Checkout screens),
  talks only to your own `/api/...` routes.
- Orders are kept in an in-memory `Map` — resets on restart. Swap in a real
  database (SQLite, Postgres, etc.) before going to production.

## Routes

- `POST /api/connect` → creates a FamPay connect link
- `POST /api/payment-links` → creates an order, returns `payUrl` like `/pay/ord_xxx`
- `GET /api/orders/:id` → live status check (proxied to FamApi)
- `GET /pay/:id` → serves the checkout page for that order

## Before going live

- Set `FAMAPI_KEY` as a real environment variable (never commit it to code).
- Replace the in-memory `Map` with a real database.
- Put this behind HTTPS.
- Consider adding your own auth if payment-link creation should be restricted
  to logged-in merchants only.
