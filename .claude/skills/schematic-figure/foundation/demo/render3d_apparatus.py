"""Gallery for blender/apparatus3d.py: renders demo/art/app_<scene>.png (+ anchor JSON) for each scene.
Run all:   blender -b --factory-startup -P demo/render3d_apparatus.py
Run some:  blender -b --factory-startup -P demo/render3d_apparatus.py -- glassware optics
"""
import sys, os, math, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'blender'))
from scene import *
from apparatus3d import *

ILLUS = '--illus' in sys.argv                     # illustration variant: -- --illus  ->  *_illus.png
if ILLUS: use_style('illustration')
SUF = '_illus' if ILLUS else ''

ART = os.path.join(HERE, 'art'); os.makedirs(ART, exist_ok=True)


def glassware():
    S = setup(1800, 1000, 80); look(S)
    A = {}
    o, a = beaker((-2.85, 0, 0), 0.5, fill=0.55, liquid_color='#2f86c9'); A.update(tag(a, 'beaker'))
    o, a = flask((-1.45, 0.1, 0), 0.55, fill=0.35, liquid_color='#d9534f'); A.update(tag(a, 'flask'))
    o, a = vessel('round', (-0.1, 0.15, 0), 0.45, fill=0.3, liquid_color='#e0a526'); A.update(tag(a, 'round'))
    o, a = vial((0.85, -0.2, 0), 0.16, fill=0.6, liquid_color='#5aae61'); A.update(tag(a, 'vial'))
    o, a = electrochem_cell((2.15, 0.1, 0), 0.58, 1.25, cable_out=(1, 0.9), cable_reach=1.9); A.update(tag(a, 'cell'))
    shadow_floor(0)
    camera_look(loc=(0.0, -9.0, 3.4), target=(-0.15, 0, 0.95), lens_mm=50); studio(target=(0, 0, 0.8), scale=1.0)
    return S, A


def flow():
    S = setup(1800, 900, 64); look(S)
    o, A = flow_loop((0, 0, 0), liquid_color='#d9534f')
    shadow_floor(0)
    camera_look(loc=(0.2, -8.5, 4.6), target=(0.1, 0, 0.35), lens_mm=45); studio(target=(0, 0, 0.3), scale=1.0)
    return S, A


def optics():
    S = setup(1800, 1100, 64); look(S)
    A = {}
    o, a = breadboard((0, 0, -0.07), (5.6, 3.0, 0.14)); A.update(a)
    z0 = 0.0; h = 0.72
    o, a = laser_head((-2.0, -0.8, z0), (1.3, 0.42, 0.36), beam_length=0.0); A.update(tag(a, 'laser'))
    zb = a['aperture'][2]; x0 = a['aperture'][0]
    o, a = post_mount((0.6, -0.8, z0), zb, 'mirror', 135); A.update(tag(a, 'm1'))
    o, a = post_mount((0.6, 0.7, z0), zb, 'mirror', -45); A.update(tag(a, 'm2'))
    o, a = post_mount((1.6, 0.7, z0), zb, 'lens', 0); A.update(tag(a, 'lens'))
    o, a = camera_box((2.55, 0.7, z0 + zb - 0.33), (0.55, 0.5, 0.5), lens_length=0.35); A.update(tag(a, 'cam'))
    o, a = post_mount((-0.5, -0.8, z0), zb, 'iris', 0); A.update(tag(a, 'iris'))
    no_shadow(beam([(x0, -0.8, zb), (0.6, -0.8, zb), (0.6, 0.7, zb), (A['cam.lens'][0], 0.7, zb)], 0.028, '#e8322b'))
    camera_look(loc=(-0.9, -7.0, 5.4), target=(0.25, 0.25, -0.05), lens_mm=38); studio(target=(0, 0, 0.3), scale=1.1)
    return S, A


def vacuum():
    S = setup(1800, 1100, 64); look(S)
    A = {}
    o, a = vacuum_chamber((-1.7, 0, 1.2), 1.0, 'octagon', inside='#ff7b54'); A.update(tag(a, 'oct'))
    o, a = helmholtz_coils((-1.7, 0, 1.2), 1.25, 0.18, 0.16, 1.25, axis='z'); A.update(tag(a, 'coils'))
    o, a = vacuum_chamber((1.9, 0.3, 1.0), 0.8, 'sphere'); A.update(tag(a, 'sph'))
    o, a = cable([(0.2, -0.5, 0.0), (0.6, -1.0, 0.1), (1.2, -0.9, 0.4), (1.9, 0.3, 1.85)], 0.035, '#2a2d33', 'coax'); A.update(tag(a, 'coax'))
    shadow_floor(-0.05)
    camera_look(loc=(0.0, -9.0, 6.4), target=(0.1, 0, 1.0), lens_mm=42); studio(target=(0, 0, 1.0), scale=1.1)
    return S, A


def cryo():
    S = setup(1100, 1500, 64); look(S)
    o, A = dilution_fridge((0, 0, 2.3))
    camera_look(loc=(0.0, -7.8, 3.4), target=(0.0, 0, 0.75), lens_mm=58); studio(target=(0, 0, 0.8), scale=1.0)
    return S, A


def traps():
    S = setup(1800, 900, 64); look(S)
    A = {}
    o, a = ion_trap('blade', (-1.55, 0, 0.75), n_ions=5, spacing=0.22, length=2.2, rot=-62); A.update(tag(a, 'blade'))
    o, a = ion_trap('surface', (1.55, 0.3, 0.2), n_ions=4, spacing=0.3, length=2.2, ion_color='#7b61ff', rot=12); A.update(tag(a, 'surf'))
    camera_look(loc=(0.0, -7.2, 4.2), target=(0.0, 0, 0.45), lens_mm=46); studio(target=(0, 0, 0.5), scale=1.0)
    return S, A


