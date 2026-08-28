# MindPay architecture

## System boundary

MindPay is split into three deployables so the merchant remains the owner of its checkout,
Razorpay credentials, webhook verification, and fulfilment state.

```text
MindPay Web
    |
    v
MindPay Gateway  <---- signed commerce messages ---->  SignalWorks Merchant
                                                        |
                                                        v
                                                Razorpay Test Mode
```

## Authority model

| Actor | May do | Must never do |
|---|---|---|
| Browser | Collect user intent, passkey approval, and launch checkout | Assert payment or fulfilment state |
| Agent runtime | Search, compare, explain, and propose | Modify policy, select arbitrary recipients, or call Razorpay |
| MindPay Gateway | Verify merchants, enforce mandates, reserve budget, reconcile evidence | Hold card data or merchant Razorpay secrets |
| SignalWorks | Sign offers, create orders, verify Razorpay, and fulfil services | Expand a user mandate or issue MindPay entitlements |

## Canonical state

D1 is the canonical business-state store. KV caches marketplace reads, R2 stores large private
evidence, Queues process asynchronous events, and Durable Objects stream transaction updates. No
supporting store may independently advance a financial state.

See `docs/adr/0001-monorepo-and-authority-boundaries.md` for the initial decision record.
