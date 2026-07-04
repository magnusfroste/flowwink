import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CartItem {
  productId: string;
  productName: string;
  priceCents: number;
  quantity: number;
  variantId?: string | null;
}

interface CheckoutRequest {
  items: CartItem[];
  customerName: string;
  customerEmail: string;
  userId?: string | null;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  bookingId?: string | null;
  discountCode?: string | null;
  /** snake_case alias for agent/REST callers */
  discount_code?: string | null;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  type: "one_time" | "recurring";
  price_cents: number;
  currency: string;
  image_url: string | null;
  stripe_price_id: string | null;
}

interface Variant {
  id: string;
  product_id: string;
  sku: string | null;
  price_delta_cents: number;
  is_active: boolean;
}

interface ResolvedDiscount {
  codeId: string;
  code: string;
  type: string;
  value: number;
  discountCents: number;
}

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[create-checkout] ${step}${detailsStr}`);
};

/**
 * Server-side price resolution for variant items. Any item carrying a
 * variantId gets its priceCents overridden with the DB truth
 * (product.price_cents + variant.price_delta_cents) so client-tampered or
 * stale cart prices can never set what a variant costs. Non-variant items
 * are left as-is here (live mode prices those from Stripe price ids).
 * Throws when a variant is missing, inactive, or belongs to another product.
 */
// deno-lint-ignore no-explicit-any
async function resolveVariantPrices(supabase: any, items: CartItem[]): Promise<Map<string, Variant>> {
  const variantIds = items.map((i) => i.variantId).filter(Boolean) as string[];
  const variantMap = new Map<string, Variant>();
  if (variantIds.length === 0) return variantMap;

  const { data: variants, error: variantsError } = await supabase
    .from("product_variants")
    .select("id, product_id, sku, price_delta_cents, is_active")
    .in("id", variantIds);
  if (variantsError) {
    logStep("Error fetching variants", variantsError);
    throw new Error("Could not fetch product variants");
  }
  for (const v of variants || []) variantMap.set(v.id, v as Variant);

  const productIds = [...new Set(items.filter((i) => i.variantId).map((i) => i.productId))];
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, price_cents")
    .in("id", productIds);
  if (productsError) {
    logStep("Error fetching products for variants", productsError);
    throw new Error("Could not fetch product details");
  }
  const basePrices = new Map<string, number>();
  for (const p of products || []) basePrices.set(p.id, p.price_cents);

  for (const item of items) {
    if (!item.variantId) continue;
    const variant = variantMap.get(item.variantId);
    if (!variant || !variant.is_active) {
      throw new Error(`Variant ${item.variantId} not found or inactive`);
    }
    if (variant.product_id !== item.productId) {
      throw new Error(`Variant ${item.variantId} does not belong to product ${item.productId}`);
    }
    const base = basePrices.get(item.productId);
    if (base === undefined) {
      throw new Error(`Product ${item.productId} not found`);
    }
    item.priceCents = base + (variant.price_delta_cents ?? 0);
  }
  return variantMap;
}

/**
 * Validate a discount code server-side via the validate_discount_code RPC
 * (single source of truth shared with the public checkout UI). Throws on an
 * invalid code so the order is never created with a discount that no longer
 * applies — the UI surfaces the reason and lets the visitor retry.
 */
// deno-lint-ignore no-explicit-any
async function resolveDiscount(
  supabase: any,
  rawCode: string,
  subtotalCents: number,
  currency: string,
): Promise<ResolvedDiscount> {
  const { data, error } = await supabase.rpc("validate_discount_code", {
    p_code: rawCode,
    p_order_cents: subtotalCents,
    p_currency: currency,
  });
  if (error) {
    logStep("Discount validation error", error);
    throw new Error("Could not validate discount code");
  }
  if (!data?.valid) {
    throw new Error(data?.reason ? `Discount code rejected: ${data.reason}` : "Invalid discount code");
  }
  return {
    codeId: data.code_id,
    code: data.code,
    type: data.type,
    value: Number(data.value),
    discountCents: Math.min(Number(data.discount_cents ?? 0), subtotalCents),
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

            const supabase = getServiceClient();

    // Check integration + module settings
    const { data: integrationSettings } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "integrations")
      .maybeSingle();

    const { data: moduleSettings } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "modules")
      .maybeSingle();

    const stripeEnabled = (integrationSettings?.value as any)?.stripe?.enabled ?? false;
    const ecomConfig = (moduleSettings?.value as any)?.ecommerce ?? {};
    const sandboxMode = ecomConfig.sandboxMode ?? (!stripeEnabled); // Auto-sandbox if Stripe is off
    const sandboxAutoPayDays = ecomConfig.sandboxAutoPayDays ?? 0;

    logStep("Mode check", { stripeEnabled, sandboxMode, sandboxAutoPayDays });

    const body: CheckoutRequest = await req.json();
    const {
      items,
      customerName,
      customerEmail,
      userId,
      currency,
      successUrl,
      cancelUrl,
      bookingId,
    } = body;
    const discountCode = (body.discountCode ?? body.discount_code ?? "").trim() || null;

    // The storefront passes a real successUrl (its own confirmation page), but
    // autonomous/MCP callers (e.g. place_order via an agent) don't — which made
    // the sandbox redirectUrl come out as "undefined?order_id=…". Fall back to a
    // resolved site origin so the URL is always valid. (Reported by OpenClaw,
    // finding efb271fa.)
    let resolvedSuccessUrl = (successUrl ?? "").trim();
    if (!resolvedSuccessUrl) {
      resolvedSuccessUrl = Deno.env.get("PUBLIC_SITE_URL") || "";
      if (!resolvedSuccessUrl) {
        const { data: gen } = await supabase
          .from("site_settings").select("value").eq("key", "general").maybeSingle();
        const g = (gen?.value as any) || {};
        resolvedSuccessUrl = g.siteUrl || g.site_url || g.public_url || g.publicUrl || "";
      }
      resolvedSuccessUrl = (resolvedSuccessUrl || "https://dev.flowwink.com").replace(/\/+$/, "");
    }

    if (!items || items.length === 0) {
      throw new Error("No items in cart");
    }
    logStep("Starting checkout", { customerEmail, itemCount: items.length, discountCode });

    if (!customerEmail) {
      throw new Error("Customer email is required");
    }

    // Variant items always get DB-truth prices (also validates ownership).
    const variantMap = await resolveVariantPrices(supabase, items);

    // ── SANDBOX MODE: Skip Stripe entirely ──
    if (sandboxMode) {
      logStep("Sandbox mode — creating order without payment");

      const subtotalCents = items.reduce(
        (sum, item) => sum + item.priceCents * item.quantity, 0
      );

      let discount: ResolvedDiscount | null = null;
      if (discountCode) {
        discount = await resolveDiscount(supabase, discountCode, subtotalCents, currency || 'SEK');
        logStep("Discount applied (sandbox)", discount);
      }
      const totalCents = subtotalCents - (discount?.discountCents ?? 0);

      const orderStatus = sandboxAutoPayDays === 0 ? "paid" : "pending";

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_email: customerEmail,
          customer_name: customerName,
          total_cents: totalCents,
          currency: (currency || 'SEK').toUpperCase(),
          status: orderStatus,
          user_id: userId || null,
          discount_code: discount?.code ?? null,
          discount_cents: discount?.discountCents ?? null,
          discount_code_id: discount?.codeId ?? null,
          metadata: {
            sandbox: true,
            sandbox_auto_pay_days: sandboxAutoPayDays,
            sandbox_pay_at: sandboxAutoPayDays > 0
              ? new Date(Date.now() + sandboxAutoPayDays * 86400000).toISOString()
              : null,
            booking_id: bookingId || null,
            ...(discount ? { discount: { code: discount.code, type: discount.type, value: discount.value, discount_cents: discount.discountCents } } : {}),
          },
        })
        .select()
        .single();

      if (orderError) {
        logStep("Sandbox order error", orderError);
        throw new Error("Could not create sandbox order");
      }

      // Create order items
      const orderItems = items.map((item) => ({
        order_id: order.id,
        product_id: item.productId,
        variant_id: item.variantId ?? null,
        product_name: item.productName,
        price_cents: item.priceCents,
        quantity: item.quantity,
      }));
      await supabase.from("order_items").insert(orderItems);

      // Sandbox orders exist in the DB immediately — count the redemption now.
      if (discount) {
        const { error: redeemError } = await supabase.rpc("redeem_discount_code", {
          p_code_id: discount.codeId,
        });
        if (redeemError) logStep("Discount redeem error (sandbox)", redeemError);
      }

      logStep("Sandbox order created", { orderId: order.id, status: orderStatus });

      // Trigger CMS webhooks for sandbox orders too
      try {
        const webhookEvent = orderStatus === "paid" ? "order.paid" : "order.created";
        const { data: webhooks } = await supabase
          .from("webhooks")
          .select("*")
          .eq("is_active", true)
          .contains("events", [webhookEvent]);

        if (webhooks && webhooks.length > 0) {
          for (const webhook of webhooks) {
            fetch(webhook.url, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...(webhook.headers || {}) },
              body: JSON.stringify({
                event: webhookEvent,
                timestamp: new Date().toISOString(),
                data: { id: order.id, total_cents: totalCents, customer_email: customerEmail, sandbox: true },
              }),
            }).catch(() => {});
          }
        }
      } catch (_) {}

      return new Response(
        JSON.stringify({
          sandbox: true,
          orderId: order.id,
          status: orderStatus,
          redirectUrl: `${resolvedSuccessUrl}?order_id=${order.id}&sandbox=true`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── LIVE MODE: Stripe payment ──
    if (!stripeKey) {
      throw new Error("Stripe secret key not configured. Enable sandbox mode or configure Stripe.");
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil",
    });

    // Fetch all products from database to get their types and stripe_price_ids
    const productIds = items.map((item) => item.productId);
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, name, description, type, price_cents, currency, image_url, stripe_price_id")
      .in("id", productIds);

    if (productsError) {
      logStep("Error fetching products", productsError);
      throw new Error("Could not fetch product details");
    }

    logStep("Fetched products", { count: products?.length });

    // Create a map for quick lookup
    const productMap = new Map<string, Product>();
    for (const product of products || []) {
      productMap.set(product.id, product as Product);
    }

    // Determine checkout mode based on products
    // If ANY product is recurring, we use subscription mode
    const hasRecurring = items.some((item) => {
      const product = productMap.get(item.productId);
      return product?.type === "recurring";
    });
    const hasOneTime = items.some((item) => {
      const product = productMap.get(item.productId);
      return product?.type === "one_time";
    });

    logStep("Product types", { hasRecurring, hasOneTime });

    // For mixed carts, we need to handle this differently
    // Stripe subscription mode can include one-time items via price_data
    const mode = hasRecurring ? "subscription" : "payment";

    // Ensure all products have Stripe price IDs (create if missing)
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    const productsToUpdate: { id: string; stripe_price_id: string }[] = [];

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) {
        logStep("Product not found", { productId: item.productId });
        throw new Error(`Product ${item.productId} not found`);
      }

      // Variant items: charge the variant's server-resolved price via inline
      // price_data (the product's stripe_price_id knows nothing about deltas).
      if (item.variantId) {
        const variant = variantMap.get(item.variantId)!;
        const priceData: Stripe.Checkout.SessionCreateParams.LineItem.PriceData = {
          currency: product.currency.toLowerCase(),
          unit_amount: item.priceCents,
          product_data: {
            name: item.productName || product.name,
            metadata: {
              flowwink_product_id: product.id,
              flowwink_variant_id: variant.id,
              ...(variant.sku ? { sku: variant.sku } : {}),
            },
          },
        };
        if (product.type === "recurring") {
          priceData.recurring = { interval: "month" };
        }
        lineItems.push({ price_data: priceData, quantity: item.quantity });
        continue;
      }

      // Keep the order row honest: non-variant items are charged at the DB
      // price (via the Stripe price id), so the order total must use it too.
      item.priceCents = product.price_cents;

      let stripePriceId = product.stripe_price_id;

      // If no Stripe price ID, create product and price in Stripe
      if (!stripePriceId) {
        logStep("Creating Stripe product", { productName: product.name });

        // Create Stripe product
        const stripeProduct = await stripe.products.create({
          name: product.name,
          description: product.description || undefined,
          images: product.image_url ? [product.image_url] : undefined,
          metadata: {
            flowwink_product_id: product.id,
          },
        });

        logStep("Created Stripe product", { stripeProductId: stripeProduct.id });

        // Create Stripe price
        const priceData: Stripe.PriceCreateParams = {
          product: stripeProduct.id,
          unit_amount: product.price_cents,
          currency: product.currency.toLowerCase(),
        };

        if (product.type === "recurring") {
          priceData.recurring = { interval: "month" };
        }

        const stripePrice = await stripe.prices.create(priceData);
        stripePriceId = stripePrice.id;

        logStep("Created Stripe price", { stripePriceId });

        // Queue update to save back to database
        productsToUpdate.push({ id: product.id, stripe_price_id: stripePriceId! });
      }

      lineItems.push({
        price: stripePriceId,
        quantity: item.quantity,
      });
    }

    // Update products with new Stripe price IDs
    for (const update of productsToUpdate) {
      const { error: updateError } = await supabase
        .from("products")
        .update({ stripe_price_id: update.stripe_price_id })
        .eq("id", update.id);

      if (updateError) {
        logStep("Error updating product with stripe_price_id", updateError);
      } else {
        logStep("Updated product with stripe_price_id", update);
      }
    }

    // Calculate total for order (server-resolved prices)
    const subtotalCents = items.reduce(
      (sum, item) => sum + item.priceCents * item.quantity,
      0
    );

    // Validate + price the discount against the server-side subtotal
    let discount: ResolvedDiscount | null = null;
    if (discountCode) {
      discount = await resolveDiscount(supabase, discountCode, subtotalCents, currency || 'SEK');
      logStep("Discount applied (live)", discount);
    }
    const totalCents = subtotalCents - (discount?.discountCents ?? 0);

    // Create order in database. total_cents is net of discount; use_count is
    // incremented by stripe-webhook when the payment actually completes.
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        customer_email: customerEmail,
        customer_name: customerName,
        total_cents: totalCents,
        currency: currency.toUpperCase(),
        status: "pending",
        user_id: userId || null,
        discount_code: discount?.code ?? null,
        discount_cents: discount?.discountCents ?? null,
        discount_code_id: discount?.codeId ?? null,
        metadata: {
          mode,
          hasRecurring,
          hasOneTime,
          booking_id: bookingId || null,
          ...(discount ? { discount: { code: discount.code, type: discount.type, value: discount.value, discount_cents: discount.discountCents } } : {}),
        },
      })
      .select()
      .single();

    if (orderError) {
      logStep("Error creating order", orderError);
      throw new Error("Could not create order");
    }

    logStep("Created order", { orderId: order.id });

    // Create order items
    const orderItems = items.map((item) => ({
      order_id: order.id,
      product_id: item.productId,
      variant_id: item.variantId ?? null,
      product_name: item.productName,
      price_cents: item.priceCents,
      quantity: item.quantity,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) {
      logStep("Error creating order items", itemsError);
    }

    // Check for existing Stripe customer
    const customers = await stripe.customers.list({
      email: customerEmail,
      limit: 1,
    });

    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing Stripe customer", { customerId });
    }

    // Create Stripe Checkout Session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: mode,
      success_url: `${resolvedSuccessUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        order_id: order.id,
        booking_id: bookingId || undefined,
      },
    };

    // Apply the discount as a one-off Stripe coupon. Always amount_off (even
    // for percent codes) so the Stripe charge matches the discounted
    // total_cents we stored on the order to the cent — percent_off would let
    // Stripe do its own rounding.
    if (discount && discount.discountCents > 0) {
      const coupon = await stripe.coupons.create({
        name: discount.code,
        duration: "once",
        amount_off: discount.discountCents,
        currency: currency.toLowerCase(),
      });
      sessionParams.discounts = [{ coupon: coupon.id }];
      logStep("Created Stripe coupon", { couponId: coupon.id });
    }

    // Add customer info
    if (customerId) {
      sessionParams.customer = customerId;
    } else {
      sessionParams.customer_email = customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    logStep("Created Stripe session", { sessionId: session.id, mode });

    // Update order with Stripe checkout ID
    await supabase
      .from("orders")
      .update({ stripe_checkout_id: session.id })
      .eq("id", order.id);

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logStep("Checkout error", { error: message });
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
