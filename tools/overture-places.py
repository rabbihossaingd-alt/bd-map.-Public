# Places of Bangladesh from Overture Maps (CDLA-Permissive-2.0; Meta, Microsoft, Amazon and others), for the map's
# second layer of places beside OpenStreetMap's. Reads Overture's public parquet straight from S3 (no account),
# keeps the box around Bangladesh, and writes tools/.cache/overture-places.parquet for tools/overture-places.mjs.
# Run: python tools/overture-places.py [release]
import sys, os, duckdb

release = sys.argv[1] if len(sys.argv) > 1 else '2026-09-23.1'
os.makedirs('tools/.cache', exist_ok=True)
out = 'tools/.cache/overture-places.parquet'
con = duckdb.connect()
for sql in ("INSTALL httpfs", "LOAD httpfs", "INSTALL spatial", "LOAD spatial", "SET s3_region='us-west-2'"):
    con.execute(sql)
src = f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"
con.execute(f"""
COPY (
  SELECT id,
         names.primary AS name,
         names.common AS common,
         coalesce(taxonomy.primary, basic_category) AS cat,
         basic_category AS basic,
         confidence,
         (bbox.xmin + bbox.xmax) / 2 AS lon,
         (bbox.ymin + bbox.ymax) / 2 AS lat,
         addresses[1].country AS country,
         addresses[1].freeform AS addr,
         phones[1] AS phone,
         websites[1] AS web
  FROM read_parquet('{src}', hive_partitioning = 1)
  WHERE bbox.xmin BETWEEN 88.0 AND 92.7 AND bbox.ymin BETWEEN 20.5 AND 26.7
    AND coalesce(operating_status, 'open') <> 'permanently_closed'
) TO '{out}' (FORMAT parquet)
""")
print(con.execute(f"SELECT count(*), count(*) FILTER (WHERE country = 'BD') FROM '{out}'").fetchone())
