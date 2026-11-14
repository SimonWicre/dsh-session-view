from pathlib import Path
from lxml import etree

root = Path(__file__).resolve().parents[1]
icon = root / 'icon.svg'
parser = etree.XMLParser(resolve_entities=False, no_network=True)
image = etree.parse(str(icon), parser).getroot()
ns = '{http://www.w3.org/2000/svg}'
assert image.tag == ns + 'svg'
assert image.attrib['viewBox'] == '0 0 36 36'
assert image.attrib['width'] == '36' and image.attrib['height'] == '36'
assert icon.stat().st_size < 256 * 1024
for node in image.iter():
    assert etree.QName(node).localname not in {'script', 'style', 'image', 'text', 'foreignObject', 'animate', 'animateTransform'}
    assert not any(key.lower().startswith('on') or key in {'href', 'src'} for key in node.attrib)
print('SVG XML, dimensions and self-contained geometry: passed')
