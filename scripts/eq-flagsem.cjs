/*
 * P4 · 开关判定表达式一致性核验（只读）
 *
 * 同一个 flags.xxx 在 v1 与 v2 侧必须是同一种判定形态：
 *   !== false  /  !== 'false'  → 默认「开」（关 ≡ 旧版）
 *   === true                   → 默认「关」（灰度新能力）
 * 两侧形态不同 = 语义漂移：开关不动，v2 的行为就和 v1 不一样了。
 */
const fs=require('fs'),path=require('path');
const walk=(d,out=[])=>{if(!fs.existsSync(d))return out;for(const f of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,f.name);if(f.isDirectory())walk(p,out);else if(/\.tsx?$/.test(f.name))out.push(p)}return out};
const formOf=(files)=>{const m=new Map();
  for(const f of files){const s=fs.readFileSync(f,'utf8');
    for(const g of s.matchAll(/flags\.([a-zA-Z0-9_]+)\s*(===\s*true|!==\s*false|!==\s*'false'|===false|==\s*true)/g)){
      const k=g[1];const form=/!==\s*(false|'false')/.test(g[2])?'DEFAULT_ON':(/===\s*true|==\s*true/.test(g[2])?'DEFAULT_OFF':'EXPLICIT_OFF');
      if(!m.has(k))m.set(k,new Map());const q=m.get(k);q.set(form,(q.get(form)||0)+1)}}
  return m};
const all=walk('src');
const v2=[...walk('src/pages/v2'),...walk('src/hooks'),...walk('src/components/v2'),...walk('src/layouts/v2')];
const v1=all.filter(f=>!f.startsWith('src/pages/v2')&&!f.startsWith('src/hooks')&&!f.startsWith('src/components/v2')&&!f.startsWith('src/layouts/v2'));
const A=formOf(v1),B=formOf(v2);
const L=(m,k)=>[...m.get(k).entries()].map(([f,n])=>f+'×'+n).join('+');
let drift=0;
console.log('开关'.padEnd(26)+'v1 判定'.padEnd(22)+'v2 判定'.padEnd(22)+'结论');
console.log('-'.repeat(86));
for(const k of [...new Set([...A.keys(),...B.keys()])].sort()){
  const a=A.get(k)?L(A,k):'—', b=B.get(k)?L(B,k):'—';
  // 只比较「主导形态」：出现次数最多的那个
  const dom=(m)=>{if(!m.has(k))return null;return [...m.get(k).entries()].sort((x,y)=>y[1]-x[1])[0][0]};
  const da=dom(A),db=dom(B);
  const ok=(!da||!db||da===db);
  if(!ok)drift++;
  console.log(k.padEnd(26)+String(a).padEnd(22)+String(b).padEnd(22)+(ok?'✓':'✗ 漂移'));
}
console.log('\n语义漂移数：'+drift);
