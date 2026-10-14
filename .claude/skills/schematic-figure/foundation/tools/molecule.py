"""Draw a molecule (SMILES) as a vector SVG for a figure, with RDKit.

python tools/molecule.py "CC(=O)Oc1ccccc1C(=O)O" figure/art/aspirin.svg [--width 300] [--height 200]
    [--bond 2.0] [--font 0.8] [--color "#1a1a1a"] [--hetero-colour] [--highlight 3,4,5 --hl-color "#E69F00"]
    [--rotate 0] [--no-h]

Then in figure.js: const m = await L.svgFile(p, '/figure/art/aspirin.svg', x, y, w).
Skeletal formula in house style: black bonds, heteroatom labels black (or coloured with --hetero-colour),
no background, labels as text. Needs rdkit (pip install rdkit) in the project's Python.
"""
import argparse
from rdkit import Chem
from rdkit.Chem import AllChem, rdDepictor
from rdkit.Chem.Draw import rdMolDraw2D

a = argparse.ArgumentParser()
a.add_argument('smiles'); a.add_argument('out')
a.add_argument('--width', type=int, default=300); a.add_argument('--height', type=int, default=200)
a.add_argument('--bond', type=float, default=2.0); a.add_argument('--font', type=float, default=0.8)
a.add_argument('--color', default='#1a1a1a'); a.add_argument('--hetero-colour', action='store_true')
a.add_argument('--highlight', default=''); a.add_argument('--hl-color', default='#E69F00')
a.add_argument('--rotate', type=float, default=0); a.add_argument('--no-h', action='store_true')
g = a.parse_args()
m = Chem.MolFromSmiles(g.smiles)
if m is None: raise SystemExit('invalid SMILES: ' + g.smiles)
if g.no_h: m = Chem.RemoveHs(m)
rdDepictor.SetPreferCoordGen(True); rdDepictor.Compute2DCoords(m)
d = rdMolDraw2D.MolDraw2DSVG(g.width, g.height)
o = d.drawOptions()
o.clearBackground = False; o.bondLineWidth = g.bond; o.baseFontSize = g.font; o.rotate = g.rotate
o.fixedFontSize = -1; o.addStereoAnnotation = False
if not g.hetero_colour: o.useBWAtomPalette()
hex2 = lambda h: tuple(int(h.lstrip('#')[i:i + 2], 16) / 255 for i in (0, 2, 4))
hl = [int(i) for i in g.highlight.split(',') if i.strip()]
kw = {}
if hl:
    kw = dict(highlightAtoms=hl, highlightAtomColors={i: hex2(g.hl_color) for i in hl},
              highlightBonds=[b.GetIdx() for b in m.GetBonds() if b.GetBeginAtomIdx() in hl and b.GetEndAtomIdx() in hl])
    kw['highlightBondColors'] = {b: hex2(g.hl_color) for b in kw['highlightBonds']}
rdMolDraw2D.PrepareAndDrawMolecule(d, m, **kw)
d.FinishDrawing()
svg = d.GetDrawingText()
if g.color.lower() not in ('#000000', 'black'): svg = svg.replace('#000000', g.color)
open(g.out, 'w', encoding='utf-8').write(svg)
print('wrote', g.out, m.GetNumAtoms(), 'atoms; valid:', Chem.MolToSmiles(m))
