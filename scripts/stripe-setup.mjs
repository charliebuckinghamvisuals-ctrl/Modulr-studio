/**
 * Create the Modulr products, prices and coupons in Stripe, and print the
 * environment variables server.js reads them from. Idempotent: it looks up
 * existing objects by their lookup keys / coupon names first, so it can be
 * re-run safely and never creates duplicates.
 *
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.mjs
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs   (test mode first)
 *
 * Prices are inc VAT (Stripe automatic tax is on in checkout, so the amounts
 * are set as tax-inclusive). Restructured by Charlie 20 Sep 2026:
 *   Configurator £49.99 / £499.90 a year (lookup keys stay standard_*),
 *   The Hub £199 / £1,990 a year (lookup keys stay business_*),
 *   video credit packs £25 / £50 / £100 (one-off),
 *   founding coupon: The Hub at £140 for 12 months, first 5 companies,
 *   month-one coupon: same price, for trial users converting in their
 *   first month (expires on the date you set below).
 *
 * Stripe prices are immutable. If the 17 Sep prices (£59.99 / £199.99) were
 * already created under these lookup keys, this script will find and keep
 * them: archive those prices in the Stripe dashboard first (or move their
 * lookup keys), then re-run so the new amounts are created.
 */
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error('Set STRIPE_SECRET_KEY in the environment (never in a file that is committed).'); process.exit(1); }
const stripe = new Stripe(key);
const live = key.startsWith('sk_live');
console.log(`Stripe ${live ? 'LIVE' : 'TEST'} mode`);

/** The founding month-one coupon's expiry: the last day trial converts can still get it. */
const MONTH_ONE_ENDS = process.env.MONTH_ONE_ENDS || '2026-12-31';

const PRODUCTS = [
    { key: 'standard', name: 'Modulr Studio Configurator', description: 'Full 3D configurator, walk inside and outside, projects, saved designs, clients and PDFs. No AI tools.' },
    { key: 'business', name: 'Modulr Studio The Hub',      description: 'Everything in Configurator plus 250 renders a month, the Render Engine, material close-ups, Line Converter, 4K and Animation Studio.' },
    { key: 'video',    name: 'Modulr Video Credits',       description: 'Pay-as-you-go credit for Animation Studio clips.' },
];

const PRICES = [
    { env: 'STRIPE_PRICE_STANDARD_MONTHLY', lookup: 'standard_monthly', product: 'standard', pence: 4999,   recurring: { interval: 'month' } },
    { env: 'STRIPE_PRICE_STANDARD_YEARLY',  lookup: 'standard_yearly',  product: 'standard', pence: 49990,  recurring: { interval: 'year' } },
    { env: 'STRIPE_PRICE_BUSINESS_MONTHLY', lookup: 'business_monthly', product: 'business', pence: 19900,  recurring: { interval: 'month' } },
    { env: 'STRIPE_PRICE_BUSINESS_YEARLY',  lookup: 'business_yearly',  product: 'business', pence: 199000, recurring: { interval: 'year' } },
    { env: 'STRIPE_PRICE_VIDEO_25',         lookup: 'video_25',         product: 'video',    pence: 2500 },
    { env: 'STRIPE_PRICE_VIDEO_50',         lookup: 'video_50',         product: 'video',    pence: 5000 },
    { env: 'STRIPE_PRICE_VIDEO_100',        lookup: 'video_100',        product: 'video',    pence: 10000 },
];

// £199 -> £140 is £59.00 off a month for 12 months.
const COUPONS = [
    { env: 'STRIPE_COUPON_FOUNDING',  id: 'FOUNDING5',  name: 'Founding price (first 5 companies)', amount_off: 5900, currency: 'gbp', duration: 'repeating', duration_in_months: 12, max_redemptions: 5 },
    { env: 'STRIPE_COUPON_MONTH_ONE', id: 'FOUNDINGM1', name: 'Founding price (trial, first month)', amount_off: 5900, currency: 'gbp', duration: 'repeating', duration_in_months: 12, redeem_by: Math.floor(new Date(MONTH_ONE_ENDS + 'T23:59:59Z').getTime() / 1000) },
];

const out = [];

const products = {};
for (const p of PRODUCTS) {
    const found = await stripe.products.search({ query: `metadata['modulr_key']:'${p.key}'` });
    products[p.key] = found.data[0] || await stripe.products.create({ name: p.name, description: p.description, metadata: { modulr_key: p.key } });
    console.log(`product ${p.key}: ${products[p.key].id}${found.data[0] ? ' (existing)' : ' (created)'}`);
}

for (const pr of PRICES) {
    const found = await stripe.prices.list({ lookup_keys: [pr.lookup], limit: 1 });
    let price = found.data[0];
    if (!price) {
        price = await stripe.prices.create({
            product: products[pr.product].id,
            currency: 'gbp',
            unit_amount: pr.pence,
            tax_behavior: 'inclusive',
            lookup_key: pr.lookup,
            ...(pr.recurring ? { recurring: pr.recurring } : {}),
            metadata: { modulr_key: pr.lookup },
        });
    }
    console.log(`price ${pr.lookup}: ${price.id} £${(pr.pence / 100).toFixed(2)}${found.data[0] ? ' (existing)' : ' (created)'}`);
    out.push(`${pr.env}=${price.id}`);
}

for (const c of COUPONS) {
    let coupon = null;
    try { coupon = await stripe.coupons.retrieve(c.id); } catch { /* not there yet */ }
    if (!coupon) {
        const { env, ...def } = c;
        coupon = await stripe.coupons.create(def);
    }
    console.log(`coupon ${c.id}: ${coupon.id} (${coupon.times_redeemed}/${coupon.max_redemptions ?? 'unlimited'} used)${coupon.valid ? '' : ' - NO LONGER VALID'}`);
    out.push(`${c.env}=${coupon.id}`);
}

console.log('\nAdd these to Render (Environment) and to the local .env:\n');
console.log(out.join('\n'));
console.log('\nAlso needed: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (from the webhook endpoint for /webhook/stripe), and BILLING_ENABLED=true when you are ready to sell.');
