"""Independent stdlib reader for the application XLSX/CSV export QA fixtures."""
import csv
import json
import math
import posixpath
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs"
S = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def read_book(filename):
    """Read relationships and typed cells; do not assume worksheet file order."""
    with zipfile.ZipFile(filename) as archive:
        assert archive.testzip() is None, "ZIP CRC validation failed"
        names = archive.namelist()
        assert len(names) == len(set(names)), "Duplicate ZIP entry"
        for name in names:
            if name.endswith((".xml", ".rels")):
                ET.fromstring(archive.read(name))
        package = ET.fromstring(archive.read("_rels/.rels"))
        assert any(r.attrib["Target"] == "xl/workbook.xml" for r in package)
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {r.attrib["Id"]: posixpath.normpath(posixpath.join("xl", r.attrib["Target"])) for r in rels}
        assert all(target in names for target in targets.values()), "Unresolved workbook relationship"
        book = ET.fromstring(archive.read("xl/workbook.xml"))
        result = {}
        for sheet in book.find("s:sheets", S):
            name = sheet.attrib["name"]
            assert name not in result
            xml = ET.fromstring(archive.read(targets[sheet.attrib[RID]]))
            assert not xml.findall(".//s:f", S), "Unexpected executable formula"
            rows = []
            types = []
            refs = []
            for row in xml.findall("s:sheetData/s:row", S):
                values, cell_types, cell_refs = [], [], []
                for cell in row:
                    kind = cell.get("t", "n")
                    if kind == "n":
                        value = float(cell.findtext("s:v", namespaces=S))
                        assert math.isfinite(value)
                    elif kind == "inlineStr":
                        value = "".join(cell.find("s:is", S).itertext())
                    else:
                        raise AssertionError(f"Unsupported or unexpected cell type: {kind}")
                    values.append(value)
                    cell_types.append(kind)
                    cell_refs.append(cell.attrib["r"])
                rows.append(values)
                types.append(cell_types)
                refs.append(cell_refs)
            assert xml.find("s:autoFilter", S) is not None
            assert xml.find("s:sheetViews/s:sheetView/s:pane", S).get("state") == "frozen"
            result[name] = {"rows": rows, "types": types, "refs": refs}
        return result


def assert_records(sheet, expected):
    rows = sheet["rows"]
    assert len(rows) == len(expected) + 1
    keys = rows[0]
    assert len(keys) == len(set(keys))
    for index, (actual, record) in enumerate(zip(rows[1:], expected), start=1):
        assert set(record).issubset(keys)
        actual = dict(zip(keys, actual))
        for key in keys:
            value = record.get(key)
            if value is None:
                assert actual[key] == "", (index, key, actual[key])
            elif isinstance(value, (dict, list)):
                assert json.loads(actual[key]) == value
            elif isinstance(value, bool):
                assert actual[key] == str(value).lower()
            elif isinstance(value, (int, float)):
                assert sheet["types"][index][keys.index(key)] == "n", (index, key)
                assert actual[key] == value, (index, key, actual[key], value)
            else:
                assert actual[key] == value, (index, key, actual[key], value)


seed = json.loads((ROOT / "data/seed-public.json").read_text(encoding="utf-8"))
book = read_book(OUT / "test-export.xlsx")
expected_names = ["Bilgi", "Malzemeler", "Ozellikler", "Olcumler", "Kaynaklar", "Eksikler", "Yuzme Referanslari", "Yuzme Karsilastirma", "Bilesenler", "Arastirma Gorevleri", "Gecmis", "Aktarim Ozetleri"]
assert list(book) == expected_names
for name, key in [("Malzemeler", "materials"), ("Ozellikler", "properties"), ("Olcumler", "measurements"), ("Kaynaklar", "sources"), ("Yuzme Referanslari", "swimReferences"), ("Yuzme Karsilastirma", "comparison"), ("Bilesenler", "components"), ("Arastirma Gorevleri", "tasks"), ("Aktarim Ozetleri", "seedHistory")]:
    assert_records(book[name], seed[key])
assert len(seed["measurements"]) == 25
assert len(book["Gecmis"]["rows"]) == 1
info = dict(zip(*book["Bilgi"]["rows"]))
assert info["surum"] == 17
assert info["temelSurum"] == "0.4"
observed = {(m["materialId"], m["propertyId"]) for m in seed["measurements"]}
missing = {(m["id"], p["id"]) for m in seed["materials"] for p in seed["properties"]} - observed
gap_keys = book["Eksikler"]["rows"][0]
gap_records = [dict(zip(gap_keys, row)) for row in book["Eksikler"]["rows"][1:]]
assert {(r["materialId"], r["propertyId"]) for r in gap_records} == missing
assert len(gap_records) == len(missing)

edge = read_book(OUT / "test-export-edge.xlsx")
assert list(edge) == ["Türkçe & <test>", "Boş", "Nesne"]
rows = edge["Türkçe & <test>"]["rows"]
assert rows[0][0] == "Türkçe & <başlık>"
assert rows[1] == ["İıŞşĞğÜüÖöÇç", "true", "", 0, "=1+1", 'İı Şş Ğğ Üü Öö Çç — ± & <etiket> "alıntı"']
assert rows[2] == ["İkinci", "false", "", -12.5, "+SUM(A1:A2)", "  boşluklar  "]
assert edge["Türkçe & <test>"]["refs"][3][-3:] == ["AA4", "AB4", "AC4"]
assert edge["Boş"]["rows"] == [["Kayıt"]]
assert_records(edge["Nesne"], [{"id": "ilk", "detail": {"x": "< & ±"}, "list": [1, "iki"], "missing": None}, {"id": "ikinci", "extra": "yeni alan"}])

cases = json.loads((OUT / "test-export-cases.json").read_text(encoding="utf-8"))
with (OUT / "test-export-cases.csv").open(encoding="utf-8-sig", newline="") as handle:
    parsed = list(csv.DictReader(handle))
assert len(parsed) == len(cases)
for actual, case in zip(parsed, cases):
    value = str(case["value"])
    expected = "'" + value if value.startswith(("=", "+", "-", "@", "\t", "\r")) else value
    assert actual == {"id": case["id"], "value": expected}
with (OUT / "test-export-measurements.csv").open(encoding="utf-8-sig", newline="") as handle:
    measurements = list(csv.DictReader(handle))
assert len(measurements) == 25
for actual, expected in zip(measurements, seed["measurements"]):
    assert actual["id"] == expected["id"]
    assert actual["materialId"] == expected["materialId"]
    assert float(actual["value"]) == expected["value"]
    assert actual["sourceId"] == expected["sourceId"]
print("Independent XLSX QA passed: CRC/XML, 12 sheets, 25 complete observations, all seed records, gaps, typed numbers, Unicode/escaping, blanks, formula safety, CSV.")
