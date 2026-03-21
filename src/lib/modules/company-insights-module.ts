export const companyInsightsModule = {
  id: "companyInsights",
  name: "Business Identity",
  description: "Unified business identity, financials, and market positioning. Feeds Sales Intelligence, Chat AI, SEO, and FlowAgent with company context.",
  category: "crm" as const,
  icon: "Building2",
  autonomy: "agent-capable" as const,
  defaultEnabled: true,
  dependencies: [],
  optionalIntegrations: ["firecrawl"],
  features: [
    "Company identity management",
    "Website-based enrichment",
    "Public records enrichment (web search)",
    "Financial insights",
    "Market positioning & ICP",
    "Enrichment history & source tracking",
  ],
};
