const a=require(process.cwd()+"/supabase/seed/module-skills.json");
const all=a.modules.flatMap(m=>m.skills.map(s=>({...s,m:m.moduleId})));
for(const n of process.argv.slice(2)){const s=all.find(x=>x.name===n);if(!s){console.log("?? "+n);continue;}
const p=s.tool_definition?.function?.parameters??{};const req=new Set(p.required??[]);
console.log(`\n## ${s.m}/${n} [${s.handler}] trust=${s.trust_level}`);
for(const [k,v] of Object.entries(p.properties??{})){console.log(`  ${req.has(k)?"*":" "} ${k}: ${v.type??""}${v.enum?" "+JSON.stringify(v.enum):""}${v.items?.properties?" items{"+Object.keys(v.items.properties).join(",")+"}":""}`);}
if(p["x-action-required"])console.log("  x-action-required:",JSON.stringify(p["x-action-required"]));}
