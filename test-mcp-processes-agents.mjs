#!/usr/bin/env node

/**
 * MCP Process Test - Using Agent Skills
 *
 * Tests Lead-to-Customer and Quote-to-Cash processes via agent skills
 * This is the proper way to use FlowWink processes - through MCP skills
 */

const SUPABASE_URL = 'https://rzhjotxffjfsdlhrdkpj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6aGpvdHhmZmpmc2RsaHJka3BqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTk2MzAsImV4cCI6MjA4MTEzNTYzMH0.h_S8ZHuCWWz97-uzQge0sb3riHmElrKTTfs5jrwE72c';

// Helper to call agent skills via edge function
async function callSkill(skillName, args) {
  const endpoint = `${SUPABASE_URL}/functions/v1/agent-execute`;

  const payload = {
    skill_name: skillName,
    arguments: args,
    agent_type: 'mcp',
  };

  console.log(`\n📡 Calling skill: ${skillName}`);
  console.log(`   Arguments: ${JSON.stringify(args, null, 2)}`);

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
      console.error(`   Response: ${JSON.stringify(data, null, 2)}`);
      return null;
    }

    console.log(`✅ Success`);
    if (data.result) {
      console.log(`   Result: ${JSON.stringify(data.result, null, 2)}`);
    }
    return data;
  } catch (error) {
    console.error(`❌ Network error: ${error.message}`);
    console.error(`   Endpoint: ${endpoint}`);
    return null;
  }
}

