/**
 * Create the Modulr products, prices and coupons in Stripe, and print the
 * environment variables server.js reads them from. Idempotent: it looks up
 * existing objects by their lookup keys / coupon names first, so it can be
 * re-run safely and never creates duplicates.
 *
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.mjs
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs   (test mode first)
 *
 * Prices are + VAT (Charlie, 24 Sep 2026 - they were inc VAT until then):
 * every price is tax-EXCLUSIVE and Stripe automatic tax adds 20% at
 * checkout and on invoices. A price still set inc VAT is replaced on the next
 * run, like a price at an old amount. Restructured by Charlie 20 Sep 2026:
 *   Configurator £49.99 / £499.90 a year (lookup keys stay standard_*),
 *   The Hub £199 / £1,990 a year (lookup keys stay business_*),
 *   video credit packs £25 / £50 / £100 (one-off),
 *   founding coupon: The Hub at £140 for 12 months, first 5 companies,
 *   month-one coupon: same price, for trial users converting in their
 *   first month (expires on the date you set below).
 *
 * Stripe prices are immutable. A price already under one of these lookup
 * keys at a different amount (the 17 Sep £59.99 / £199.99) is replaced: a
 * new price takes the lookup key and the old one is archived (24 Sep 2026 -
 * this used to be a manual step in the dashboard).
 */
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error('Set STRIPE_SECRET_KEY in the environment (never in a file that is committed).'); process.exit(1); }
const stripe = new Stripe(key);
const live = key.startsWith('sk_live');
console.log(`Stripe ${live ? 'LIVE' : 'TEST'} mode`);

/** The founding month-one coupon's expiry: the last day trial converts can still get it. */
const MONTH_ONE_ENDS = process.env.MONTH_ONE_ENDS || '2026-12-31';

/**
 * What the customer reads on the Stripe checkout page, receipts and invoices
 * (24 Sep 2026). The first three are sold in the app; the rest are invoiced
 * from the dashboard, with the amount set on each invoice (they are quoted),
 * so they are created without a price.
 */
const PRODUCTS = [
    {
        key: 'standard', name: 'Modulr Studio - Configurator',
        description: 'The design side of Modulr Studio for garden room and annexe providers: the full 3D Configurator with interiors, kitchens and walk inside and outside, and Jobs & Quotes - your price book, quotes built from the design, the lead-to-won pipeline and branded PDF quotes and proposals. Includes a 1-to-1 online training session with Charlie, who built Modulr Studio. No AI renders.',
    },
    {
        key: 'business', name: 'Modulr Studio - The Hub',
        description: 'Everything in Configurator, plus the AI studio: 250 renders a month across the Render Engine, Interior Render, Detail Studio, Material Editor, Line Converter and Weather Lab, 50 4K exports a month, and Animation Studio and Floor Plan Studio as they launch. Includes a 1-to-1 online training session with Charlie, who built Modulr Studio.',
    },
    {
        key: 'video', name: 'Modulr Studio - Animations',
        description: 'Animations for Animation Studio, The Hub: a finished render turned into a short clip. One animation is one clip; the longest cinematic clips count as two or three, always shown before you generate. A failed clip is refunded automatically. Credit lasts 12 months.',
    },
    {
        key: 'managed_project', name: 'Modulr Managed Service - per project', invoiceOnly: true,
        description: 'A Modulr designer builds the scheme for you from your brief: 3D Configurator build with the interior, walk inside and outside, a render set, a material specification and a client PDF, with one round of changes. Delivered as files plus a client link. No subscription needed.',
    },
    {
        key: 'website_config_setup', name: 'Website Configurator - setup', invoiceOnly: true,
        description: 'Your own 3D configurator, built for your website: your set designs, your finishes and your prices, in your branding, added to your site with one line of code. Includes four set designs; no Modulr plan needed.',
    },
    {
        key: 'website_config_monthly', name: 'Website Configurator - monthly', invoiceOnly: true,
        description: 'Hosting for your Website Configurator, with every design a homeowner sends arriving as a lead.',
    },
    {
        key: 'website_config_design', name: 'Website Configurator - extra set design', invoiceOnly: true,
        description: 'One more of your set designs added to your Website Configurator, beyond the four included in the setup.',
    },
    {
        key: 'website_config_update', name: 'Website Configurator - update, support or fix', invoiceOnly: true,
        description: 'A later change to your Website Configurator: an update, a support request or a fix. Price changes you make yourself from your price book are free.',
    },
];

/**
 * Products that are no longer sold (24 Sep 2026: the two managed-design
 * routes became one per-project price). Archived, never deleted - past
 * invoices still point at them.
 */
const RETIRED = ['managed_package', 'managed_design'];