def terrain():
    S = setup(1800, 1150, 64); look(S)
    o, A = terrain_block((0, 0, 0), (6.0, 3.6, 2.2), seed=7, relief=0.2,
                         layers=[(0.35, '#d9c28c'), (0.3, '#b98a5c'), (0.35, '#e6d7ad'), (0.4, '#9a6b50'), (0.6, '#827c75')],
                         fault={'x': 1.0, 'dip': 62, 'throw': 0.3}, water_table=0.25)
    ry = A.river_y
    o, a = forest((-2.8, -0.2, -1.6, 1.6), 16, 3, A.ground, avoid=lambda x, y: abs(y - ry(x)) < 0.45)
    o, a = forest((1.4, 2.8, -1.6, 1.6), 7, 4, A.ground, kinds=('conifer',), avoid=lambda x, y: abs(y - ry(x)) < 0.45)
    o, c = cloud((-1.2, 0.8, 2.6), 0.55, seed=2); A.update(tag(c, 'cloud'))
    camera_look(loc=(-3.2, -10.5, 6.0), target=(0.0, 0, 0.3), lens_mm=42); studio(target=(0, 0, 0.5), scale=1.2)
    return S, A


def landscape():
    S = setup(1800, 1100, 64); look(S)
    o, A = terrain_surface((0, 0, 0), (8.0, 5.0), seed=4, relief=0.7, coast=True)
    g = A.ground
    for i, (x, y) in enumerate([(-2.6, 1.4), (-1.9, 1.9), (-3.2, 2.1)]):
        o, a = wind_turbine((x, y, g(x, y)), 1.25, 0.75, seed=i, yaw=10 * i); A.update(tag(a, f'wt{i}'))
    o, a = solar_array((-2.2, -1.4, g(-2.2, -1.4)), rows=2, cols=4, module=(0.28, 0.45)); A.update(tag(a, 'pv'))
    o, a = city_block((0.2, -1.0, g(0.2, -1.0)), (3, 2), 0.35, seed=5, heights=(0.2, 1.0)); A.update(tag(a, 'city'))
    o, a = crop_field((-0.9, -0.2, g(-0.9, -0.2) - 0.02), (1.3, 0.9), rows=8, per_row=18, seed=2); A.update(tag(a, 'crops'))
    o, a = forest((-3.8, -0.8, -2.4, 0.4), 12, 6, g, height=(0.3, 0.5), avoid=lambda x, y: (abs(x + 2.2) < 0.9 and abs(y + 1.3) < 0.6) or (abs(x - 0.2) < 0.8 and abs(y + 1.0) < 0.6) or (abs(x + 0.9) < 0.8 and abs(y + 0.2) < 0.6))
    for k, (x, y, z, s) in enumerate([(1.8, 1.2, 2.4, 0.45), (-1.2, 1.6, 2.7, 0.4)]):
        o, c = cloud((x, y, z), s, seed=10 + k)
    camera_look(loc=(-2.2, -11.5, 6.8), target=(0.0, 0.3, 0.1), lens_mm=40); studio(target=(0, 0, 0.3), scale=1.3)
    return S, A


def globe_scene():
    S = setup(1600, 1100, 48); look(S)
    A = {}
    o, a = globe((-1.9, 0, 1.55), 1.45, seed=11, cutaway=True, spin=-48, tilt=10); A.update(tag(a, 'globe'))
    o, a = atmosphere_layers((2.3, 0.0, 0.25), 9.0, 17.0, 0.8,
                             layers=[(0.7, '#d3e8f7', '#bddcf2', 'troposphere'), (0.6, '#aacdef', '#93bce8', 'stratosphere'),
                                     (0.55, '#86abe0', '#7196d3', 'mesosphere'), (0.7, '#6788c9', '#44559e', 'thermosphere')]); A.update(tag(a, 'atm'))
    o, c = cloud((1.75, -0.62, 0.32), 0.24, seed=4)
    o, c = cloud((2.95, -0.62, 0.4), 0.18, seed=5)
    camera_look(loc=(0.3, -10.5, 3.2), target=(0.3, 0, 1.45), lens_mm=46); studio(target=(0, 0, 1.2), scale=1.1)
    return S, A


def ocean():
    S = setup(1800, 1000, 64); look(S)
    o, A = ocean_section((0, 0, 0), (6.0, 2.6), 1.7, seed=5, amp=0.1, wavelength=1.3)
    o, c = cloud((-1.6, 1.0, 1.1), 0.5, seed=21)
    o, c = cloud((1.7, 1.4, 1.3), 0.4, seed=22)
    camera_look(loc=(-2.5, -9.5, 4.2), target=(0.0, 0, -0.2), lens_mm=45); studio(target=(0, 0, 0), scale=1.1)
    return S, A


SCENES = {'glassware': glassware, 'flow': flow, 'optics': optics, 'vacuum': vacuum, 'cryo': cryo, 'traps': traps,
          'terrain': terrain, 'landscape': landscape, 'globe': globe_scene, 'ocean': ocean}

if __name__ == '__main__':
    argv = [a for a in sys.argv[sys.argv.index('--') + 1:] if a != '--illus'] if '--' in sys.argv else []
    argv = argv or list(SCENES)
    for name in argv:
        t0 = time.time()
        S, A = SCENES[name]()
        A = {k: v for k, v in A.items() if isinstance(v, tuple) and len(v) == 3}
        finish(S, os.path.join(ART, f'app_{name}{SUF}.png'), anchors=A)
        print(f'TIME {name} {time.time() - t0:.1f} s')
