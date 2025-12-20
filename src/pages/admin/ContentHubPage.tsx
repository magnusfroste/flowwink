import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Globe, Smartphone, MessageSquare, Mail, Code2, Copy, Check, Play, Database, FileJson, Layers, Info, FileText, Rss } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

const CHANNELS = [
  { id: "web", name: "Website", icon: Globe, status: "active", description: "Built-in responsive website" },
  { id: "blog", name: "Blog", icon: FileText, status: "active", description: "Blog with RSS feed", extra: Rss },
  { id: "chat", name: "AI Chat", icon: MessageSquare, status: "active", description: "Intelligent chatbot with CAG" },
  { id: "newsletter", name: "Newsletter", icon: Mail, status: "active", description: "Email campaigns via Resend" },
  { id: "app", name: "Mobile App", icon: Smartphone, status: "coming", description: "iOS & Android via API" },
];

const BLOCK_TYPES = [
  { type: "hero", name: "Hero", category: "Layout" },
  { type: "text", name: "Text", category: "Content" },
  { type: "image", name: "Image", category: "Media" },
  { type: "two-column", name: "Two Column", category: "Layout" },
  { type: "cta", name: "Call to Action", category: "Interaction" },
  { type: "contact", name: "Contact", category: "Interaction" },
  { type: "accordion", name: "Accordion", category: "Content" },
  { type: "link-grid", name: "Link Grid", category: "Navigation" },
  { type: "info-box", name: "Fact Box", category: "Content" },
  { type: "quote", name: "Quote", category: "Content" },
  { type: "stats", name: "Statistics", category: "Data" },
  { type: "gallery", name: "Gallery", category: "Media" },
  { type: "youtube", name: "YouTube", category: "Media" },
  { type: "separator", name: "Separator", category: "Layout" },
  { type: "article-grid", name: "Article Grid", category: "Content" },
];

const DEFAULT_GRAPHQL_QUERY = `query {
  pages {
    id
    title
    slug
    status
  }
}`;

export default function ContentHubPage() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [graphqlQuery, setGraphqlQuery] = useState(DEFAULT_GRAPHQL_QUERY);
  const [queryResult, setQueryResult] = useState<string | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);

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

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
    toast.success("Copied to clipboard");
  };

  const runGraphQLQuery = async () => {
    setIsQuerying(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/content-api/graphql`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: graphqlQuery }),
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setQueryResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setQueryResult(JSON.stringify({ error: err.message }, null, 2));
    } finally {
      setIsQuerying(false);
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
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Multi-Channel Delivery
            </CardTitle>
            <CardDescription>
              Your content can be delivered to multiple channels simultaneously
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {CHANNELS.map((channel) => (
                <div
                  key={channel.id}
                  className={`relative p-4 rounded-xl border-2 transition-all ${
                    channel.status === "active"
                      ? "border-primary/50 bg-primary/5"
                      : "border-dashed border-muted-foreground/30 bg-muted/30"
                  }`}
                >
                  {channel.status === "active" && (
                    <Badge className="absolute -top-2 -right-2 bg-green-500">Active</Badge>
                  )}
                  {channel.status === "coming" && (
                    <Badge variant="secondary" className="absolute -top-2 -right-2">Coming</Badge>
                  )}
                  <channel.icon className={`h-8 w-8 mb-3 ${
                    channel.status === "active" ? "text-primary" : "text-muted-foreground"
                  }`} />
                  <h4 className="font-medium">{channel.name}</h4>
                  <p className="text-sm text-muted-foreground">{channel.description}</p>
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

        {/* API Explorer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="h-5 w-5" />
              API Explorer
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Test your Content API queries directly. GraphQL queries run against the live API endpoint and return published page data.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            <CardDescription>
              Test and explore the Content API directly
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="graphql" className="space-y-4">
              <TabsList>
                <TabsTrigger value="graphql">GraphQL</TabsTrigger>
                <TabsTrigger value="rest">REST</TabsTrigger>
                <TabsTrigger value="react">React</TabsTrigger>
                <TabsTrigger value="nextjs">Next.js</TabsTrigger>
              </TabsList>

              <TabsContent value="graphql" className="space-y-4">
                <div className="grid lg:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Query</label>
                    <Textarea
                      value={graphqlQuery}
                      onChange={(e) => setGraphqlQuery(e.target.value)}
                      className="font-mono text-sm min-h-[200px]"
                    />
                    <Button onClick={runGraphQLQuery} disabled={isQuerying}>
                      <Play className="h-4 w-4 mr-2" />
                      {isQuerying ? "Running..." : "Run Query"}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Result</label>
                    <pre className="p-4 bg-muted rounded-lg text-sm overflow-auto min-h-[200px] max-h-[300px]">
                      {queryResult || "// Run a query to see the result"}
                    </pre>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="rest" className="space-y-4">
                <div className="relative">
                  <pre className="p-4 bg-muted rounded-lg text-sm overflow-x-auto">
                    {restExample}
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2"
                    onClick={() => copyCode(restExample, "rest")}
                  >
                    {copiedCode === "rest" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
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
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {BLOCK_TYPES.map((block) => {
                const count = blockCounts[block.type] || 0;
                return (
                  <div
                    key={block.type}
                    className={`p-3 rounded-lg border transition-colors ${
                      count > 0 ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{block.name}</span>
                      <Badge variant={count > 0 ? "default" : "secondary"}>
                        {count}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{block.category}</span>
                      <code className="text-xs text-muted-foreground">{block.type}</code>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
