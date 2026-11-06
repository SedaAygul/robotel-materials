"""Regenerate the public seed from separately held, authorized research inputs.

Requires Python 3.10+ and only the standard library. The three input paths are
provided explicitly; none of the private inputs or source history is copied.
The committed JSON is the distributable public snapshot. This script never
downloads or republishes third-party CAD, archives, images, or full documents.
"""

from __future__ import annotations

import argparse
import json
import math
import posixpath
import re
import sys
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET


NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

MATERIAL_FIELDS = [
    "id", "kind", "parentId", "name", "polymer", "manufacturer", "variant",
    "colorScope", "additivesOrChemistry", "researchTier", "skinContactEvidence",
    "dataStatus", "lastChecked", "sourceId", "recordStage", "identificationNote",
]
PROPERTY_FIELDS = [
    "id", "name", "unit", "description", "use", "contextRequired", "group", "priority",
]
MEASUREMENT_FIELDS = [
    "id", "materialId", "materialName", "propertyId", "propertyName", "value",
    "unit", "plusMinus", "plusMinusMeaning", "method", "specimen", "direction",
    "conditioning", "process", "sourceId", "sourceVersion", "sourceLocation",
    "accessDate", "evidenceType", "limitation",
]
SOURCE_FIELDS = [
    "id", "type", "title", "publisher", "version", "url", "scope", "accessDate",
    "evidenceType", "limitation",
]


def column(index: int) -> str:
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def read_workbook(path: Path) -> dict[str, dict[str, str]]:
    """Read cached cell values without executing formulas or macros."""
    with zipfile.ZipFile(path) as archive:
        if archive.testzip() is not None:
            raise ValueError("Workbook archive is damaged")
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = [
                "".join(node.itertext())
                for node in ET.fromstring(archive.read("xl/sharedStrings.xml"))
            ]
        links = {
            node.attrib["Id"]: node.attrib["Target"]
            for node in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        }
        sheets = {}
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        for sheet in workbook.findall("s:sheets/s:sheet", NS):
            target = links[sheet.attrib[RNS + "id"]]
            target = target.lstrip("/") if target.startswith("/") else posixpath.normpath(
                posixpath.join("xl", target)
            )
            cells = {}
            for cell in ET.fromstring(archive.read(target)).findall(
                ".//s:sheetData/s:row/s:c", NS
            ):
                kind = cell.attrib.get("t")
                value = cell.findtext("s:v", default="", namespaces=NS)
                if kind == "e":
                    raise ValueError("Workbook contains an error cell")
                if kind == "s":
                    value = strings[int(value)]
                elif kind == "inlineStr":
                    value = "".join(cell.find("s:is", NS).itertext())
                cells[cell.attrib["r"]] = value
            sheets[sheet.attrib["name"]] = cells
        return sheets


def records(cells: dict[str, str], fields: list[str], id_pattern: str) -> list[dict]:
    row_numbers = sorted({int(re.search(r"\d+$", address)[0]) for address in cells})
    result = []
    for row in row_numbers:
        if re.fullmatch(id_pattern, cells.get(f"A{row}", "")):
            result.append({
                field: cells.get(f"{column(index)}{row}", "") or None
                for index, field in enumerate(fields, 1)
            })
    return result


def number(value: str | None) -> int | float | None:
    if value is None:
        return None
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("Non-finite numerical observation")
    return int(result) if result.is_integer() else result


def excel_date(value: str | None) -> str | None:
    if value is None:
        return None
    return (datetime(1899, 12, 30) + timedelta(days=float(value))).date().isoformat()