const PRICES = [
    { env: 'STRIPE_PRICE_STANDARD_MONTHLY', lookup: 'standard_monthly', product: 'standard', pence: 4999,   recurring: { interval: 'month' }, nickname: 'Configurator, monthly' },
    { env: 'STRIPE_PRICE_STANDARD_YEARLY',  lookup: 'standard_yearly',  product: 'standard', pence: 49990,  recurring: { interval: 'year' },  nickname: 'Configurator, yearly' },
    { env: 'STRIPE_PRICE_BUSINESS_MONTHLY', lookup: 'business_monthly', product: 'business', pence: 19900,  recurring: { interval: 'month' }, nickname: 'The Hub, monthly' },
    { env: 'STRIPE_PRICE_BUSINESS_YEARLY',  lookup: 'business_yearly',  product: 'business', pence: 199000, recurring: { interval: 'year' },  nickname: 'The Hub, yearly' },
    { env: 'STRIPE_PRICE_VIDEO_25',         lookup: 'video_25',         product: 'video',    pence: 2500,  nickname: '7 animations' },
    { env: 'STRIPE_PRICE_VIDEO_50',         lookup: 'video_50',         product: 'video',    pence: 5000,  nickname: '15 animations' },
    { env: 'STRIPE_PRICE_VIDEO_100',        lookup: 'video_100',        product: 'video',    pence: 10000, nickname: '30 animations' },
    // Invoiced from the dashboard, not sold in the app: fixed prices so an
    // invoice or subscription picks them up. No env var - server.js never
    // sees them.
    { env: null, lookup: 'managed_project',        product: 'managed_project',        pence: 14999, nickname: 'Managed Service, one project' },
    { env: null, lookup: 'website_config_setup',   product: 'website_config_setup',   pence: 99500, nickname: 'Website Configurator, setup with four set designs' },
    { env: null, lookup: 'website_config_design',  product: 'website_config_design',  pence: 20000, nickname: 'Website Configurator, extra set design' },
    { env: null, lookup: 'website_config_monthly', product: 'website_config_monthly', pence: 9900,  recurring: { interval: 'month' }, nickname: 'Website Configurator, monthly' },
    { env: null, lookup: 'website_config_update',  product: 'website_config_update',  pence: 5000,  nickname: 'Website Configurator, update or fix' },
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
    const existing = found.data[0];
    // Existing products take the current name and description, so re-running
    // the script is how the checkout wording is kept up to date.
    products[p.key] = existing
        ? await stripe.products.update(existing.id, { name: p.name, description: p.description, active: true })
        : await stripe.products.create({ name: p.name, description: p.description, metadata: { modulr_key: p.key } });
    console.log(`product ${p.key}: ${products[p.key].id}${existing ? ' (updated)' : ' (created)'}${p.invoiceOnly ? ' - invoiced from the dashboard' : ''}`);
}

for (const k of RETIRED) {
    const found = await stripe.products.search({ query: `metadata['modulr_key']:'${k}'` });
    for (const old of found.data.filter(x => x.active)) {
        await stripe.products.update(old.id, { active: false });
        console.log(`product ${k}: ${old.id} archived (no longer sold)`);
    }
}

for (const pr of PRICES) {
    const found = await stripe.prices.list({ lookup_keys: [pr.lookup], limit: 1 });
    let price = found.data[0];
    const stale = price && (price.unit_amount !== pr.pence || !price.active || price.product !== products[pr.product].id || price.tax_behavior !== 'exclusive');
    if (!price || stale) {
        // Prices cannot be edited. A price at an old amount (the 17 Sep
        // £59.99 / £199.99, say) is replaced: the new one takes over its
        // lookup key and the old one is archived. Existing subscribers stay
        // on the price they signed up at until they are moved.
        const created = await stripe.prices.create({
            product: products[pr.product].id,
            currency: 'gbp',
            unit_amount: pr.pence,
            tax_behavior: 'exclusive',
            lookup_key: pr.lookup,
            transfer_lookup_key: true,
            nickname: pr.nickname,
            ...(pr.recurring ? { recurring: pr.recurring } : {}),
            metadata: { modulr_key: pr.lookup },
        });
        if (stale && price.active) await stripe.prices.update(price.id, { active: false });
        if (stale) console.log(`  replaced ${pr.lookup} ${price.id} (£${(price.unit_amount / 100).toFixed(2)}), archived`);
        price = created;
    } else if (price.nickname !== pr.nickname) {
        await stripe.prices.update(price.id, { nickname: pr.nickname });
    }
    console.log(`price ${pr.lookup}: ${price.id} £${(pr.pence / 100).toFixed(2)} + VAT${found.data[0] && !stale ? ' (existing)' : ' (created)'}`);
    if (pr.env) out.push(`${pr.env}=${price.id}`);
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
console.log('\nAlso needed: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and, when you are ready to sell, BILLING_ENABLED=true.');
console.log('Webhook endpoint: https://www.modulrstudio.co.uk/webhook/stripe (with www - the bare domain redirects and Stripe does not follow redirects).');
console.log('Webhook events: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.deleted');
