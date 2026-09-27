"use strict";
// Standalone browser fixture. It never opens Zotero, SQLite or user documents.
const http = require("node:http");
const fs = require("node:fs");
const { resolve, join } = require("node:path");
const root = resolve(__dirname, "..");
const addon = join(root, "addon/chrome/content/lyz");
const locale = fs.readFileSync(join(root, "addon/locale/hu-HU/lyz.ftl"), "utf8");
const strings = Object.fromEntries([...locale.matchAll(/^(lyz-manager-[a-z-]+) = (.+)$/gm)].map(([, id, text]) => [id, text]));
const fixture = String.raw`
const strings = STRINGS;
const clone = value => JSON.parse(JSON.stringify(value));
const ok = { state: 'ok' }, missing = { state: 'missing' };
const data = {
    docs: [
        {id:1,doc:'D:/Dokumentumok/Disszertáció/fő dokumentum.lyx',bib:'D:/Dokumentumok/Disszertáció/források.bib',file:ok,bibliography:ok},
        {id:2,doc:'D:/Dokumentumok/Disszertáció/fejezet 2.lyx',bib:'D:/Dokumentumok/Disszertáció/források.bib',file:missing,bibliography:ok},
        {id:3,doc:'D:/Projektek/Tanulmány/cikk.lyx',bib:'D:/Projektek/Tanulmány/irodalom.bib',file:ok,bibliography:missing}
    ],
    bibs: [
        {bib:'D:/Dokumentumok/Disszertáció/források.bib',file:ok,documents:2,keys:62},
        {bib:'D:/Projektek/Tanulmány/irodalom.bib',file:missing,documents:1,keys:1}
    ],
    keys: Array.from({length:63},(_,i)=>({id:i,zid:'1_'+i,key:'Primusz2026_'+i,
        bib:'D:/Dokumentumok/Disszertáció/források.bib',title:'Árvíztűrő tanulmány '+i,itemState:i===2?'missing':'ok',file:ok})),
    recovery: [], archive: [{id:1,source:'docs',record:JSON.stringify({id:14,doc:'D:/Régi hely/fő dokumentum.lyx',bib:'D:/Régi hely/források.bib'})}],
    errors:[],editable:!location.search.includes('readonly')
};
if(!data.editable) data.recovery.push({id:'lyz-preview',bib:data.bibs[0].bib,state:'prepared',journal:'{"files":[{"path":"D:/Dokumentumok/Disszertáció/fejezet 2.lyx"}]}'});
let pending, applies=0;
window.arguments = [{
    localize:(id,args={})=>(strings[id]||id).replace(/\{ \$([\w-]+) \}/g,(_,name)=>args[name]),
    inventory:async()=>clone(data),
    chooseFile:async(kind)=>kind==='docs'?'D:/Áthelyezve/fejezet 2.lyx':'D:/Áthelyezve/források.bib',
    preview:async(request)=>{
        pending=clone(request);
        const docs=data.docs.filter(row=>request.action.endsWith('doc')?row.doc===request.source:row.bib===request.source);
        return {...request,id:'preview',documents:docs.length,keys:request.action.endsWith('doc')?0:62,affected:docs.map(row=>row.doc),sourceMissing:true};
    },
    discard:()=>{pending=null;},
    apply:async()=>{
        if(!pending) throw Error('Preview missing');
        applies++;
        const source=clone(pending);
        const docs=data.docs.filter(row=>source.action.endsWith('doc')?row.doc===source.source:row.bib===source.source);
        for(const doc of docs) data.archive.push({id:100+applies,source:'docs',record:JSON.stringify(doc)});
        if(source.action==='relink-doc') for(const row of docs){row.doc=source.target;row.file=ok;}
        if(source.action==='delete-doc') data.docs=data.docs.filter(row=>row.doc!==source.source);
        if(source.action==='delete-bib') {data.docs=data.docs.filter(row=>row.bib!==source.source);data.bibs=data.bibs.filter(row=>row.bib!==source.source);data.keys=data.keys.filter(row=>row.bib!==source.source);}
        return true;
    },
    export:async()=>true
}];
`;
http.createServer((req, res) => {
    const path = new URL(req.url, "http://127.0.0.1").pathname;
    if (path === "/preview-api.js") {
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.end(fixture.replace("STRINGS", JSON.stringify(strings)));
    } else if (["/mapping-manager.xhtml", "/mapping-manager.css", "/mapping-manager.js"].includes(path)) {
        const file = path.slice(1);
        let content = fs.readFileSync(join(addon, file), "utf8");
        if (file.endsWith(".xhtml")) content = content.replace('<head>', '<head><script src="preview-api.js"></script>');
        res.setHeader("Content-Type", (file.endsWith(".xhtml") ? "application/xhtml+xml" : file.endsWith(".css") ? "text/css" : "application/javascript") + "; charset=utf-8");
        res.end(content);
    } else { res.writeHead(404); res.end(); }
}).listen(8765, "127.0.0.1", () => process.stdout.write("Mapping UI fixture: http://127.0.0.1:8765/mapping-manager.xhtml\n"));