# Public summaries retain the scope of the original evidence while removing
# individual case details, source-machine locations, and private archive names.
ANATOMY = {
    "A01": "Kalan uzva bağlanan palet; hedef anatomik düzey ve ölçü aralığı doğrulanmadı.",
    "A02": "El işlevi / uzuv farklılığı için kişiye özel destek; ayrıntılı anatomik kapsam doğrulanmadı.",
    "A03": "Mevcut ele takılan kişiye özel ortez; uzuv eksikliği soketi örneği değildir.",
    "A04": "Üst uzuv için yumuşak arayüz; hedef anatomik düzey ve ölçü aralığı doğrulanmadı.",
    "A05": "Python el sistemine takılan eklenti; anatomik kapsam ayrıca doğrulanacak.",
    "IDUM-2025": "Dirsek altı uzuv farklılığı için palet; farklı ölçü ve bant varyantları derlemede belirtiliyor.",
    "WATERLOO-2025": "Yetişkin önkol antropometrisine dayanan aktif araştırma prototipi; pediatrik ölçü kaynağı değildir.",
    "NEMO-CONCEPT": "Üst kol seviyesine uzanan arayüz; kişiye özel anatomik uyum araştırılacak.",
    "R01": "El / önkol farklılığı için kişiye özel protez ucuna bağlanan modül; hazır çocuk ölçüsü değildir.",
    "R02": "Kalan uzva doğrudan bağlanan kit; derlemede ergen–yetişkin aralığı belirtiliyor.",
    "R03": "Explorer önkol soketiyle kullanılan modül; boyut ve çocuk kapsamı ayrıca doğrulanacak.",
    "R04": "Protez bileğine bağlanan sörf ucu; çocuk yüzme paletinden farklı kullanım.",
    "R05": "El / kol farklılığı için kürek; yaş ve ölçü kapsamı belirtilmemiş.",
    "R06": "Mevcut eli olan ve kavraması sınırlı kullanıcılar için tutamaklı palet; uzuv eksikliği soketi değildir.",
    "R07": "Mevcut eli olan ve kavrayabilen kullanıcılar için tutamaklı palet; uzuv eksikliği soketi değildir.",
    "SWUM-DATA": "Genel insan yüzmesi simülasyonu; proteze özel doğrulanmış proje değildir.",
    "NAKASHIMA-CHIDA-2023": "Dirsek altı uzuv farklılığında yüzme; pediatrik ölçü kaynağı değildir.",
    "NAKASHIMA-2020-OPT": "Dirsek altı uzuv farklılığında kulaç optimizasyonu; pediatrik kapsam doğrulanmadı.",
    "NAKASHIMA-TEBBE-2020": "Üst uzuv farklılığında yüzme analizi; pediatrik ölçü kaynağı değildir.",
    "MOLINO-2022-FEA": "Alt uzuv için yüzme protezi; kol aparatına doğrudan aktarılmaz.",
}

NEXT_STEP = {
    "A01": "Özgün CAD, ölçek ve parça ilişkilerini doğrula; lisans atfını koru. Üç STL geometrisi kullanım uygunluğu kanıtı değildir.",
    "A02": "Özgün kaynak, anatomik kapsam, ölçülendirme ve tam lisans sürümünü doğrula; TPU / PLA beyanını ürün ve prosesle eşleştir.",
    "A03": "Ölçek ve kişiye özel el desteği kapsamını incele; PA grade ve üretim sürecini doğrula. PVA yalnız baskı desteğidir.",
    "A04": "Yapım talimatlarını ve arayüz yaklaşımını incele; dosyaların yeniden dağıtım koşulunu netleştir.",
    "A05": "Resmî duyurudaki model bağlantısını, güncel dosya listesini, anatomi kapsamını ve lisansı doğrula.",
    "IDUM-2025": "Tam metin, ürün / grade, baskı ayarları, boyutlandırma ve CAD paylaşım koşulunu doğrula.",
    "WATERLOO-2025": "Tez içeriğini, CAD ve kontrol kodu erişimini incele; aktif mekanizmayı pasif pediatrik başlangıç modeli olarak kabul etme.",
    "NEMO-CONCEPT": "Konseptin prototip olgunluğunu, ölçü kapsamını ve CAD paylaşım koşulunu araştır.",
    "R01": "Katlanır kanat kinematiği ve bağlantı için karşılaştır; ticari ürünün CAD paylaşım koşulunu ayrıca araştır.",
    "R02": "Doğrudan uzva bağlanan yaklaşımı ve ıslak tutunmayı incele; küçük çocuk ölçü ve kullanım kapsamını ayrı değerlendir.",
    "R03": "Sabit palet ve modüler bağlantıyı karşılaştır; PA2200 üretim sürecini ve erişilebilir teknik belgeleri doğrula.",
    "R04": "Sörf / tahtada ilerleme kategorisinde karşılaştır; yüzme paletiyle aynı kullanım sayma.",
    "R05": "Dosya erişimi, boyutlandırma, malzeme ve yeniden kullanım lisansı için birincil kaynakları doğrula.",
    "R06": "Palet yüzeyi, tutamak ve bant yuvasını incele; FDM / SLS dosya kapsamını ve güncel kullanım koşullarını doğrula.",
    "R07": "Yüzey ve akış açıklıklarını karşılaştır; uzva bağlanma için ayrıca tasarım gerekir.",
    "SWUM-DATA": "Örnek projeyi yeniden çalıştır; protez geometrisine uyarlama ve örnek veri lisansı kapsamını doğrula.",
    "NAKASHIMA-CHIDA-2023": "Palet geometrisi ve ilgili simülasyon projesine erişim ile yeniden kullanım koşullarını araştır.",
    "NAKASHIMA-2020-OPT": "Antropometri, hareket ve analiz ayarı girdilerine erişim ile yeniden kullanım koşullarını araştır.",
    "NAKASHIMA-TEBBE-2020": "Yöntemi incele; palet geometrisi ve simülasyon girdilerinin erişim / paylaşım koşullarını araştır.",
    "MOLINO-2022-FEA": "PDF lisansını ve sonuç kapsamını doğrula; CAD, ağ, malzeme modeli ve sınır şartları olmadan FEA sonuçlarını aktarma.",
}


