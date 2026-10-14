import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'blender'))
from scene import *

ILLUS = '--illus' in sys.argv                     # illustration variant: -- --illus  ->  *_illus.png
if ILLUS: use_style('illustration')
SUF = '_illus' if ILLUS else ''
S = setup(width_px=1400, height_px=800, samples=48)
torus(loc=(0, 0, 0.08), major=2.0, minor=0.08)
for k in range(5):
    a = -math.pi / 2 + k * 0.5; gaussian_solid(loc=(2.0 * math.cos(a), 2.0 * math.sin(a), 0.1), height=0.5, sigma=0.09)
fiber_path([(-2.0, 0.3, 0.1), (-2.6, 0.5, 0.9), (-1.6, 0.9, 1.1), (-1.2, 0.8, 0.1)], radius=0.07, mat=plastic('#8a5cd6', 0.3, 0.6))
shadow_floor(z=0.0)
camera_look(loc=(0, -7.5, 4.2), target=(0, 0, 0.2), lens_mm=45)
soft_lights()
finish(S, os.path.join(HERE, 'art', 'ring%s.png' % SUF), anchors={'pulse0': (0, -2, 0.6), 'loop': (-1.9, 0.7, 1.1)})
