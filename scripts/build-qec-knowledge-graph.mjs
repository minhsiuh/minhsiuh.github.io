#!/usr/bin/env node
import fs from 'node:fs';

const pubsPath = new URL('../data/research-qec.publications.json', import.meta.url);
const collabPath = new URL('../data/research-qec.collaborators.json', import.meta.url);
const outGraphPath = new URL('../data/research-qec.knowledge-graph.json', import.meta.url);
const outCsvPath = new URL('../data/research-qec.collab-matrix.csv', import.meta.url);

const pubs = JSON.parse(fs.readFileSync(pubsPath, 'utf8'));
const collab = JSON.parse(fs.readFileSync(collabPath, 'utf8'));

const SELF = 'Min-Hsiu Hsieh';
const splitAuthors = (s='') => s.split(',').map(x=>x.trim()).filter(Boolean);

const paperList=[];
for(const g of pubs.groups||[]){
  for(const p of g.publications||[]){
    const y=(p.venue||'').match(/(19|20)\d{2}/g); const year=y?Number(y[y.length-1]):null;
    const c=(p.venue||'').match(/·\s*(\d+)\s+citations/i); const citations=c?Number(c[1]):null;
    const doi=(p.links||[]).find(l=>(l.label||'').toLowerCase()==='doi')?.url||null;
    const arxiv=(p.links||[]).find(l=>(l.label||'').toLowerCase()==='arxiv')?.url||null;
    paperList.push({group:g.group,title:p.title,authors:splitAuthors(p.authors),venue:p.venue,year,citations,doi,arxiv});
  }
}

const papers=paperList.map((p,i)=>({paperId:`P${String(i+1).padStart(3,'0')}`,group:p.group,title:p.title,year:p.year,citations:p.citations,venue:p.venue,doi:p.doi,arxiv:p.arxiv}));

const institutions=(collab.institutions||[]).map((i,idx)=>({institutionId:`I${String(idx+1).padStart(3,'0')}`,name:i.name,country:i.country,lat:i.location?.[0]??null,lon:i.location?.[1]??null}));
const instIdByName=new Map(institutions.map(i=>[i.name,i.institutionId]));

const collabSet=new Set((collab.collaborators||[]));
const collaborators=[...collabSet].sort((a,b)=>{const la=a.split(/\s+/).slice(-1)[0].toLowerCase();const lb=b.split(/\s+/).slice(-1)[0].toLowerCase();return la===lb?a.localeCompare(b):la.localeCompare(lb);}).map((name,idx)=>({collaboratorId:`C${String(idx+1).padStart(3,'0')}`,name,affiliations:[],paperIds:[]}));
const collabIdByName=new Map(collaborators.map(c=>[c.name,c.collaboratorId]));
const collabObjByName=new Map(collaborators.map(c=>[c.name,c]));

const collabToInst={};
for(const i of collab.institutions||[]){
  for(const c of i.collaborators||[]){
    if(!collabToInst[c]) collabToInst[c]=[];
    collabToInst[c].push(i);
  }
}
for(const c of collaborators){
  const insts=collabToInst[c.name]||[];
  c.affiliations=insts.map((i,idx)=>({institutionId:instIdByName.get(i.name)||null,institution:i.name,country:i.country,startYear:null,endYear:null,isPrimary:idx===0,source:'manual'}));
}

const edges=[];
for(const p of papers){
  const src=paperList[Number(p.paperId.slice(1))-1];
  for(const a of src.authors){
    if(a===SELF) continue;
    if(!collabIdByName.has(a)) continue;
    const cid=collabIdByName.get(a);
    const inst=(collabToInst[a]||[])[0];
    edges.push({paperId:p.paperId,collaboratorId:cid,institutionId:inst?instIdByName.get(inst.name):null,role:'coauthor'});
    const co=collabObjByName.get(a); if(co && !co.paperIds.includes(p.paperId)) co.paperIds.push(p.paperId);
  }
}
for(const c of collaborators) c.paperIds.sort();

const graph={version:'1.0',topic:pubs.topic||'Quantum Error Correction',lastCurated:new Date().toISOString().slice(0,10),papers,collaborators,institutions,edges};
fs.writeFileSync(outGraphPath,JSON.stringify(graph,null,2));

const rows=[['collaborator_name','affiliation','country','paper_id','paper_title','year','citations','doi']];
for(const c of collaborators){
  const pri=c.affiliations?.[0]||{};
  for(const pid of c.paperIds){
    const p=papers.find(x=>x.paperId===pid)||{};
    rows.push([c.name,pri.institution||'',pri.country||'',pid,p.title||'',p.year??'',p.citations??'',p.doi||'']);
  }
}
const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n')+'\n';
fs.writeFileSync(outCsvPath,csv);
console.log('✅ Built qec knowledge graph + matrix');
console.log(`papers=${papers.length}, collaborators=${collaborators.length}, institutions=${institutions.length}, edges=${edges.length}`);
