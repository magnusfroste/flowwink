import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CartItem {
  productId: string;
  productName: string;
  priceCents: number;
  quantity: number;
}

interface CheckoutRequest {
  items: CartItem[];
  customerName: string;
  customerEmail: string;
  currency: string;
  successUrl: string;
  cancelUrl: string;
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

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[create-checkout] ${step}${detailsStr}`);
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      throw new Error("Stripe secret key not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      items,
      customerName,
      customerEmail,
      currency,
      successUrl,
      cancelUrl,
    }: CheckoutRequest = await req.json();

    logStep("Starting checkout", { customerEmail, itemCount: items.length });

    if (!items || items.length === 0) {
      throw new Error("No items in cart");
    }
    if (!customerEmail) {
      throw new Error("Customer email is required");
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

    // Calculate total for order
    const totalCents = items.reduce(
      (sum, item) => sum + item.priceCents * item.quantity,
      0
    );

    // Create order in database
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        customer_email: customerEmail,
        customer_name: customerName,
        total_cents: totalCents,
        currency: currency.toUpperCase(),
        status: "pending",
        metadata: { mode, hasRecurring, hasOneTime },
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
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        order_id: order.id,
      },
    };

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