def public_sources(source_rows: list[dict], references: list[dict]) -> list[dict]:
    by_reference = {item["id"]: item for item in references}
    for source in source_rows:
        source["accessDate"] = excel_date(source["accessDate"])
        source["licenseStatus"] = "Kaynağın kendi hak ve kullanım koşulları geçerlidir; bu platform yeniden lisanslamaz."
        if source["id"] == "S013":
            source.update(
                title="Yüzme tasarımları ve yayınları — proje araştırma derlemesi",
                publisher="Proje katkısı",
                url=None,
                scope="15 tasarım ve 5 yayın için kullanıcı tarafından sağlanan araştırma derlemesi.",
                limitation="Derleme birincil teknik kanıt değildir; her satır yeniden doğrulanmış değildir. Özel kaynak dosyası paylaşılmaz.",
                licenseStatus="Derleme atfı korunur; içindeki üçüncü taraf tasarımlar ve yayınlar kendi lisanslarına tabidir.",
            )
        archive_reference = {"S014": "A01", "S015": "A02", "S016": "A03", "S017": "A04"}.get(source["id"])
        if archive_reference:
            reference = by_reference[archive_reference]
            source.update(
                type="Yerel arşiv inceleme kaydı",
                title=f"{reference['name']} — dosya listesi incelemesi",
                publisher="Proje araştırma kaydı; özgün tasarımcıya atıf",
                version="06.11.2026 inceleme kaydı",
                url=reference["url"],
                scope=(f"{reference['stlCount']} STL; incelenen arşivde STEP / özgün CAD yok. "
                       "Dosyalar bu platformda yeniden dağıtılmaz."),
                licenseStatus=reference["licenseStatus"],
            )
            if source["id"] == "S017":
                source["scope"] = "1 yapım belgesi ve 2 görsel dosyasının varlığı kontrol edildi; içerikleri incelenmedi. STEP / özgün CAD yok; dosyalar paylaşılmaz."
                source["evidenceType"] = "Yerel arşiv dosya listesi; belge ve görsel içeriği incelenmedi"
        if source["id"] == "S018":
            source["licenseStatus"] = by_reference["A01"]["licenseStatus"]
    return source_rows


def public_references(rows: list[list]) -> list[dict]:
    result = []
    for row in rows:
        reference_id = row[0]
        local_status = {
            "A01": "Yerel arşiv dosya listesi ve biçimi incelendi; 3 STL.",
            "A02": "Yerel arşiv dosya listesi ve biçimi incelendi; 4 STL.",
            "A03": "Yerel arşiv dosya listesi ve biçimi incelendi; 1 STL.",
            "A04": "Yerel arşivde yapım belgesi ve görsel dosyaları var; içerik incelenmedi.",
            "WATERLOO-2025": "Yerel tez belgesi mevcut; içeriği bu incelemede doğrulanmadı.",
        }.get(reference_id, row[8])
        cad_status = row[10]
        if reference_id == "SWUM-DATA":
            cad_status = "Derleme: altı örnek simülasyon arşivi yalnız girdi / sonuç verisi içeriyor; özgün CAD kanıtı yok."
        if reference_id == "MOLINO-2022-FEA":
            cad_status = "Ham FEA projesi bulunamadı; derlemede yalnız yayın belgesi belirtiliyor."
        result.append({
            "id": reference_id,
            "kind": row[1],
            "name": row[2],
            "approach": row[3],
            "anatomy": ANATOMY[reference_id],
            "mechanism": row[5],
            "materialNote": row[6],
            "evidenceStatus": row[7],
            "localStatus": local_status,
            "stlCount": row[9],
            "cadStatus": cad_status,
            "licenseStatus": row[11],
            "sourceIds": re.findall(r"S\d{3}", row[12]),
            "url": row[13],
            "nextStep": NEXT_STEP[reference_id],
        })
    return result


