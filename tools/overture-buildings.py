# Buildings of Bangladesh from Overture Maps (OpenStreetMap, Microsoft, Google and Esri footprints merged;
# ODbL), for the map's own building tiles. Keeps footprints whose centre lies inside Bangladesh's border
# (data/bd-outline.js, widened by about 2 km so the border towns are whole), with a height in metres where the
# data has one (height, else floors × 3.2). Writes tools/.cache/buildings-bd.parquet (GeoParquet).
# Run: python tools/overture-buildings.py [release]
import sys, os, re, json, duckdb

release = sys.argv[1] if len(sys.argv) > 1 else '2026-09-23.1'
os.makedirs('tools/.cache', exist_ok=True)
out = 'tools/.cache/buildings-bd.parquet'
rings = json.loads(re.search(r'=\s*(\[[\s\S]*\]);?', open('data/bd-outline.js', encoding='utf-8').read()).group(1))
wkt = 'MULTIPOLYGON(' + ','.join('((' + ','.join(f'{x} {y}' for x, y in r + [r[0]]) + '))' for r in rings) + ')'
con = duckdb.connect()
for sql in ("INSTALL httpfs", "LOAD httpfs", "INSTALL spatial", "LOAD spatial", "SET s3_region='us-west-2'"):
    con.execute(sql)
src = f"s3://overturemaps-us-west-2/release/{release}/theme=buildings/type=building/*"
con.execute(f"""
COPY (
  WITH bd AS (SELECT ST_Buffer(ST_GeomFromText('{wkt}'), 0.02) AS g)
  SELECT CAST(coalesce(height, num_floors * 3.2) AS FLOAT) AS height, geometry
  FROM read_parquet('{src}', hive_partitioning = 1), bd
  WHERE bbox.xmin BETWEEN 88.0 AND 92.7 AND bbox.ymin BETWEEN 20.5 AND 26.7
    AND ST_Intersects(bd.g, ST_Point((bbox.xmin + bbox.xmax) / 2, (bbox.ymin + bbox.ymax) / 2))
) TO '{out}' (FORMAT parquet, COMPRESSION zstd)
""")
print(con.execute(f"SELECT count(*), count(height) FROM '{out}'").fetchone(), os.path.getsize(out) // 1_000_000, 'MB')
