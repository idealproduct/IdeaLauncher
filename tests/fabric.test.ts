import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installFabricVersion } from '../src/main/app/installer/fabric';

for (const minecraft of ['26.3', '1.21.1']) {
  for (const pinned of [true, false]) {
    test(`Fabric ${minecraft} uses official profile (${pinned ? 'pinned' : 'stable'} loader)`, async () => {
      const root = await mkdtemp(join(tmpdir(), 'idea-fabric-'));
      const requests: string[] = [];
      const loader = '0.19.5';
      const libraries = [{ name: 'net.fabricmc:fabric-loader:' + loader }];
      const fetchProfile = (async (url: string) => {
        requests.push(String(url));
        return { json: async () => String(url).endsWith('/profile/json')
          ? { id: 'official-profile', inheritsFrom: minecraft, mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient', libraries, arguments: { game: [], jvm: ['-Dfabric.test=true'] } }
          : [{ loader: { stable: true, version: loader }, intermediary: { version: '0.0.0' } }] };
      }) as Parameters<typeof installFabricVersion>[3];
      try {
        const id = await installFabricVersion(minecraft, root, pinned ? loader : undefined, fetchProfile);
        const profile = JSON.parse(await readFile(join(root, 'versions', id, `${id}.json`), 'utf8'));
        assert.equal(id, `${minecraft}-fabric${loader}`);
        assert.equal(profile.inheritsFrom, minecraft);
        assert.deepEqual(profile.libraries, libraries);
        assert.deepEqual(profile.arguments.jvm, ['-Dfabric.test=true']);
        assert.equal(requests.at(-1), `https://meta.fabricmc.net/v2/versions/loader/${minecraft}/${loader}/profile/json`);
        assert.equal(requests.length, pinned ? 1 : 2);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
}
