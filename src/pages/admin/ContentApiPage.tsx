import { useState, useCallback } from "react";
import { 
  Code2, Copy, Check, Play, 
  FileJson, Loader2, RefreshCw, ExternalLink,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

// REST endpoint definitions
interface RestEndpoint {
  id: string;
  name: string;
  method: "GET" | "POST";
  path: string;
  description: string;
  params?: { name: string; type: string; description: string; required?: boolean }[];
  bodyTemplate?: Record<string, unknown>;
}

const REST_ENDPOINTS: RestEndpoint[] = [
  // Pages
  { id: "pages", name: "List Pages", method: "GET", path: "/pages", description: "Get all published pages" },
  { id: "page", name: "Get Page", method: "GET", path: "/page/:slug", description: "Get a single page by slug", params: [{ name: "slug", type: "string", description: "Page slug", required: true }] },
  { id: "page-md", name: "Page as Markdown", method: "GET", path: "/page/:slug.md", description: "Export a page as Markdown", params: [{ name: "slug", type: "string", description: "Page slug (without .md)", required: true }] },
  // Blog
  { id: "blog-posts", name: "Blog Posts", method: "GET", path: "/blog/posts", description: "List published blog posts", params: [{ name: "limit", type: "number", description: "Max results" }, { name: "category", type: "string", description: "Category slug" }] },
  { id: "blog-post", name: "Blog Post", method: "GET", path: "/blog/post/:slug", description: "Get blog post by slug", params: [{ name: "slug", type: "string", description: "Post slug", required: true }] },
  { id: "blog-categories", name: "Blog Categories", method: "GET", path: "/blog/categories", description: "List all blog categories" },
  // Products
  { id: "products", name: "Products", method: "GET", path: "/products", description: "List all active products" },
  { id: "product", name: "Get Product", method: "GET", path: "/product/:id", description: "Get product by ID", params: [{ name: "id", type: "string", description: "Product ID", required: true }] },
  // Orders
  { id: "orders", name: "Orders", method: "GET", path: "/orders", description: "List orders (requires auth)", params: [{ name: "status", type: "string", description: "Filter by status" }, { name: "limit", type: "number", description: "Max results" }] },
  { id: "order", name: "Get Order", method: "GET", path: "/order/:id", description: "Get order by ID", params: [{ name: "id", type: "string", description: "Order ID", required: true }] },
  // Bookings
  { id: "booking-services", name: "Booking Services", method: "GET", path: "/booking/services", description: "List booking services" },
  { 
    id: "booking-create", name: "Create Booking", method: "POST", path: "/booking/create", 
    description: "Create a new booking",
    bodyTemplate: { service_id: "example-service-id", customer_name: "John Doe", customer_email: "john@example.com", customer_phone: "+46701234567", start_time: new Date(Date.now() + 86400000).toISOString(), notes: "Test booking" }
  },
  // CRM / Leads
  { id: "leads", name: "Leads", method: "GET", path: "/leads", description: "List CRM leads (requires auth)", params: [{ name: "status", type: "string", description: "Filter by status" }, { name: "limit", type: "number", description: "Max results" }] },
  { id: "lead", name: "Get Lead", method: "GET", path: "/lead/:id", description: "Get lead by ID", params: [{ name: "id", type: "string", description: "Lead ID", required: true }] },
  // Deals
  { id: "deals", name: "Deals", method: "GET", path: "/deals", description: "List deals (requires auth)", params: [{ name: "stage", type: "string", description: "Filter by stage" }, { name: "limit", type: "number", description: "Max results" }] },
  // Companies
  { id: "companies", name: "Companies", method: "GET", path: "/companies", description: "List companies (requires auth)", params: [{ name: "limit", type: "number", description: "Max results" }] },
  // Tickets
  { id: "tickets", name: "Tickets", method: "GET", path: "/tickets", description: "List support tickets (requires auth)", params: [{ name: "status", type: "string", description: "Filter by status" }, { name: "limit", type: "number", description: "Max results" }] },
  // Knowledge Base
  { id: "kb-categories", name: "KB Categories", method: "GET", path: "/kb/categories", description: "Knowledge base categories with articles" },
  { id: "kb-articles", name: "KB Articles", method: "GET", path: "/kb/articles", description: "List all published KB articles", params: [{ name: "category", type: "string", description: "Category slug" }, { name: "limit", type: "number", description: "Max results" }] },
  { id: "kb-article", name: "KB Article", method: "GET", path: "/kb/article/:slug", description: "Get KB article by slug", params: [{ name: "slug", type: "string", description: "Article slug", required: true }] },
  // Invoicing
  { id: "invoices", name: "Invoices", method: "GET", path: "/invoices", description: "List invoices (requires auth)", params: [{ name: "status", type: "string", description: "Filter by status" }, { name: "limit", type: "number", description: "Max results" }] },
  // Webinars
  { id: "webinars", name: "Webinars", method: "GET", path: "/webinars", description: "List upcoming webinars", params: [{ name: "limit", type: "number", description: "Max results" }] },
  // Consultants
  { id: "consultants", name: "Consultants", method: "GET", path: "/consultants", description: "List active consultant profiles" },
  // Global Blocks
  { id: "global-blocks", name: "Global Blocks", method: "GET", path: "/global-blocks", description: "Get global blocks (header, footer, popup)" },
  // Settings
  { id: "settings", name: "Site Settings", method: "GET", path: "/settings", description: "Get all site settings" },
  // Forms
  { 
    id: "form-submit", name: "Submit Form", method: "POST", path: "/form/submit", 
    description: "Submit a form (contact, lead capture, etc.)",
    bodyTemplate: { block_id: "example-block-id", page_id: "example-page-id", form_name: "Contact Form", data: { name: "John Doe", email: "john@example.com", message: "Hello" } }
  },
  // Newsletter
  { 
    id: "newsletter-subscribe", name: "Newsletter Subscribe", method: "POST", path: "/newsletter/subscribe", 
    description: "Subscribe to newsletter",
    bodyTemplate: { email: "subscriber@example.com", name: "Jane Doe" }
  },
  // Media
  { id: "media", name: "Media Library", method: "GET", path: "/media", description: "List media assets", params: [{ name: "limit", type: "number", description: "Max results" }] },
];

const GRAPHQL_EXAMPLES: { name: string; query: string }[] = [
  { name: "Pages", query: `query {\n  pages {\n    id\n    title\n    slug\n    status\n  }\n}` },
  { name: "Blog Posts", query: `query {\n  blogPosts(limit: 5) {\n    title\n    slug\n    excerpt\n    author {\n      full_name\n    }\n    categories {\n      name\n    }\n  }\n}` },
  { name: "Products", query: `query {\n  products {\n    id\n    name\n    price_cents\n    currency\n    type\n  }\n}` },
  { name: "Orders", query: `query {\n  orders(limit: 10) {\n    id\n    customer_email\n    total_cents\n    currency\n    status\n    items\n  }\n}` },
  { name: "Leads", query: `query {\n  leads(limit: 10) {\n    id\n    name\n    email\n    status\n    score\n    source\n  }\n}` },
  { name: "Deals", query: `query {\n  deals(limit: 10) {\n    id\n    lead {\n      name\n      email\n    }\n    value_cents\n    stage\n    expected_close\n  }\n}` },
  { name: "Companies", query: `query {\n  companies {\n    id\n    name\n    domain\n    industry\n    size\n  }\n}` },
  { name: "Tickets", query: `query {\n  tickets(limit: 10) {\n    id\n    title\n    status\n    priority\n    created_at\n  }\n}` },
  { name: "Knowledge Base", query: `query {\n  kbCategories {\n    name\n    slug\n    icon\n    articles {\n      title\n      slug\n    }\n  }\n}` },
  { name: "Invoices", query: `query {\n  invoices(limit: 10) {\n    id\n    invoice_number\n    total_cents\n    currency\n    status\n    due_date\n  }\n}` },
  { name: "Booking Services", query: `query {\n  bookingServices {\n    id\n    name\n    duration_minutes\n    price_cents\n  }\n}` },
  { name: "Webinars", query: `query {\n  webinars {\n    id\n    title\n    starts_at\n    status\n    max_attendees\n  }\n}` },
  { name: "Consultants", query: `query {\n  consultants {\n    id\n    name\n    title\n    skills\n    hourly_rate_cents\n  }\n}` },
  { name: "Site Settings", query: `query {\n  siteSettings {\n    key\n    value\n  }\n}` },
];

export function ContentApiContent() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [graphqlQuery, setGraphqlQuery] = useState(GRAPHQL_EXAMPLES[0].query);
  const [graphqlResult, setGraphqlResult] = useState<string | null>(null);
  const [isGraphqlQuerying, setIsGraphqlQuerying] = useState(false);
  
  const [selectedEndpoint, setSelectedEndpoint] = useState<RestEndpoint>(REST_ENDPOINTS[0]);
  const [restParams, setRestParams] = useState<Record<string, string>>({});
  const [restBody, setRestBody] = useState<string>("");
  const [restResult, setRestResult] = useState<string | null>(null);
  const [isRestQuerying, setIsRestQuerying] = useState(false);
  const [restResponseTime, setRestResponseTime] = useState<number | null>(null);
  const [graphqlResponseTime, setGraphqlResponseTime] = useState<number | null>(null);

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
    toast.success("Copied to clipboard");
  };

  const runGraphQLQuery = useCallback(async () => {
    setIsGraphqlQuerying(true);
    const startTime = performance.now();
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/content-api/graphql`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: graphqlQuery }) }
      );
      setGraphqlResponseTime(Math.round(performance.now() - startTime));
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      setGraphqlResult(JSON.stringify(await response.json(), null, 2));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setGraphqlResult(JSON.stringify({ error: message }, null, 2));
    } finally {
      setIsGraphqlQuerying(false);
    }
  }, [graphqlQuery]);

  const buildRestUrl = useCallback(() => {
    let path = selectedEndpoint.path;
    const queryParams: string[] = [];
    selectedEndpoint.params?.forEach(param => {
      const value = restParams[param.name];
      if (value) {
        if (path.includes(`:${param.name}`)) {
          path = path.replace(`:${param.name}`, encodeURIComponent(value));
        } else {
          queryParams.push(`${param.name}=${encodeURIComponent(value)}`);
        }
      }
    });
    const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/content-api${path}`;
    return queryParams.length > 0 ? `${baseUrl}?${queryParams.join("&")}` : baseUrl;
  }, [selectedEndpoint, restParams]);

  const runRestQuery = useCallback(async () => {
    setIsRestQuerying(true);
    const startTime = performance.now();
    try {
      const url = buildRestUrl();
      const fetchOptions: RequestInit = { method: selectedEndpoint.method, headers: { "Content-Type": "application/json" } };
      if (selectedEndpoint.method === "POST" && restBody) {
        try { JSON.parse(restBody); fetchOptions.body = restBody; } catch { throw new Error("Invalid JSON in request body"); }
      }
      const response = await fetch(url, fetchOptions);
      setRestResponseTime(Math.round(performance.now() - startTime));
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try { errorData = JSON.parse(errorText); } catch { errorData = { error: errorText || `HTTP ${response.status}` }; }
        setRestResult(JSON.stringify(errorData, null, 2));
        return;
      }
      setRestResult(JSON.stringify(await response.json(), null, 2));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setRestResult(JSON.stringify({ error: message }, null, 2));
    } finally {
      setIsRestQuerying(false);
    }
  }, [buildRestUrl, selectedEndpoint.method, restBody]);

  const handleEndpointChange = (endpointId: string) => {
    const endpoint = REST_ENDPOINTS.find(e => e.id === endpointId);
    if (endpoint) {
      setSelectedEndpoint(endpoint);
      setRestParams({});
      setRestResult(null);
      setRestResponseTime(null);
      if (endpoint.method === "POST" && endpoint.bodyTemplate) {
        setRestBody(JSON.stringify(endpoint.bodyTemplate, null, 2));
      } else {
        setRestBody("");
      }
    }
  };

  const mcpUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-server`;

  const reactExample = `import { useQuery } from '@tanstack/react-query';

