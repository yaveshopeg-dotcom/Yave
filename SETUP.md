# Turning on orders and the dashboard

The shop page and cart work on their own. To receive orders you need a database and a dashboard password.

1. In Vercel, open the project, go to **Storage**, and create an **Upstash Redis** database (free plan). Connect it to the project for all environments.
2. In **Settings → Environment Variables**, add `ADMIN_PASSWORD` with a long password you will remember (at least 8 characters).
3. In **Deployments**, open the latest one, tap the **⋯** menu and choose **Redeploy**.
4. Open `your-site/admin` and log in with that password.

Place a test order first, then delete it from the dashboard.

## How it works
- `api/server.js` receives orders and runs the dashboard. It reads prices from `products.js`, so customers can't change them.
- Orders are saved in the database. They are only visible on `/admin`.
- Payment is cash on delivery. You confirm the delivery fee by phone, then enter it in the order's "Delivery fee, notes, delete" section.
