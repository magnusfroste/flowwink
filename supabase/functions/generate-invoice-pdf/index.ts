import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { invoice_id } = await req.json();
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: "invoice_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch invoice with lead
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*, leads(id, name, email, company_id, companies(name))")
      .eq("id", invoice_id)
      .single();

    if (invErr || !invoice) {
      return new Response(
        JSON.stringify({ error: invErr?.message || "Invoice not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch company settings
    const { data: companyNameRow } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "company_name")
      .single();
    const { data: companyProfileRow } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "company_profile")
      .single();
    const { data: brandingRow } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "branding")
      .single();

    const companyName =
      typeof companyNameRow?.value === "string"
        ? companyNameRow.value
        : (companyNameRow?.value as any)?.company_name || "Company";
    const profile = (companyProfileRow?.value as any) || {};
    const branding = (brandingRow?.value as any) || {};
    const primaryColor = hexToRgb(branding.primary_color || "#2563eb");

    // Build PDF
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    const margin = 50;
    let y = height - margin;

    const black = rgb(0, 0, 0);
    const gray = rgb(0.4, 0.4, 0.4);
    const lightGray = rgb(0.85, 0.85, 0.85);
    const primary = rgb(
      primaryColor.r / 255,
      primaryColor.g / 255,
      primaryColor.b / 255
    );

    // --- Header: Company name + INVOICE label ---
    page.drawText(companyName, {
      x: margin,
      y,
      size: 20,
      font: helveticaBold,
      color: primary,
    });

    page.drawText("INVOICE", {
      x: width - margin - helveticaBold.widthOfTextAtSize("INVOICE", 28),
      y,
      size: 28,
      font: helveticaBold,
      color: black,
    });

    y -= 16;

    // Company address
    if (profile.address) {
      page.drawText(profile.address, {
        x: margin,
        y,
        size: 9,
        font: helvetica,
        color: gray,
      });
      y -= 12;
    }
    if (profile.contact_email) {
      page.drawText(profile.contact_email, {
        x: margin,
        y,
        size: 9,
        font: helvetica,
        color: gray,
      });
      y -= 12;
    }
    if (profile.contact_phone) {
      page.drawText(profile.contact_phone, {
        x: margin,
        y,
        size: 9,
        font: helvetica,
        color: gray,
      });
      y -= 12;
    }

    y -= 20;

    // Divider line
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 1,
      color: lightGray,
    });
    y -= 25;

    // --- Invoice meta ---
    const metaLeft = margin;
    const metaRight = width / 2 + 30;

    // Left: Bill To
    page.drawText("BILL TO", {
      x: metaLeft,
      y,
      size: 8,
      font: helveticaBold,
      color: gray,
    });
    y -= 14;

    const customerName =
      invoice.leads?.name || invoice.customer_name || "—";
    const customerEmail =
      invoice.leads?.email || invoice.customer_email || "";
    const customerCompany = invoice.leads?.companies?.name || "";

    page.drawText(customerName, {
      x: metaLeft,
      y,
      size: 11,
      font: helveticaBold,
      color: black,
    });
    y -= 14;
    if (customerCompany) {
      page.drawText(customerCompany, {
        x: metaLeft,
        y,
        size: 10,
        font: helvetica,
        color: gray,
      });
      y -= 13;
    }
    if (customerEmail) {
      page.drawText(customerEmail, {
        x: metaLeft,
        y,
        size: 10,
        font: helvetica,
        color: gray,
      });
      y -= 13;
    }

    // Right: Invoice details
    let metaY = y + 14 + 13 + (customerCompany ? 13 : 0);
    const detailLines = [
      ["Invoice #", invoice.invoice_number],
      ["Status", (invoice.status as string).toUpperCase()],
      [
        "Date",
        new Date(invoice.created_at).toLocaleDateString("sv-SE"),
      ],
      ...(invoice.due_date
        ? [
            [
              "Due Date",
              new Date(invoice.due_date).toLocaleDateString("sv-SE"),
            ],
          ]
        : []),
    ];

    for (const [label, value] of detailLines) {
      page.drawText(label, {
        x: metaRight,
        y: metaY,
        size: 9,
        font: helvetica,
        color: gray,
      });
      page.drawText(value, {
        x: metaRight + 80,
        y: metaY,
        size: 10,
        font: helveticaBold,
        color: black,
      });
      metaY -= 16;
    }

    y -= 30;

    // --- Line items table ---
    const colX = {
      desc: margin,
      qty: 340,
      price: 400,
      total: width - margin - 70,
    };

    // Header row
    page.drawRectangle({
      x: margin,
      y: y - 4,
      width: width - margin * 2,
      height: 20,
      color: rgb(
        primaryColor.r / 255,
        primaryColor.g / 255,
        primaryColor.b / 255
      ),
    });

    const headerY = y;
    page.drawText("Description", {
      x: colX.desc + 8,
      y: headerY,
      size: 9,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });
    page.drawText("Qty", {
      x: colX.qty,
      y: headerY,
      size: 9,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });
    page.drawText("Unit Price", {
      x: colX.price,
      y: headerY,
      size: 9,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });
    page.drawText("Amount", {
      x: colX.total,
      y: headerY,
      size: 9,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });

    y -= 22;

    const currency = invoice.currency || "SEK";
    const fmt = (cents: number) =>
      new Intl.NumberFormat("sv-SE", {
        style: "currency",
        currency,
      }).format(cents / 100);

    const lineItems = (invoice.line_items as any[]) || [];
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const lineTotal = item.qty * item.unit_price_cents;

      // Alternating row bg
      if (i % 2 === 0) {
        page.drawRectangle({
          x: margin,
          y: y - 4,
          width: width - margin * 2,
          height: 18,
          color: rgb(0.97, 0.97, 0.97),
        });
      }

      page.drawText(item.description || "", {
        x: colX.desc + 8,
        y,
        size: 9,
        font: helvetica,
        color: black,
      });
      page.drawText(String(item.qty), {
        x: colX.qty,
        y,
        size: 9,
        font: helvetica,
        color: black,
      });
      page.drawText(fmt(item.unit_price_cents), {
        x: colX.price,
        y,
        size: 9,
        font: helvetica,
        color: black,
      });
      page.drawText(fmt(lineTotal), {
        x: colX.total,
        y,
        size: 9,
        font: helvetica,
        color: black,
      });

      y -= 20;
    }

    y -= 10;

    // Divider
    page.drawLine({
      start: { x: colX.price - 10, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: lightGray,
    });
    y -= 18;

    // Totals
    const totalsX = colX.price - 10;
    const totalsValX = colX.total;

    page.drawText("Subtotal", {
      x: totalsX,
      y,
      size: 10,
      font: helvetica,
      color: gray,
    });
    page.drawText(fmt(invoice.subtotal_cents), {
      x: totalsValX,
      y,
      size: 10,
      font: helvetica,
      color: black,
    });
    y -= 16;

    page.drawText(`Tax (${Math.round(invoice.tax_rate * 100)}%)`, {
      x: totalsX,
      y,
      size: 10,
      font: helvetica,
      color: gray,
    });
    page.drawText(fmt(invoice.tax_cents), {
      x: totalsValX,
      y,
      size: 10,
      font: helvetica,
      color: black,
    });
    y -= 18;

    // Total line
    page.drawLine({
      start: { x: totalsX, y: y + 4 },
      end: { x: width - margin, y: y + 4 },
      thickness: 1,
      color: primary,
    });

    page.drawText("TOTAL", {
      x: totalsX,
      y: y - 10,
      size: 12,
      font: helveticaBold,
      color: black,
    });
    page.drawText(fmt(invoice.total_cents), {
      x: totalsValX,
      y: y - 10,
      size: 12,
      font: helveticaBold,
      color: primary,
    });

    y -= 40;

    // Notes
    if (invoice.notes) {
      page.drawText("Notes", {
        x: margin,
        y,
        size: 9,
        font: helveticaBold,
        color: gray,
      });
      y -= 14;
      // Simple text wrapping
      const words = invoice.notes.split(" ");
      let line = "";
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (helvetica.widthOfTextAtSize(test, 9) > width - margin * 2) {
          page.drawText(line, {
            x: margin,
            y,
            size: 9,
            font: helvetica,
            color: gray,
          });
          y -= 12;
          line = word;
        } else {
          line = test;
        }
      }
      if (line) {
        page.drawText(line, {
          x: margin,
          y,
          size: 9,
          font: helvetica,
          color: gray,
        });
      }
    }

    // Footer
    page.drawText(
      `${companyName} — Generated ${new Date().toLocaleDateString("sv-SE")}`,
      {
        x: margin,
        y: 30,
        size: 7,
        font: helvetica,
        color: lightGray,
      }
    );

    const pdfBytes = await pdfDoc.save();

    return new Response(pdfBytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.invoice_number}.pdf"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}
