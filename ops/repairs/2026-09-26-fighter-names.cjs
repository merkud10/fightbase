// Run from the project root. Only fills missing names, with an on-disk backup.
// Sources and intentionally unresolved names: docs/improvement-results-2026-09-26.md.
require('dotenv').config({quiet:true});
const fs = require('node:fs');
const {PrismaClient}=require('@prisma/client');
const names=require('../../lib/ufc-name-dictionary.json').fullNames;
const targets={
  'luis-hernandez':'Luis Hernandez',
  'mehemmedeli-osmanli':'Mehemmedeli Osmanli',
  'ilimbek-akylbek-uulu':'Ilimbek Akylbek Uulu',
  'ricky-simon':'Ricky Simon',
  'melissa-amaya':'Melissa Amaya',
  'tina-black':'Tina Black',
  'christian-edwards':'Christian Edwards'
};
const p=new PrismaClient();
async function main(){
 const rows=await p.fighter.findMany({where:{slug:{in:Object.keys(targets)}},select:{id:true,slug:true,name:true,nameRu:true}});
 const changes=rows.filter(row=>row.name===targets[row.slug] && !row.nameRu?.trim());
 if(!process.argv.includes('--apply')) { console.log(JSON.stringify({dryRun:true,changes:changes.map(row=>({slug:row.slug,nameRu:names[row.name]}))})); return; }
 fs.mkdirSync('backups',{recursive:true});
 const backup=`backups/fighter-names-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
 fs.writeFileSync(backup,JSON.stringify(changes,null,2),{flag:'wx'});
 const count=await p.$transaction(async tx=>{
  let updated=0;
  for(const row of changes){
   const result=await tx.fighter.updateMany({where:{id:row.id,slug:row.slug,name:row.name,nameRu:row.nameRu},data:{nameRu:names[row.name]}});
   if(result.count!==1) throw new Error(`Concurrent change for ${row.slug}; rolling back`);
   updated+=result.count;
  }
  return updated;
 });
 console.log(JSON.stringify({updated:count,backup}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>p.$disconnect());
