import { snapshot, ApiError } from '../../lib/library-server';
import { workbook, objectSheet, csv } from '../../lib/export-workbook';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  try {
    const data=await snapshot(),format=new URL(request.url).searchParams.get('format')||'xlsx';
    const filename=`Robotel_Kutuphane_r${data.revision}`;
    const headers={'Cache-Control':'no-store','X-Library-Revision':String(data.revision)};
    if(format==='json')return new Response(JSON.stringify(data,null,2),{headers:{...headers,'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="${filename}.json"`}});
    if(format==='csv')return new Response(csv(data.measurements),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${filename}_olcumler.csv"`}});
    if(format!=='xlsx')throw new ApiError(400,'Dışa aktarma biçimi geçersiz.');
    const gaps=data.materials.flatMap(m=>data.properties.filter(p=>!data.measurements.some(v=>v.materialId===m.id&&v.propertyId===p.id)).map(p=>({materialId:m.id,materialName:m.name,propertyId:p.id,propertyName:p.name,status:'Eksik — veri bekleniyor'})));
    const bytes=workbook([
      objectSheet('Bilgi',[{surum:data.revision,temelSurum:data.version,tarih:new Date().toISOString(),aciklama:'Canlı kütüphanenin anlık kopyası. Excel değişiklikleri otomatik yüklenmez; uygulamada kaynaklı katkı önerin. Klinik uygunluk veya güvenlik onayı değildir.',haklar:data.provenance.rights}]),
      objectSheet('Malzemeler',data.materials),objectSheet('Ozellikler',data.properties),objectSheet('Olcumler',data.measurements),objectSheet('Kaynaklar',data.sources),objectSheet('Eksikler',gaps),objectSheet('Yuzme Referanslari',data.swimReferences),objectSheet('Yuzme Karsilastirma',data.comparison),objectSheet('Bilesenler',data.components),objectSheet('Arastirma Gorevleri',data.tasks),objectSheet('Gecmis',data.history),objectSheet('Aktarim Ozetleri',data.seedHistory),
    ]);
    return new Response(bytes as BodyInit,{headers:{...headers,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${filename}.xlsx"`}});
  } catch(error) {return Response.json({error:error instanceof ApiError?error.message:'Dışa aktarma tamamlanamadı.'},{status:error instanceof ApiError?error.status:500});}
}
