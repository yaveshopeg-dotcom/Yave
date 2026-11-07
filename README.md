# Yave

Static website for the Yave brand. No build step, no dependencies.

## Files
- `index.html` – homepage with the size finder and waitlist
- `products.js` – your size charts (one per garment type) and your product list. Each product picks its chart
- `product.html` – the product page (one template, filled from `products.js`)
- `app.js` – the shop, product pages and size popup logic
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
2. In `products.js`, add a size chart for the garment under `CHARTS` if it's a new type (crewneck, hoodie, pants...).
3. Copy the product example, remove the `//` marks, fill it in and set `chart` to that chart's name.
4. Commit. The home page and a product page update by themselves.

## Store later
When you're ready to take orders, connect a checkout such as Stripe Checkout or Shopify and replace the disabled Add to cart button.
