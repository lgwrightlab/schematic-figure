"""Gallery of the biology kit (blender/bio3d.py). Renders demo/art/bio_<scene>.png (+ .json anchors).
    blender -b --factory-startup -P demo/render3d_bio.py                 # all scenes
    blender -b --factory-startup -P demo/render3d_bio.py -- cell tissue  # some scenes
"""
import sys, os, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'blender'))
from bio3d import *

ILLUS = '--illus' in sys.argv                     # illustration variant: -- --illus  ->  *_illus.png
if ILLUS: use_style('illustration')
SUF = '_illus' if ILLUS else ''
ART = os.path.join(HERE, 'art'); os.makedirs(ART, exist_ok=True)


def pre(p, A): return {p + k: v for k, v in A.items()}


def scene_cell():
    S = bio_setup(1400, 1150, samples=48)
    c, A = cell(radius=1.0, cutaway='octant', cut_azimuth=-50, receptors=70, seed=4)
    camera_orbit(target=(0, 0, -0.02), dist=5.6, az=-50, el=30, lens_mm=55)
    bio_lights(az=-50); shadow_floor(z=-0.86)
    return S, A


def scene_tissue():
    S = bio_setup(1500, 1050, samples=48)
    t, A = tissue_slab(size=(4.2, 2.6, 0), layers=EPITHELIUM, seed=2)
    camera_orbit(target=(0, 0, 0.55), dist=8.2, az=-58, el=30, lens_mm=50)
    bio_lights(az=-58); shadow_floor(z=0.0)
    return S, A


def scene_membrane():
    S = bio_setup(1500, 1100, samples=48)
    m, A = membrane_patch(size=(5.2, 3.2), loc=(0, 0, -0.9), seed=1)
    v, B = vesicle(radius=0.9, loc=(-1.0, 0.9, 1.15), cut_azimuth=-58, seed=2, spacing=0.075, thickness=0.26)
    camera_orbit(target=(-0.1, 0.1, 0.1), dist=9.6, az=-58, el=24, lens_mm=50)
    bio_lights(az=-58); shadow_floor(z=-1.3)
    return S, {**pre('m.', A), **pre('v.', B)}


def scene_vessels():
    S = bio_setup(1600, 1000, samples=48)
    a, A = well_plate(loc=(0.7, 0.8, 0), wells=96, length=4.2, seed=1,
                      well_colors=lambda i, j: ['#f28e9e', '#f6c26b', '#7fc4a6', '#6fa8dc', '#b18fd6', None][(i + j) // 4 % 6] if j < 10 else None)
    b, B = petri_dish(loc=(-2.3, -0.5, 0), radius=1.25, colonies=('#f4ead2', '#e6a93a', '#c75a4a'), n_colonies=34, seed=3)
    c, C = microtube(loc=(-0.1, -1.6, 0), height=2.2, liquid='#6fa8dc', fill=0.5, lid='open')
    d, D = pipette_tip(loc=(1.9, -1.55, 0.35), rot=(0, 0, 0), length=2.1, color='#f2cf4a', liquid='#e25f7b', droplet=True)
    camera_orbit(target=(-0.1, -0.2, 0.5), dist=10.0, az=-72, el=38, lens_mm=50)
    bio_lights(az=-72); shadow_floor(z=0.0)
    return S, {**pre('plate.', A), **pre('dish.', B), **pre('tube.', C), **pre('tip.', D)}


def scene_micro():
    S = bio_setup(1600, 1000, samples=48)
    a, A = bacterium(loc=(-2.1, 1.0, 0.4), rot=(0, 0, -35), seed=1, flagellum_len=1.9)
    b, B = virus(loc=(0.2, 0.8, 0.5), radius=0.62, seed=2)
    c, C = nanoparticle(loc=(2.5, 0.7, 0.4), radius=0.42, seed=3, peg=24)
    d, D = dna_helix(loc=(-2.8, -1.6, 0.35), rot=(0, 0, 8), n_bp=22, radius=0.34, rise=0.34 * 0.34, seed=4)
    e, E = protein_blob(loc=(1.6, -1.4, 0.45), size=0.9, seed=5, color='#3a7fc0')
    camera_orbit(target=(0, -0.3, 0.3), dist=10.5, az=-80, el=28, lens_mm=50)
    bio_lights(az=-80); shadow_floor(z=-0.1)
    return S, {**pre('bact.', A), **pre('virus.', B), **pre('np.', C), **pre('dna.', D), **pre('prot.', E)}


def scene_organoid():
    S = bio_setup(1500, 1000, samples=48)
    a, A = organoid(loc=(-1.55, 0, 0), radius=1.3, n_cells=130, seed=1, cut_azimuth=-40, cut_elevation=15)
    b, B = spheroid(loc=(1.65, 0, 0), radius=1.1, cell_size=0.3, seed=2, cutaway=True, cut_azimuth=-120, cut_elevation=15)
    camera_orbit(target=(0, 0, 0), dist=9.0, az=-80, el=24, lens_mm=50)
    bio_lights(az=-80); shadow_floor(z=-1.35)
    return S, {**pre('org.', A), **pre('sph.', B)}


SCENES = {'cell': scene_cell, 'tissue': scene_tissue, 'membrane': scene_membrane, 'vessels': scene_vessels,
          'micro': scene_micro, 'organoid': scene_organoid}
args = [a for a in sys.argv[sys.argv.index('--') + 1:] if a != '--illus'] if '--' in sys.argv else []
args = args or list(SCENES)
for name in args:
    t0 = time.time(); S, A = SCENES[name](); print('BUILD %s %.1f s' % (name, time.time() - t0))
    finish(S, os.path.join(ART, 'bio_%s%s.png' % (name, SUF)), anchors=A)
    print('TIME %s %.1f s' % (name, time.time() - t0))