def verify_original_measurements(measurements: list[dict], prototype: dict) -> None:
    original = {record["id"]: record for record in prototype["measurements"]}
    assert len(original) == len(measurements) == 25, "Expected 25 original numerical observations"
    for measurement in measurements:
        for field in MEASUREMENT_FIELDS:
            assert measurement[field] == original[measurement["id"]][field], (
                f"Original measurement field changed: {measurement['id']}.{field}"
            )


def privacy_check(data: dict) -> None:
    value = json.dumps(data, ensure_ascii=False)
    forbidden = {
        "absolute file path": r"(?i)(?:(?<![A-Za-z])[A-Z]:[\\/]|file://|/Users/|/home/|\\\\[^\s\\]+\\)",
        "email address": r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+",
        "private workbook or archive name": r"(?i)\.(?:xlsx?|zip)(?:\b|[?\"'])",
        "private field": r'"(?:sourceFile|sourceHash|archives|raw|oldValue|newValue)"\s*:',
    }
    for description, pattern in forbidden.items():
        if re.search(pattern, value):
            raise ValueError(f"Public output rejected: {description}")
    for record in data["sources"] + data["swimReferences"]:
        url = record["url"]
        if url is not None and not url.startswith(("https://", "http://")):
            raise ValueError("Public source URL must be a web URL or null")


def validate(data: dict, prototype: dict) -> None:
    expected = {"materials": 14, "properties": 34, "measurements": 25,
                "sources": 20, "swimReferences": 20, "components": 6,
                "comparison": 7, "tasks": 8, "seedHistory": 2}
    for key, count in expected.items():
        assert len(data[key]) == count, f"Unexpected {key} count"
        if key != "comparison":
            ids = [record["id"] for record in data[key]]
            assert len(ids) == len(set(ids)), f"Duplicate {key} ID"
    materials = {record["id"] for record in data["materials"]}
    properties = {record["id"] for record in data["properties"]}
    sources = {record["id"] for record in data["sources"]}
    references = {record["id"] for record in data["swimReferences"]}
    assert sum(record["kind"] == "Aile" for record in data["materials"]) == 10
    assert sum(record["kind"] == "Ürün" for record in data["materials"]) == 4
    assert all(not record["id"].startswith("ADAY") for record in data["materials"])
    for record in data["materials"]:
        assert record["parentId"] is None or record["parentId"] in materials
        assert record["sourceId"] is None or record["sourceId"] in sources
    for record in data["measurements"]:
        assert record["materialId"] in materials and record["propertyId"] in properties
        assert record["sourceId"] in sources
        assert isinstance(record["value"], (int, float)) and not isinstance(record["value"], bool)
        assert record["plusMinus"] is None or isinstance(record["plusMinus"], (int, float))
        assert all(record[field] is not None for field in MEASUREMENT_FIELDS if field != "plusMinus")
    for record in data["swimReferences"]:
        assert set(record["sourceIds"]) <= sources
        assert record["stlCount"] is None or isinstance(record["stlCount"], int)
    for record in data["components"]:
        assert set(record["propertyIds"]) <= properties
        assert set(record["referenceIds"]) <= references
        assert set(record["sourceIds"]) <= sources
    verify_original_measurements(data["measurements"], prototype)
    privacy_check(data)


