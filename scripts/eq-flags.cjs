/*
 * P4 · 业务开关覆盖核验（只读）
 *
 * 口径：v1 代码（pages/a b c e + 其余非 v2 组件）里读过的每个 flags.xxx，
 *      v2 侧（pages/v2 + hooks + components/v2）必须也有读取点，否则
 *      该开关在 v2 下静默失效 —— 「关 ≡ 旧版」不成立（因为「开」也不成立）。
 */
const fs=require('fs'),path=require('path');
const walk=(d,out=[])=>{if(!fs.existsSync(d))return out;for(const f of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,f.name);if(f.isDirectory())walk(p,out);else if(/\.tsx?$/.test(f.name))out.push(p)}return out};
const read=(p)=>fs.readFileSync(p,'utf8');
const keysOf=(files)=>{const m=new Map();for(const f of files){const s=read(f);for(const g of s.matchAll(/flags\.([a-zA-Z0-9_]+)/g)){const k=g[1];if(!m.has(k))m.set(k,new Set());m.get(k).add(f)}}return m};

const v2Files=[...walk('src/pages/v2'),...walk('src/hooks'),...walk('src/components/v2')];
const all=walk('src');
const v1Files=all.filter(f=>!f.startsWith('src/pages/v2')&&!f.startsWith('src/hooks')&&!f.startsWith('src/components/v2'));

const A=keysOf(v1Files),B=keysOf(v2Files);
const only1=[...A.keys()].filter(k=>!B.has(k)).sort();
const only2=[...B.keys()].filter(k=>!A.has(k)).sort();
const both=[...A.keys()].filter(k=>B.has(k)).sort();

console.log('=== v1 读了、v2 侧（页+hook）没有读取点 → 开关在 v2 静默失效 ===');
for(const k of only1) console.log('  ✗ '+k+'   (v1: '+[...A.get(k)].join(', ')+')');
if(!only1.length) console.log('  （无）');
console.log('\n=== v2 侧独有读取（v1 未直接读，通常是 hook 收敛或新增）===');
for(const k of only2) console.log('  · '+k+'   (v2: '+[...B.get(k)].join(', ')+')');
if(!only2.length) console.log('  （无）');
console.log('\n=== 两侧都有读取点 ===');
for(const k of both) console.log('  ✓ '+k);
console.log('\n合计：v1 读 '+A.size+' / v2 读 '+B.size+' / 交集 '+both.length+' / v1 独有 '+only1.length+' / v2 独有 '+only2.length);
