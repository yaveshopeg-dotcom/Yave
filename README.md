# Yave

Static website for the Yave brand. No build step, no dependencies.

## Files
- `index.html` – homepage with the size finder and waitlist
- `products.js` – your product list. Add a product here and it appears on the home page with its own page
- `product.html` – the product page (one template, filled from `products.js`)
- `app.js` – size data and recommendation logic (edit `SIZES` to change the chart; also builds the size guide popup)
- `logo.png` / `favicon.png` – brand logo (transparent) and tab icon
- `style.css` – all styles and colour tokens (`:root`)

## Run locally
Open `index.html` in a browser, or run `npx serve .`

## Deploy
1. Push this folder to a new GitHub repo.
2. In Vercel, choose Add New Project, import the repo, leave all settings as default (Framework: Other), and deploy.

## Waitlist
In `index.html`, replace `YOUR_FORM_ID` in the waitlist form's `action` with a real Formspree form ID (or another form endpoint).

## Adding a product
1. Upload the photos to an `images` folder in the repo.
2. Copy the example in `products.js`, remove the `//` marks and fill it in.
3. Commit. The home page and a product page update by themselves.

## Store later
When you're ready to take orders, connect a checkout such as Stripe Checkout or Shopify and replace the disabled Add to cart button.
