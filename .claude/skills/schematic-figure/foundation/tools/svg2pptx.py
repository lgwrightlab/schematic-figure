"""Build a 16:9 PowerPoint deck whose slides are SVG pictures (vector in PowerPoint 365; right-click > Convert
to Shape makes every label and line editable), each with a PNG fallback. A 16:9 figure fills its slide. A figure
of any other shape is centred and fitted inside the slide, never stretched.

python tools/svg2pptx.py out.pptx slide1.svg slide1.png [slide2.svg slide2.png ...]
python tools/svg2pptx.py --native out.pptx slide1.svg slide1.png [...]    (native shapes and live text, see svg2pptx_native.py)
"""
import copy
import sys
if '--native' in sys.argv:
    # Editable deck: real text boxes, shapes and groups instead of one picture. The PNG is not read.
    sys.argv.remove('--native')
    import svg2pptx_native
    svg2pptx_native.main(sys.argv[1], sys.argv[2::2])
    sys.exit(0)
from PIL import Image
from pptx import Presentation
from pptx.util import Mm
from pptx.opc.package import Part
from pptx.opc.packuri import PackURI
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from lxml import etree

def ppt_safe(svg_bytes):
    """PowerPoint ignores paint-order, so a haloed label (paint-order=stroke) is painted white on top of its
    own fill. Split each into a stroke-only copy behind and a fill-only copy in front."""
    t = etree.fromstring(svg_bytes)
    n = 0
    for el in list(t.iter('{http://www.w3.org/2000/svg}text')):
        if el.get('paint-order', '').startswith('stroke') and el.get('stroke'):
            # Copy the element with deepcopy. Do not serialise and parse it again: etree.tostring on an inner
            # element can also write the text and the elements that follow it (the tail and later siblings), and
            # the parse then fails with "Extra content at the end of the document". The copy keeps the tail, so
            # clear it.
            halo = copy.deepcopy(el)
            halo.tail = None
            for a in ('paint-order',):
                halo.attrib.pop(a, None)
            halo.set('fill', 'none')
            for c in halo.iter():
                if c is not halo and c.get('fill'):
                    c.set('fill', 'none')
            for a in ('paint-order', 'stroke', 'stroke-width', 'stroke-linejoin'):
                el.attrib.pop(a, None)
            el.addprevious(halo)
            n += 1
    return etree.tostring(t, xml_declaration=True, encoding='UTF-8'), n


out, files = sys.argv[1], sys.argv[2:]
pairs = list(zip(files[0::2], files[1::2]))
prs = Presentation()
prs.slide_width, prs.slide_height = Mm(338.7), Mm(190.5)
blank = prs.slide_layouts[6]
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
SVGNS = 'http://schemas.microsoft.com/office/drawing/2016/SVG/main'
for i, (svg, png) in enumerate(pairs, 1):
    s = prs.slides.add_slide(blank)
    # Keep the figure's own shape. A 16:9 figure fills the slide. Any other shape fits inside it, centred, so it is
    # never stretched.
    iw, ih = Image.open(png).size
    k = min(prs.slide_width / iw, prs.slide_height / ih)
    w, h = (prs.slide_width, prs.slide_height) if abs(iw / ih - 16 / 9) < 0.01 else (round(iw * k), round(ih * k))
    pic = s.shapes.add_picture(png, (prs.slide_width - w) // 2, (prs.slide_height - h) // 2, w, h)
    pic.name = f'slide{i} (SVG)'
    data, nhalo = ppt_safe(open(svg, 'rb').read())
    print(f'slide {i}: {nhalo} haloed labels split for PowerPoint')
    part = Part(PackURI(f'/ppt/media/slide{i}-vector.svg'), 'image/svg+xml', prs.part.package, data)
    rid = s.part.relate_to(part, RT.IMAGE)
    blip = pic._element.find(f'.//{{{A}}}blip')
    ext_lst = etree.SubElement(blip, f'{{{A}}}extLst')
    ext = etree.SubElement(ext_lst, f'{{{A}}}ext', uri='{96DAC541-7B7A-43D3-8B79-37D633B846F1}')
    sb = etree.SubElement(ext, f'{{{SVGNS}}}svgBlip', nsmap={'asvg': SVGNS})
    sb.set(f'{{{R}}}embed', rid)
prs.save(out)
print('wrote', out, len(pairs), 'slides')
