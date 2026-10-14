import sys, os
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'blender'))
from scene import *

ILLUS = '--illus' in sys.argv                     # illustration variant: -- --illus  ->  *_illus.png
if ILLUS: use_style('illustration')
SUF = '_illus' if ILLUS else ''
S = setup(width_px=1600, height_px=800, samples=48)
chip(size=(4.4, 2.4, 0.3), loc=(0.6, 0, -0.35), waveguides=[[(-2.2, 0.0), (-1.0, 0.0), (0.0, 0.5), (1.0, 0.5), (2.2, 0.5)], [(-2.2, -0.6), (-1.0, -0.6), (0.0, -0.1), (1.0, -0.1), (2.2, -0.1)]])
fiber_path([(-4.5, 0.6, 0.6), (-3.2, 0.4, 0.2), (-1.7, 0.0, 0.0)], radius=0.11)
lens(x=3.6, radius=0.6, thickness=0.2)
beam([(2.8, 0.5, 0.0), (4.6, 0.5, 0.0)], radius=0.04)
camera_look(loc=(0.4, -8.5, 5.2), target=(0.4, 0, -0.2), lens_mm=42)
soft_lights()
finish(S, os.path.join(HERE, 'art', 'chip%s.png' % SUF), anchors={'fiber': (-3.2, 0.4, 0.3), 'chip': (0.6, -1.2, -0.2), 'wg': (0.0, 0.5, -0.15), 'lens': (3.6, 0, 0.6), 'out': (4.6, 0.5, 0)})
