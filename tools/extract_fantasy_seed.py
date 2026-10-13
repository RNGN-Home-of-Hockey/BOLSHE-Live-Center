"""One-time export of PUBLIC player fields from the RG Fantasy 2026 workbook.

Usage: python -I tools/extract_fantasy_seed.py "<path to RG Fantasy Bot DB.xlsx>" data/seed/fantasy_rg2026_players.json

Only player facts are exported (names, tour, seed, Flashscore id, photo, aliases).
Users, entries, chat ids and prize data stay out of this repository on purpose.
"""
import json
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
WANTED = {"Players", "TournamentDrawPlayers", "PlayerAliases"}


def _cell_text(cell, shared):
    value = cell.find("m:v", NS)
    kind = cell.get("t")
    if value is None:
        inline = cell.find("m:is", NS)
        if inline is None:
            return ""
        return "".join(t.text or "" for t in inline.iter("{%s}t" % NS["m"]))
    return shared[int(value.text)] if kind == "s" else (value.text or "")


def _col_index(ref):
    letters = "".join(ch for ch in ref if ch.isalpha())
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch.upper()) - 64)
    return n - 1


def read_sheets(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    targets = {r.get("Id"): r.get("Target") for r in rels}
    out = {}
    for sheet in wb.find("m:sheets", NS):
        name = sheet.get("name")
        if name not in WANTED:
            continue
        target = targets[sheet.get("{%s}id" % NS["r"])].lstrip("/").replace("xl/", "")
        root = ET.fromstring(z.read("xl/" + target))
        rows = []
        for row in root.find("m:sheetData", NS).findall("m:row", NS):
            values = {}
            for cell in row.findall("m:c", NS):
                values[_col_index(cell.get("r"))] = _cell_text(cell, shared)
            width = max(values) + 1 if values else 0
            rows.append([values.get(i, "") for i in range(width)])
        header = rows[0] if rows else []
        out[name] = [dict(zip(header, r)) for r in rows[1:]]
    return out


def main(src, dst):
    sheets = read_sheets(src)
    draw = {r.get("player_id"): r for r in sheets.get("TournamentDrawPlayers", [])}
    aliases = {}
    for a in sheets.get("PlayerAliases", []):
        aliases.setdefault(a.get("player_id"), set()).add(a.get("alias", "").strip())
    players = []
    for p in sheets.get("Players", []):
        pid = p.get("playerId")
        d = draw.get(pid, {})
        extra = set()
        try:
            extra = set(json.loads(d.get("aliases_json") or "[]"))
        except ValueError:
            pass
        players.append({
            "fantasy_player_id": pid,
            "tour": p.get("tour"),
            "name_ru": (d.get("canonical_name_ru") or p.get("nameRu") or "").strip(),
            "name_en": (d.get("canonical_name_en") or p.get("nameEn") or "").strip(),
            "fs_id": (d.get("flashscore_player_id") or "").strip(),
            "seed": p.get("seed") or d.get("seed") or "",
            "photo_url": (p.get("photoUrl") or "").strip(),
            "aliases": sorted(x for x in (aliases.get(pid, set()) | extra) if x),
        })
    with open(dst, "w", encoding="utf-8") as fh:
        json.dump({"source": "RG Fantasy 2026 (Roland Garros), editor-checked names",
                   "players": players}, fh, ensure_ascii=False, indent=1)
    with_fs = sum(1 for p in players if p["fs_id"])
    print(f"players={len(players)} with_flashscore_id={with_fs} with_photo={sum(1 for p in players if p['photo_url'])}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
