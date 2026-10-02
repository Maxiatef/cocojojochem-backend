# Cart, Requests & Quotes — How It Works

## The two kinds of items

- **Priced items** (our products) → go to **Ready to pay** → paid by card at checkout.
- **Unpriced items** (supplier reference materials, or a size we don't list) → go to **Price to confirm** → never charged at checkout; we price them first.

---

## Customer flow

### 1. Adding items
1. Our product → **Add to cart** → lands in *Ready to pay*.
2. Our product in a size we don't list → **Request a quote for this size** → lands in *Price to confirm*.
3. Supplier material → **Request** (with quantity and optional size) → lands in *Price to confirm*.

### 2. Checkout — three cart cases
| Cart has | What checkout does |
|---|---|
| Only *Ready to pay* | Normal Stripe card payment. |
| Only *Price to confirm* | No payment. Customer sends a request (no Stripe). |
| Both | One button: **Pay $X and request pricing for N items**. Request is saved first, then Stripe payment for the priced items. |

### 3. Sending a request (no payment)
1. Customer chooses **Order these items** (needs delivery address) or **Just a price quote** (no address).
2. Fills name, email, optional company/phone, notes, ticks consent.
3. Clicks **Submit order request** / **Request a quote**.
4. Sees reference **CJ-XXXXXXXX** and gets a "We received your request" email.

### 4. Getting the quote
1. Customer gets "We're reviewing your request" (when staff start).
2. Customer gets **"Your quote is ready"** email: price per item, pack size, availability, shipping, total.
3. Email button opens their private quote page: `/quotes/<link>`.

### 5. Accepting
1. Customer clicks **Accept & add to cart**.
2. Quoted items join *Ready to pay* at the quoted prices (quantities fixed).
3. Customer can add more products, then checks out and pays by card.
4. Gets the normal order confirmation email. Quote becomes **Paid**.

### 6. Declining
1. On the quote page → **Decline quote** → optional reason.
2. Quote closes and leaves the cart.
3. Customer gets "Your request is closed"; staff get "Quote declined".

---

## Admin flow (Admin → Order Requests)

1. New request arrives → staff email "New order/quote request".
2. Open it → see Type (Order/Quote), Guest/Customer, ship-to, items, supplier badges with original listing links.
3. Set status **In progress** → customer is emailed "We're reviewing".
4. In **Quote**: for each line set available, unit price, pack size, quantity, lead time, note. Add shipping (required, 0 = free) and an optional message.
5. **Save draft** (nothing sent) or **Send quote to customer** (emails the quote, status → Quoted).
6. Watch the **Quote** column:
   - *Sent* → waiting for customer.
   - *Accepted · in cart, not paid* → staff email "Quote accepted".
   - *Quote paid* → linked order; staff email "Quote paid".
   - *Declined by customer* → reason shown.
7. To close it yourself → set status **Lost** → enter reason → customer is emailed.

**Filters:** Status · Type (Order / Quote) · Account (Guest / Customer) · Source (has supplier reference / our catalog only).

---

## Status meanings

| Admin status | Customer sees | Meaning |
|---|---|---|
| New | Received | Just sent |
| In progress | Being reviewed | Staff pricing it |
| Quoted | Quote ready | Quote emailed, waiting for customer |
| Won | Paid | Quote paid at checkout |
| Lost | Closed | Declined by customer or closed by staff |

---

## Emails at a glance

| When | Customer | Staff |
|---|---|---|
| Request sent | Request received | New request |
| Status → In progress | Being reviewed | — |
| Quote sent | Quote ready (with link) | — |
| Customer accepts | — | Quote accepted |
| Customer pays | Order confirmation | Quote paid + new order |
| Declined / closed | Request closed | Quote declined |

---

## Q&A

**Can a customer change quoted quantities in the cart?**
No. They're fixed to what was quoted. Removing an item removes the whole quote (still open via the email link).

**Do quotes expire?**
No. They stay open until accepted, declined, paid or closed by staff.

**Can staff change a quote after sending?**
Yes, until it's paid. Click **Update & re-send quote**; the customer gets the new email and their cart shows the new prices.

**What if payment fails or is abandoned in a combined checkout?**
The request is still sent and priced. Admin shows **Payment not completed** for that request.

**Can someone pay a different price by editing the browser?**
No. The server reads quoted prices from the database, not from the cart.

**Does a guest need an account?**
No. Guests use the link in their quote email. Signed-in customers also see requests under **Account → Your requests**.

**What if an item can't be supplied?**
Untick **Avail.** for that line. It shows as "Not available" and is never charged.

**How is shipping handled for quoted items?**
Staff enter it in the quote. It's added to the checkout total by the server.

**What's the difference between Order request and Quote request?**
Order request = customer gave a delivery address and wants to buy. Quote request = prices only.

**Is the MakingCosmetics data live?**
No. It's a fixed snapshot of 1,103 entries (they have no public API). We confirm price and stock ourselves.
