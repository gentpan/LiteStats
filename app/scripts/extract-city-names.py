"""Extract public GeoNames city/district translations. No analytics input is used.
Usage: python3 scripts/extract-city-names.py /path/to/public-geonames-downloads
Download allCountries.zip, cities500.zip, alternateNamesV2.zip and
admin1CodesASCII.txt from https://download.geonames.org/export/dump/ first.
"""
import io
import json
from pathlib import Path
import sys
import zipfile

root = Path(sys.argv[1])
def lines(archive, member):
    with zipfile.ZipFile(root / archive) as z:
        yield from io.TextIOWrapper(z.open(member), encoding="utf-8")

translations = {}
for line in lines("alternateNamesV2.zip", "alternateNamesV2.txt"):
    r = line.rstrip("\n").split("\t")
    if len(r) < 8 or not r[2].startswith("zh") or r[6] == "1" or r[7] == "1":
        continue
    rank = (4 if r[2] in ("zh-CN", "zh-Hans") else 3 if r[2] == "zh" else 2) + (0.1 if r[4] == "1" else 0)
    translations.setdefault(r[1], []).append((rank, r[3]))
base = {line.split("\t", 1)[0] for line in lines("cities500.zip", "cities500.txt")}
admins = {}
for line in (root / "admin1CodesASCII.txt").read_text().splitlines():
    r = line.split("\t")
    admins[r[0]] = r[1:3]
records = []
for line in lines("allCountries.zip", "allCountries.txt"):
    r = line.rstrip("\n").split("\t")
    if len(r) < 19 or r[0] not in translations:
        continue
    if not (r[0] in base or (r[6] == "P" and (r[8] != "CN" or r[7] != "PPL")) or r[7] in ("ADM2", "ADM3", "ADM4")):
        continue
    names = sorted(translations[r[0]], key=lambda item: (-item[0], item[1]))
    records.append(dict(id=r[0], country=r[8], name=r[1], ascii=r[2],
                        adminNames=admins.get(r[8] + "." + r[10], []),
                        zhNames=[name for _, name in names], aliases=r[3].split(","),
                        populated=r[6] == "P", population=int(r[14] or 0)))
(root / "localized-cities-source.json").write_text(json.dumps(records, ensure_ascii=False))
print(f"Extracted {len(records)} public records")
