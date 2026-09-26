// Read-only HTTP audit of pages selected from Search Console on 2026-09-26.
import { writeFile } from 'node:fs/promises';
const paths = [
 '/ru', '/ru/fighters/joshua-van', '/ru/fighters/yadong-song', '/ru/events/ufc-335',
 '/ru/fighters/rafa-garcia', '/ru/fighters/muhammad-naimov', '/ru/fighters/trevor-peek',
 '/ru/fighters/mario-pinto', '/ru/fighters/jeremy-horn', '/ru/fighters/sofia-montenegro',
 '/ru/fighters/bo-nickal', '/ru/fighters/sean-woodson', '/ru/fighters/kori-makkenna-7',
 '/ru/compare/levi-rodrigues-jr-vs-liu-ce', '/ru/compare/dzhek-della-maddalena-vs-yaroslav-amosov',
 '/ru/predictions/accuracy', '/ru/news/debyutant-ufc-osmanly-natselilsya-na-lyogkij-boj-s-shonom-omelli'
];
const results=[];
for(let start=0;start<paths.length;start+=4){
 results.push(...await Promise.all(paths.slice(start,start+4).map(async path=>{
  const begin=Date.now();
  try{
   const r=await fetch('https://fightbase.ru'+path,{signal:AbortSignal.timeout(20000)});
   const html=await r.text();
   const value=regex=>(html.match(regex)||[])[1]||null;
   const schemas=[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>{try{return JSON.parse(m[1])['@type']}catch{return 'INVALID_JSON'}});
   return {path,status:r.status,url:r.url,elapsedMs:Date.now()-begin,bytes:Buffer.byteLength(html),title:value(/<title>(.*?)<\/title>/s),description:value(/<meta name="description" content="([^"]*)/),canonical:value(/<link rel="canonical" href="([^"]*)/),h1Count:[...html.matchAll(/<h1\b/g)].length,schemas};
  }catch(e){return{path,error:e.message}}
 })));
}
const report={checkedAt:new Date().toISOString(),note:'HTTP timings are single samples, not Core Web Vitals or Lighthouse scores.',results};
await writeFile(process.argv[2]||'tmp/seo-baseline.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(results.map(({path,status,h1Count,canonical,title,error})=>({path,status,h1Count,canonical,title,error})),null,2));
