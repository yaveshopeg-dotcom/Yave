# Yave

Static website for the Yave brand. No build step, no dependencies.

## Files
- `index.html` – homepage with the size finder and waitlist
- `size-guide.html` – size chart, how to measure, size finder
- `app.js` – size data and recommendation logic (edit `SIZES` to change the chart)
- `logo.png` / `favicon.png` – brand logo (transparent) and tab icon
- `style.css` – all styles and colour tokens (`:root`)

## Run locally
Open `index.html` in a browser, or run `npx serve .`

## Deploy
1. Push this folder to a new GitHub repo.
2. In Vercel, choose Add New Project, import the repo, leave all settings as default (Framework: Other), and deploy.

## Waitlist
In `index.html`, replace `YOUR_FORM_ID` in the waitlist form's `action` with a real Formspree form ID (or another form endpoint).

## Adding products later
Add a `shop.html` and a product grid, or move to a store backend such as Shopify or Stripe Checkout when you're ready to sell.
