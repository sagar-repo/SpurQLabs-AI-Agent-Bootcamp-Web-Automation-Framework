# Product Requirements Document: Demoblaze (PRODUCT STORE)

**Application URL:** https://www.demoblaze.com  
**Document Type:** Product Requirements Document (PRD) — RAG Ingest Version  
**Date:** 2026-05-31  
**Scope:** Full functional specification of all pages, modals, user flows, and data entities

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Technology Stack & Architecture](#2-technology-stack--architecture)
3. [User Roles & Authentication Model](#3-user-roles--authentication-model)
4. [Site Structure & Navigation](#4-site-structure--navigation)
5. [Page Specifications](#5-page-specifications)
   - 5.1 [Home Page (index.html)](#51-home-page-indexhtml)
   - 5.2 [Product Detail Page (prod.html)](#52-product-detail-page-prodhtml)
   - 5.3 [Cart Page (cart.html)](#53-cart-page-carthtml)
6. [Modal Specifications](#6-modal-specifications)
   - 6.1 [Log In Modal](#61-log-in-modal)
   - 6.2 [Sign Up Modal](#62-sign-up-modal)
   - 6.3 [Contact (New Message) Modal](#63-contact-new-message-modal)
   - 6.4 [About Us Modal](#64-about-us-modal)
   - 6.5 [Place Order Modal](#65-place-order-modal)
7. [Product Catalog](#7-product-catalog)
8. [User Flows](#8-user-flows)
9. [UI Components & Layout](#9-ui-components--layout)
10. [Data Model](#10-data-model)
11. [API Behavior (Observed)](#11-api-behavior-observed)
12. [Known Limitations & Test-Relevant Behaviors](#12-known-limitations--test-relevant-behaviors)
13. [Glossary](#13-glossary)

---

## 1. Product Overview

**Demoblaze** (branded as "PRODUCT STORE") is a demonstration e-commerce web application built and maintained by BlazeMeter. It is intentionally designed as a test target for web automation frameworks, performance testing tools, and QA training exercises. The store simulates a real-world electronics retail site with product browsing, a shopping cart, user registration/login, and an order-placement flow.

### 1.1 Purpose

- Serve as a realistic but controlled test target for UI automation (Selenium, Playwright, Cypress, etc.)
- Provide a full purchase flow (browse → add to cart → place order) for end-to-end automation scenarios
- Support BlazeMeter performance testing demonstrations
- Act as a learning platform for QA engineers to practice test automation

### 1.2 Brand Identity

| Attribute | Value |
|-----------|-------|
| Brand Name | PRODUCT STORE |
| Parent Company | BlazeMeter |
| Contact Email | demo@blazemeter.com |
| Contact Phone | +440 123456 |
| Address | 2390 El Camino Real |
| Copyright | © Product Store |
| Page Title | STORE (consistent across all pages) |

---

## 2. Technology Stack & Architecture

### 2.1 Frontend

- **Framework:** Vanilla HTML5 / JavaScript (no SPA framework)
- **CSS Framework:** Bootstrap 4 (navbar, modals, grid, buttons)
- **JavaScript Libraries:** jQuery (DOM manipulation, AJAX calls)
- **Carousel:** Bootstrap Carousel component (3 slides on homepage)
- **Modals:** Bootstrap Modal component

### 2.2 Routing

- **Multi-page application (MPA):** separate `.html` files for each page
- Pages: `index.html`, `prod.html`, `cart.html`
- Product routing uses query parameter: `prod.html?idp_=<product_id>`
- Modals triggered via Bootstrap `data-toggle="modal"` and `data-target` attributes

### 2.3 Backend / API

- RESTful JSON API (endpoints not publicly documented)
- Cart state is persisted server-side (tied to session/cookie)
- User accounts stored server-side
- Product data fetched dynamically via AJAX on page load

### 2.4 State Management

- Cart contents: persisted server-side, loaded asynchronously on `cart.html`
- Auth state: session-based; on successful login the navbar shows the logged-in username and a "Log out" link replaces "Log in"
- Category filter: client-side filtering via `byCat()` JavaScript function with category slugs: `phone`, `notebook`, `monitor`

---

## 3. User Roles & Authentication Model

### 3.1 Roles

| Role | Description |
|------|-------------|
| Guest | Unauthenticated visitor. Can browse products, view product details, add items to cart, and place orders without logging in. |
| Registered User | Authenticated user. Can log in and out. Post-login, the navbar displays the username. |

### 3.2 Authentication

- **Registration:** Username + Password (no email required)
- **Login:** Username + Password; no "forgot password" or OAuth
- **Session:** Cookie/session-based; persists across page navigation within the session
- **Logout:** Available via "Log out" nav link (visible only when logged in)
- **Logged-in State Indicator:** `#nameofuser` nav element displays the authenticated username

### 3.3 Auth-Related Nav Links (State-Dependent)

| Nav Link | Visible When | Action |
|----------|-------------|--------|
| Log in | Always (guest or logged in) | Opens Log In modal |
| Sign up | Always | Opens Sign Up modal |
| Log out | Always (rendered but hidden via CSS when logged out) | Calls `logOut()` JS function |
| Username display (`#nameofuser`) | After login | Shows logged-in username |

---

## 4. Site Structure & Navigation

### 4.1 Global Navigation Bar

The navigation bar is consistent across all pages and contains:

| Element | Type | Target / Behavior |
|---------|------|-------------------|
| PRODUCT STORE logo | Link | `index.html` — navigates to homepage |
| Home | Nav link | `index.html` — shows `(current)` active indicator |
| Contact | Nav link | Opens Contact / "New message" modal |
| About us | Nav link | Opens About Us modal (video player) |
| Cart | Nav link | `cart.html` — navigates to cart page |
| Log in | Nav link | Opens Log In modal |
| Log out | Nav link (hidden when logged out) | Calls `logOut()` |
| Username | Nav link (hidden when logged out) | Displays current user (`#nameofuser`) |
| Sign up | Nav link | Opens Sign Up modal |

### 4.2 Footer

- Single-line copyright: `Copyright © Product Store`
- No additional links or social media

### 4.3 Pre-Footer (Three-Column Information Block)

Appears at the bottom of every page above the copyright footer:

| Column | Heading | Content |
|--------|---------|---------|
| Left | About Us | "We believe performance needs to be validated at every stage of the software development cycle and our open source compatible, massively scalable platform makes that a reality." |
| Middle | Get in Touch | Address: 2390 El Camino Real / Phone: +440 123456 / Email: demo@blazemeter.com |
| Right | PRODUCT STORE | Brand logo + name |

---

## 5. Page Specifications

### 5.1 Home Page (index.html)

**URL:** `https://www.demoblaze.com/` or `https://www.demoblaze.com/index.html`

#### 5.1.1 Hero Carousel

- Bootstrap carousel with 3 slides, auto-advancing
- Navigation: "Previous" button (left arrow), "Next" button (right arrow)
- Slide indicators: 3 dot indicators (clickable)
- Images labeled: "First slide", "Second slide", (third slide unlabeled)

#### 5.1.2 Category Sidebar

Located in the left column of the main content area:

| Element | ID/Selector | Behavior |
|---------|-------------|----------|
| CATEGORIES header | `#itemc` (link) | Navigates to `""` (home) |
| Phones | `a[onclick="byCat('phone')"]` | Filters product grid to phones |
| Laptops | `a[onclick="byCat('notebook')"]` | Filters product grid to laptops |
| Monitors | `a[onclick="byCat('monitor')"]` | Filters product grid to monitors |

- Default state: all products shown (no active category)
- Active category link receives Bootstrap `active` class
- Filter is applied by reloading the product grid via AJAX — no page reload

#### 5.1.3 Product Grid

- Responsive Bootstrap grid layout (cards)
- Each product card contains:
  - **Product image** (clickable link → `prod.html?idp_=<id>`)
  - **Product name** (H4, clickable link → `prod.html?idp_=<id>`)
  - **Price** (H5, formatted as `$<amount>`)
  - **Short description** (paragraph text)
- Default view shows 9 products per page
- Pagination: "Previous" and "Next" buttons below the grid

#### 5.1.4 Pagination

| Button | Behavior |
|--------|----------|
| Previous | Loads previous page of products; disabled on first page |
| Next | Loads next page of products |

---

### 5.2 Product Detail Page (prod.html)

**URL Pattern:** `https://www.demoblaze.com/prod.html?idp_=<product_id>`  
**Route Parameter:** `idp_` — integer product identifier

#### 5.2.1 Layout

- Left column: product image carousel (3 slide indicators, Previous/Next controls)
- Right column: product information panel

#### 5.2.2 Product Information Panel

| Element | HTML Level | Content |
|---------|-----------|---------|
| Product Name | H2 | e.g., "Samsung galaxy s6" |
| Price | H3 | e.g., "$360 *includes tax" |
| Description Label | `<strong>` | "Product description" |
| Description Body | Paragraph | Full product description text |
| Add to Cart | Link button (`<a>`) | Triggers add-to-cart API call |

#### 5.2.3 Add to Cart Behavior

- Selector: `a.btn.btn-success.btn-lg`
- On click: sends AJAX request to add product to cart (server-side)
- On success: browser native `alert()` dialog appears with message: **"Product added"**
- User must click OK to dismiss the alert
- No quantity selector — each click adds one unit
- No duplicate prevention — clicking multiple times adds multiple units

---

### 5.3 Cart Page (cart.html)

**URL:** `https://www.demoblaze.com/cart.html`

#### 5.3.1 Products Table

| Column | Header Label | Content |
|--------|-------------|---------|
| 1 | Pic | Product thumbnail image |
| 2 | Title | Product name (text) |
| 3 | Price | Numeric price (no $ symbol in table cell) |
| 4 | x | "Delete" link — removes item from cart |

- Table is populated asynchronously on page load from server-side cart
- Empty cart: table body is empty, Total shows blank/zero
- Delete link selector: `a` inside the `x` column cell, `href="#"`

#### 5.3.2 Total Section

- Heading: "Total"
- Dynamic H3 showing sum of all cart item prices (e.g., `360`)
- No $ symbol prefix in the total display

#### 5.3.3 Place Order Button

- Selector: `button[id="orderBtn"]` / `button` with text "Place Order"
- Opens the Place Order modal (see Section 6.5)

---

## 6. Modal Specifications

All modals use Bootstrap Modal component, triggered via data attributes. They overlay the current page without navigation.

---

### 6.1 Log In Modal

**Trigger:** "Log in" nav link  
**data-target:** `#logInModal`  
**Title:** "Log in"

#### Fields

| Label | Element | Type | Required | Notes |
|-------|---------|------|----------|-------|
| Username | `textbox` | Text input | Yes | No placeholder text |
| Password | `textbox` | Password input | Yes | No placeholder text |

#### Actions

| Button | Behavior |
|--------|----------|
| Close (header ×) | Dismisses modal, no action |
| Close (footer) | Dismisses modal, no action |
| Log in | Submits credentials; on success updates navbar with username; on failure shows alert with error message |

#### Post-Login State

- Navbar: "Log in" and "Sign up" remain visible; "Log out" becomes visible; `#nameofuser` displays username
- No page redirect — user stays on current page

---

### 6.2 Sign Up Modal

**Trigger:** "Sign up" nav link  
**data-target:** `#signInModal`  
**Title:** "Sign up"

#### Fields

| Label | Element | Type | Required | Notes |
|-------|---------|------|----------|-------|
| Username | `textbox "Username:"` | Text input | Yes | |
| Password | `textbox "Password:"` | Password input | Yes | |

#### Actions

| Button | Behavior |
|--------|----------|
| Close (header ×) | Dismisses modal |
| Close (footer) | Dismisses modal |
| Sign up | Submits registration; on success shows alert "Sign up successful."; on duplicate username shows alert with error |

#### Validation

- No client-side validation observed
- Duplicate username: server returns error message via alert dialog
- No email field, no password confirmation field, no password strength rules

---

### 6.3 Contact (New Message) Modal

**Trigger:** "Contact" nav link  
**data-target:** `#exampleModal`  
**Title:** "New message"

#### Fields

| Label | Element | Type | Required | Notes |
|-------|---------|------|----------|-------|
| Contact Email | `textbox` | Text input | Unknown | No validation observed |
| Contact Name | `textbox "Contact Email: Contact Name:"` | Text input | Unknown | Aria label includes prior field label (a11y quirk) |
| Message | `textbox "Message:"` | Text input (single line) | Unknown | |

#### Actions

| Button | Behavior |
|--------|----------|
| Close (header ×) | Dismisses modal |
| Close (footer) | Dismisses modal |
| Send message | Submits form; shows alert "Thanks for the message!!" on success |

---

### 6.4 About Us Modal

**Trigger:** "About us" nav link  
**data-target:** `#videoModal`  
**Title:** "About us"

#### Content

- Embedded video player (region labeled "Video Player")
- Application element (likely `<video>` or embedded iframe)
- "Play Video" button to start playback

#### Actions

| Button | Behavior |
|--------|----------|
| Close (header ×) | Dismisses modal, stops video |
| Close (footer) | Dismisses modal, stops video |

---

### 6.5 Place Order Modal

**Trigger:** "Place Order" button on `cart.html`  
**Title:** "Place order"

#### Pre-filled Information

- **Total:** Displays the current cart total (e.g., `Total: 360`) — read-only, shown above form fields

#### Fields

| Label | Element | Type | Required | Notes |
|-------|---------|------|----------|-------|
| Name | `textbox` | Text input | Yes | Billing/cardholder name |
| Country | `textbox "Country:"` | Text input | Yes | |
| City | `textbox "City:"` | Text input | Yes | |
| Credit card | `textbox "Credit card:"` | Text input | Yes | No masking, no card type detection |
| Month | `textbox "Month:"` | Text input | Yes | Free-text, no dropdown |
| Year | `textbox "Year:"` | Text input | Yes | Free-text, no dropdown |

#### Actions

| Button | Behavior |
|--------|----------|
| Close (header ×) | Dismisses modal, cart unchanged |
| Close (footer) | Dismisses modal, cart unchanged |
| Purchase | Submits order; on success shows confirmation modal with order ID, amount, card details, date, and a thank-you message; cart is cleared |

#### Post-Purchase Confirmation

On successful purchase, an overlay appears with:
- "Thank you for your purchase!" message
- Order ID
- Amount
- Card number (partial)
- Name
- Date
- "OK" button which dismisses and redirects to homepage

---

## 7. Product Catalog

### 7.1 Phones Category (`byCat('phone')`)

| ID | Product Name | Price | Key Specs |
|----|-------------|-------|-----------|
| 1 | Samsung galaxy s6 | $360 | 1.5GHz octa-core Exynos 7420, 3GB RAM, 32GB storage (non-expandable) |
| 2 | Nokia lumia 1520 | $820 | 2.2GHz quad-core Snapdragon 800, 2GB RAM |
| 3 | Nexus 6 | $650 | 2.7GHz quad-core Snapdragon 805, 3GB RAM |
| 4 | Samsung galaxy s7 | $800 | 1.6GHz octa-core, 4GB RAM, 32GB storage (expandable to 200GB) |
| 5 | Iphone 6 32gb | $790 | 1GB RAM, 16GB storage, 8MP rear camera, 1.2MP front camera |
| 6 | Sony xperia z5 | $320 | Launched Sep 2015, 5.20-inch 1080×1920 display, 424 PPI |
| 7 | HTC One M9 | $700 | 1.5GHz octa-core Snapdragon 810, 3GB RAM, 32GB (expandable to 128GB) |

### 7.2 Laptops Category (`byCat('notebook')`)

| ID | Product Name | Price | Key Specs |
|----|-------------|-------|-----------|
| 8 | Sony vaio i5 | $790 | Ultraportable, lighter than MacBook Pro 13-inch |
| 9 | Sony vaio i7 | $790 | Ultraportable, higher-res display, more storage, Blu-ray drive vs MacBook Pro |
| 11 | MacBook air | $700 | 1.6GHz dual-core i5 (Turbo Boost to 2.7GHz), 3MB L3 cache; configurable to i7 |
| 12 | Dell i7 8gb | $700 | i7-6500U 2.5GHz, 8GB DDR4, 1TB HDD, 15.6" FHD touch, Intel HD 520 |
| 13 | 2017 Dell 15.6 Inch | $700 | i7-7500U 2.7GHz, 8GB DDR4 2400MHz, 1TB, 15.6" FHD IPS touch, 360° hinge |
| 15 | MacBook Pro | $1100 | 13-inch and 15-inch models with Touch Bar |

### 7.3 Monitors Category (`byCat('monitor')`)

| ID | Product Name | Price | Key Specs |
|----|-------------|-------|-----------|
| 10 | Apple monitor 24 | $400 | 27-inch glossy LED-backlit IPS LCD, 2560×1440, 178° viewing angle, 375 cd/m², 1000:1 contrast, 12ms response |
| 14 | ASUS Full HD | $230 | ASUS VS247H-P 23.6-inch Full HD |

### 7.4 Product ID Gaps

Notable gap: Product ID 10 is a monitor categorized with monitors despite the "Apple monitor 24" label suggesting a display. IDs 1–9 cover phones and laptops; IDs 10–15 cover monitors and additional laptops. No products with IDs observed beyond 15 in the standard catalog.

---

## 8. User Flows

### 8.1 Browse & Purchase Flow (Guest)

```
1. Land on https://www.demoblaze.com (Home page)
2. [Optional] Click category (Phones / Laptops / Monitors) to filter
3. Click on a product card (image or name)
4. View product detail page
5. Click "Add to cart"
6. Dismiss "Product added" alert (OK)
7. Navigate to Cart (via nav link or direct URL)
8. Review cart items and total
9. Click "Place Order"
10. Fill in: Name, Country, City, Credit card, Month, Year
11. Click "Purchase"
12. View confirmation message (Order ID, Amount, Card, Name, Date)
13. Click "OK" → redirected to Home page
```

### 8.2 Register & Login Flow

```
1. Click "Sign up" in navbar
2. Enter Username and Password
3. Click "Sign up"
4. Dismiss success alert
5. Click "Log in" in navbar
6. Enter same Username and Password
7. Click "Log in"
8. Modal closes → navbar shows username in #nameofuser
```

### 8.3 Delete from Cart Flow

```
1. Navigate to cart.html
2. Locate item row in Products table
3. Click "Delete" link in the "x" column
4. Item is removed; Total updates
```

### 8.4 Contact Flow

```
1. Click "Contact" in navbar
2. Fill in: Contact Email, Contact Name, Message
3. Click "Send message"
4. Dismiss alert "Thanks for the message!!"
```

### 8.5 Category Filter Flow

```
1. On Home page, click "Phones", "Laptops", or "Monitors" in sidebar
2. Product grid updates (AJAX) showing only products in that category
3. Click "CATEGORIES" header link to return to all products
```

---

## 9. UI Components & Layout

### 9.1 Page Layout Structure

```
┌─────────────────────────────────────────────────────┐
│                  Navigation Bar                      │
│  [Logo] [Home] [Contact] [About] [Cart] [Login/User] │
├─────────────────────────────────────────────────────┤
│              Hero Carousel (Home only)               │
│  [◄ Prev]  [Slide Image]  [Next ►]                  │
├──────────────┬──────────────────────────────────────┤
│  Categories  │        Product Grid                  │
│  ──────────  │  ┌────┐ ┌────┐ ┌────┐               │
│  Phones      │  │Card│ │Card│ │Card│               │
│  Laptops     │  └────┘ └────┘ └────┘               │
│  Monitors    │        [Prev] [Next]                 │
├──────────────┴──────────────────────────────────────┤
│        Pre-footer: About | Contact | Brand          │
├─────────────────────────────────────────────────────┤
│              Copyright © Product Store              │
└─────────────────────────────────────────────────────┘
```

### 9.2 Product Card Structure

```
┌──────────────┐
│   [Image]    │  ← Clickable → prod.html?idp_=<id>
├──────────────┤
│ Product Name │  ← H4, clickable link
│    $Price    │  ← H5
│ Description  │  ← Paragraph (truncated)
└──────────────┘
```

### 9.3 Cart Table Structure

```
┌─────┬──────────────────┬───────┬────────┐
│ Pic │       Title      │ Price │   x    │
├─────┼──────────────────┼───────┼────────┤
│ img │ Samsung galaxy.. │  360  │ Delete │
└─────┴──────────────────┴───────┴────────┘
Total: 360
[Place Order]
```

### 9.4 Bootstrap Modal Structure (all modals)

```
┌─────────────────────────┐
│ Modal Title          [×]│  ← Header with Close button
├─────────────────────────┤
│  Form fields / content  │  ← Body
├─────────────────────────┤
│ [Close]     [Action]    │  ← Footer with two buttons
└─────────────────────────┘
```

---

## 10. Data Model

### 10.1 Product Entity

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `idp_` | Integer | `1` | URL query parameter; product primary key |
| `name` | String | `"Samsung galaxy s6"` | Displayed as H4 on cards, H2 on detail page |
| `price` | Integer | `360` | USD, no decimals |
| `description` | String | `"The Samsung Galaxy S6..."` | Short paragraph |
| `category` | String | `"phone"`, `"notebook"`, `"monitor"` | Used by `byCat()` filter |
| `image` | URL | (not shown in DOM) | Product image served from API |

### 10.2 Cart Item Entity

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `product_name` | String | `"Samsung galaxy s6"` | Displayed in Title column |
| `price` | Integer | `360` | Displayed in Price column (no $) |
| `image_url` | URL | (img src) | Displayed as thumbnail in Pic column |

### 10.3 Order Entity (Place Order Form)

| Field | Type | Example | Validation |
|-------|------|---------|------------|
| `name` | String | `"John Doe"` | None (client-side) |
| `country` | String | `"USA"` | None |
| `city` | String | `"New York"` | None |
| `credit_card` | String | `"1234567890"` | No masking, no format validation |
| `month` | String | `"12"` | Free text, no range check |
| `year` | String | `"2026"` | Free text, no range check |
| `total` | Integer | `360` | Pre-populated from cart; read-only |

### 10.4 User Entity

| Field | Type | Notes |
|-------|------|-------|
| `username` | String | Unique; displayed in navbar after login |
| `password` | String | Stored server-side; no complexity rules observed |

### 10.5 Contact Message Entity

| Field | Type | Notes |
|-------|------|-------|
| `contact_email` | String | No format validation observed |
| `contact_name` | String | |
| `message` | String | Single-line text input |

---

## 11. API Behavior (Observed)

### 11.1 Add to Cart

- **Trigger:** Click "Add to cart" on product detail page
- **Result:** Server-side cart updated; `alert("Product added")` shown
- **Idempotency:** Non-idempotent — repeated clicks add duplicate entries
- **Auth requirement:** None — works as guest

### 11.2 Delete from Cart

- **Trigger:** Click "Delete" link on cart page
- **Result:** Item removed from server-side cart; row removed from DOM; total recalculated

### 11.3 Cart Loading

- **Trigger:** Navigation to `cart.html`
- **Method:** Asynchronous (AJAX); table body populated after page load
- **Timing:** Brief delay between page render and cart data display

### 11.4 Category Filter

- **Trigger:** Click category link
- **Method:** AJAX call with category slug parameter
- **Result:** Product grid replaces its contents with filtered results; no page reload

### 11.5 Login

- **Trigger:** Submit Log In form
- **Success:** Modal closes; `#nameofuser` shows username; "Log out" appears
- **Failure:** Browser `alert()` with error message (e.g., "User does not exist.")

### 11.6 Sign Up

- **Trigger:** Submit Sign Up form
- **Success:** Browser `alert()` — "Sign up successful."
- **Failure:** Browser `alert()` with error (e.g., "This user already exist.")

### 11.7 Place Order / Purchase

- **Trigger:** Submit Place Order form
- **Success:** SweetAlert or custom modal shows confirmation with Order ID, amount, card info, name, date
- **Post-success:** Cart is cleared; user redirected to home page on clicking OK

### 11.8 Send Message

- **Trigger:** Submit Contact form
- **Success:** Browser `alert()` — "Thanks for the message!!"

---

## 12. Known Limitations & Test-Relevant Behaviors

### 12.1 No Input Validation

- All form fields (Sign Up, Login, Contact, Place Order) lack client-side validation
- Empty form submission is possible and produces server-side errors delivered via `alert()`
- Credit card field accepts any string — no Luhn check, no format mask

### 12.2 Duplicate Cart Items

- Adding the same product multiple times creates separate rows in the cart
- No "already in cart" check or quantity increment

### 12.3 Browser Alert Dialogs

- `alert()` used extensively for feedback (add to cart, sign up, login errors, contact success, purchase errors)
- Automation frameworks must handle these dialogs explicitly (e.g., `page.on('dialog', ...)` in Playwright)

### 12.4 Asynchronous Data Loading

- Cart page and product grid load data asynchronously — waits/explicit delays required in automation
- No loading indicators visible; data appears after AJAX calls resolve

### 12.5 Accessibility Quirks

- Contact modal: "Contact Name" textbox has an aria-label that includes "Contact Email:" prefix (concatenated from adjacent label) — accessibility anti-pattern
- About Us modal: Accessible dialog role is labeled "Log in" (inherited from prior modal state) — accessibility bug

### 12.6 Category Sidebar ID Collision

- All three category links share `id="itemc"` — non-unique IDs (HTML spec violation)
- Must be targeted by `onclick` attribute or text content in automation selectors

### 12.7 Guest Checkout

- The full purchase flow works without authentication
- No account association for guest orders

### 12.8 No Product Search

- No search bar or search functionality exists anywhere in the application

### 12.9 No Wishlist / Favorites

- No ability to save or favorite products outside of cart

### 12.10 Static Catalog

- Product catalog is pre-seeded; no admin interface for adding/removing products
- Product IDs are non-sequential (gap between 9 and 10, between 13 and 15)

---

## 13. Glossary

| Term | Definition |
|------|-----------|
| `idp_` | URL query parameter used to identify a product on the product detail page |
| `byCat()` | JavaScript function on `index.html` that filters the product grid by category slug |
| Cart | Server-side shopping cart tied to the current browser session |
| Place Order | The checkout action that opens the order form modal |
| Purchase | The final submission action within the Place Order modal |
| SweetAlert | Third-party alert library used for the post-purchase confirmation dialog (as opposed to native `alert()`) |
| Bootstrap Modal | Bootstrap 4 modal component used for all overlay dialogs (Login, Sign Up, Contact, About Us, Place Order) |
| Carousel | Bootstrap 4 image slider on the home page hero section |
| `#tbodyid` | DOM ID of the product grid container on the home page |
| `#nameofuser` | DOM ID of the nav element that displays the logged-in username |
| RAG | Retrieval-Augmented Generation — this document is structured for ingestion into a RAG pipeline |

---

*End of Document*

**Document stats:**
- Pages covered: 3 (index.html, prod.html, cart.html)
- Modals covered: 5 (Login, Sign Up, Contact, About Us, Place Order)
- Products catalogued: 15 (7 Phones, 6 Laptops, 2 Monitors)
- User flows documented: 5
- Known limitations: 10
