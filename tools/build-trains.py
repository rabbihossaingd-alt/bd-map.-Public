# Builds data/trains.json from the open Bangladesh Railway dataset
# (github.com/hussain-ahmed2/bd-railway-data, MIT licence), saved as tools/.cache/railway-data.json and
# tools/.cache/railway-stations.json.
#
#   python tools/build-trains.py
#
# Output, kept compact because the app downloads it when the Train page opens:
#   stations: { code: [Bangla, English, lat, lon] }
#   trains:   [{ c: number, bn, en, t: type, off: [Bangla, English] or null, cls: [classes],
#                s: [[stationCode, arrive, depart, km from origin], …], f: { stationCode: { class: taka } } }]
#   rates:    { class: taka per km } — worked out from the trains that do have published fares, and used
#             by the app to estimate a fare where the dataset has none.

import io, json, statistics, sys

data = json.load(io.open('tools/.cache/railway-data.json', encoding='utf-8'))
stations_in = json.load(io.open('tools/.cache/railway-stations.json', encoding='utf-8'))

stations = {s['code']: [s['name']['bn'], s['name']['en'], round(s['lat'], 4), round(s['lng'], 4)]
            for s in stations_in if s.get('lat') and s.get('lng')}

trains, samples = [], {}
for t in data['trains']:
    if t.get('isActive') is False:
        continue
    stops = [[s['stationCode'], s['arrivalTime'], s['departureTime'], round(s.get('distanceKm') or 0, 1)]
             for s in t['stoppages'] if s['stationCode'] in stations]
    if len(stops) < 2:
        continue
    off = t['offDay']
    daily = off['en'].lower().startswith(('daily', 'none'))
    km = {s[0]: s[3] for s in stops}
    fares = {code: f for code, f in (t.get('fares') or {}).items() if code in km}
    for code, by_class in fares.items():
        if km[code] > 40:                           # short hops are dominated by the minimum fare
            for cls, taka in by_class.items():
                samples.setdefault(cls, []).append(taka / km[code])
    trains.append({'c': t['code'], 'bn': t['name']['bn'], 'en': t['name']['en'], 't': t['type'],
                   'off': None if daily else [off['bn'], off['en']], 'cls': t.get('classes', []), 's': stops, 'f': fares})

rates = {cls: round(statistics.median(v), 3) for cls, v in samples.items()}
out = {'updated': data['meta']['lastUpdated'], 'stations': stations, 'trains': trains, 'rates': rates}
text = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
io.open('data/trains.json', 'w', encoding='utf-8', newline='\n').write(text)

sys.stdout.reconfigure(encoding='utf-8')
print(len(trains), 'trains,', len(stations), 'stations,', round(len(text.encode('utf-8')) / 1024), 'KB')
print('per-km rates from published fares:', rates, {k: len(v) for k, v in samples.items()})
