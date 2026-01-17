import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { 
  Globe, Smartphone, MessageSquare, Mail, Code2, Copy, Check, Play, Database, 
  FileJson, Layers, Info, FileText, Rss, Settings2, Plus, Loader2, RefreshCw,
  ExternalLink, ChevronRight, Megaphone,
  // Block icons
  LayoutTemplate, PanelTop, PanelBottom, Columns2, Minus, Type, 
  ChevronDown, AlertCircle, Quote, LayoutGrid, Image, Images, 
  Youtube, Grid3X3, MousePointerClick, Phone, ClipboardList, 
  Bot, MailPlus, MapPin, BarChart3, CalendarCheck, CreditCard,
  MessageCircle, Users, Building, Columns3, BellRing, Sparkles,
  type LucideIcon
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useModules } from "@/hooks/useModules";
import { CampaignsDashboard } from "@/components/admin/content-hub";

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
  // GET endpoints
  { id: "pages", name: "List Pages", method: "GET", path: "/pages", description: "Get all published pages" },
  { id: "page", name: "Get Page", method: "GET", path: "/page/:slug", description: "Get a single page by slug", params: [{ name: "slug", type: "string", description: "Page slug", required: true }] },
  { id: "blog-posts", name: "Blog Posts", method: "GET", path: "/blog/posts", description: "List published blog posts", params: [{ name: "limit", type: "number", description: "Max results" }, { name: "category", type: "string", description: "Category slug" }] },
  { id: "blog-post", name: "Blog Post", method: "GET", path: "/blog/post/:slug", description: "Get blog post by slug", params: [{ name: "slug", type: "string", description: "Post slug", required: true }] },
  { id: "blog-categories", name: "Blog Categories", method: "GET", path: "/blog/categories", description: "List all blog categories" },
  { id: "blog-tags", name: "Blog Tags", method: "GET", path: "/blog/tags", description: "List all blog tags" },
  { id: "products", name: "Products", method: "GET", path: "/products", description: "List all active products" },
  { id: "product", name: "Product", method: "GET", path: "/product/:id", description: "Get product by ID", params: [{ name: "id", type: "string", description: "Product ID", required: true }] },
  { id: "booking-services", name: "Booking Services", method: "GET", path: "/booking/services", description: "List booking services" },
  { id: "kb-categories", name: "KB Categories", method: "GET", path: "/kb/categories", description: "Knowledge base categories with articles" },
  { id: "kb-article", name: "KB Article", method: "GET", path: "/kb/article/:slug", description: "Get KB article by slug", params: [{ name: "slug", type: "string", description: "Article slug", required: true }] },
  { id: "global-blocks", name: "Global Blocks", method: "GET", path: "/global-blocks/:slot", description: "Get global blocks by slot", params: [{ name: "slot", type: "string", description: "header, footer, or popup", required: true }] },
  { id: "settings", name: "Site Settings", method: "GET", path: "/settings", description: "Get all site settings" },
  // POST endpoints
  { 
    id: "form-submit", 
    name: "Submit Form", 
    method: "POST", 
    path: "/form/submit", 
    description: "Submit a form (test form submissions)",
    bodyTemplate: {
      block_id: "example-block-id",
      page_id: "example-page-id",
      form_name: "Contact Form",
      data: {
        name: "John Doe",
        email: "john@example.com",
        message: "Hello, this is a test message"
      }
    }
  },
  { 
    id: "newsletter-subscribe", 
    name: "Newsletter Subscribe", 
    method: "POST", 
    path: "/newsletter/subscribe", 
    description: "Subscribe to newsletter",
    bodyTemplate: {
      email: "subscriber@example.com",
      name: "Jane Doe"
    }
  },
  { 
    id: "booking-create", 
    name: "Create Booking", 
    method: "POST", 
    path: "/booking/create", 
    description: "Create a new booking",
    bodyTemplate: {
      service_id: "example-service-id",
      customer_name: "John Doe",
      customer_email: "john@example.com",
      customer_phone: "+46701234567",
      start_time: new Date(Date.now() + 86400000).toISOString(),
      notes: "Test booking"
    }
  },
];

