// SXO PAY — backend server
// Proxies every FamApi call so the API key never reaches the browser.

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ------------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------------
// Put your key in an environment variable, e.g.:
//   FAMAPI_KEY=fam_live_xxxx node server.js
// Falls back to the placeholder below only for local editing.
const FAMAPI_KEY = process.env.FAMAPI_KEY || 'YOUR_FAMAPI_KEY';
const BASE_URL = 'https://famapi-orcin.vercel.app';
const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------------
// In-memory store — just for local testing.
// Keyed by our own short link id -> FamApi order id + basic info.
// Restarting the server wipes this (fine for a demo).
// ------------------------------------------------------------------
const orderCache = new Map();

// Small helper: call FamApi with the server-side key
async function famApiFetch(pathname, options = {}) {
  const res = await fetch(`${BASE_URL}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-FamApi-Key': FAMAPI_KEY,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  return { httpStatus: res.status, data };
}

// ------------------------------------------------------------------
// POST /api/connect  -> create a FamPay connect link
// body: { externalRef?, label?, redirectUrl? }
// ------------------------------------------------------------------
app.post('/api/connect', async (req, res) => {
  try {
    const { externalRef, label, redirectUrl } = req.body || {};
    const body = {};
    if (externalRef) body.externalRef = externalRef;
    if (label) body.label = label;
    if (redirectUrl) body.redirectUrl = redirectUrl;

    const { httpStatus, data } = await famApiFetch('/api/v1/orders/connect-tokens', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    res.status(httpStatus).json(data);
  } catch (err) {
    console.error('connect error:', err);
    res.status(500).json({ success: false, error: { code: 'PROXY_ERROR', message: 'Could not reach FamApi.' } });
  }
});

// ------------------------------------------------------------------
// POST /api/payment-links -> create a FamApi order, return our link
// body: { amount, reference?, connectionId? }
// ------------------------------------------------------------------
app.post('/api/payment-links', async (req, res) => {
  try {
    const rawAmount = req.body?.amount;
    const amount = Number(String(rawAmount).replace(/[^0-9.]/g, ''));

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'amount must be a positive number' } });
    }

    const body = { amount };
    if (req.body.reference) body.reference = String(req.body.reference).slice(0, 100);
    if (req.body.connectionId) body.connectionId = req.body.connectionId;

    const { httpStatus, data } = await famApiFetch('/api/v1/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!data.success) {
      return res.status(httpStatus).json(data);
    }

    orderCache.set(data.order.id, {
      orderId: data.order.id,
      amount: data.order.amount,
      currency: data.order.currency,
      reference: data.order.reference,
      upiId: data.order.upiId,
      createdAt: data.order.createdAt,
    });

    res.status(201).json({
      success: true,
      order: data.order,
      payUrl: `/pay/${data.order.id}`,
    });
  } catch (err) {
    console.error('create order error:', err);
    res.status(500).json({ success: false, error: { code: 'PROXY_ERROR', message: 'Could not reach FamApi.' } });
  }
});

// ------------------------------------------------------------------
// GET /api/orders/:id -> live status check (proxied, triggers FamApi poll)
// ------------------------------------------------------------------
app.get('/api/orders/:id', async (req, res) => {
  try {
    const { httpStatus, data } = await famApiFetch(`/api/v1/orders/${encodeURIComponent(req.params.id)}`, {
      method: 'GET',
    });
    res.status(httpStatus).json(data);
  } catch (err) {
    console.error('order status error:', err);
    res.status(500).json({ success: false, error: { code: 'PROXY_ERROR', message: 'Could not reach FamApi.' } });
  }
});

// ------------------------------------------------------------------
// Pretty checkout URL: /pay/ord_xxx -> serves the SPA, which reads the
// order id from the URL path itself.
// ------------------------------------------------------------------
app.get('/pay/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  if (FAMAPI_KEY === 'YOUR_FAMAPI_KEY') {
    console.warn('⚠️  FAMAPI_KEY not set — set it via environment variable before going live.');
  }
  console.log(`SXO PAY running at http://localhost:${PORT}`);
});
