import { env } from 'cloudflare:workers';
import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from '../chatgpt-auth';
import { seedData } from './seed-data';
import type { Material, Measurement, Source } from './types';

type Row = Record<string, unknown>;
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export function database(): D1Database { if (!env.DB) throw new ApiError(503,'Ortak veri deposuna şu anda ulaşılamıyor.'); return env.DB; }
const parse = (s: unknown) => typeof s === 'string' ? JSON.parse(s) : null;
const json = (v: unknown) => v === null ? null : JSON.stringify(v);
function checkPublicText(value:unknown) {
  if(/(?<![A-Za-z])[A-Za-z]:[\\/]|\\\\[^\\\s]+\\|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(JSON.stringify(value)))throw new ApiError(400,'Kişisel e-posta adreslerini ve yerel dosya yollarını çıkarın. Kamusal kaynak bağlantısı kullanın.');
}
export async function identity() {
  const user = await getChatGPTUser();
  const allowed = (env.MAINTAINER_EMAILS ?? '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  // Email is used only for server authorization, never sent to the public API.
  const actorId = user ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.userId)))).map(x=>x.toString(16).padStart(2,'0')).join('') : '';
  const displayName = user?.fullName?.trim().slice(0,80).replace(/\S+@\S+/g,'Katkıcı') || (user ? `Katkıcı ${actorId.slice(0,6)}` : 'Ziyaretçi');
  return { user, actorId, displayName, canReview: !!user && allowed.includes(user.email.toLowerCase()) };
}
export async function mutationContext(request: Request, review = false) {
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') throw new ApiError(403,'Bu işlem yalnız uygulama içinden yapılabilir.');
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415,'JSON biçiminde bir istek gerekli.');
  const who = await identity();
  if (!who.user) throw new ApiError(401,'Katkı önermek için giriş yapın.');
  if (review && !who.canReview) throw new ApiError(403,'Bu işlem için değerlendirici yetkisi gerekiyor.');
  if (Number(request.headers.get('content-length') || 0) > 24000) throw new ApiError(413,'Öneri çok uzun.');
  const raw = await request.text();
  if (raw.length > 24000) throw new ApiError(413,'Öneri çok uzun.');
  let body: Row;
  try { body = JSON.parse(raw); } catch { throw new ApiError(400,'İstek okunamadı.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400,'İstek alanlarını kontrol edin.');
  return { who, body };
}
function str(body: Row, key: string, max=1000, required=false) {
  const v = typeof body[key] === 'string' ? body[key].trim() : '';
  if (v.length > max || (required && !v)) throw new ApiError(400,`${key} alanını kontrol edin (en fazla ${max} karakter).`);
  return v;
}
function requestId(body: Row) { const id=str(body,'requestId',100,true); if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id)) throw new ApiError(400,'İstek kimliği geçersiz.'); return id; }
function revision(body: Row, key='expectedRevision') { const v=body[key]; if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0) throw new ApiError(400,'Sürüm numarası geçersiz.'); return v; }
async function init(db: D1Database) { await db.prepare('INSERT OR IGNORE INTO library_meta (id,revision) VALUES (1,0)').run(); }
export async function snapshot() {
  const db=database(); await init(db);
  // One D1 batch is one consistent database transaction, including its revision.
  const [meta,records,events] = await db.batch([
    db.prepare('SELECT revision FROM library_meta WHERE id=1'),
    db.prepare('SELECT * FROM library_records'),
    db.prepare('SELECT * FROM library_events ORDER BY revision DESC'),
  ]);
  const materials=new Map(seedData.materials.map(x=>[x.id,x]));
  const measurements=new Map(seedData.measurements.map(x=>[x.id,x]));
  const sources=new Map(seedData.sources.map(x=>[x.id,x]));
  for (const row of records.results as Row[]) {
    const data=parse(row.data); const id=String(row.key).split(':').slice(1).join(':');
    const map=row.kind==='material'?materials:row.kind==='measurement'?measurements:sources;
    if(data) map.set(id,data); else map.delete(id);
  }
  const history=(events.results as Row[]).map(e=>({id:e.id,revision:e.revision,groupId:e.group_id,actorName:e.actor_name,createdAt:e.created_at,action:e.action,recordKey:e.record_key,recordKind:e.record_kind,before:parse(e.before),after:parse(e.after),note:e.note,proposalId:e.proposal_id,reversible:!!e.record_key}));
  return {...seedData, revision:Number((meta.results[0] as Row).revision), materials:[...materials.values()],measurements:[...measurements.values()],sources:[...sources.values()],history};
}
export async function libraryResponse() {
  const [data,who]=await Promise.all([snapshot(),identity()]);
  // Pending/rejected content is visible only to its author and maintainers.
  const rows=who.canReview
    ? await database().prepare('SELECT * FROM proposals ORDER BY created_at DESC LIMIT 1000').all()
    : await database().prepare('SELECT * FROM proposals WHERE status=? OR actor_id=? ORDER BY created_at DESC LIMIT 1000').bind('approved',who.actorId).all();
  const proposals=rows.results.map(r=>({id:r.id,kind:r.kind,payload:parse(r.payload),actorName:r.actor_name,createdAt:r.created_at,baseRevision:r.base_revision,status:r.status,reviewedAt:r.reviewed_at,reviewerName:r.reviewer_name,reviewNote:r.review_note}));
  return {...data,proposals,user:{signedIn:!!who.user,displayName:who.displayName,canReview:who.canReview},links:{signIn:chatGPTSignInPath('/'),signOut:chatGPTSignOutPath('/'),github:'https://github.com/SedaAygul/robotel-materials'}};
}
function httpsUrl(value:string) {
  let url: URL; try { url=new URL(value); } catch { throw new ApiError(400,'Geçerli bir kaynak bağlantısı ekleyin.'); }
  if(url.protocol!=='https:' || url.username || url.password) throw new ApiError(400,'Kaynak bağlantısı https ile başlamalı ve kimlik bilgisi içermemeli.');
  return url.toString();
}
export async function submitProposal(request: Request) {
  const {who,body}=await mutationContext(request);
  const db=database(); await init(db); const rid=requestId(body);
  const existing=await db.prepare('SELECT id FROM proposals WHERE actor_id=? AND request_id=?').bind(who.actorId,rid).first<Row>();
  if(existing) return {ok:true,proposalId:existing.id,revision:(await snapshot()).revision,duplicate:true};
  const data=await snapshot(); const base=revision(body,'baseRevision');
  if(data.revision!==base) throw new ApiError(409,'Kütüphane değişti. Sayfayı yenileyip önerinizi güncel sürümde gönderin.');
  const kind=str(body,'kind',30,true);
  if(!['material','measurement','correction'].includes(kind)) throw new ApiError(400,'Öneri türü geçersiz.');
  const payload:Row={kind,note:str(body,'note',3000),baseRevision:base};
  if(kind==='material') {
    payload.title=str(body,'title',150,true);
    payload.polymer=str(body,'polymer',100) || 'Belirtilmemiş';
    payload.manufacturer=str(body,'manufacturer',150);
    payload.sourceUrl=str(body,'sourceUrl',2000) ? httpsUrl(str(body,'sourceUrl',2000)) : '';
    payload.sourceTitle=str(body,'sourceTitle',250);
    if(data.materials.some(m=>m.name.toLocaleLowerCase('tr')===String(payload.title).toLocaleLowerCase('tr'))) throw new ApiError(409,'Bu isim katalogda bulunuyor. İlgili malzemeye veri önerebilirsiniz.');
  } else {
    const materialId=str(body,'materialId',100,true), propertyId=str(body,'propertyId',100,true);
    if(!data.materials.some(m=>m.id===materialId)) throw new ApiError(400,'Malzeme bulunamadı.');
    const prop=data.properties.find(p=>p.id===propertyId); if(!prop) throw new ApiError(400,'Özellik bulunamadı.');
    const value=body.value;
    const numericUnits:Record<string,string[]>={O01:['g/cm³'],O02:['MPa'],O03:['MPa'],O04:['MPa'],O07:['MPa'],O08:['kJ/m²','J/m'],O09:['%'],O10:['MPa'],O11:['Shore A','Shore D'],O12:['kütle %'],O13:['kütle %'],O14:['derece'],O19:['°C'],O20:['°C'],O21:['katsayı'],O24:['µm'],O27:['TRY/kg'],O31:['mm']};
    const numericUnit=!!numericUnits[propertyId];
    const suppliedUnit=str(body,'unit',80,true);
    if(typeof value==='number') {
      if(!Number.isFinite(value)||Math.abs(value)>1e12) throw new ApiError(400,'Ölçüm değeri geçersiz.');
      if(!(numericUnits[propertyId]||[prop.unit]).includes(suppliedUnit)) throw new ApiError(400,`Bu özellik için birim ${(numericUnits[propertyId]||[prop.unit]).join(' veya ')} olmalı. Kaynaktaki değeri dönüştürerek ve açıklayarak girin.`);
      if(value<0 && !['O19','O20'].includes(propertyId)) throw new ApiError(400,'Bu özellik negatif olamaz.');
    } else if(typeof value!=='string'||!value.trim()||value.length>1000||numericUnit) throw new ApiError(400,'Bu özellik için geçerli sayısal değer ve kütüphane birimi gerekiyor.');
    Object.assign(payload,{materialId,propertyId,value:typeof value==='string'?value.trim():value,unit:suppliedUnit,sourceUrl:httpsUrl(str(body,'sourceUrl',2000,true)),sourceTitle:str(body,'sourceTitle',250,true),sourceVersion:str(body,'sourceVersion',150),sourceLocation:str(body,'sourceLocation',500,true)});
    if('plusMinus' in body) {
      if(body.plusMinus!==null && (typeof body.plusMinus!=='number'||!Number.isFinite(body.plusMinus)||body.plusMinus<0))throw new ApiError(400,'± değeri sıfır veya pozitif bir sayı olmalı.');
      payload.plusMinus=body.plusMinus;
      payload.plusMinusMeaning=str(body,'plusMinusMeaning',250)||'Belirtilmemiş';
    }
    for(const key of ['method','specimen','direction','conditioning','process']) payload[key]=str(body,key,500)||'Belirtilmemiş';
    if(kind==='correction') {
      const measurementId=str(body,'measurementId',100,true);
      const before=data.measurements.find(m=>m.id===measurementId);
      if(!before || before.materialId!==materialId || before.propertyId!==propertyId) throw new ApiError(400,'Düzeltilecek ölçüm ile malzeme/özellik uyuşmuyor.');
      payload.measurementId=measurementId; payload.before=before;
    }
  }
  const id=crypto.randomUUID(),now=new Date().toISOString();
  checkPublicText(payload);
  const inserted=await db.prepare('INSERT OR IGNORE INTO proposals (id,actor_id,actor_name,created_at,kind,payload,base_revision,status,request_id) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,who.actorId,who.displayName,now,kind,JSON.stringify(payload),base,'pending',rid).run();
  const saved=await db.prepare('SELECT id FROM proposals WHERE actor_id=? AND request_id=?').bind(who.actorId,rid).first<Row>();
  if(!saved)throw new ApiError(500,'Öneri kaydedilemedi.');
  return {ok:true,proposalId:saved.id,revision:base,duplicate:!inserted.meta.changes};
}
function dayGroup(actorId:string,now:string) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
  const get=(t:string)=>parts.find(x=>x.type===t)?.value;
  return `${actorId.slice(0,16)}|${get('year')}-${get('month')}-${get('day')}`;
}
async function duplicateEvent(db:D1Database,actor:string,rid:string) { const r=await db.prepare('SELECT id,revision FROM library_events WHERE actor_id=? AND request_id=?').bind(actor,rid).first<Row>();return r?{ok:true,eventId:r.id,revision:r.revision,duplicate:true}:null; }
export async function reviewProposal(request:Request,id:string) {
  const {who,body}=await mutationContext(request,true); const db=database(); await init(db);
  const rid=requestId(body),duplicate=await duplicateEvent(db,who.actorId,rid); if(duplicate)return duplicate;
  const expected=revision(body),action=str(body,'action',20,true),note=str(body,'note',3000,true);
  checkPublicText(note);
  if(!['approve','reject'].includes(action))throw new ApiError(400,'Değerlendirme işlemi geçersiz.');
  const proposal=await db.prepare('SELECT * FROM proposals WHERE id=?').bind(id).first<Row>();
  if(!proposal)throw new ApiError(404,'Öneri bulunamadı.');
  if(proposal.status!=='pending')throw new ApiError(409,'Öneri zaten değerlendirildi.');
  const data=await snapshot(); if(data.revision!==expected)throw new ApiError(409,'Sürüm değişti. Güncel veriyi inceleyip tekrar deneyin.');
  const p=parse(proposal.payload); let kind:string|null=null,key:string|null=null,before:unknown=null,after:unknown=null;
  let source:Source|null=null;
  if(action==='approve') {
    if(p.kind==='material') {
      if(data.materials.some(m=>m.name.toLocaleLowerCase('tr')===String(p.title).toLocaleLowerCase('tr')))throw new ApiError(409,'Aynı isimli malzeme katalogda zaten bulunuyor. Bu öneri yinelenen kayıt olarak reddedilebilir.');
      kind='material'; const materialId='M-'+id; key='material:'+materialId;
      after={id:materialId,kind:p.manufacturer?'Ürün':'Aile',parentId:null,name:p.title,polymer:p.polymer,manufacturer:p.manufacturer||null,dataStatus:'Eksik veri',recordStage:'Topluluk kaydı — özellikler bekleniyor',identificationNote:p.note,sourceId:p.sourceUrl?'S-'+id:null} satisfies Material;
    } else {
      if(!data.materials.some(m=>m.id===p.materialId))throw new ApiError(409,'Önerinin bağlı olduğu malzeme artık katalogda yok. Önce malzeme kaydı geri getirilmeli.');
      kind='measurement';const measurementId=p.kind==='correction'?p.measurementId:'V-'+id;key='measurement:'+measurementId;
      before=data.measurements.find(m=>m.id===measurementId)||null;
      if(p.kind==='correction' && JSON.stringify(before)!==JSON.stringify(p.before))throw new ApiError(409,'Düzeltilecek ölçüm öneri gönderildikten sonra değişmiş. Yeni bir düzeltme önerisi gerekli.');
      const prior=before as Measurement|null;
      const priorSource=data.sources.find(s=>s.id===prior?.sourceId);
      const unchanged=!!prior && ['value','unit','method','specimen','direction','conditioning','process','sourceVersion','sourceLocation'].every(k=>(prior as unknown as Row)[k]===p[k]) && priorSource?.url===p.sourceUrl;
      const plusMinus='plusMinus' in p?p.plusMinus:unchanged?(before as Measurement).plusMinus:null;
      const plusMinusMeaning='plusMinus' in p?p.plusMinusMeaning:unchanged?(before as Measurement).plusMinusMeaning:'Belirtilmemiş';
      after={id:measurementId,materialId:p.materialId,propertyId:p.propertyId,value:p.value,unit:p.unit,plusMinus,plusMinusMeaning,method:p.method,specimen:p.specimen,direction:p.direction,conditioning:p.conditioning,process:p.process,sourceId:'S-'+id,sourceVersion:p.sourceVersion,sourceLocation:p.sourceLocation,evidenceType:'Topluluk aktarımı · değerlendirici incelemesi',limitation:p.note||'Aparat güvenliği veya klinik uygunluk onayı değildir.'} satisfies Measurement;
    }
    if(p.sourceUrl) source={id:'S-'+id,type:'Topluluk kaynağı',title:p.sourceTitle||p.title,publisher:'Belirtilmemiş',version:p.sourceVersion||'',url:p.sourceUrl,scope:'İlgili öneri',evidenceType:'Katkıcı aktarımı',limitation:'Kaynağın kullanım ve dağıtım hakları ayrıca geçerlidir.',licenseStatus:'Ayrıca kontrol edilmeli'};
  }
  const eventId=crypto.randomUUID(),now=new Date().toISOString();
  const statements=[db.prepare('INSERT INTO library_events (id,revision,group_id,actor_id,actor_name,created_at,action,record_key,record_kind,before,after,note,proposal_id,request_id) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT revision FROM library_meta WHERE id=1)=? AND EXISTS(SELECT 1 FROM proposals WHERE id=? AND status=?)').bind(eventId,expected+1,dayGroup(who.actorId,now),who.actorId,who.displayName,now,action,key,kind,json(before),json(after),note,id,rid,expected,id,'pending')];
  if(key) statements.push(db.prepare('INSERT INTO library_records (key,kind,data,revision) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM library_events WHERE id=?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,revision=excluded.revision').bind(key,kind,json(after),expected+1,eventId));
  if(source) statements.push(db.prepare('INSERT INTO library_records (key,kind,data,revision) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM library_events WHERE id=?)').bind('source:'+source.id,'source',JSON.stringify(source),expected+1,eventId));
  statements.push(db.prepare('UPDATE proposals SET status=?,reviewed_at=?,reviewer_name=?,review_note=? WHERE id=? AND EXISTS(SELECT 1 FROM library_events WHERE id=?)').bind(action==='approve'?'approved':'rejected',now,who.displayName,note,id,eventId));
  statements.push(db.prepare('UPDATE library_meta SET revision=? WHERE id=1 AND revision=? AND EXISTS(SELECT 1 FROM library_events WHERE id=?)').bind(expected+1,expected,eventId));
  const results=await db.batch(statements);
  if(!results[0].meta.changes)throw new ApiError(409,'Başka bir kişi veriyi güncelledi. Yenileyip tekrar deneyin.');
  return {ok:true,eventId,revision:expected+1};
}
export async function revertEvent(request:Request) {
  const {who,body}=await mutationContext(request,true);const db=database(); await init(db);
  const rid=requestId(body),duplicate=await duplicateEvent(db,who.actorId,rid);if(duplicate)return duplicate;
  const expected=revision(body),targetId=str(body,'eventId',100,true),note=str(body,'note',3000,true);
  checkPublicText(note);
  const target=await db.prepare('SELECT * FROM library_events WHERE id=?').bind(targetId).first<Row>();
  if(!target?.record_key)throw new ApiError(400,'Bu olayda geri alınabilecek bir veri değişikliği yok.');
  const data=await snapshot(); if(data.revision!==expected)throw new ApiError(409,'Sürüm değişti. Yenileyip tekrar deneyin.');
  const latest=await db.prepare('SELECT revision FROM library_records WHERE key=?').bind(target.record_key).first<Row>();
  if(latest?.revision!==target.revision)throw new ApiError(409,'Bu kayıt daha sonra değiştirilmiş. Daha yeni değişiklikleri korumak için geri alma durduruldu.');
  const restored=parse(target.before);
  if(target.record_kind==='measurement' && restored && !data.materials.some(m=>m.id===restored.materialId))throw new ApiError(409,'Geri getirilecek ölçümün malzemesi katalogda yok. Önce malzemeyi geri getirin.');
  const eventId=crypto.randomUUID(),now=new Date().toISOString();
  const statements=[db.prepare('INSERT INTO library_events (id,revision,group_id,actor_id,actor_name,created_at,action,record_key,record_kind,before,after,note,proposal_id,request_id) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT revision FROM library_meta WHERE id=1)=? AND EXISTS(SELECT 1 FROM library_records WHERE key=? AND revision=?)').bind(eventId,expected+1,dayGroup(who.actorId,now),who.actorId,who.displayName,now,'revert',target.record_key,target.record_kind,target.after,target.before,note,target.proposal_id,rid,expected,target.record_key,target.revision),
    db.prepare('UPDATE library_records SET data=?,revision=? WHERE key=? AND EXISTS(SELECT 1 FROM library_events WHERE id=?)').bind(target.before,expected+1,target.record_key,eventId),
    db.prepare('UPDATE library_meta SET revision=? WHERE id=1 AND revision=? AND EXISTS(SELECT 1 FROM library_events WHERE id=?)').bind(expected+1,expected,eventId)];
  // Do not remove a newly added material if approved measurements now depend on it.
  if(target.record_kind==='material' && !target.before && data.measurements.some(m=>'material:'+m.materialId===target.record_key))throw new ApiError(409,'Malzemeye bağlı ölçümler var. Önce bu değişiklikler incelenmeli.');
  const results=await db.batch(statements);if(!results[0].meta.changes)throw new ApiError(409,'Veri değişti. Yenileyip tekrar deneyin.');
  return {ok:true,eventId,revision:expected+1};
}
export async function api(fn:()=>Promise<unknown>) { try { return Response.json(await fn(),{headers:{'Cache-Control':'no-store'}}); } catch(error) { console.error(error instanceof ApiError ? error.message : 'Library request failed');return Response.json({ok:false,error:error instanceof ApiError?error.message:'İşlem tamamlanamadı. Lütfen tekrar deneyin.'},{status:error instanceof ApiError?error.status:500,headers:{'Cache-Control':'no-store'}}); } }