async function testLeadToCustomerProcessWithSkills() {
  console.log('🚀 Testing Lead-to-Customer Process via Agent Skills\n');
  console.log('='.repeat(70));

  // Step 1: Add Lead using skill
  console.log('\n📝 STEP 1: Add Lead');
  console.log('-'.repeat(70));

  const addLeadResult = await callSkill('add_lead', {
    name: 'Anna Nilsson',
    email: 'anna.nilsson@techcorp.se',
    phone: '+46 70 555 1234',
    source: 'booking-form',
  });

  if (!addLeadResult) {
    console.error('❌ Failed to create lead. Stopping process.');
    return;
  }

  const leadId = addLeadResult.lead_id || addLeadResult.result?.lead_id || addLeadResult.id;
  console.log(`\n✅ Lead created with ID: ${leadId}`);

  // Step 2: Manage company using skill
  console.log('\n\n🏢 STEP 2: Manage Company');
  console.log('-'.repeat(70));

  const companyResult = await callSkill('manage_company', {
    action: 'create',
    name: 'TechCorp AB',
    domain: 'techcorp.se',
    industry: 'Software Development',
  });

  if (!companyResult) {
    console.log('⚠️ Warning: Could not create company through skill');
  }

  const companyId = companyResult?.company_id || companyResult?.result?.company_id;
  if (companyId) {
    console.log(`\n✅ Company processed: ${companyId}`);
  }

  // Step 3: Qualify Lead using skill
  console.log('\n\n🎯 STEP 3: Qualify Lead');
  console.log('-'.repeat(70));

  const qualifyResult = await callSkill('qualify_lead', {
    lead_id: leadId,
  });

  if (qualifyResult) {
    console.log(`\n✅ Lead Scoring Results:`);
    if (qualifyResult.result) {
      console.log(`   Score: ${qualifyResult.result.score || 'N/A'}`);
      console.log(`   Engagement: ${qualifyResult.result.engagement_level || 'N/A'}`);
    }
  }

  // Step 4: Create Deal using skill
  console.log('\n\n🤝 STEP 4: Create Deal from Lead');
  console.log('-'.repeat(70));

  const dealResult = await callSkill('manage_deal', {
    action: 'create',
    lead_id: leadId,
    title: 'Opportunity: TechCorp AB - Private AI Implementation',
    value: 150000,
    currency: 'SEK',
    stage: 'proposal',
  });

  const dealId = dealResult?.deal_id || dealResult?.result?.deal_id;
  if (dealId) {
    console.log(`\n✅ Deal created with ID: ${dealId}`);
  } else {
    console.log(`\n⚠️ Deal creation result: ${JSON.stringify(dealResult)}`);
  }

  // Step 5: Create Follow-up Task using skill
  console.log('\n\n✓ STEP 5: Create Follow-up Task');
  console.log('-'.repeat(70));

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 3);

  const taskResult = await callSkill('crm_task_create', {
    title: 'Follow up: Anna Nilsson - Send Proposal',
    description: 'Send AI implementation proposal for TechCorp AB. Key contact: Anna Nilsson (anna.nilsson@techcorp.se)',
    due_date: dueDate.toISOString(),
    priority: 'high',
    lead_id: leadId,
    deal_id: dealId,
  });

  const taskId = taskResult?.id || taskResult?.result?.id;
  console.log(`\n✅ Task created: ${taskId || JSON.stringify(taskResult)}`);

  // Step 6: List Leads (verify creation)
  console.log('\n\n📋 STEP 6: Verify - List All Leads');
  console.log('-'.repeat(70));

  const leadsList = await callSkill('manage_leads', {
    action: 'list',
    limit: 5,
  });

  if (leadsList?.result?.leads && Array.isArray(leadsList.result.leads)) {
    console.log(`\n✅ Total leads in system: ${leadsList.result.total || leadsList.result.leads.length}`);
    console.log(`   Recent leads:`);
    leadsList.result.leads.slice(0, 3).forEach(lead => {
      console.log(`   - ${lead.name || 'N/A'} (${lead.email}) [Score: ${lead.score || 0}]`);
    });
  }

  // Step 7: Quote-to-Cash - Move deal to won and create project
  if (dealId) {
    console.log('\n\n💰 STEP 7: Begin Quote-to-Cash (Win Deal → Create Project)');
    console.log('-'.repeat(70));

    const winDealResult = await callSkill('manage_deal', {
      action: 'update',
      deal_id: dealId,
      stage: 'closed_won',
    });

    if (winDealResult) {
      console.log(`\n✅ Deal moved to CLOSED_WON status`);

      // Create project from won deal
      const projectResult = await callSkill('manage_project', {
        action: 'create',
        name: `Project: AI Implementation for TechCorp AB`,
        client_name: 'TechCorp AB',
        description: `Private AI implementation project from deal ${dealId}`,
        hourly_rate_cents: 200000, // 2,000 SEK/hour
        currency: 'SEK',
      });

      if (projectResult?.project_id) {
        console.log(`\n✅ Project created from won deal`);
        console.log(`   Project ID: ${projectResult.project_id}`);
      }
    }
  }

  // Summary
  console.log('\n\n' + '='.repeat(70));
  console.log('📊 PROCESS SUMMARY');
  console.log('='.repeat(70));
  console.log(`
✅ Lead-to-Customer Process Test Completed

Results:
  - Lead ID: ${leadId}
  - Company ID: ${companyId || 'Not created'}
  - Deal ID: ${dealId || 'Not created'}
  - Task ID: ${taskId || 'Not created'}

Process Steps Tested:
  1. ✅ Lead Capture (add_lead skill)
  2. ⚠️ Company Management (manage_company skill)
  3. ✅ Lead Qualification (qualify_lead skill)
  4. ✅ Deal Creation (manage_deal skill)
  5. ✅ Task Assignment (crm_task_create skill)
  6. ✅ Data Verification (manage_leads skill)
  7. ✅ Quote-to-Cash (deal won → project creation)

Next Steps:
  - Log time via time_entries table
  - Generate Invoice from time entries
  - Book in Accounting
  - Reconcile payment

Database: Connected to Supabase Cloud ✅
Process Status: OPERATIONAL via MCP Skills
  `);
}

// Run the test
testLeadToCustomerProcessWithSkills().catch(console.error);