function usePages() {
  return useQuery({
    queryKey: ['pages'],
    queryFn: async () => {
      const res = await fetch(
        '${import.meta.env.VITE_SUPABASE_URL}/functions/v1/content-api/pages'
      );
      return res.json();
    },
  });
}`;

  const nextjsExample = `// app/page.tsx
async function getPages() {
  const res = await fetch(
    '${import.meta.env.VITE_SUPABASE_URL}/functions/v1/content-api/pages',
    { next: { revalidate: 60 } }
  );
  return res.json();
}

export default async function Home() {
  const pages = await getPages();
  return <PageList pages={pages} />;
}`;

  return (
    <div className="space-y-6">
      {/* API Base URL */}
      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
        <FileJson className="h-5 w-5 text-primary flex-shrink-0" />
        <code className="text-sm font-mono break-all flex-1">
          {import.meta.env.VITE_SUPABASE_URL}/functions/v1/content-api
        </code>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => copyCode(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/content-api`, "base-url")}
        >
          {copiedCode === "base-url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>

      {/* Interactive API Explorer */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5" />
                API Explorer
                <Badge variant="secondary" className="ml-1">Live</Badge>
              </CardTitle>
              <CardDescription>
                Test endpoints directly against your live Content API
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href="/docs/HEADLESS-API.md" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Docs
              </a>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="rest-explorer" className="space-y-4">
            <TabsList className="grid grid-cols-5 w-full max-w-xl">
              <TabsTrigger value="rest-explorer">REST</TabsTrigger>
              <TabsTrigger value="graphql-explorer">GraphQL</TabsTrigger>
              <TabsTrigger value="react">React</TabsTrigger>
              <TabsTrigger value="nextjs">Next.js</TabsTrigger>
              <TabsTrigger value="mcp">MCP</TabsTrigger>
            </TabsList>

            {/* REST Explorer */}
            <TabsContent value="rest-explorer" className="space-y-4">
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Endpoint</label>
                    <Select value={selectedEndpoint.id} onValueChange={handleEndpointChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REST_ENDPOINTS.map(endpoint => (
                          <SelectItem key={endpoint.id} value={endpoint.id}>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono text-xs">{endpoint.method}</Badge>
                              <span>{endpoint.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={selectedEndpoint.method === "GET" ? "default" : "secondary"}>{selectedEndpoint.method}</Badge>
                      <code className="text-xs text-muted-foreground">{selectedEndpoint.path}</code>
                    </div>
                    <p className="text-sm text-muted-foreground">{selectedEndpoint.description}</p>
                  </div>

                  {selectedEndpoint.params && selectedEndpoint.params.length > 0 && (
                    <div className="space-y-3">
                      <label className="text-sm font-medium">Parameters</label>
                      {selectedEndpoint.params.map(param => (
                        <div key={param.name} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <label className="text-sm">{param.name}</label>
                            {param.required && <Badge variant="destructive" className="text-[10px] px-1 py-0">Required</Badge>}
                          </div>
                          <Input
                            placeholder={param.description}
                            value={restParams[param.name] || ""}
                            onChange={(e) => setRestParams(prev => ({ ...prev, [param.name]: e.target.value }))}
                            className="font-mono text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedEndpoint.method === "POST" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Request Body</label>
                        <Button size="sm" variant="ghost" onClick={() => { if (selectedEndpoint.bodyTemplate) setRestBody(JSON.stringify(selectedEndpoint.bodyTemplate, null, 2)); }}>
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Reset
                        </Button>
                      </div>
                      <Textarea value={restBody} onChange={(e) => setRestBody(e.target.value)} className="font-mono text-sm min-h-[150px]" placeholder='{"key": "value"}' />
                    </div>
                  )}

                  <Button onClick={runRestQuery} disabled={isRestQuerying} className="w-full">
                    {isRestQuerying ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running...</> : <><Play className="h-4 w-4 mr-2" />Send {selectedEndpoint.method} Request</>}
                  </Button>
                </div>

                <div className="lg:col-span-2 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Request URL</label>
                      <Button size="sm" variant="ghost" onClick={() => copyCode(buildRestUrl(), "rest-url")}>
                        {copiedCode === "rest-url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="p-3 bg-muted rounded-lg font-mono text-sm break-all">
                      <span className="text-green-600 dark:text-green-400">{selectedEndpoint.method}</span>{" "}
                      {buildRestUrl()}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium flex items-center gap-2">
                        Response
                        {restResponseTime !== null && <Badge variant="outline" className="text-xs">{restResponseTime}ms</Badge>}
                      </label>
                      {restResult && (
                        <Button size="sm" variant="ghost" onClick={() => copyCode(restResult, "rest-result")}>
                          {copiedCode === "rest-result" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                    <ScrollArea className="h-[300px] rounded-lg border">
                      <pre className="p-4 text-sm font-mono">{restResult || "// Click 'Send Request' to see the response"}</pre>
                    </ScrollArea>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* GraphQL Explorer */}
            <TabsContent value="graphql-explorer" className="space-y-4">
              <div className="flex gap-2 flex-wrap mb-4">
                {GRAPHQL_EXAMPLES.map(example => (
                  <Button key={example.name} variant={graphqlQuery === example.query ? "default" : "outline"} size="sm"
                    onClick={() => { setGraphqlQuery(example.query); setGraphqlResult(null); setGraphqlResponseTime(null); }}>
                    {example.name}
                  </Button>
                ))}
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Query</label>
                    <Button size="sm" variant="ghost" onClick={() => copyCode(graphqlQuery, "graphql-query")}>
                      {copiedCode === "graphql-query" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Textarea value={graphqlQuery} onChange={(e) => setGraphqlQuery(e.target.value)} className="font-mono text-sm min-h-[250px]" />
                  <Button onClick={runGraphQLQuery} disabled={isGraphqlQuerying} className="w-full">
                    {isGraphqlQuerying ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running...</> : <><Play className="h-4 w-4 mr-2" />Run Query</>}
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium flex items-center gap-2">
                      Result
                      {graphqlResponseTime !== null && <Badge variant="outline" className="text-xs">{graphqlResponseTime}ms</Badge>}
                    </label>
                    {graphqlResult && (
                      <Button size="sm" variant="ghost" onClick={() => copyCode(graphqlResult, "graphql-result")}>
                        {copiedCode === "graphql-result" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                  <ScrollArea className="h-[300px] rounded-lg border">
                    <pre className="p-4 text-sm font-mono">{graphqlResult || "// Run a query to see the result"}</pre>
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>

            {/* Code Examples */}
            <TabsContent value="react" className="space-y-4">
              <div className="relative">
                <pre className="p-4 bg-muted rounded-lg text-sm overflow-x-auto">{reactExample}</pre>
                <Button size="sm" variant="ghost" className="absolute top-2 right-2" onClick={() => copyCode(reactExample, "react")}>
                  {copiedCode === "react" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="nextjs" className="space-y-4">
              <div className="relative">
                <pre className="p-4 bg-muted rounded-lg text-sm overflow-x-auto">{nextjsExample}</pre>
                <Button size="sm" variant="ghost" className="absolute top-2 right-2" onClick={() => copyCode(nextjsExample, "nextjs")}>
                  {copiedCode === "nextjs" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="mcp" className="space-y-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Connect external AI clients (Cursor, Claude Desktop, etc.) to FlowWink via the MCP protocol.
                  Manage API keys in the <strong>MCP Keys</strong> tab.
                </p>

                <div>
                  <label className="text-sm font-medium mb-2 block">Cursor IDE — <code className="text-xs">.cursor/mcp.json</code></label>
                  <div className="relative">
                    <pre className="p-4 bg-muted rounded-lg text-sm overflow-x-auto">{`{
  "mcpServers": {
    "flowwink": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer fwk_your_key_here"
      }
    }
  }
}`}</pre>
                    <Button size="sm" variant="ghost" className="absolute top-2 right-2" onClick={() => copyCode(`{\n  "mcpServers": {\n    "flowwink": {\n      "url": "${mcpUrl}",\n      "headers": {\n        "Authorization": "Bearer fwk_your_key_here"\n      }\n    }\n  }\n}`, "mcp-cursor")}>
                      {copiedCode === "mcp-cursor" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Claude Desktop — <code className="text-xs">claude_desktop_config.json</code></label>
                  <div className="relative">
                    <pre className="p-4 bg-muted rounded-lg text-sm overflow-x-auto">{`{
  "mcpServers": {
    "flowwink": {
      "type": "streamable-http",
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer fwk_your_key_here"
      }
    }
  }
}`}</pre>
                    <Button size="sm" variant="ghost" className="absolute top-2 right-2" onClick={() => copyCode(`{\n  "mcpServers": {\n    "flowwink": {\n      "type": "streamable-http",\n      "url": "${mcpUrl}",\n      "headers": {\n        "Authorization": "Bearer fwk_your_key_here"\n      }\n    }\n  }\n}`, "mcp-claude")}>
                      {copiedCode === "mcp-claude" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Discover tools via curl</label>
                  <div className="relative">
                    <pre className="p-4 bg-muted rounded-lg text-sm overflow-x-auto">{`curl -X POST ${mcpUrl} \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -H "Authorization: Bearer fwk_your_key_here" \\
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`}</pre>
                    <Button size="sm" variant="ghost" className="absolute top-2 right-2" onClick={() => copyCode(`curl -X POST ${mcpUrl} \\\n  -H "Content-Type: application/json" \\\n  -H "Accept: application/json, text/event-stream" \\\n  -H "Authorization: Bearer fwk_your_key_here" \\\n  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`, "mcp-curl")}>
                      {copiedCode === "mcp-curl" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ContentApiPage() {
  return (
    <AdminLayout>
      <div className="space-y-8">
        <AdminPageHeader
          title="Content API"
          description="Developer tools for multi-channel content delivery. REST & GraphQL."
        />
        <ContentApiContent />
      </div>
    </AdminLayout>
  );
}