def extract(workbook: Path, prototype_file: Path, swim_file: Path) -> dict:
    sheets = read_workbook(workbook)
    prototype = json.loads(prototype_file.read_text(encoding="utf-8"))
    swim = json.loads(swim_file.read_text(encoding="utf-8"))
    materials = records(sheets["Malzemeler"], MATERIAL_FIELDS, r"(?:F|P)-[A-Z0-9-]+")
    for material in materials:
        material["lastChecked"] = excel_date(material["lastChecked"])
    properties = records(sheets["Özellik Sözlüğü"], PROPERTY_FIELDS, r"O\d{2}")
    measurements = records(sheets["Ölçümler"], MEASUREMENT_FIELDS, r"M\d{3}")
    for measurement in measurements:
        measurement["value"] = number(measurement["value"])
        measurement["plusMinus"] = number(measurement["plusMinus"])
        measurement["accessDate"] = excel_date(measurement["accessDate"])
    references = public_references(swim["references"])
    source_rows = records(sheets["Kaynaklar"], SOURCE_FIELDS, r"S\d{3}")
    components = [{
        "id": row[0], "role": row[1], "scope": row[2],
        "materialResearch": row[3], "propertyIds": re.findall(r"O\d{2}", row[4]),
        "referenceIds": re.findall(r"(?:A\d{2}|R\d{2}|IDUM-2025)", row[5]),
        "sourceIds": re.findall(r"S\d{3}", row[5]), "missingEvidence": row[6],
    } for row in swim["roles"]]
    tasks = [dict(zip([
        "id", "scope", "title", "expectedRecord", "status", "owner", "priority", "completionCriteria",
    ], row)) for row in swim["tasks"]]
    # Verify the two named source groups before producing brief public summaries.
    history = records(sheets["Tarihçe"], [
        "groupId", "id", "revision", "actorId", "actorName", "localTime", "utc",
        "eventType", "recordId", "field", "oldValue", "newValue", "source", "validation", "note",
    ], r"codex\|\d{4}-\d{2}-\d{2}")
    for day in ("2026-10-30", "2026-11-06"):
        assert any(row["groupId"] == f"codex|{day}" and row["actorName"] == "Codex" for row in history)
    data = {
        "version": "0.4",
        "updatedAt": swim["day"],
        "provenance": {
            "title": "RobotEl Türkiye malzeme kütüphanesi — kamusal başlangıç verisi",
            "sourceVersion": "0.4",
            "scope": "Filament araştırması: aileler, ürün bazında TDS gözlemleri ve yüzme tasarım referansları. Reçine sistemleri gelecek çalışma kapsamındadır.",
            "privacy": "Özel dosya yolları, arşiv adları, e-posta adresleri, kişisel vaka ayrıntıları ve görseller yayınlanmaz.",
            "history": "Kaynak çalışma kitabının ayrıntılı geçmişi özel proje arşivinde korunur. Burada iki doğrulanmış günlük aktarım özeti vardır; site katkıları ayrıca kaydedilir.",
            "rights": "Platformun açık kaynak lisansı üçüncü taraf veri, makale, CAD ve model lisanslarını değiştirmez. Yalnız kaynak atıfları ve kısa araştırma kayıtları paylaşılır; CAD ve görseller yeniden dağıtılmaz.",
        },
        "materials": materials,
        "properties": properties,
        "measurements": measurements,
        "sources": public_sources(source_rows, references),
        "swimReferences": references,
        "components": components,
        "comparison": [{"criterion": row[0], "residualLimb": row[1], "existingHand": row[2]} for row in swim["comparison"]],
        "tasks": tasks,
        "seedHistory": [
            {
                "id": "IMPORT-2026-10-30", "groupId": "codex|2026-10-30", "date": "2026-10-30",
                "actorId": "codex", "actorName": "Codex", "kind": "import-summary", "sourceVersion": "0.3",
                "summary": "0.3 başlangıç verisi: 10 malzeme ailesi, 4 ürün, 34 özellik ve 25 üretici TDS gözlemi.",
                "note": "Özel kaynak geçmişindeki aynı kişi / İstanbul günü grubu özetlenmiştir. Teknik veri aktarımı, aparat uygunluğu veya test onayı değildir.",
            },
            {
                "id": "IMPORT-2026-11-06", "groupId": "codex|2026-11-06", "date": "2026-11-06",
                "actorId": "codex", "actorName": "Codex", "kind": "import-summary", "sourceVersion": "0.4",
                "summary": "0.4 kaynak entegrasyonu: 20 yüzme referansı, 8 ek kaynak, iki yaklaşım karşılaştırması ve bileşen araştırma görevleri.",
                "note": "Yerel dosya listesi incelemeleri atıf ve kapsam özeti olarak aktarılmıştır; özel dosyalar ile ayrıntılı kaynak geçmişi yayınlanmaz. Yeni nicel malzeme ölçümü eklenmemiştir.",
            },
        ],
    }
    validate(data, prototype)
    return data


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, required=True)
    parser.add_argument("--prototype", type=Path, required=True)
    parser.add_argument("--swim", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "seed-public.json")
    args = parser.parse_args()
    data = extract(args.workbook, args.prototype, args.swim)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"version": data["version"], "validated": True, "counts": {
        name: len(data[name]) for name in ("materials", "properties", "measurements", "sources", "swimReferences", "components", "comparison", "tasks", "seedHistory")
    }, "original_measurements_unchanged": True, "public_privacy_scan": "passed"}, ensure_ascii=False))


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
