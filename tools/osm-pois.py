# Places from OpenStreetMap that Overture has few of (mosques, filling stations, ATMs, pharmacies…), for the map's
# "nearby" chips and its search. Reads the Bangladesh extract Planetiler downloads (tools/build-tiles.mjs) and writes
# tools/.cache/osm-pois.json: [osm kind, name, name:en, name:bn, lat, lon, religion]. Then: node tools/add-osm-pois.mjs
#   pip install osmium      (or: pip install --target <dir> osmium, and PYTHONPATH=<dir>)
#   python tools/osm-pois.py
import json, sys, osmium
SRC = sys.argv[1] if len(sys.argv) > 1 else 'tools/.cache/tiles/data/sources/bangladesh.osm.pbf'
OUT = 'tools/.cache/osm-pois.json'
POI = {('amenity', 'fuel'): 'fuel', ('amenity', 'atm'): 'atm', ('amenity', 'bank'): 'bank', ('amenity', 'pharmacy'): 'pharmacy',
       ('amenity', 'police'): 'police', ('amenity', 'hospital'): 'hospital', ('amenity', 'clinic'): 'clinic', ('amenity', 'school'): 'school',
       ('amenity', 'college'): 'college', ('amenity', 'university'): 'university', ('amenity', 'restaurant'): 'restaurant', ('amenity', 'fast_food'): 'fast_food',
       ('amenity', 'cafe'): 'cafe', ('amenity', 'marketplace'): 'market', ('shop', 'supermarket'): 'supermarket', ('shop', 'mall'): 'mall', ('tourism', 'hotel'): 'hotel',
       ('amenity', 'bus_station'): 'bus_station', ('amenity', 'fire_station'): 'fire_station', ('amenity', 'post_office'): 'post_office'}
out = []
class H(osmium.SimpleHandler):
    def take(self, tags, lat, lon):
        name = tags.get('name') or tags.get('name:en') or tags.get('name:bn')
        if not name: return
        row = [name, tags.get('name:en') or '', tags.get('name:bn') or '', round(lat, 6), round(lon, 6)]
        if tags.get('amenity') == 'place_of_worship':
            r = tags.get('religion', '')
            out.append(['mosque' if r == 'muslim' else 'worship', *row, r]); return
        for (k, v), p in POI.items():
            if tags.get(k) == v: out.append([p, *row, '']); return
    def node(self, n):
        if n.tags and n.location.valid(): self.take(n.tags, n.location.lat, n.location.lon)
    def area(self, a):
        try:
            pts = [(n.lat, n.lon) for ring in a.outer_rings() for n in ring]
            if pts and a.tags: self.take(a.tags, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
        except Exception: pass
H().apply_file(SRC, locations=True)
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
print(len(out), 'places ->', OUT)
