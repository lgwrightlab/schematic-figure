"""Gallery of device3d.py hero objects -> demo/art/dev_<name>.png (+ .json anchors).

blender -b --factory-startup -P demo/render3d_device.py                 # every scene
blender -b --factory-startup -P demo/render3d_device.py -- pouch coin   # only these
"""
import sys, os, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'blender'))
from device3d import *

ILLUS = '--illus' in sys.argv                     # illustration variant: -- --illus  ->  *_illus.png
if ILLUS: use_style('illustration')
SUF = '_illus' if ILLUS else ''

ART = os.path.join(HERE, 'art'); os.makedirs(ART, exist_ok=True)
W, H, SPP = 1600, 1100, 64


def out(name): return os.path.join(ART, 'dev_%s%s.png' % (name, SUF))


def stack():
    S = setup(W, H, SPP)
    L = [dict(thickness=0.42, color='#6b7384', kind='semiconductor', label='Si'),
         dict(thickness=0.14, color='#d4cfe3', kind='oxide', label='SiO2'),
         dict(thickness=0.06, color='#cfe3ea', kind='ceramic', label='hBN bottom'),
         dict(thickness=0.02, color='#30343b', kind='graphene', label='graphene', lattice='honeycomb'),
         dict(thickness=0.06, color='#cfe3ea', kind='ceramic', label='hBN top'),
         dict(thickness=0.07, color='#d6a74f', kind='gold', label='gate', inset=0.35)]
    objs, A = layer_stack(L, footprint=(3.2, 2.2), exploded=0.26, cut='step')
    studio(scale=1.2, floor=0.0)
    camera_look(loc=(3.2, -7.8, 5.4), target=(0.15, 0, 0.55), lens_mm=52)
    finish(S, out('stack'), anchors=A)


def stack_corner():
    S = setup(W, H, SPP)
    L = [dict(thickness=0.32, color='#cfe0e8', kind='glass', label='glass', alpha=0.8),
         dict(thickness=0.06, color='#9fc6d8', kind='oxide', label='ITO'),
         dict(thickness=0.07, color='#e8e4dc', kind='ceramic', label='SnO2'),
         dict(thickness=0.22, color='#5a3f36', kind='oxide', label='perovskite'),
         dict(thickness=0.07, color='#c9a0c9', kind='polymer', label='HTL', alpha=0.9),
         dict(thickness=0.08, color='#d6a74f', kind='gold', label='Au')]
    objs, A = layer_stack(L, footprint=(3.0, 2.2), cut='corner', notch=(0.4, 0.45))
    studio(scale=1.2, floor=0.0)
    camera_look(loc=(4.6, -7.2, 5.0), target=(0.1, 0, 0.35), lens_mm=55)
    finish(S, out('stack_corner'), anchors=A)


def moire():
    S = setup(W, H, SPP)
    objs, A = lattice('honeycomb', n=26, a=0.07, style='stick', colors=['#30343b'], colors2=['#4f86c0'], twist=8.0,
                      interlayer=0.09, bond_radius=0.012)
    studio(scale=1.2, floor=-0.3)
    camera_look(loc=(0, -3.6, 6.6), target=(0, -0.12, 0), lens_mm=46)
    finish(S, out('moire'), anchors=A)


def crystal():
    S = setup(W, H, SPP)
    objs, A = lattice('perovskite', n=3, a=0.4, colors=['#6c7ccc', '#9c72c4', '#cf4a3d'], loc=(-1.45, 0, 0))
    o2, A2 = lattice('rocksalt', n=2, a=0.42, colors=['#9c72c4', '#86b85f'], loc=(1.55, 0, 0), prefix='rs.')
    studio(scale=1.3, floor=0.0)
    camera_look(loc=(1.6, -8.6, 5.2), target=(0.05, 0, 0.8), lens_mm=50)
    finish(S, out('crystal'), anchors={**A, **A2})


def molecules():
    S = setup(W, H, SPP)
    o1, A1 = molecule_3d('O=C1OCCO1', loc=(-2.55, 0, 1.0), scale=0.4, prefix='EC.')
    o2, A2 = molecule_3d('FC(F)(F)S(=O)(=O)[N-]S(=O)(=O)C(F)(F)F', loc=(-0.35, 0, 1.0), scale=0.33, prefix='TFSI.', seed=1)
    o3, A3 = molecule_3d('c1cc2ccc3ccc4ccc5ccc6ccc1c1c2c3c4c5c61', loc=(2.35, 0, 1.0), scale=0.24, prefix='coronene.', rot=(-15, 0, 0))
    fz = min(v[2] for AA in (A1, A2, A3) for k, v in AA.items() if k.endswith('.bottom')) - 0.05
    studio(scale=1.3, floor=fz, target=(0, 0, 1.0))
    camera_look(loc=(0.0, -9.5, 3.9), target=(0.0, 0, 1.0), lens_mm=50)
    finish(S, out('molecules'), anchors={**A1, **A2, **A3})