const GRAPHQL_EXAMPLES: { name: string; query: string }[] = [
  { name: "Pages", query: `query {\n  pages {\n    id\n    title\n    slug\n    status\n  }\n}` },
  { name: "Blog Posts", query: `query {\n  blogPosts(limit: 5) {\n    title\n    slug\n    excerpt\n    author {\n      full_name\n    }\n    categories {\n      name\n    }\n  }\n}` },
  { name: "Products", query: `query {\n  products {\n    id\n    name\n    price_cents\n    currency\n    type\n  }\n}` },
  { name: "Knowledge Base", query: `query {\n  kbCategories {\n    name\n    slug\n    icon\n    articles {\n      title\n      slug\n    }\n  }\n}` },
  { name: "Booking Services", query: `query {\n  bookingServices {\n    id\n    name\n    duration_minutes\n    price_cents\n  }\n}` },
  { name: "Site Settings", query: `query {\n  siteSettings {\n    key\n    value\n  }\n}` },
];

type ChannelStatus = "active" | "inactive" | "coming";

interface Channel {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  status: ChannelStatus;
  description: string;
  moduleId?: string;
  extra?: React.ComponentType<{ className?: string }>;
}

interface BlockType {
  type: string;
  name: string;
  category: string;
  icon: LucideIcon;
}

const BLOCK_TYPES: BlockType[] = [
  // Layout
  { type: "hero", name: "Hero", category: "Layout", icon: LayoutTemplate },
  { type: "header", name: "Header", category: "Layout", icon: PanelTop },
  { type: "footer", name: "Footer", category: "Layout", icon: PanelBottom },
  { type: "two-column", name: "Two Column", category: "Layout", icon: Columns2 },
  { type: "separator", name: "Separator", category: "Layout", icon: Minus },
  // Content
  { type: "text", name: "Text", category: "Content", icon: Type },
  { type: "accordion", name: "Accordion", category: "Content", icon: ChevronDown },
  { type: "info-box", name: "Fact Box", category: "Content", icon: AlertCircle },
  { type: "quote", name: "Quote", category: "Content", icon: Quote },
  { type: "article-grid", name: "Article Grid", category: "Content", icon: LayoutGrid },
  // Media
  { type: "image", name: "Image", category: "Media", icon: Image },
  { type: "gallery", name: "Gallery", category: "Media", icon: Images },
  { type: "youtube", name: "YouTube", category: "Media", icon: Youtube },
  // Navigation
  { type: "link-grid", name: "Link Grid", category: "Navigation", icon: Grid3X3 },
  // Interaction
  { type: "cta", name: "Call to Action", category: "Interaction", icon: MousePointerClick },
  { type: "contact", name: "Contact", category: "Interaction", icon: Phone },
  { type: "form", name: "Form", category: "Interaction", icon: ClipboardList },
  { type: "chat", name: "AI Chat", category: "Interaction", icon: Bot },
  { type: "newsletter", name: "Newsletter", category: "Interaction", icon: MailPlus },
  { type: "map", name: "Map", category: "Interaction", icon: MapPin },
  { type: "booking", name: "Booking", category: "Interaction", icon: CalendarCheck },
  { type: "popup", name: "Popup", category: "Interaction", icon: BellRing },
  // Marketing
  { type: "pricing", name: "Pricing", category: "Marketing", icon: CreditCard },
  { type: "testimonials", name: "Testimonials", category: "Marketing", icon: MessageCircle },
  { type: "team", name: "Team", category: "Marketing", icon: Users },
  { type: "logos", name: "Logo Cloud", category: "Marketing", icon: Building },
  { type: "comparison", name: "Comparison", category: "Marketing", icon: Columns3 },
  { type: "features", name: "Features", category: "Marketing", icon: Sparkles },
  { type: "timeline", name: "Timeline", category: "Marketing", icon: LayoutGrid },
  // Data
  { type: "stats", name: "Statistics", category: "Data", icon: BarChart3 },
];

