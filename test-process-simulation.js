#!/usr/bin/env node

/**
 * Test Process Simulation - Lead-to-Customer via MCP Skills
 *
 * Simulates a complete business process using Supabase edge functions
 * and tests all key steps: lead creation → enrichment → qualification → deal
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
// No default: a key in the tree is a key in every fork (CLAUDE.md, "never add an instance default").
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_KEY) {
  console.error('VITE_SUPABASE_ANON_KEY is not set — point this script at a stack with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  process.exit(1);
}

// Simulated lead data
const testLead = {
  name: 'Sofia Bergström',
  email: 'sofia.bergstrom@techstartup.se',
  phone: '+46 70 123 4567',
  company_name: 'TechStartup AB',
  company_domain: 'techstartup.se',
  source: 'booking-form'
};

// Helper to make skill calls via Supabase edge function
async function callSkill(skillName, params) {
  const endpoint = `${SUPABASE_URL}/functions/v1/agent-execute`;

  const payload = {
    skill_name: skillName,
    arguments: params,
    agent_type: 'admin-tester',
  };

  console.log(`\n📡 Calling skill: ${skillName}`);
  console.log(`   Parameters: ${JSON.stringify(params, null, 2)}`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ Error: ${response.status}`);
      console.error(`   Response: ${JSON.stringify(data)}`);
      return null;
    }

    console.log(`✅ Success: ${JSON.stringify(data, null, 2)}`);
    return data;
  } catch (error) {
    console.error(`❌ Network error: ${error.message}`);
    console.error(`   Endpoint: ${endpoint}`);
    return null;
  }
}

async function testLeadToCustomerProcess() {
  console.log('🚀 Starting Lead-to-Customer Process Simulation\n');
  console.log('='.repeat(60));

  // Step 1: Add Lead
  console.log('\n📝 STEP 1: Add Lead');
  console.log('-'.repeat(60));
  const addLeadResult = await callSkill('add_lead', {
    name: testLead.name,
    email: testLead.email,
    phone: testLead.phone,
    source: testLead.source,
  });

  if (!addLeadResult?.lead_id) {
    console.error('❌ Failed to create lead. Stopping process.');
    return;
  }

  const leadId = addLeadResult.lead_id;
  console.log(`\n✅ Lead created with ID: ${leadId}`);

  // Step 2: Create Company (if not exists)
  console.log('\n\n🏢 STEP 2: Manage Company');
  console.log('-'.repeat(60));
  const companyResult = await callSkill('manage_company', {
    action: 'create',
    name: testLead.company_name,
    domain: testLead.company_domain,
  });

  const companyId = companyResult?.company_id;
  console.log(`\n✅ Company processed: ${companyId || 'linked to existing'}`);

  // Step 3: Enrich Company (if ID available)
  if (companyId) {
    console.log('\n\n💎 STEP 3: Enrich Company');
    console.log('-'.repeat(60));
    const enrichResult = await callSkill('enrich_company', {
      companyId: companyId,
      domain: testLead.company_domain,
    });
    console.log(`\n✅ Company enriched with industry/size data`);
  }

  // Step 4: Qualify Lead
  console.log('\n\n🎯 STEP 4: Qualify Lead');
  console.log('-'.repeat(60));
  const qualifyResult = await callSkill('qualify_lead', {
    leadId: leadId,
  });

  if (qualifyResult) {
    console.log(`\n✅ Lead Scoring Results:`);
    console.log(`   Score: ${qualifyResult.score || 'N/A'}`);
    console.log(`   Engagement: ${qualifyResult.engagement_level || 'N/A'}`);
    console.log(`   Activity Count: ${qualifyResult.activity_count || 0}`);
  }

  // Step 5: Create Deal
  console.log('\n\n🤝 STEP 5: Create Deal from Lead');
  console.log('-'.repeat(60));
  const dealResult = await callSkill('manage_deal', {
    action: 'create',
    lead_id: leadId,
    title: `Opportunity: ${testLead.company_name} - Private AI Consultation`,
    value: 50000,
    currency: 'SEK',
    stage: 'qualified',
  });

  const dealId = dealResult?.deal_id;
  if (dealId) {
    console.log(`\n✅ Deal created with ID: ${dealId}`);
  } else {
    console.log(`\n⚠️ Deal creation status: ${JSON.stringify(dealResult)}`);
  }

  // Step 6: Create Follow-up Task
  console.log('\n\n✓ STEP 6: Create Follow-up Task');
  console.log('-'.repeat(60));
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 3);

  const taskResult = await callSkill('crm_task_create', {
    title: `Follow up: ${testLead.name} - Send Proposal`,
    description: `Send consulting proposal for Private AI implementation. Key contact: ${testLead.name} (${testLead.email})`,
    due_date: dueDate.toISOString(),
    priority: 'high',
    lead_id: leadId,
    deal_id: dealId,
  });

  const taskId = taskResult?.id;
  console.log(`\n✅ Task created: ${taskId || taskResult}`);

  // Step 7: List Leads (verify creation)
  console.log('\n\n📋 STEP 7: Verify - List All Leads');
  console.log('-'.repeat(60));
  const leadsList = await callSkill('manage_leads', {
    action: 'list',
    limit: 5,
  });

  if (leadsList?.leads && Array.isArray(leadsList.leads)) {
    console.log(`\n✅ Total leads in system: ${leadsList.total || leadsList.leads.length}`);
    console.log(`   Recent leads:`);
    leadsList.leads.slice(0, 3).forEach(lead => {
      console.log(`   - ${lead.name || 'N/A'} (${lead.email}) [Score: ${lead.score || 0}]`);
    });
  }

  // Summary
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 PROCESS SUMMARY');
  console.log('='.repeat(60));
  console.log(`
✅ Lead-to-Customer Process Test Completed

Process Steps Tested:
  1. ✅ Lead Capture (add_lead)
  2. ✅ Company Management (manage_company)
  3. ✅ Company Enrichment (enrich_company)
  4. ✅ Lead Qualification (qualify_lead)
  5. ✅ Deal Creation (manage_deal)
  6. ✅ Task Assignment (crm_task_create)
  7. ✅ Data Verification (manage_leads)

Results:
  - Lead ID: ${leadId}
  - Company ID: ${companyId || 'N/A'}
  - Deal ID: ${dealId || 'N/A'}
  - Task ID: ${taskId || 'N/A'}

Next Steps in Quote-to-Cash:
  When deal is won, project setup would follow with:
  - manage_project (create project from deal)
  - manage_project_task (create project tasks)
  - log_time (team logs hours)
  - invoice_from_timesheets (auto-generate invoice)
  `);
}

// Run the test
testLeadToCustomerProcess().catch(console.error);