def particles():
    S = setup(W, H, SPP)
    objs, A = particle_bed(size=(3.2, 2.0, 0.8), n=190, radius=(0.1, 0.19), seed=3, color='#6f8fb8', kind='ceramic',
                           shell=dict(t=0.018, color='#e9a53c'), carbon=dict(n=360, r=0.024),
                           binder=dict(n=70, r=0.011), foil=dict(t=0.07, color='#c6c9ce', kind='aluminium'))
    studio(scale=1.2, floor=0.0)
    camera_look(loc=(2.8, -7.6, 4.8), target=(0.1, 0, 0.35), lens_mm=55)
    finish(S, out('particles'), anchors=A)


def interface():
    S = setup(W, H, SPP)
    objs, A = electrode_interface(size=(3.2, 2.0), thickness=0.5, seed=4, roughness=0.05,
                                  substrate=dict(kind='lithium', color='#aab0b8'),
                                  coating=dict(t=0.06, color='#4f9ac4', kind='ceramic', from_x=-0.05),
                                  deposit=dict(kind='dendrite', n=7, height=0.95))
    studio(scale=1.2, floor=-0.5)
    camera_look(loc=(2.8, -7.6, 4.2), target=(0.05, 0, 0.15), lens_mm=52)
    finish(S, out('interface'), anchors=A)


def pouch():
    S = setup(W, H, SPP)
    objs, A = pouch_cell(size=(2.6, 1.8), exploded=0.3, n_pairs=1)
    o2, A2 = pouch_cell(size=(1.3, 0.9), exploded=0, loc=(2.6, 0.6, 0), prefix='cell.')
    studio(scale=1.3, floor=0.0)
    camera_look(loc=(3.0, -8.2, 5.8), target=(0.6, 0.2, 0.55), lens_mm=50)
    finish(S, out('pouch'), anchors={**A, **A2})


def coin():
    S = setup(W, H, SPP)
    objs, A = coin_cell(radius=1.0, exploded=0.26, loc=(-0.9, 0, 0))
    o2, A2 = coin_cell(radius=0.85, exploded=0, cut=True, loc=(1.85, -0.2, 0), prefix='cut.')
    studio(scale=1.3, floor=0.0)
    camera_look(loc=(2.2, -8.6, 5.6), target=(0.35, 0, 1.05), lens_mm=46)
    finish(S, out('coin'), anchors={**A, **A2})


def cylinder():
    S = setup(1300, H, SPP)
    objs, A = cylindrical_cell(radius=0.9, height=3.0, cut=True)
    studio(scale=1.3, floor=0.0)
    camera_look(loc=(5.2, -6.6, 5.2), target=(0, 0, 1.4), lens_mm=50)
    finish(S, out('cylinder'), anchors=A)


def fet():
    S = setup(W, H, SPP)
    objs, A = gate_device(gate='top')
    studio(scale=1.3, floor=-0.08)
    camera_look(loc=(2.8, -7.2, 5.6), target=(0, 0.2, 0.3), lens_mm=50)
    finish(S, out('fet'), anchors=A)


def nano():
    S = setup(W, H, SPP)
    objs, A = nanowire_array(n=(7, 5), pitch=0.38, radius=0.075, height=1.1, tip=dict(), seed=2, loc=(-1.45, 0, 0),
                             color='#5f86b0', substrate=dict(color='#8e97a6'))
    o2, A2 = porous_membrane(size=(2.2, 1.9), thickness=0.3, pore_radius=0.09, pitch=0.27, loc=(1.55, 0, 0), prefix='mem.')
    studio(scale=1.3, floor=-0.2)
    camera_look(loc=(1.4, -8.0, 5.8), target=(0.05, 0, 0.3), lens_mm=50)
    finish(S, out('nano'), anchors={**A, **A2})


SCENES = dict(stack=stack, stack_corner=stack_corner, moire=moire, crystal=crystal, molecules=molecules,
              particles=particles, interface=interface, pouch=pouch, coin=coin, cylinder=cylinder, fet=fet, nano=nano)
if __name__ == '__main__':
    pick = [a for a in sys.argv[sys.argv.index('--') + 1:] if a != '--illus'] if '--' in sys.argv else []
    pick = pick or list(SCENES)
    for k in pick:
        t = time.time(); SCENES[k](); print('SCENE %s %.1f s' % (k, time.time() - t))
