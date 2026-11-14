import hashlib
import json
from pathlib import Path
import tarfile

root = Path(__file__).resolve().parents[1]
package_file = root / 'dist' / 'dsh-session-view-1.0.0.tgz'
expected = {'client.js', 'cordis.patch.yml', 'icon.svg', 'index.js', 'LICENSE', 'locale/en.json', 'locale/zh.json', 'package.json', 'README.md'}
with tarfile.open(package_file, 'r:gz') as archive:
    members = archive.getmembers()
    assert all(member.isfile() and member.name.startswith('package/') for member in members)
    names = {member.name.removeprefix('package/') for member in members}
    assert names == expected, f'Unexpected packed file list: {names}'
    for name in expected - {'package.json'}:
        packed = archive.extractfile('package/' + name).read()
        assert packed == (root / name).read_bytes(), f'Stale packed asset: {name}'
    manifest = json.load(archive.extractfile('package/package.json'))
    assert manifest['name'] == '@simonwicre/dsh-session-view'
    assert manifest['version'] == '1.0.0'
    assert manifest['engines']['dsh'] == '0.2.2-rc.2'
    assert not manifest.get('dependencies')
    assert manifest['dsh']['bundle']['patch'] == './cordis.patch.yml'
    assert manifest['exports']['./client'] == './client.js'
print('Packed file list, runtime bytes, locale resources and manifest: passed')
print('SHA256:', hashlib.sha256(package_file.read_bytes()).hexdigest())