export default function ContentHubPage() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [graphqlQuery, setGraphqlQuery] = useState(GRAPHQL_EXAMPLES[0].query);
  const [graphqlResult, setGraphqlResult] = useState<string | null>(null);
  const [isGraphqlQuerying, setIsGraphqlQuerying] = useState(false);
  
  // REST Explorer state
  const [selectedEndpoint, setSelectedEndpoint] = useState<RestEndpoint>(REST_ENDPOINTS[0]);
  const [restParams, setRestParams] = useState<Record<string, string>>({});
  const [restBody, setRestBody] = useState<string>("");
  const [restResult, setRestResult] = useState<string | null>(null);
  const [isRestQuerying, setIsRestQuerying] = useState(false);
  const [restResponseTime, setRestResponseTime] = useState<number | null>(null);
  const [graphqlResponseTime, setGraphqlResponseTime] = useState<number | null>(null);
  
  const { data: modules } = useModules();

  // Build channels based on module status
  const CHANNELS: Channel[] = [
    { id: "web", name: "Website", icon: Globe, status: "active", description: "Built-in responsive website" },
    { 
      id: "blog", 
      name: "Blog", 
      icon: FileText, 
      status: modules?.blog?.enabled ? "active" : "inactive", 
      description: "Blog with RSS feed", 
      moduleId: "blog",
      extra: Rss 
    },
    { 
      id: "chat", 
      name: "AI Chat", 
      icon: MessageSquare, 
      status: modules?.chat?.enabled ? "active" : "inactive", 
      description: "Intelligent chatbot with CAG",
      moduleId: "chat"
    },
    { 
      id: "newsletter", 
      name: "Newsletter", 
      icon: Mail, 
      status: modules?.newsletter?.enabled ? "active" : "inactive", 
      description: "Email campaigns via Resend",
      moduleId: "newsletter"
    },
    { id: "app", name: "Mobile App", icon: Smartphone, status: "coming", description: "iOS & Android via API" },
  ];

  // Fetch pages to count block usage
  const { data: pages } = useQuery({
    queryKey: ["pages-content-hub"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pages")
        .select("content_json, status")
        .eq("status", "published");
      if (error) throw error;
      return data;
    },
  });

  // Count block instances
  const blockCounts = pages?.reduce((acc, page) => {
    const blocks = (page.content_json as any[]) || [];
    blocks.forEach((block) => {
      acc[block.type] = (acc[block.type] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>) || {};

  const totalBlocks = Object.values(blockCounts).reduce((a, b) => a + b, 0);
  const activeChannels = CHANNELS.filter(c => c.status === "active").length;
  const inactiveChannels = CHANNELS.filter(c => c.status === "inactive").length;

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
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: graphqlQuery }),
        }
      );
      
      const endTime = performance.now();
      setGraphqlResponseTime(Math.round(endTime - startTime));
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setGraphqlResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setGraphqlResult(JSON.stringify({ error: err.message }, null, 2));
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
      const fetchOptions: RequestInit = {
        method: selectedEndpoint.method,
        headers: { "Content-Type": "application/json" },
      };
      
      if (selectedEndpoint.method === "POST" && restBody) {
        try {
          JSON.parse(restBody); // Validate JSON
          fetchOptions.body = restBody;
        } catch {
          throw new Error("Invalid JSON in request body");
        }
      }
      
      const response = await fetch(url, fetchOptions);
      
      const endTime = performance.now();
      setRestResponseTime(Math.round(endTime - startTime));
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `HTTP ${response.status}: ${response.statusText}` };
        }
        setRestResult(JSON.stringify(errorData, null, 2));
        return;
      }
      
      const data = await response.json();
      setRestResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setRestResult(JSON.stringify({ error: err.message }, null, 2));
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
      // Set body template for POST endpoints
      if (endpoint.method === "POST" && endpoint.bodyTemplate) {
        setRestBody(JSON.stringify(endpoint.bodyTemplate, null, 2));
      } else {
        setRestBody("");
      }
    }
  };

  const restExample = `// Fetch all published pages
const response = await fetch(
  '${import.meta.env.VITE_SUPABASE_URL}/functions/v1/content-api/pages'
);
const pages = await response.json();`;

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
    <AdminLayout>
      <div className="space-y-8">
        <AdminPageHeader
          title="Content Hub"
          description="Your content, everywhere. Both head and headless."
        />

        {/* Hero Section */}
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            {/* Head Side */}
            <div className="p-8 bg-gradient-to-br from-primary/5 to-primary/10 border-r border-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Globe className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Head</h3>
                  <p className="text-sm text-muted-foreground">Complete website</p>
                </div>
              </div>
              <p className="text-muted-foreground mb-4">
                Built-in responsive website with professional design, SEO optimization and accessibility according to WCAG 2.1 AA.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Responsive</Badge>
                <Badge variant="secondary">SEO</Badge>
                <Badge variant="secondary">WCAG 2.1 AA</Badge>
                <Badge variant="secondary">Dark Mode</Badge>
              </div>
            </div>

            {/* Headless Side */}
            <div className="p-8 bg-gradient-to-br from-secondary/5 to-secondary/10">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-xl bg-secondary/20 flex items-center justify-center">
                  <Code2 className="h-6 w-6 text-secondary-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Headless</h3>
                  <p className="text-sm text-muted-foreground">REST & GraphQL API</p>
                </div>
              </div>
              <p className="text-muted-foreground mb-4">
                Fully structured content via REST and GraphQL. Build apps, integrations or use with any framework.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">REST API</Badge>
                <Badge variant="outline">GraphQL</Badge>
                <Badge variant="outline">Tiptap JSON</Badge>
                <Badge variant="outline">Webhooks</Badge>
              </div>
            </div>
          </div>
        </Card>

        {/* Multi-Channel Visualization */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Multi-Channel Delivery
                </CardTitle>
                <CardDescription>
                  Your content can be delivered to multiple channels simultaneously
                </CardDescription>
              </div>
              {inactiveChannels > 0 && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/admin/modules">
                    <Settings2 className="h-4 w-4 mr-2" />
                    Manage Modules
                  </Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {CHANNELS.map((channel) => (
                <div
                  key={channel.id}
                  className={`relative p-4 rounded-xl border-2 transition-all ${
                    channel.status === "active"
                      ? "border-primary/50 bg-primary/5"
                      : channel.status === "inactive"
                      ? "border-dashed border-amber-500/30 bg-amber-500/5"
                      : "border-dashed border-muted-foreground/30 bg-muted/30"
                  }`}
                >
                  {channel.status === "active" && (
                    <Badge className="absolute -top-2 -right-2 bg-green-500">Active</Badge>
                  )}
                  {channel.status === "inactive" && (
                    <Badge variant="outline" className="absolute -top-2 -right-2 border-amber-500 text-amber-600">
                      Inactive
                    </Badge>
                  )}
                  {channel.status === "coming" && (
                    <Badge variant="secondary" className="absolute -top-2 -right-2">Coming</Badge>
                  )}
                  <channel.icon className={`h-8 w-8 mb-3 ${
                    channel.status === "active" 
                      ? "text-primary" 
                      : channel.status === "inactive"
                      ? "text-amber-600"
                      : "text-muted-foreground"
                  }`} />
                  <h4 className="font-medium">{channel.name}</h4>
                  <p className="text-sm text-muted-foreground">{channel.description}</p>
                  
                  {channel.status === "inactive" && channel.moduleId && (
                    <Button asChild variant="ghost" size="sm" className="mt-2 h-7 text-xs">
                      <Link to="/admin/modules">
                        <Plus className="h-3 w-3 mr-1" />
                        Activate
                      </Link>
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Flow Diagram */}
            <div className="mt-8 p-6 bg-muted/30 rounded-xl">
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <div className="flex items-center gap-2 px-4 py-2 bg-background rounded-lg border shadow-sm">
                  <Database className="h-4 w-4 text-primary" />
                  <span className="font-medium">CMS</span>
                </div>
                <div className="text-2xl text-muted-foreground">→</div>
                <div className="flex items-center gap-2 px-4 py-2 bg-background rounded-lg border shadow-sm">
                  <FileJson className="h-4 w-4 text-primary" />
                  <span className="font-medium">Content API</span>
                </div>
                <div className="text-2xl text-muted-foreground">→</div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {CHANNELS.filter(c => c.status === "active").map(channel => (
                    <div key={channel.id} className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 rounded-full text-sm">
                      <channel.icon className="h-3.5 w-3.5" />
                      <span>{channel.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content Campaigns Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              Content Campaigns
              <Badge variant="secondary">AI-Powered</Badge>
            </CardTitle>
            <CardDescription>
              Create content once, automatically adapted for all channels
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CampaignsDashboard />
          </CardContent>
        </Card>

        {/* Interactive API Explorer */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Code2 className="h-5 w-5" />
                  Interactive API Explorer
                  <Badge variant="secondary" className="ml-2">Live</Badge>
                </CardTitle>
                <CardDescription>
                  Test endpoints directly against your live Content API
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href="/docs/HEADLESS-API.md" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Full Docs
                </a>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="rest-explorer" className="space-y-4">
              <TabsList className="grid grid-cols-4 w-full max-w-lg">
                <TabsTrigger value="rest-explorer">REST Explorer</TabsTrigger>
                <TabsTrigger value="graphql-explorer">GraphQL</TabsTrigger>
                <TabsTrigger value="react">React</TabsTrigger>
                <TabsTrigger value="nextjs">Next.js</TabsTrigger>
              </TabsList>

              {/* REST Explorer */}
              <TabsContent value="rest-explorer" className="space-y-4">
                <div className="grid lg:grid-cols-3 gap-6">
                  {/* Endpoint Selector */}
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
                                <Badge variant="outline" className="font-mono text-xs">
                                  {endpoint.method}
                                </Badge>
                                <span>{endpoint.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={selectedEndpoint.method === "GET" ? "default" : "secondary"}>
                          {selectedEndpoint.method}
                        </Badge>
                        <code className="text-xs text-muted-foreground">{selectedEndpoint.path}</code>
                      </div>
                      <p className="text-sm text-muted-foreground">{selectedEndpoint.description}</p>
                    </div>

                    {/* Parameters */}
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

                    {/* Request Body for POST */}
                    {selectedEndpoint.method === "POST" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">Request Body</label>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (selectedEndpoint.bodyTemplate) {
                                setRestBody(JSON.stringify(selectedEndpoint.bodyTemplate, null, 2));
                              }
                            }}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Reset
                          </Button>
                        </div>
                        <Textarea
                          value={restBody}
                          onChange={(e) => setRestBody(e.target.value)}
                          className="font-mono text-sm min-h-[150px]"
                          placeholder='{"key": "value"}'
                        />
                      </div>
                    )}

                    <Button onClick={runRestQuery} disabled={isRestQuerying} className="w-full">
                      {isRestQuerying ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Send {selectedEndpoint.method} Request
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Request/Response */}
                  <div className="lg:col-span-2 space-y-4">
                    {/* Request URL */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Request URL</label>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyCode(buildRestUrl(), "rest-url")}
                        >
                          {copiedCode === "rest-url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                      <div className="p-3 bg-muted rounded-lg font-mono text-sm break-all">
                        <span className="text-green-600 dark:text-green-400">{selectedEndpoint.method}</span>{" "}
                        {buildRestUrl()}
                      </div>
                    </div>

                    {/* Response */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium flex items-center gap-2">
                          Response
                          {restResponseTime !== null && (
                            <Badge variant="outline" className="text-xs">
                              {restResponseTime}ms
                            </Badge>
                          )}
                        </label>
                        {restResult && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyCode(restResult, "rest-result")}
                          >
                            {copiedCode === "rest-result" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                      <ScrollArea className="h-[300px] rounded-lg border">
                        <pre className="p-4 text-sm font-mono">
                          {restResult || "// Click 'Send Request' to see the response"}
                        </pre>
                      </ScrollArea>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* GraphQL Explorer */}
              <TabsContent value="graphql-explorer" className="space-y-4">
                <div className="flex gap-2 flex-wrap mb-4">
                  {GRAPHQL_EXAMPLES.map(example => (
                    <Button
                      key={example.name}
                      variant={graphqlQuery === example.query ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setGraphqlQuery(example.query);
                        setGraphqlResult(null);
                        setGraphqlResponseTime(null);
                      }}
                    >
                      {example.name}
                    </Button>
                  ))}
                </div>

                <div className="grid lg:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Query</label>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyCode(graphqlQuery, "graphql-query")}
                      >
                        {copiedCode === "graphql-query" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <Textarea
                      value={graphqlQuery}
                      onChange={(e) => setGraphqlQuery(e.target.value)}
                      className="font-mono text-sm min-h-[250px]"
                    />
                    <Button onClick={runGraphQLQuery} disabled={isGraphqlQuerying} className="w-full">
                      {isGraphqlQuerying ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Run Query
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium flex items-center gap-2">
                        Result
                        {graphqlResponseTime !== null && (
                          <Badge variant="outline" className="text-xs">
                            {graphqlResponseTime}ms
                          </Badge>
                        )}
                      </label>
                      {graphqlResult && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyCode(graphqlResult, "graphql-result")}
                        >
                          {copiedCode === "graphql-result" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                    <ScrollArea className="h-[300px] rounded-lg border">
                      <pre className="p-4 text-sm font-mono">
                        {graphqlResult || "// Run a query to see the result"}
                      </pre>
                    </ScrollArea>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="react" className="space-y-4">
                <div className="relative">
                  <pre className="p-4 bg-muted rounded-lg text-sm overflow-x-auto">
                    {reactExample}
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2"
                    onClick={() => copyCode(reactExample, "react")}
                  >
                    {copiedCode === "react" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="nextjs" className="space-y-4">
                <div className="relative">
                  <pre className="p-4 bg-muted rounded-lg text-sm overflow-x-auto">
                    {nextjsExample}
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2"
                    onClick={() => copyCode(nextjsExample, "nextjs")}
                  >
                    {copiedCode === "nextjs" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Content Model Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Content Model
            </CardTitle>
            <CardDescription>
              {totalBlocks} block instances across {pages?.length || 0} published pages
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {(() => {
              const categories = ["Layout", "Content", "Media", "Navigation", "Interaction", "Marketing", "Data"];
              return categories.map(category => {
                const blocksInCategory = BLOCK_TYPES.filter(b => b.category === category);
                if (blocksInCategory.length === 0) return null;
                
                const categoryCount = blocksInCategory.reduce((sum, b) => sum + (blockCounts[b.type] || 0), 0);
                
                return (
                  <div key={category}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                        {category}
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        {categoryCount} used
                      </Badge>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {blocksInCategory.map((block) => {
                        const count = blockCounts[block.type] || 0;
                        return (
                          <div
                            key={block.type}
                            className={`p-3 rounded-lg border transition-colors ${
                              count > 0 ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-transparent"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <block.icon className={`h-4 w-4 ${count > 0 ? "text-primary" : "text-muted-foreground"}`} />
                                <span className="font-medium">{block.name}</span>
                              </div>
                              <Badge variant={count > 0 ? "default" : "secondary"}>
                                {count}
                              </Badge>
                            </div>
                            <code className="text-xs text-muted-foreground ml-6">{block.type}</code>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
