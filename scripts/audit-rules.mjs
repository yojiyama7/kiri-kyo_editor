import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const registry=JSON.parse(fs.readFileSync(path.join(root,'llm','rules.json'),'utf8'));
const retiredRegistry=JSON.parse(fs.readFileSync(path.join(root,'llm','retired-rules.json'),'utf8'));
const rules=registry.rules || [];
const retired=retiredRegistry.retired || [];

const ids=rules.map(rule => rule.id);
assert.equal(new Set(ids).size,ids.length,'active rule IDs must be unique');
assert.ok(rules.every(rule => rule.id && rule.domain && rule.decision && rule.outcome && rule.text));
assert.ok(retired.every(rule => !ids.includes(rule.id)),'retired rules must not remain active');
assert.ok(retired.every(rule => (rule.supersededBy || []).every(id => ids.includes(id))));

function values(value){
  return new Set(Array.isArray(value) ? value.map(String) : [String(value)]);
}

function conditionsOverlap(left={},right={}){
  for(const key of Object.keys(left)){
    if(!(key in right)) continue;
    const a=values(left[key]);
    const b=values(right[key]);
    if(![...a].some(value => b.has(value))) return false;
  }
  return true;
}

function classify(left,right){
  if(left.id === right.id) return {status:'self',reason:'same rule'};
  if(left.decision !== right.decision){
    return {status:'orthogonal',reason:'different decision'};
  }
  if(!conditionsOverlap(left.when,right.when)){
    return {status:'compatible',reason:'disjoint conditions'};
  }
  if(left.outcome === right.outcome){
    return {status:'compatible',reason:'same outcome'};
  }
  return {
    status:'conflict',
    reason:`overlapping conditions produce ${left.outcome} vs ${right.outcome}`
  };
}

const rows=[];
for(const left of rules){
  for(const right of rules){
    rows.push({left:left.id,right:right.id,...classify(left,right)});
  }
}

const conflicts=rows.filter(row => row.status === 'conflict');
const counts=Object.fromEntries(
  ['self','orthogonal','compatible','conflict'].map(status => [
    status,
    rows.filter(row => row.status === status).length
  ])
);

const csvEscape=value => `"${String(value).replaceAll('"','""')}"`;
const csv=[
  ['left','right','status','reason'].map(csvEscape).join(','),
  ...rows.map(row => [row.left,row.right,row.status,row.reason].map(csvEscape).join(','))
].join('\n')+'\n';
fs.writeFileSync(path.join(root,'llm','rule-pair-audit.csv'),csv);

const byDomain=new Map();
for(const rule of rules){
  if(!byDomain.has(rule.domain)) byDomain.set(rule.domain,[]);
  byDomain.get(rule.domain).push(rule);
}

const markdown=[
  '# 規則一覧と全ペア矛盾監査',
  '',
  `生成日: ${registry.updated}`,
  '',
  '## 監査方法',
  '',
  `- active規則集合を A とし、|A| = ${rules.length}。`,
  `- A x A の全順序対 ${rows.length} 件を検査した。`,
  '- 判断名が異なるペアは独立、同じ判断名でも適用条件が排他的なら両立とする。',
  '- 同じ判断名で条件が同時成立し、結果が異なるペアだけを矛盾とする。',
  '- 全順序対の判定は `llm/rule-pair-audit.csv` に保存する。',
  '',
  '## 結果',
  '',
  `- self: ${counts.self}`,
  `- orthogonal: ${counts.orthogonal}`,
  `- compatible: ${counts.compatible}`,
  `- unresolved conflict: ${counts.conflict}`,
  '',
  '## 廃止した旧規則',
  '',
  ...retired.flatMap(rule => [
    `- ${rule.id}: ${rule.text}`,
    `  - 新規則 ${rule.supersededBy.join(', ')} を優先。${rule.reason}`
  ]),
  '',
  '## Active規則 A',
  ''
];

for(const [domain,domainRules] of byDomain){
  markdown.push(`### ${domain}`,'');
  for(const rule of domainRules){
    markdown.push(`- ${rule.id}: ${rule.text}`);
  }
  markdown.push('');
}

fs.writeFileSync(path.join(root,'llm','rule-audit.md'),markdown.join('\n')+'\n');

if(conflicts.length){
  for(const conflict of conflicts){
    console.error(`${conflict.left} x ${conflict.right}: ${conflict.reason}`);
  }
  process.exitCode=1;
}else{
  console.log(`${rules.length} active rules; ${rows.length} ordered pairs; 0 unresolved conflicts`);
}
