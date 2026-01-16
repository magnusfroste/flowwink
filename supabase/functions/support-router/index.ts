import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SentimentAnalysis {
  frustrationLevel: number; // 0-10
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  humanNeeded: boolean;
  trigger: string;
}

interface RouteRequest {
  conversationId: string;
  sentiment: SentimentAnalysis;
  customerEmail?: string;
  customerName?: string;
}

interface RouteResult {
  action: 'continue_ai' | 'handoff_to_agent' | 'create_escalation';
  agentId?: string;
  agentName?: string;
  escalationId?: string;
  message: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId, sentiment, customerEmail, customerName } = await req.json() as RouteRequest;
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Support router called:', { conversationId, sentiment });

    // Check if handoff is needed
    if (!sentiment.humanNeeded) {
      return new Response(
        JSON.stringify({ 
          action: 'continue_ai',
          message: 'AI can handle this conversation'
        } as RouteResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find available online agents
    const { data: onlineAgents, error: agentsError } = await supabase
      .from('support_agents')
      .select(`
        id,
        user_id,
        current_conversations,
        max_conversations,
        profiles:user_id (
          full_name,
          email
        )
      `)
      .eq('status', 'online')
      .order('current_conversations', { ascending: true });

    if (agentsError) {
      console.error('Error fetching agents:', agentsError);
      throw agentsError;
    }

    // Filter agents with available capacity
    const availableAgents = (onlineAgents || []).filter(
      agent => agent.current_conversations < agent.max_conversations
    );

    console.log('Available agents:', availableAgents.length);

    if (availableAgents.length > 0) {
      // Assign to least busy agent
      const agent = availableAgents[0];
      const agentProfile = agent.profiles as any;

      // Update conversation status
      await supabase
        .from('chat_conversations')
        .update({
          assigned_agent_id: agent.id,
          conversation_status: 'with_agent',
          priority: sentiment.urgency,
          sentiment_score: sentiment.frustrationLevel,
          customer_email: customerEmail,
          customer_name: customerName,
        })
        .eq('id', conversationId);

      // Increment agent's current conversations
      await supabase
        .from('support_agents')
        .update({
          current_conversations: agent.current_conversations + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', agent.id);

      return new Response(
        JSON.stringify({
          action: 'handoff_to_agent',
          agentId: agent.id,
          agentName: agentProfile?.full_name || 'Support Agent',
          message: `Connecting you to ${agentProfile?.full_name || 'a support agent'}...`,
        } as RouteResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No agents available - create escalation
    console.log('No agents available, creating escalation');

    // Get conversation messages for summary
    const { data: messages } = await supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    // Create form submission with chat transcript
    const { data: formSubmission, error: formError } = await supabase
      .from('form_submissions')
      .insert({
        form_name: 'Chat Escalation',
        block_id: 'system-escalation',
        data: {
          type: 'chat_escalation',
          conversation_id: conversationId,
          priority: sentiment.urgency,
          reason: sentiment.trigger,
          customer_email: customerEmail,
          customer_name: customerName,
          frustration_level: sentiment.frustrationLevel,
          transcript: (messages || []).map(m => ({
            role: m.role,
            content: m.content,
            timestamp: m.created_at,
          })),
        },
        metadata: {
          source: 'chat_escalation',
          sentiment: sentiment,
        },
      })
      .select('id')
      .single();

    if (formError) {
      console.error('Error creating form submission:', formError);
      throw formError;
    }

    // Create escalation record
    const { data: escalation, error: escalationError } = await supabase
      .from('support_escalations')
      .insert({
        conversation_id: conversationId,
        form_submission_id: formSubmission.id,
        reason: sentiment.trigger,
        priority: sentiment.urgency,
      })
      .select('id')
      .single();

    if (escalationError) {
      console.error('Error creating escalation:', escalationError);
      throw escalationError;
    }

    // Update conversation status
    await supabase
      .from('chat_conversations')
      .update({
        conversation_status: 'escalated',
        priority: sentiment.urgency,
        sentiment_score: sentiment.frustrationLevel,
        escalation_reason: sentiment.trigger,
        escalated_at: new Date().toISOString(),
        customer_email: customerEmail,
        customer_name: customerName,
      })
      .eq('id', conversationId);

    return new Response(
      JSON.stringify({
        action: 'create_escalation',
        escalationId: escalation.id,
        message: 'No agents are available right now. Your request has been saved and a team member will get back to you soon.',
      } as RouteResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Support router error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An error occurred'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
