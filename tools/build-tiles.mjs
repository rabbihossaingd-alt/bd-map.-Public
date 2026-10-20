// Bangladesh's own vector tiles: OpenStreetMap (Geofabrik's daily extract) through Planetiler's OpenMapTiles
// profile into one PMTiles file, then up to the R2 bucket (see tools/r2.mjs), where the map reads it with range
// requests — no tile server. About 20 minutes and 245 MB (October 2026).
// Needs Java 21 (a portable JDK in tools/.cache/jdk works) and tools/.cache/tiles/planetiler.jar.
// On Windows, Java's internal pipes need a short folder for their sockets, hence jdk.net.unixdomain.tmpdir.
// Run: node tools/build-tiles.mjs [--no-upload]
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdirSync, existsSync } from 'node:fs';

const dir = 'tools/.cache/tiles';
const jdk = existsSync('tools/.cache/jdk') && readdirSync('tools/.cache/jdk').find(d => d.startsWith('jdk-'));
const java = jdk ? `tools/.cache/jdk/${jdk}/bin/java` : 'java';
mkdirSync('C:/jtmp', { recursive: true });
execFileSync(java, ['-Xmx6g', '-Djdk.net.unixdomain.tmpdir=C:/jtmp', '-jar', 'planetiler.jar', '--download', '--area=bangladesh',
  '--languages=bn,en', '--output=bd.pmtiles', '--force'], { cwd: dir, stdio: 'inherit' });
// Buildings: Overture's footprints for Bangladesh (python tools/overture-buildings.py writes them, ~20 min, 2.2 GB),
// laid out where Planetiler's Overture reader looks for them, then tiled at z13–14 (~3 min, 418 MB). The column
// must be called `height`: the reader keeps Overture's own attribute names only.
const parquet = `${dir}/data/overture/theme=buildings/type=building/part-0.parquet`;
if (existsSync(parquet)) execFileSync(java, ['-Xmx8g', '-Djdk.net.unixdomain.tmpdir=C:/jtmp', '-cp', 'planetiler.jar',
  'com.onthegomap.planetiler.examples.overture.OvertureBasemap', '--base=data/overture', '--minzoom=13', '--maxzoom=14',
  '--bounds=88.0,20.7,92.7,26.6', '--output=buildings-bd.pmtiles', '--exclude_ids=true', '--force'], { cwd: dir, stdio: 'inherit' });
if (!process.argv.includes('--no-upload')) {
  execFileSync('node', ['tools/r2.mjs', 'put', `${dir}/bd.pmtiles`, 'tiles/bd.pmtiles', 'application/vnd.pmtiles'], { stdio: 'inherit' });
  if (existsSync(`${dir}/buildings-bd.pmtiles`)) execFileSync('node', ['tools/r2.mjs', 'put', `${dir}/buildings-bd.pmtiles`, 'tiles/buildings-bd.pmtiles', 'application/vnd.pmtiles'], { stdio: 'inherit' });
}
