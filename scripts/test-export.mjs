// Run: node scripts/test-export.mjs [--python /path/to/python]
// The route uses a fixture snapshot; its actual sheet assembly and writer are exercised.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'outputs');
await mkdir(out,{recursive:true});
const seed=JSON.parse(await readFile(path.join(root,'data/seed-public.json'),'utf8'));
assert.equal(seed.measurements.length,25,'The public fixture must retain all 25 source observations.');
const snapshot={...seed,revision:17,history:[]};
const asModule=(source)=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64');
const writerUrl=asModule(await readFile(path.join(root,'app/lib/export-workbook.ts'),'utf8'));
const writer=await import(writerUrl);
globalThis.__robotelExportTest={snapshot:async()=>snapshot,ApiError:class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}};
const routeText=(await readFile(path.join(root,'app/api/export/route.ts'),'utf8'))
  .replace(/import \{ snapshot, ApiError \} from '\.\.\/\.\.\/lib\/library-server';/, 'const {snapshot,ApiError}=globalThis.__robotelExportTest;')
  .replace(/from '\.\.\/\.\.\/lib\/export-workbook'/,`from '${writerUrl}'`);
assert(!routeText.includes("from '../../lib/"),'Unexpected route import: update the test harness explicitly.');
const {GET}=await import(asModule(routeText));
const xlsxResponse=await GET(new Request('https://library.test/api/export?format=xlsx'));
assert.equal(xlsxResponse.status,200);
assert.equal(xlsxResponse.headers.get('X-Library-Revision'),'17');
assert.equal(xlsxResponse.headers.get('Cache-Control'),'no-store');
assert(xlsxResponse.headers.get('Content-Disposition').includes('Robotel_Kutuphane_r17.xlsx'));
const bytes=new Uint8Array(await xlsxResponse.arrayBuffer());
assert.deepEqual([...bytes.slice(0,4)],[0x50,0x4b,0x03,0x04]);
await writeFile(path.join(out,'test-export.xlsx'),bytes);

const special='İı Şş Ğğ Üü Öö Çç — ± & <etiket> "alıntı"';
const csvCases=[
  {id:'unicode',value:special}, {id:'comma',value:'bir,iki'},
  {id:'newline',value:'bir\r\niki'}, {id:'quote',value:'"iki"'},
  {id:'equals',value:'=1+1'}, {id:'plus',value:'+SUM(A1:A2)'},
  {id:'minus',value:'-1+1'}, {id:'at',value:'@SUM(A1:A2)'},
  {id:'tab',value:'\t=1+1'}, {id:'carriage',value:'\r=1+1'},
  {id:'blank',value:''}, {id:'zero',value:0}, {id:'decimal',value:1.27},
];
await writeFile(path.join(out,'test-export-cases.csv'),writer.csv(csvCases),'utf8');
await writeFile(path.join(out,'test-export-cases.json'),JSON.stringify(csvCases),'utf8');
const wide=Array.from({length:29},(_,i)=>i===26?'AA':i===27?'AB':i===28?'AC':`sütun ${i+1}`);
const edgeRows=[
  ['Türkçe & <başlık>','Tür','Boş','Sayı','Formül gibi metin','Özel metin'],
  ['İıŞşĞğÜüÖöÇç',true,null,0,'=1+1',special],
  ['İkinci',false,undefined,-12.5,'+SUM(A1:A2)','  boşluklar  '],
  wide,
];
await writeFile(path.join(out,'test-export-edge.xlsx'),writer.workbook([
  {name:'Türkçe & <test>',rows:edgeRows},writer.objectSheet('Boş',[]),
  writer.objectSheet('Nesne',[{id:'ilk',detail:{x:'< & ±'},list:[1,'iki'],missing:null},{id:'ikinci',extra:'yeni alan'}]),
]));
const jsonResponse=await GET(new Request('https://library.test/api/export?format=json'));
assert.equal(jsonResponse.status,200);
assert.deepEqual(await jsonResponse.json(),snapshot);
const csvResponse=await GET(new Request('https://library.test/api/export?format=csv'));
assert.equal(csvResponse.status,200);
await writeFile(path.join(out,'test-export-measurements.csv'),await csvResponse.text(),'utf8');
const invalid=await GET(new Request('https://library.test/api/export?format=zip'));
assert.equal(invalid.status,400);
assert((await invalid.json()).error);
const pythonIndex=process.argv.indexOf('--python');
const python=pythonIndex>=0?process.argv[pythonIndex+1]:(process.env.TEST_PYTHON||'python');
assert(python,'--python requires an executable path.');
const checked=spawnSync(python,[path.join(root,'scripts/test-export.py'),root],{encoding:'utf8',shell:false});
if(checked.stdout)process.stdout.write(checked.stdout);
if(checked.stderr)process.stderr.write(checked.stderr);
assert.equal(checked.status,0,'Independent Python ZIP/XML validation failed.');
delete globalThis.__robotelExportTest;
console.log('Export QA passed: real route, revision headers, JSON, CSV, 12-sheet XLSX and edge cases.');
