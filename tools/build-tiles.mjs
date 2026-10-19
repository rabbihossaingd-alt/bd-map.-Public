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
if (!process.argv.includes('--no-upload'))
  execFileSync('node', ['tools/r2.mjs', 'put', `${dir}/bd.pmtiles`, 'tiles/bd.pmtiles', 'application/vnd.pmtiles'], { stdio: 'inherit' });
