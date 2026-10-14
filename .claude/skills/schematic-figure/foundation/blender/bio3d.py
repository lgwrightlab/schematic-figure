"""Biology 3D hero kit: cells, tissue, vesicles, membranes, microbes, molecules and lab vessels, rendered headless in
Blender (Cycles, on a GPU when present, else the CPU) with soft subsurface materials and composited under vector labels. Builds on scene.py.

Usage from a figure's render script (figure/render3d.py):
    import sys; sys.path.insert(0, '<project>/blender'); from bio3d import *      # also re-exports scene.py
    S = bio_setup(width_px=1600, height_px=1200, samples=64)
    c, A = cell(radius=1.0, cutaway='octant', receptors=60, seed=3)             # c: root Empty, A: {name: (x,y,z)}
    t, B = tissue_slab(size=(4, 2.4, 1.0), loc=(0, 0, -2), layers=EPITHELIUM, seed=1)
    camera_orbit(target=(0, 0, 0), dist=6, az=-50, el=28, lens_mm=50)          # az matches cut_azimuth=-45
    bio_lights(az=-50); shadow_floor(z=-1.0)
    finish(S, 'figure/art/cell.png', anchors={**A, **{'tissue.' + k: v for k, v in B.items()}})
Run: blender -b --factory-startup -P figure/render3d.py   (Blender 4.2+/5.x; full path if not on PATH)
finish() writes the PNG (transparent background) and <png>.json with pixel anchors (see scene.py).

Every builder takes loc=(x,y,z), rot=(rx,ry,rz) in degrees, colours as '#rrggbb' and seed=<int> (same seed, same
object; no two cells/lipids/colonies are identical within one call). Each returns (root, anchors): root is an Empty
whose children are the parts (move/rotate the root to move the whole object), anchors maps names to world points
for labels (pass to finish). Units are free; the defaults assume an object about 1-4 units across.

Cells and tissue
  cell(...)              wobbly cell: membrane shell with a visible cut rim, cytoplasm, nucleus + nucleolus,
                         mitochondria, ER cisternae, vesicles, surface receptors ('Y' antibody-like or 'ball').
                         cutaway='octant' | 'quadrant' | 'half' | None, cut_azimuth (deg, point it at the camera
                         azimuth); translucent=True gives a Fresnel see-through membrane instead of a cut.
                         anchors: center membrane membrane_left membrane_right cytoplasm cut_wall nucleus nucleolus
                         nuclear_envelope mito er vesicle receptor top
  tissue_slab(...)       block of packed Voronoi cells (every cell different), domed apical surface, cut faces
                         ('front', 'right', 'left', 'back') showing cell sections with nuclei, per-cell colour
                         jitter, optional layers=[{thickness, size, color, rows}, ...] bottom-to-top (EPITHELIUM
                         is a stratified example), basement membrane.  anchors: top apical front_face right_face
                         nucleus basement layer0.. corner
  organoid(...)          hollow sphere of columnar cells around a lumen, cut open (cutaway=True) along a plane facing
                         (cut_azimuth, cut_elevation) to show the ring of cells with nuclei; a matrix shell fills
                         the grooves.  anchors: center lumen outer cut_face nucleus top
  spheroid(...)          solid ball of packed cells (radial outer cells with domed faces), optionally cut open.
                         anchors: center surface cut_face nucleus top
  bacterium(...)         rod (optionally bent) with pili and a helical flagellum.  anchors: body pole pole_back
                         flagellum_tip pilus top
Particles and membranes
  vesicle(...)/liposome  lipid-bilayer vesicle built from individual lipids (heads + two tails), transmembrane
                         proteins, cargo, cut open to show the bilayer.  anchors: center outer_leaflet
                         inner_leaflet bilayer_cut lumen cargo protein top
  virus(...)             enveloped virus-like particle with trimeric spikes and small envelope proteins.
                         anchors: center envelope spike top
  nanoparticle(...)      metal (or any) core with an adsorbed protein corona and optional PEG chains.
                         anchors: center core corona peg top
  membrane_patch(...)    rectangular lipid bilayer with embedded proteins ('channel', 'receptor', 'blob').
                         anchors: head_top head_bottom tails extracellular cytosol protein0.. corner
Molecules
  dna_helix(...)         B-DNA double helix: two backbones, phosphate beads, base pairs coloured by base.
                         anchors: start end axis_mid major_groove minor_groove backbone1 backbone2 base_pair
  protein_blob(...)      seeded smooth globular protein (voxel-remeshed union of spheres).  anchors: center top
Lab vessels
  microtube(...)         1.5 mL microcentrifuge tube with liquid, lid open or closed.  anchors: lid liquid tip rim body
  petri_dish(...)        dish with agar and seeded colonies (list of colours), optional lid beside it.
                         anchors: dish agar colony rim lid
  well_plate(...)        6/12/24/48/96/384-well plate, well_colors = callable(row, col) | dict {'A1': hex} |
                         2D list | one hex; clear, white or black plastic.  anchors: plate A1 A<last> <row>1 ...
  pipette_tip(...)       tapered tip (natural / yellow / blue) with optional liquid and a droplet.
                         anchors: collar tip droplet liquid body

Materials and scene
  bio_mat(color, preset) presets: cell membrane nucleus organelle protein section lipid_head lipid_tail agar colony
                         plastic_clear plastic_frosted plastic_white liquid gold silica matte.  Soft subsurface,
                         low specular, sheen, fine noise mottling + bump (no glossy plastic look).
  shell_mat(color)       Fresnel see-through membrane (clear face-on, coloured at the rim).
  bio_setup(...)         scene.setup + bounce/transparency settings for glass, liquid and subsurface.
  bio_lights(az=...)     large soft key, fill, strong back rim (makes subsurface glow) and top light, placed
                         relative to the camera azimuth.
  camera_orbit(target, dist, az, el, lens_mm | ortho)
Render times (demo/render3d_bio.py, 32-thread CPU, 1400-1600 px wide, 48 samples): 18-43 s per scene. A GPU is faster.
Tips: keep 'Standard' view transform (colour fidelity). Point cut_azimuth near the camera azimuth (+-20 deg) for an
octant cut; for organoid/spheroid sections turn the cut 30-45 deg away from the camera so the outer surface shows.
Lower wobble for rounder cells, raise var for more cell-to-cell colour spread. White objects clip under strong
light: use light greys (#e3e6e9) for 'white' plastic. Clear vessels use a low IOR on purpose (thin-plastic read).
"""
import bpy, bmesh, math, random
import numpy as np
from mathutils import Vector, Matrix, Euler, Quaternion, noise
from mathutils.kdtree import KDTree
from scene import *                       # noqa: F401,F403  (re-export the photonics kit)
from scene import hex_rgb, setup, camera_look

# ----------------------------------------------------------------------------------------------- materials
PRESETS = {
    'cell':        dict(rough=0.55, sss=0.55, sss_scale=0.10, spec=0.22, sheen=0.25, mottle=0.10, tex=5.0, bump=0.10),
    'membrane':    dict(rough=0.45, sss=0.5, sss_scale=0.06, spec=0.35, sheen=0.4, mottle=0.10, tex=9.0, bump=0.14),
    'nucleus':     dict(rough=0.5, sss=0.4, sss_scale=0.06, spec=0.3, sheen=0.3, mottle=0.16, tex=7.0, bump=0.2),
    'organelle':   dict(rough=0.42, sss=0.45, sss_scale=0.04, spec=0.35, sheen=0.25, mottle=0.10, tex=12.0, bump=0.15),
    'protein':     dict(rough=0.55, sss=0.35, sss_scale=0.04, spec=0.25, sheen=0.45, mottle=0.08, tex=16.0, bump=0.12),
    'section':     dict(rough=0.75, sss=0.15, sss_scale=0.02, spec=0.15, sheen=0.0, mottle=0.10, tex=12.0, bump=0.04),
    'lipid_head':  dict(rough=0.4, sss=0.3, sss_scale=0.01, spec=0.35, sheen=0.2, mottle=0.0, tex=1.0, bump=0.0),
    'lipid_tail':  dict(rough=0.55, sss=0.25, sss_scale=0.01, spec=0.2, sheen=0.1, mottle=0.0, tex=1.0, bump=0.0),
    'agar':        dict(rough=0.18, sss=1.0, sss_scale=0.25, spec=0.5, sheen=0.0, mottle=0.03, tex=3.0, bump=0.0),
    'colony':      dict(rough=0.28, sss=0.5, sss_scale=0.04, spec=0.5, sheen=0.1, mottle=0.06, tex=25.0, bump=0.05),
    'plastic_clear':   dict(rough=0.03, trans=1.0, ior=1.55, spec=0.5, mottle=0.0, bump=0.0, sss=0.0),
    'plastic_frosted': dict(rough=0.28, trans=1.0, ior=1.49, spec=0.5, mottle=0.0, bump=0.0, sss=0.0),
    'plastic_white':   dict(rough=0.35, sss=0.35, sss_scale=0.05, spec=0.4, coat=0.2, mottle=0.0, bump=0.0),
    'liquid':      dict(rough=0.02, trans=1.0, ior=1.33, spec=0.5, mottle=0.0, bump=0.0, sss=0.0),
    'gold':        dict(metal=1.0, rough=0.22, spec=0.5, mottle=0.05, tex=30.0, bump=0.03, sss=0.0),
    'silica':      dict(rough=0.35, sss=0.4, sss_scale=0.05, spec=0.4, coat=0.3, mottle=0.04, tex=20.0, bump=0.02),
    'matte':       dict(rough=0.7, sss=0.0, spec=0.2, mottle=0.06, tex=10.0, bump=0.03),
}


def _lin(h): return hex_rgb(h)


def bio_mat(color, preset='cell', name=None, var=0.0, **kw):
    """Principled material with soft biological defaults. var>0 jitters hue/value per cell from the 'rand' face
    attribute the builders write (0.04-0.12 is natural). Any preset key can be overridden: rough, sss, sss_scale,
    spec, sheen, coat, trans, ior, metal, mottle (colour noise amplitude), tex (noise scale), bump, alpha."""
    p = dict(rough=0.5, sss=0.0, sss_scale=0.05, spec=0.3, sheen=0.0, coat=0.0, trans=0.0, ior=1.45, metal=0.0,
             mottle=0.0, tex=8.0, bump=0.0, alpha=1.0)
    p.update(PRESETS[preset]); p.update(kw)
    m = bpy.data.materials.new(name or preset); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; Lk = nt.links
    b = N['Principled BSDF']
    c = _lin(color)
    if p['trans'] > 0 and preset.startswith('plastic'):   # 4 surface crossings through a hollow vessel: sqrt tint
        c = tuple(v ** 0.5 for v in c[:3]) + (1.0,)
    col_out = None
    if p['mottle'] > 0 or p['bump'] > 0 or var > 0:
        tc = N.new('ShaderNodeTexCoord')
    if p['mottle'] > 0:
        nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = p['tex']
        nz.inputs['Detail'].default_value = 3.0; nz.inputs['Roughness'].default_value = 0.55
        Lk.new(tc.outputs['Object'], nz.inputs['Vector'])
        mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.3; mr.inputs['From Max'].default_value = 0.7
        Lk.new(nz.outputs['Fac'], mr.inputs['Value'])
        mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.clamp_factor = True
        k = p['mottle']
        mx.inputs[6].default_value = tuple(v * (1 - k) for v in c[:3]) + (1,)
        mx.inputs[7].default_value = tuple(min(1.0, v * (1 + 0.6 * k) + 0.25 * k) for v in c[:3]) + (1,)
        Lk.new(mr.outputs['Result'], mx.inputs[0]); col_out = mx.outputs[2]
    if var > 0:
        at = N.new('ShaderNodeAttribute'); at.attribute_name = 'rand'
        hs = N.new('ShaderNodeHueSaturation')
        h1 = N.new('ShaderNodeMapRange'); h1.inputs['To Min'].default_value = 0.5 - 0.35 * var; h1.inputs['To Max'].default_value = 0.5 + 0.35 * var
        v1 = N.new('ShaderNodeMapRange'); v1.inputs['To Min'].default_value = 1 - 1.6 * var; v1.inputs['To Max'].default_value = 1 + 1.2 * var
        s1 = N.new('ShaderNodeMapRange'); s1.inputs['To Min'].default_value = 1 - var; s1.inputs['To Max'].default_value = 1 + var
        Lk.new(at.outputs['Fac'], h1.inputs['Value']); Lk.new(at.outputs['Fac'], v1.inputs['Value'])
        at2 = N.new('ShaderNodeAttribute'); at2.attribute_name = 'rand2'
        Lk.new(at2.outputs['Fac'], s1.inputs['Value'])
        Lk.new(h1.outputs['Result'], hs.inputs['Hue']); Lk.new(v1.outputs['Result'], hs.inputs['Value'])
        Lk.new(s1.outputs['Result'], hs.inputs['Saturation'])
        if col_out is not None: Lk.new(col_out, hs.inputs['Color'])
        else: hs.inputs['Color'].default_value = c
        col_out = hs.outputs['Color']
    if col_out is not None: Lk.new(col_out, b.inputs['Base Color'])
    else: b.inputs['Base Color'].default_value = c
    if p['bump'] > 0:
        nz2 = N.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = p['tex'] * 2.2
        nz2.inputs['Detail'].default_value = 4.0
        Lk.new(tc.outputs['Object'], nz2.inputs['Vector'])
        bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = p['bump']
        bp.inputs['Distance'].default_value = 0.02
        Lk.new(nz2.outputs['Fac'], bp.inputs['Height']); Lk.new(bp.outputs['Normal'], b.inputs['Normal'])
    rad = [0.35 + 0.65 * v ** 0.5 for v in c[:3]]; mm = max(rad)
    b.inputs['Roughness'].default_value = p['rough']
    b.inputs['Metallic'].default_value = p['metal']
    b.inputs['IOR'].default_value = p['ior']
    b.inputs['Specular IOR Level'].default_value = p['spec']
    b.subsurface_method = 'BURLEY'       # 3-4x faster than random walk, same soft look at figure scale
    b.inputs['Subsurface Weight'].default_value = p['sss']
    b.inputs['Subsurface Radius'].default_value = tuple(v / mm for v in rad)
    b.inputs['Subsurface Scale'].default_value = p['sss_scale']
    b.inputs['Sheen Weight'].default_value = p['sheen']; b.inputs['Sheen Roughness'].default_value = 0.4
    b.inputs['Coat Weight'].default_value = p['coat']
    b.inputs['Transmission Weight'].default_value = p['trans']
    b.inputs['Alpha'].default_value = p['alpha']
    return m


def shell_mat(color, face=0.10, edge=0.92, power=1.6, preset='membrane'):
    """See-through membrane: transparent face-on, opaque and coloured at grazing angles (a visible rim)."""
    m = bio_mat(color, preset); nt = m.node_tree; N = nt.nodes; Lk = nt.links
    b = N['Principled BSDF']; out = N['Material Output']
    lw = N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35
    pw = N.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = power
    mr = N.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = face; mr.inputs['To Max'].default_value = edge
    Lk.new(lw.outputs['Facing'], pw.inputs[0]); Lk.new(pw.outputs[0], mr.inputs['Value'])
    tr = N.new('ShaderNodeBsdfTransparent')
    c = _lin(color); tr.inputs['Color'].default_value = tuple(0.8 + 0.2 * v for v in c[:3]) + (1,)
    mx = N.new('ShaderNodeMixShader')
    Lk.new(mr.outputs['Result'], mx.inputs[0]); Lk.new(tr.outputs[0], mx.inputs[1]); Lk.new(b.outputs[0], mx.inputs[2])
    Lk.new(mx.outputs[0], out.inputs['Surface'])
    return m


# ----------------------------------------------------------------------------------------------- scene helpers
def bio_setup(width_px=1600, height_px=1200, samples=64, world=0.45, exposure=0.0):
    sc = setup(width_px, height_px, samples, world)
    c = sc.cycles
    c.max_bounces = 12; c.diffuse_bounces = 4; c.glossy_bounces = 6; c.transmission_bounces = 12
    c.transparent_max_bounces = 48; c.volume_bounces = 0
    c.caustics_reflective = False; c.caustics_refractive = False
    c.sample_clamp_indirect = 8.0; c.blur_glossy = 1.0; c.adaptive_threshold = 0.02
    sc.view_settings.exposure = exposure
    return sc


def camera_orbit(target=(0, 0, 0), dist=8.0, az=-50.0, el=28.0, lens_mm=50, ortho=None):
    """Camera on a sphere around target: az in degrees from +x toward +y (-90 = in front, on -y), el above horizon."""
    a, e = math.radians(az), math.radians(el); t = Vector(target)
    loc = t + dist * Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))
    return camera_look(tuple(loc), tuple(t), lens_mm, ortho)


def bio_lights(target=(0, 0, 0), az=-50.0, dist=10.0, key=650, fill=220, rim=850, top=100, size=6.0):
    """Soft studio for translucent biology: big key upper-left of the camera, low fill right, strong rim from behind
    (subsurface glow and silhouette separation) and a soft top light. Energies are for dist=10; they scale with dist^2."""
    t = Vector(target); s2 = (dist / 10.0) ** 2
    for name, daz, el, e, sz in [('key', -50, 58, key, size), ('fill', 70, 12, fill, size * 1.4),
                                 ('rim', 180, 38, rim, size * 0.9), ('top', 0, 85, top, size * 1.6)]:
        a, ee = math.radians(az + daz), math.radians(el)
        loc = t + dist * Vector((math.cos(ee) * math.cos(a), math.cos(ee) * math.sin(a), math.sin(ee)))
        bpy.ops.object.light_add(type='AREA', location=tuple(loc)); L = bpy.context.object; L.name = 'bio_' + name
        L.data.energy = e * s2; L.data.size = sz * dist / 10.0
        L.rotation_euler = (t - loc).to_track_quat('-Z', 'Y').to_euler()
        L.data.use_shadow = name in ('key', 'top')     # fill/rim shadows only add grey patches on the floor


# ----------------------------------------------------------------------------------------------- geometry core
_CACHE = {}


def _fix(V, F):
    """Orient faces of a small closed template outward (bmesh recalc)."""
    bm = bmesh.new(); vs = [bm.verts.new(tuple(v)) for v in V]
    for f in F: bm.faces.new([vs[i] for i in f])
    bm.faces.ensure_lookup_table(); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    F2 = np.array([[v.index for v in f.verts] for f in bm.faces]); bm.free(); return F2


def _ico(sub=3):
    k = ('ico', sub)
    if k not in _CACHE:
        bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
        V = np.array([v.co[:] for v in bm.verts]); F = np.array([[v.index for v in f.verts] for f in bm.faces]); bm.free()
        _CACHE[k] = (V, _fix(V, F))
    return _CACHE[k]


def _uvsphere(seg=20, rings=12):
    k = ('uv', seg, rings)
    if k not in _CACHE:
        V = [(0, 0, -1)]
        for i in range(1, rings):
            th = -math.pi / 2 + math.pi * i / rings
            V += [(math.cos(th) * math.cos(2 * math.pi * j / seg), math.cos(th) * math.sin(2 * math.pi * j / seg), math.sin(th)) for j in range(seg)]
        V.append((0, 0, 1)); V = np.array(V); top = len(V) - 1; F = []
        for j in range(seg): F.append((0, 1 + (j + 1) % seg, 1 + j))
        for i in range(rings - 2):
            a, b = 1 + i * seg, 1 + (i + 1) * seg
            for j in range(seg):
                j2 = (j + 1) % seg; F += [(a + j, a + j2, b + j2), (a + j, b + j2, b + j)]
        a = 1 + (rings - 2) * seg
        for j in range(seg): F.append((a + j, a + (j + 1) % seg, top))
        _CACHE[k] = (V, _fix(V, np.array(F)))
    return _CACHE[k]


def _capsule(L, r, seg=20, rings=12, bend=0.0):
    """Capsule along z centred at 0: total length L + 2r; bend displaces x by bend*(z/h)^2."""
    V, F = _uvsphere(seg, rings | 1); V = V * r   # odd ring count: no ring on the equator
    V[:, 2] += np.sign(V[:, 2]) * L / 2
    if bend: h = L / 2 + r; V[:, 0] += bend * (V[:, 2] / h) ** 2
    return V, F


def _tube(P, r, sides=10, flat=1.0, n0=None, cap=True):
    """Closed tube along polyline P (n,3) with radius r (scalar or per point); flat squashes the B axis."""
    P = np.asarray(P, float); n = len(P); r = np.broadcast_to(np.asarray(r, float), (n,)).astype(float)
    T = np.gradient(P, axis=0); T /= np.linalg.norm(T, axis=1)[:, None]
    if n0 is None:
        a = np.array([0, 0, 1.0]) if abs(T[0][2]) < 0.9 else np.array([1.0, 0, 0])
        n0 = np.cross(T[0], a)
    Nn = np.zeros_like(P); v = np.asarray(n0, float) - np.dot(n0, T[0]) * T[0]; Nn[0] = v / np.linalg.norm(v)
    for i in range(1, n):
        v = Nn[i - 1] - np.dot(Nn[i - 1], T[i]) * T[i]; Nn[i] = v / np.linalg.norm(v)
    B = np.cross(T, Nn)
    ang = 2 * np.pi * np.arange(sides) / sides
    V = P[:, None, :] + r[:, None, None] * (np.cos(ang)[None, :, None] * Nn[:, None, :] + flat * np.sin(ang)[None, :, None] * B[:, None, :])
    V = V.reshape(-1, 3)
    i = np.arange(n - 1)[:, None] * sides; j = np.arange(sides)[None, :]; j2 = (j + 1) % sides
    a, b, c, d = (i + j), (i + j2), (i + sides + j2), (i + sides + j)
    F = np.concatenate([np.stack([a, b, c], -1).reshape(-1, 3), np.stack([a, c, d], -1).reshape(-1, 3)])
    if cap:
        s0, s1 = len(V), len(V) + 1; V = np.vstack([V, P[0], P[-1]])
        e = (n - 1) * sides
        F = np.vstack([F, np.stack([np.full(sides, s0), (np.arange(sides) + 1) % sides, np.arange(sides)], -1),
                       np.stack([np.full(sides, s1), e + np.arange(sides), e + (np.arange(sides) + 1) % sides], -1)])
    return V, F


def _box(lo, hi):
    lo, hi = np.asarray(lo, float), np.asarray(hi, float)
    V = np.array([[lo[0] if i & 1 == 0 else hi[0], lo[1] if i & 2 == 0 else hi[1], lo[2] if i & 4 == 0 else hi[2]] for i in range(8)])
    F = np.array([[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]])
    return V, F


def _lathe(prof, segs=72, closed=True):
    """Surface of revolution about z from a 2D profile [(r, z), ...] (points with r=0 sit on the axis)."""
    V, rings = [], []
    ca, sa = np.cos(2 * np.pi * np.arange(segs) / segs), np.sin(2 * np.pi * np.arange(segs) / segs)
    for r, z in prof:
        if r < 1e-9: rings.append([len(V)]); V.append((0.0, 0.0, z))
        else:
            rings.append(list(range(len(V), len(V) + segs))); V += [(r * ca[k], r * sa[k], z) for k in range(segs)]
    F = []
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for a, b in pairs:
        if len(a) == 1 and len(b) == 1: continue
        for j in range(segs):
            j2 = (j + 1) % segs
            if len(a) == 1: F.append((a[0], b[j], b[j2]))
            elif len(b) == 1: F.append((a[j], a[j2], b[0]))
            else: F += [(a[j], a[j2], b[j2]), (a[j], b[j2], b[j])]
    return np.array(V), np.array(F)


def _rot_to(d, twist=0.0):
    d = np.asarray(d, float); d = d / np.linalg.norm(d)
    a = np.array([1.0, 0, 0]) if abs(d[0]) < 0.9 else np.array([0, 1.0, 0])
    x = np.cross(a, d); x /= np.linalg.norm(x); y = np.cross(d, x)
    c, s = math.cos(twist), math.sin(twist)
    return np.column_stack([c * x + s * y, -s * x + c * y, d])


def _rz(phi):
    c, s = math.cos(phi), math.sin(phi); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])


def _inst(V, F, M, T):
    """Instance template (V,F) with 3x3 matrices M (N,3,3) and translations T (N,3)."""
    M = np.asarray(M, float); T = np.asarray(T, float); k = len(V)
    VV = np.einsum('nij,kj->nki', M, V) + T[:, None, :]
    FF = F[None, :, :] + (np.arange(len(T)) * k)[:, None, None]
    return VV.reshape(-1, 3), FF.reshape(-1, F.shape[1])


def _cat(parts):
    Vs, Fs, off = [], [], 0
    for V, F in parts:
        Vs.append(np.asarray(V)); Fs.append(np.asarray(F) + off); off += len(V)
    if not Vs: return np.zeros((0, 3)), np.zeros((0, 3), int)
    return np.vstack(Vs), np.vstack(Fs)


def _obj(name, V, F, mats, parent=None, face_mat=None, rand=None, rand2=None, smooth=True, recalc=False):
    me = bpy.data.meshes.new(name)
    Fl = F.tolist() if isinstance(F, np.ndarray) else F
    me.from_pydata(np.asarray(V, float).tolist(), [], Fl)
    if recalc:
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    if face_mat is not None: me.polygons.foreach_set('material_index', np.asarray(face_mat, np.int32))
    for nm, vals in (('rand', rand), ('rand2', rand2)):
        if vals is not None:
            at = me.attributes.new(nm, 'FLOAT', 'FACE'); at.data.foreach_set('value', np.asarray(vals, np.float32))
    if smooth: me.shade_smooth()
    for m in (mats if isinstance(mats, (list, tuple)) else [mats]): me.materials.append(m)
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    if parent is not None: o.parent = parent
    return o


class _G:
    """Group root: an Empty carrying loc/rot/scale; parts are built in its local frame."""
    def __init__(self, name, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
        self.root = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(self.root)
        s = scale if isinstance(scale, (tuple, list)) else (scale,) * 3
        self.M = Matrix.LocRotScale(Vector(loc), Euler([math.radians(v) for v in rot]).to_quaternion(), Vector(s))
        self.root.matrix_world = self.M; self.A = {}

    def obj(self, name, V, F, mats, **kw): return _obj(name, V, F, mats, parent=self.root, **kw)

    def a(self, name, p): self.A[name] = tuple(round(v, 5) for v in (self.M @ Vector(tuple(float(x) for x in p))))

    def done(self): return self.root, self.A


def _cutter(g, V, F, mat, name='cutter'):
    o = g.obj(name, V, F, [mat], smooth=False); o.hide_render = True; o.display_type = 'WIRE'; return o


def _boolean(target, cutter, op='DIFFERENCE'):
    md = target.modifiers.new('cut', 'BOOLEAN'); md.operation = op; md.solver = 'EXACT'; md.object = cutter
    md.material_mode = 'TRANSFER'; return md


def _smooth_mods(o, bevel=0.0, segs=1, levels=2, angle=40):
    """Chamfer (one segment, so subdivision rounds it instead of keeping a crisp edge) + subdivision."""
    if bevel > 0:
        b = o.modifiers.new('bev', 'BEVEL'); b.width = bevel; b.segments = segs; b.limit_method = 'ANGLE'
        b.angle_limit = math.radians(angle)
    if levels:
        s = o.modifiers.new('sub', 'SUBSURF'); s.levels = min(1, levels); s.render_levels = levels


def _radial(seed, wobble, freq=1.7):
    rng = random.Random(seed)
    o1 = Vector([rng.uniform(-60, 60) for _ in range(3)]); o2 = Vector([rng.uniform(-60, 60) for _ in range(3)])

    def f(u):
        u = Vector(tuple(u))
        return 1.0 + wobble * (noise.noise(u * freq + o1) + 0.45 * noise.noise(u * freq * 2.6 + o2))
    return f


def _wobbly(sub, R, shape=(1, 1, 1), wobble=0.05, seed=0, freq=1.7):
    V, F = _ico(sub); f = _radial(seed, wobble, freq)
    fac = np.array([f(v) for v in V])
    return V * fac[:, None] * np.asarray(shape) * R, F, f


def _fib(n, rng=None, jitter=0.0):
    i = np.arange(n) + 0.5; phi = np.arccos(1 - 2 * i / n); th = np.pi * (1 + 5 ** 0.5) * i
    P = np.stack([np.cos(th) * np.sin(phi), np.sin(th) * np.sin(phi), np.cos(phi)], -1)
    if rng is not None and jitter > 0:
        P = P + np.array([[rng.gauss(0, jitter) for _ in range(3)] for _ in range(n)])
        P /= np.linalg.norm(P, axis=1)[:, None]
    return P


class _Cut:
    """Cut-away region. octant: x'>=0, y'<=0, z>=cz in a frame turned so the wedge faces azimuth az;
    quadrant: the same without the z limit; half: everything on the az side of a vertical plane through cz-offset."""
    def __init__(self, mode, az=-45.0, cz=0.0, B=50.0):
        self.mode = mode; self.cz = cz; self.B = B
        self.phi = math.radians(az + (90 if mode == 'half' else 45)); self.R = _rz(self.phi)

    def lohi(self, e=0.0):
        B = self.B
        if self.mode == 'octant': return (e, -B, self.cz + e), (B, -e, B)
        if self.mode == 'quadrant': return (e, -B, -B), (B, -e, B)
        return (-B, -B, -B), (B, -e - self.cz, B)

    def inside(self, p, margin=0.0):
        q = self.R.T @ np.asarray(p, float); lo, hi = self.lohi(-margin)
        return all(lo[k] <= q[k] <= hi[k] for k in range(3))

    def box(self, e=0.0):
        V, F = _box(*self.lohi(e)); return V @ self.R.T, F

    def to_world(self, q): return self.R @ np.asarray(q, float)


# ----------------------------------------------------------------------------------------------- cell
def _receptor_tpl(kind, R):
    if kind == 'ball':
        Vs, Fs = _capsule(0.07 * R, 0.011 * R, 10, 6); Vs = Vs + [0, 0, 0.045 * R]
        Vh, Fh = _ico(2); Vh = Vh * 0.034 * R + [0, 0, 0.115 * R]
        return _cat([(Vs, Fs), (Vh, Fh)])
    parts = []
    Vs, Fs = _capsule(0.07 * R, 0.013 * R, 12, 6); parts.append((Vs + [0, 0, 0.04 * R], Fs))
    for sgn in (-1, 1):
        Va, Fa = _capsule(0.06 * R, 0.017 * R, 12, 8)
        a = math.radians(32 * sgn); Ry = np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])
        Va = (Va + [0, 0, 0.05 * R]) @ Ry.T + [0, 0, 0.085 * R]
        parts.append((Va, Fa))
    return _cat(parts)


def cell(loc=(0, 0, 0), radius=1.0, shape=(1.0, 0.94, 0.82), rot=(0, 0, 0), seed=0, wobble=0.06,
         membrane='#e07a62', cytoplasm='#f2b9a0', nucleus='#6a4c9c', nucleolus='#3b2a70', mito='#df5f3b',
         er='#4f9bc6', vesicle='#f0b43c', receptor='#2e6fae', n_mito=18, n_er=4, n_vesicles=26,
         receptors=40, receptor_kind='Y', cutaway='octant', cut_azimuth=-45.0, cut_height=0.0,
         translucent=False, organelles=True, nucleus_size=0.42, nucleus_pop=0.10):
    """Single eukaryotic cell. Returns (root, anchors). See module docstring for anchors."""
    rng = random.Random(seed); g = _G('cell', loc, rot); R = radius; sh = np.asarray(shape, float)
    V, F, rf = _wobbly(5, R, sh, wobble, seed)
    t = 0.04 * R
    nrm = np.linalg.norm(V, axis=1); Vin = V * ((nrm - t) / nrm)[:, None]
    cut = _Cut(cutaway, cut_azimuth, cut_height * R) if (cutaway and not translucent) else None
    eps = 0.006 * R

    def surf(u):
        u = np.asarray(u, float); u = u / np.linalg.norm(u); return u * rf(u) * sh * R

    # membrane shell (outer + reversed inner) and cytoplasm
    if translucent:
        g.obj('membrane', V, F, [shell_mat(membrane)])
    else:
        Vs, Fs = _cat([(V, F), (Vin, F[:, ::-1])])
        mem = g.obj('membrane', Vs, Fs, [bio_mat(membrane, 'membrane')])
        cyt = g.obj('cytoplasm', Vin, F, [bio_mat(cytoplasm, 'cell')])
        if cut:
            _boolean(mem, _cutter(g, *cut.box(0.0), bio_mat(_shade(membrane, 0.82), 'section', mottle=0.06)))
            _boolean(cyt, _cutter(g, *cut.box(0.0), bio_mat(cytoplasm, 'section', mottle=0.10, tex=9.0)))
    # nucleus + nucleolus
    rn = nucleus_size * R * float(np.mean(sh))
    pop = nucleus_pop * R if cut else 0.0
    Vn, Fn, _ = _wobbly(4, rn, (1.05, 1.0, 0.9), 0.05, seed + 11)
    Vn = Vn + [0, 0, -0.03 * R]
    nuc = g.obj('nucleus', Vn, Fn, [bio_mat(nucleus, 'nucleus')])
    if cut:
        qno = np.array([0.34 * rn + pop, -0.34 * rn - pop, cut.cz + pop])
        cno = cut.to_world(qno) if cut.mode == 'octant' else np.array([0.0, 0.0, 0.1 * rn])
    else:
        cno = np.array([0.25 * rn, -0.2 * rn, 0.15 * rn])
    Vo, Fo, _ = _wobbly(3, 0.30 * rn, (1, 1, 1), 0.08, seed + 12); Vo = Vo + cno
    nucl = g.obj('nucleolus', Vo, Fo, [bio_mat(nucleolus, 'nucleus')])
    if cut:
        _boolean(nuc, _cutter(g, *cut.box(pop + eps), bio_mat(nucleus, 'section', mottle=0.35, tex=18.0)))
        _boolean(nucl, _cutter(g, *cut.box(pop + 2 * eps), bio_mat(nucleolus, 'section', mottle=0.2, tex=25.0)))
    rmax = 0.88 * R * min(sh)

    def free_point(rlo, rhi, margin):
        for _ in range(200):
            u = np.array([rng.gauss(0, 1) for _ in range(3)]); u /= np.linalg.norm(u)
            p = u * rng.uniform(rlo, rhi) * sh / max(sh)
            if cut is not None and cut.inside(p, margin): continue
            return p, u
        return None, None

    def face_point(rlo, rhi, ro):
        """Organelle centre straddling a visible cut face (half embedded, half exposed) + an in-plane direction."""
        if cut is None:
            p, u = free_point(rlo, rhi, 0.0)
            return p, (None if p is None else np.cross(u, [rng.gauss(0, 1) for _ in range(3)]))
        nf = {'octant': 3, 'quadrant': 2, 'half': 1}[cut.mode]; cz = cut.cz
        for _ in range(400):
            f = rng.randrange(nf); a, b = rng.uniform(0.03, 1.0) * rhi, rng.uniform(0.03, 1.0) * rhi
            off = rng.uniform(-0.1, 0.6) * ro; ang = rng.uniform(0, 2 * math.pi)
            if cut.mode == 'half': q = np.array([rng.uniform(-rhi, rhi), -cz + off, rng.uniform(-rhi, rhi)]); t = [math.cos(ang), 0, math.sin(ang)]
            elif f == 0: q = np.array([a, off, (cz + b) if cut.mode == 'octant' else rng.uniform(-rhi, rhi)]); t = [math.cos(ang), 0, math.sin(ang)]
            elif f == 1: q = np.array([-off, -a, (cz + b) if cut.mode == 'octant' else rng.uniform(-rhi, rhi)]); t = [0, math.cos(ang), math.sin(ang)]
            else: q = np.array([a, -b, cz - off]); t = [math.cos(ang), math.sin(ang), 0]
            p = cut.to_world(q); rr = np.linalg.norm(p / (sh / max(sh)))
            if not (rlo <= rr <= rhi): continue
            if np.linalg.norm(p - np.array([0, 0, -0.03 * R])) < rn * 1.05 + 0.5 * pop + ro: continue
            return p, cut.to_world(t)
        return None, None
    A_mito = A_ves = A_er = None
    placed = []

    def clear(p, rad):
        return all(np.linalg.norm(p - q) > 0.9 * (rad + rq) for q, rq in placed)
    if organelles:
        parts = []
        for k in range(n_mito):
            L = rng.uniform(0.16, 0.30) * R; r = rng.uniform(0.050, 0.068) * R
            for _ in range(30):
                p, tang = face_point(rn * 1.1, rmax - 0.5 * L, r)
                if p is None or clear(p, 0.5 * L + r): break
            if p is None or not clear(p, 0.5 * L + r): continue
            placed.append((p, 0.5 * L + r))
            Vc, Fc = _capsule(L, r, 20, 12, bend=rng.uniform(-0.6, 0.6) * r)
            M = _rot_to(tang, rng.uniform(0, 6.3)); parts.append(_inst(Vc, Fc, [M], [p]))
            if A_mito is None or (cut is not None and _cut_depth(cut, p) > _cut_depth(cut, A_mito)): A_mito = p
        if parts:
            Vm, Fm = _cat(parts); g.obj('mitochondria', Vm, Fm, [bio_mat(mito, 'organelle')])
        parts = []
        for k in range(n_vesicles):
            rv = rng.uniform(0.025, 0.045) * R
            for _ in range(30):
                p, _t = face_point(rn * 1.1, rmax, rv)
                if p is None or clear(p, rv): break
            if p is None or not clear(p, rv): continue
            placed.append((p, rv))
            Vv, Fv = _ico(2); parts.append((Vv * rv + p, Fv))
            if A_ves is None or (cut is not None and _cut_depth(cut, p) > _cut_depth(cut, A_ves)): A_ves = p
        if parts:
            Vv, Fv = _cat(parts); g.obj('vesicles', Vv, Fv, [bio_mat(vesicle, 'organelle')])
        # ER: stacks of thin, wavy spherical-cap cisternae concentric with the nucleus; a cut shows them as the
        # classic parallel curved lines around the nuclear section
        parts = []
        if cut is not None:
            wedge = {'octant': [1, -1, 1], 'quadrant': [1, -1, 0], 'half': [0, -1, 0]}[cut.mode]
            axes = [cut.to_world(np.array(wedge, float) / np.linalg.norm(wedge))]
        else:
            axes = []
        while len(axes) < 2:
            u = np.array([rng.gauss(0, 1) for _ in range(3)]); axes.append(u / np.linalg.norm(u))
        tk = 0.024 * R; wob = _radial(seed + 21, 0.035, 2.2)
        for si, ax in enumerate(axes):
            ax = ax + np.array([rng.gauss(0, 0.15) for _ in range(3)]); ax /= np.linalg.norm(ax)
            M = _rot_to(ax, rng.uniform(0, 6.3))
            for k in range(n_er):
                rho = rn * 1.1 + 0.5 * pop + 0.055 * R * (k + 0.5)
                if rho > rmax - 0.06 * R: break
                tm = math.radians(rng.uniform(42, 62)) * (1.0 if si == 0 else 0.7)
                th = np.linspace(0, tm, 22)
                prof = [(rr * math.sin(t), rr * math.cos(t)) for rr, t in zip([rho + tk / 2] * 22, th)]
                prof += [(rho * math.sin(tm + 0.02), rho * math.cos(tm + 0.02))]
                prof += [((rho - tk / 2) * math.sin(t), (rho - tk / 2) * math.cos(t)) for t in th[::-1]]
                Vc, Fc = _lathe(prof, 56)
                d = Vc / (np.linalg.norm(Vc, axis=1)[:, None] + 1e-9)
                Vc = Vc * np.array([wob(u) for u in d])[:, None]
                parts.append(((Vc @ M.T) * (sh / max(sh)) ** 0.5, Fc))
                if si == 0 and k == n_er // 2: A_er = ax * rho
        Ve, Fe = _cat(parts)
        ero = g.obj('er', Ve, Fe, [bio_mat(er, 'organelle')], recalc=True)
        if cut: _boolean(ero, _cutter(g, *cut.box(eps), bio_mat(er, 'section', mottle=0.05)))
    # receptors
    A_rec = None
    if receptors:
        Vt, Ft = _receptor_tpl(receptor_kind, R); Ms, Ts = [], []
        for u in _fib(receptors, rng, 0.08):
            p = surf(u)
            if cut is not None and cut.inside(p, 0.10 * R): continue
            nrm_ = u / sh; nrm_ /= np.linalg.norm(nrm_)
            Ms.append(_rot_to(nrm_, rng.uniform(0, 6.3)) * rng.uniform(0.85, 1.15)); Ts.append(p - 0.01 * R * nrm_)
        if Ts:
            Vr, Fr = _inst(Vt, Ft, Ms, Ts); g.obj('receptors', Vr, Fr, [bio_mat(receptor, 'protein')])
            A_rec = max(Ts, key=lambda p: np.dot(p / np.linalg.norm(p), _az_dir(cut_azimuth - 70, 40)))
    # anchors
    g.a('center', (0, 0, 0)); g.a('top', surf((0, 0, 1)))
    g.a('membrane', surf(_az_dir(cut_azimuth - 60, 25)))
    g.a('membrane_left', surf(_az_dir(cut_azimuth - 90, 5))); g.a('membrane_right', surf(_az_dir(cut_azimuth + 90, 5)))
    if cut:
        if cut.mode == 'octant':
            g.a('cytoplasm', cut.to_world([0.62 * R, -0.62 * R, cut.cz])); g.a('cut_wall', cut.to_world([0.55 * R, 0, cut.cz + 0.45 * R]))
            g.a('nucleus', cut.to_world([0.12 * rn, -0.62 * rn, cut.cz])); g.a('nucleolus', cno)
        else:
            g.a('cytoplasm', cut.to_world([0.6 * R, -0.02, 0])); g.a('cut_wall', cut.to_world([0.6 * R, 0, 0.3 * R]))
            g.a('nucleus', cut.to_world([0.3 * rn, -0.01, 0])); g.a('nucleolus', cno)
        g.a('nuclear_envelope', (0, 0, rn * 0.88))
    else:
        g.a('nucleus', (0, 0, 0)); g.a('nucleolus', cno); g.a('nuclear_envelope', (0, 0, 0.9 * rn * 0.9))
    if A_mito is not None: g.a('mito', A_mito)
    if A_ves is not None: g.a('vesicle', A_ves)
    if A_er is not None: g.a('er', A_er)
    if A_rec is not None: g.a('receptor', A_rec)
    return g.done()


def _az_dir(az, el=0.0):
    a, e = math.radians(az), math.radians(el)
    return np.array([math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)])


def _cut_depth(cut, p):
    """How far p sits toward the open wedge (larger = more exposed)."""
    q = cut.R.T @ np.asarray(p, float); return min(q[0], -q[1]) + (q[2] - cut.cz if cut.mode == 'octant' else 0)


def _shade(h, f):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    return '#' + ''.join('%02x' % max(0, min(255, int(round(v * f)))) for v in c)


def _mix(h1, h2, t):
    a = [int(h1.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)]; b = [int(h2.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)]
    return '#' + ''.join('%02x' % int(round(a[k] * (1 - t) + b[k] * t)) for k in range(3))


# ----------------------------------------------------------------------------------------------- packed cells (Voronoi)
def _vcell(p, half, planes):
    """Convex cell: box p +- half cut by planes [(co, n, tag)] keeping the side n.(x-co) <= 0.
    Returns (V, faces, tags) or None if nothing is left."""
    bm = bmesh.new(); tl = bm.faces.layers.int.new('tag')
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector(tuple(p[k] + 2 * half[k] * v.co[k] for k in range(3)))
    for f in bm.faces: f[tl] = 0
    for co, n, tag in planes:
        cov = np.array([v.co[:] for v in bm.verts]); s = (cov - co) @ n
        if s.max() <= 1e-7: continue
        if s.min() >= -1e-7: bm.free(); return None
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-7,
                               plane_co=tuple(co), plane_no=tuple(n), clear_outer=True)
        be = [e for e in bm.edges if e.is_boundary]
        if be:
            r = bmesh.ops.holes_fill(bm, edges=be, sides=0)
            for f in r['faces']: f[tl] = tag
        if len(bm.verts) < 4: bm.free(); return None
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def _voronoi_build(seeds, group, planes_of, reach, gap, domes, rng, min_in=0.0):
    """Cells for seeds (N,3); neighbours only within the same group id. domes {tag: height} pokes faces of that tag
    outward. Returns list of dicts (V, F, tags, faces info, centroid, seed index)."""
    P = np.asarray(seeds, float); kd = KDTree(len(P))
    for i, p in enumerate(P): kd.insert(Vector(p), i)
    kd.balance(); cells = []
    for i, p in enumerate(P):
        nb = sorted([(d, j) for (_, j, d) in kd.find_range(Vector(p), 1.6 * max(reach)) if j != i and group[j] == group[i]])
        planes = [(0.5 * (P[j] + p) - (P[j] - p) / d * gap / 2, (P[j] - p) / d, 0) for d, j in nb]
        planes += list(planes_of(i))       # nearest neighbours first (keeps the mesh small), then the fixed planes
        bm = _vcell(p, np.asarray(reach) * 1.0, planes)
        if bm is None: continue
        tl = bm.faces.layers.int['tag']
        info = [(np.array(f.calc_center_median()[:]), np.array(f.normal[:]), f[tl], f.calc_area()) for f in bm.faces]
        cen = np.mean([v.co[:] for v in bm.verts], axis=0)
        cov = np.array([v.co[:] for v in bm.verts])
        if min_in > 0 and all(t != 1 for fc, fn, t, a in info) and min(np.dot(fc - cen, fn) for fc, fn, t, a in info) < min_in:
            bm.free(); continue                          # drop slivers (they render as shards on a curved rim)
        for tag, h in domes.items():      # inset + raise: subdivision turns the plateau into a smooth dome
            for f in [f for f in bm.faces if f[tl] == tag]:
                a = f.calc_area()
                if math.sqrt(a) < 2.5 * h: continue       # slivers at a curved boundary stay flat (no spikes)
                bmesh.ops.inset_individual(bm, faces=[f], thickness=0.2 * math.sqrt(a), depth=h * rng.uniform(0.75, 1.25),
                                           use_even_offset=True)
        V = np.array([v.co[:] for v in bm.verts]); Fl = [[v.index for v in f.verts] for f in bm.faces]
        tags = [f[tl] for f in bm.faces]
        cells.append(dict(V=V, F=Fl, tags=tags, info=info, c=cen, pts=cov, i=i)); bm.free()
    return cells


def _cells_mesh(cells, mats_of, rng):
    """Join cells; mats_of(cell) -> (surface_index, cut_index). Faces tagged 1 get the cut material."""
    V, F, fm, r1, r2, off = [], [], [], [], [], 0
    for c in cells:
        si, ci = mats_of(c); a, b = rng.random(), rng.random()
        V.append(c['V']); F += [[k + off for k in f] for f in c['F']]
        fm += [ci if t == 1 else si for t in c['tags']]; r1 += [a] * len(c['F']); r2 += [b] * len(c['F']); off += len(c['V'])
    if not V: raise ValueError('no cells survived: check size, cell_size and the cut plane')
    return np.vstack(V), F, fm, r1, r2


def _nuclei_for(cells, rng, frac=0.55, cut_tag=1, elong=1.7, lift=None):
    """Ellipsoid nuclei for cells that have a cut face, centred so the cut plane slices them."""
    tpls = [_wobbly(3, 1.0, (1, 1, 1), 0.07, rng.randint(0, 10 ** 6))[:2] for _ in range(4)]
    parts, cen = [], []
    for c in cells:
        cuts = [(fc, fn, a) for (fc, fn, t, a) in c['info'] if t == cut_tag]
        if not cuts: continue
        others = [(fc, fn) for (fc, fn, t, a) in c['info'] if t != cut_tag]
        fc, fn, _ = max(cuts, key=lambda x: x[2])
        X = c['pts'] - c['c']; w, U = np.linalg.eigh(X.T @ X); e1 = U[:, -1]
        k = float(np.clip(math.sqrt(max(w[-1], 1e-12) / max(w[-2], 1e-12)), 1.0, elong))
        c0 = c['c'] - fn * np.dot(c['c'] - fc, fn)            # projection onto the cut plane
        rin = min(np.dot(fc2 - c['c'], fn2) for fc2, fn2 in others) if others else 0.2
        r = frac * rin
        cc = c0 - fn * 0.3 * r
        if lift is not None: cc = cc + lift(c)
        dmin = min(np.dot(fc2 - cc, fn2) for fc2, fn2 in others) if others else r
        r = max(0.25 * rin, min(r, 0.85 * dmin / (1 + 0.5 * (k - 1))))
        e1p = e1 - fn * np.dot(e1, fn); e1p = e1p / (np.linalg.norm(e1p) + 1e-9) if np.linalg.norm(e1p) > 1e-3 else e1
        e3 = fn; e2 = np.cross(e3, e1p); e2 /= np.linalg.norm(e2) + 1e-12
        M = np.column_stack([e1p * r * k * rng.uniform(0.9, 1.1), e2 * r * rng.uniform(0.9, 1.1), e3 * r])
        Vt, Ft = tpls[rng.randrange(4)]
        parts.append((r, _inst(Vt, Ft, [M], [cc]))); cen.append(cc)
    if not parts: return [], []
    med = float(np.median([r for r, _ in parts]))
    keep = [(pp, c) for (r, pp), c in zip(parts, cen) if r > 0.55 * med]     # a sliver of a cell gets no nucleus
    return [pp for pp, c in keep], [c for pp, c in keep]


def _halfspace(co, n, eps=0.0, B=40.0):
    """Box occupying n.(x-co) > eps (a cutter that removes everything beyond a plane)."""
    V, F = _box((-B, -B, eps), (B, B, B)); M = _rot_to(n); return V @ M.T + np.asarray(co), F


EPITHELIUM = [dict(thickness=0.55, size=0.30, color='#b8577a', rows=1),     # basal columnar
              dict(thickness=0.55, size=0.36, color='#d9829a', rows=2),     # spinous
              dict(thickness=0.22, size=0.55, color='#eaa9a6', rows=1)]     # flattened superficial


def tissue_slab(size=(4.0, 2.4, 1.0), loc=(0, 0, 0), rot=(0, 0, 0), cell_size=0.4, seed=0, color='#e2929c',
                nucleus='#4f3a8a', var=0.08, layers=None, cut_faces=('front', 'right'), dome=0.12, gap=0.012,
                basement='#d8c49a', basement_h=0.06, bevel=0.2):
    """Block of packed cells. size=(x, y, z) with the block's bottom at loc z and centred in x, y. layers bottom-to-top
    [{thickness, size, color, rows}] (default one layer of `color`). Faces named in cut_faces show sections with
    nuclei; the top is a domed apical surface. Returns (root, anchors)."""
    rng = random.Random(seed); g = _G('tissue', loc, rot)
    W, D, H = size; xlo, xhi, ylo, yhi = -W / 2, W / 2, -D / 2, D / 2
    if layers is None: layers = [dict(thickness=H, size=cell_size, color=color, rows=max(1, round(H / cell_size)))]
    side = {'front': (np.array([0, ylo, 0.]), np.array([0, -1., 0])), 'back': (np.array([0, yhi, 0.]), np.array([0, 1., 0])),
            'left': (np.array([xlo, 0, 0.]), np.array([-1., 0, 0])), 'right': (np.array([xhi, 0, 0.]), np.array([1., 0, 0]))}
    seeds, grp, lay_planes, z0 = [], [], [], basement_h
    for li, L in enumerate(layers):
        th, cs, rows = L['thickness'], L.get('size', cell_size), L.get('rows') or 1
        nx, ny = max(1, round(W / cs)), max(1, round(D / (cs * 0.87)))
        for k in range(rows):
            for j in range(ny):
                for i in range(nx):
                    x = xlo + (i + 0.5 + 0.5 * (j % 2) + rng.uniform(-0.28, 0.28)) * W / nx
                    y = ylo + (j + 0.5 + rng.uniform(-0.28, 0.28)) * D / ny
                    z = z0 + (k + 0.5 + (rng.uniform(-0.22, 0.22) if rows > 1 else 0.0)) * th / rows
                    if x > xhi: x -= W
                    seeds.append((x, y, z)); grp.append(li)
        top = li == len(layers) - 1
        pl = [(np.array([0, 0, z0]), np.array([0, 0, -1.]), 0), (np.array([0, 0, z0 + th]), np.array([0, 0, 1.]), 2 if top else 0)]
        for nm, (co, n) in side.items(): pl.append((co, n, 1 if nm in cut_faces else 0))
        lay_planes.append((pl, cs, th / rows)); z0 += th
    Htot = z0
    reach_of = lambda li: (1.4 * lay_planes[li][1], 1.4 * lay_planes[li][1], 1.2 * max(lay_planes[li][2], 0.5 * lay_planes[li][1]))
    cells = []
    for li in range(len(layers)):
        idx = [i for i in range(len(seeds)) if grp[i] == li]
        sub = [seeds[i] for i in idx]
        cs = _voronoi_build(sub, [0] * len(sub), lambda i, li=li: lay_planes[li][0], reach_of(li), gap * lay_planes[li][1] / 0.4,
                            {2: dome * lay_planes[li][1]} if li == len(layers) - 1 else {}, rng)
        for c in cs: c['layer'] = li
        cells += cs
    mats = []
    for L in layers:
        cl = L.get('color', color); cs = L.get('size', cell_size)
        mats += [bio_mat(cl, 'cell', var=var, mottle=0.05, tex=2.5 / cs), bio_mat(_mix(cl, '#ffffff', 0.18), 'section', var=var, tex=3.0 / cs)]
    V, F, fm, r1, r2 = _cells_mesh(cells, lambda c: (2 * c['layer'], 2 * c['layer'] + 1), rng)
    o = g.obj('cells', V, F, mats, face_mat=fm, rand=r1, rand2=r2, smooth=True)
    _smooth_mods(o, bevel=bevel * min(L.get('size', cell_size) for L in layers), levels=2)
    parts, cen = _nuclei_for(cells, rng)
    if parts:
        Vn, Fn = _cat(parts); nuc = g.obj('nuclei', Vn, Fn, [bio_mat(nucleus, 'nucleus')])
        for nm in cut_faces:
            co, n = side[nm]; _boolean(nuc, _cutter(g, *_halfspace(co, n, 0.004), bio_mat(nucleus, 'section', mottle=0.3, tex=40.0)))
    if basement:
        g.obj('basement', *_box((xlo, ylo, 0.0), (xhi, yhi, basement_h * 0.92)), [bio_mat(basement, 'matte', rough=0.6)], smooth=False)
    g.a('top', (0.1 * W, 0.15 * D, Htot + dome * cell_size * 0.8)); g.a('apical', (-0.25 * W, 0.2 * D, Htot + dome * cell_size * 0.8))
    g.a('front_face', (0, ylo, Htot * 0.5)); g.a('right_face', (xhi, 0, Htot * 0.5)); g.a('corner', (xhi, ylo, Htot))
    g.a('basement', (0, ylo, basement_h * 0.5))
    zz = basement_h
    for li, L in enumerate(layers):
        g.a('layer%d' % li, (-0.2 * W, ylo, zz + L['thickness'] / 2)); zz += L['thickness']
    fr = [c for c in cen if abs(c[1] - ylo) < 0.3 * cell_size]
    if fr: g.a('nucleus', min(fr, key=lambda c: abs(c[0]) + abs(c[2] - Htot / 2)))
    return g.done()


def organoid(loc=(0, 0, 0), rot=(0, 0, 0), radius=1.5, thickness=0.45, n_cells=150, seed=0, color='#e7a07a',
             nucleus='#4f3a8a', lumen_color=None, matrix=None, var=0.1, cutaway=True, cut_azimuth=-50.0, cut_elevation=10.0,
             cut_offset=0.0, gap=0.012, bevel=0.035):
    """Hollow cyst of columnar cells (apical side facing the lumen). cutaway slices it along a plane facing
    (cut_azimuth, cut_elevation) to show the ring of cells, their nuclei and the lumen. Returns (root, anchors)."""
    rng = random.Random(seed); g = _G('organoid', loc, rot)
    Rm = radius - thickness / 2; Rin, Rout = radius - thickness, radius
    U = _fib(n_cells, rng, 0.25 / math.sqrt(n_cells)); S = U * Rm
    a = math.sqrt(4 * math.pi * Rm ** 2 / n_cells)
    ncut = _az_dir(cut_azimuth, cut_elevation)
    planes_of = lambda i: ([(U[i] * Rout, U[i], 2), (U[i] * Rin, -U[i], 3)] +
                           ([(ncut * cut_offset, ncut, 1)] if cutaway else []))
    reach = (max(a, thickness) * 1.3,) * 3
    cells = _voronoi_build(S, [0] * len(S), planes_of, reach, gap, {2: 0.10 * thickness, 3: 0.12 * thickness}, rng, min_in=0.12 * min(a, thickness))
    V, F, fm, r1, r2 = _cells_mesh(cells, lambda c: (0, 1), rng)
    o = g.obj('cells', V, F, [bio_mat(color, 'cell', var=var), bio_mat(_mix(color, '#ffffff', 0.25), 'section', var=var)],
              face_mat=fm, rand=r1, rand2=r2)
    _smooth_mods(o, bevel=bevel * radius, levels=2)
    if cutaway:
        parts, cen = _nuclei_for(cells, rng, frac=0.6, lift=lambda c: 0.12 * thickness * c['c'] / np.linalg.norm(c['c']))
        if parts:
            Vn, Fn = _cat(parts); nuc = g.obj('nuclei', Vn, Fn, [bio_mat(nucleus, 'nucleus')])
            _boolean(nuc, _cutter(g, *_halfspace(ncut * cut_offset, ncut, 0.004), bio_mat(nucleus, 'section', mottle=0.3, tex=40)))
    matrix = matrix or _shade(color, 0.86)
    if matrix:          # extracellular matrix under the cells: fills the grooves so the background never shows through
        Vo, Fo = _ico(4); Vs, Fs = _cat([(Vo * (Rout - 0.3 * thickness), Fo), (Vo * (Rin + 0.3 * thickness), Fo[:, ::-1])])
        ecm = g.obj('matrix', Vs, Fs, [bio_mat(matrix, 'cell', mottle=0.0)])
        if cutaway: _boolean(ecm, _cutter(g, *_halfspace(ncut * cut_offset, ncut, -0.002), bio_mat(matrix, 'section', mottle=0.0)))
    if lumen_color:
        Vl, Fl, _ = _wobbly(3, Rin * 0.6, (1, 1, 1), 0.1, seed + 5); g.obj('lumen', Vl, Fl, [bio_mat(lumen_color, 'cell')])
    g.a('center', (0, 0, 0)); g.a('top', (0, 0, Rout))
    g.a('outer', _az_dir(cut_azimuth - 80, 30) * Rout)
    e = np.cross(ncut, [0, 0, 1.0]); e /= np.linalg.norm(e)
    g.a('lumen', -0.0 * ncut + 0.25 * Rin * np.array([0, 0, 1]) + ncut * cut_offset)
    g.a('cut_face', ncut * cut_offset + (Rin + Rout) / 2 * e)
    if cutaway and cells:
        g.a('nucleus', ncut * cut_offset + Rm * np.cross(e, ncut) * -1)
    return g.done()


def spheroid(loc=(0, 0, 0), rot=(0, 0, 0), radius=1.2, cell_size=0.32, seed=0, color='#8fb8de', nucleus='#3d3a8c',
             matrix=None, var=0.1, cutaway=False, cut_azimuth=-50.0, cut_elevation=10.0, gap=0.012, dome=0.4, bevel=0.15):
    """Solid ball of packed polyhedral cells with domed outer faces. Returns (root, anchors)."""
    rng = random.Random(seed); g = _G('spheroid', loc, rot); R = radius; c = cell_size
    # outer shell of seeds on a sphere (each outer cell is a radial wedge capped by one tangent plane -> one dome),
    # jittered grid inside
    Ro = R - 0.5 * c; n_out = int(4 * math.pi * Ro * Ro / (0.9 * c * c))
    U = _fib(n_out, rng, 0.2 * c / Ro); seeds = [u * Ro for u in U]; outer = len(seeds)
    n = int(R / c) + 2
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            for k in range(-n, n + 1):
                p = np.array([i + rng.uniform(-0.3, 0.3), j + rng.uniform(-0.3, 0.3), k + rng.uniform(-0.3, 0.3)]) * c
                if np.linalg.norm(p) < R - 1.3 * c: seeds.append(p)
    ncut = _az_dir(cut_azimuth, cut_elevation)

    def planes_of(i):
        pl = [(U[i] * R, U[i], 2)] if i < outer else []
        if cutaway: pl.append((np.zeros(3), ncut, 1))
        return pl
    cells = _voronoi_build(seeds, [0] * len(seeds), planes_of, (1.3 * c,) * 3, gap, {2: dome * c}, rng, min_in=0.14 * c)
    if not cutaway: cells = [cl for cl in cells if 2 in cl['tags']]      # interior cells are never seen
    V, F, fm, r1, r2 = _cells_mesh(cells, lambda cl: (0, 1), rng)
    o = g.obj('cells', V, F, [bio_mat(color, 'cell', var=var), bio_mat(_mix(color, '#ffffff', 0.25), 'section', var=var)],
              face_mat=fm, rand=r1, rand2=r2)
    _smooth_mods(o, bevel=bevel * c, levels=2)
    if cutaway:
        parts, cen = _nuclei_for(cells, rng, frac=0.6)
        if parts:
            Vn, Fn = _cat(parts); nuc = g.obj('nuclei', Vn, Fn, [bio_mat(nucleus, 'nucleus')])
            _boolean(nuc, _cutter(g, *_halfspace(np.zeros(3), ncut, 0.004), bio_mat(nucleus, 'section', mottle=0.3, tex=40)))
    matrix = matrix or _shade(color, 0.86)
    if matrix:
        Vo, Fo = _ico(4); ecm = g.obj('matrix', Vo * (R - 0.35 * c), Fo, [bio_mat(matrix, 'cell', mottle=0.0)])
        if cutaway: _boolean(ecm, _cutter(g, *_halfspace(np.zeros(3), ncut, -0.002), bio_mat(matrix, 'section', mottle=0.0)))
    g.a('center', (0, 0, 0)); g.a('top', (0, 0, R)); g.a('surface', _az_dir(cut_azimuth - 80, 30) * R)
    e = np.cross(ncut, [0, 0, 1.0]); e /= np.linalg.norm(e)
    g.a('cut_face', 0.5 * R * e); g.a('nucleus', 0.3 * R * np.cross(e, ncut))
    return g.done()


# ----------------------------------------------------------------------------------------------- lipids, membranes
def _lipid_tpl(rh, Lt, sides=7, pts=7):
    Vh, Fh = _ico(2); Vh = Vh * rh
    tails = []
    for sgn, kink in ((-1, 0.0), (1, 1.0)):
        z = np.linspace(-0.55 * rh, -(0.55 * rh + Lt), pts)
        x = sgn * 0.42 * rh + 0.12 * rh * np.sin(np.linspace(0, 2.5, pts)) * sgn
        if kink: x = x + np.where(z < -(0.55 * rh + 0.45 * Lt), 0.35 * rh * (-(z + 0.55 * rh + 0.45 * Lt) / Lt), 0)
        tails.append(_tube(np.stack([x, np.zeros(pts), z], -1), 0.26 * rh, sides=sides))
    Vt, Ft = _cat(tails)
    return (Vh, Fh), (Vt, _fix(Vt, Ft))


def _tm_protein(kind, T, w, rng):
    """Transmembrane protein in a local frame (z = membrane normal, z=0 mid-bilayer, T bilayer thickness, w radius).
    Returns list of (V, F) parts: helix capsules + globular domains."""
    parts = []
    if kind in ('channel', 'receptor'):
        nh = 6 if kind == 'channel' else 7; ring = 0.62 * w if kind == 'channel' else 0.55 * w
        for k in range(nh):
            a = 2 * math.pi * k / nh + rng.uniform(-0.1, 0.1)
            p = np.array([ring * math.cos(a), ring * math.sin(a), rng.uniform(-0.05, 0.05) * T]) if (kind == 'channel' or k) else np.zeros(3)
            if kind == 'receptor' and k == 0: p = np.zeros(3)
            tilt = np.array([-math.sin(a), math.cos(a), 0]) * 0.22 + np.array([0, 0, 1.0])
            Vc, Fc = _capsule(T * 1.05, 0.22 * w, 16, 10); parts.append(_inst(Vc, Fc, [_rot_to(tilt, a)], [p]))
        if kind == 'channel':
            for zs in (1, -1):
                for k in range(nh):
                    a = 2 * math.pi * (k + 0.5) / nh
                    Vb, Fb = _ico(2); parts.append((Vb * 0.2 * w + [ring * 1.05 * math.cos(a), ring * 1.05 * math.sin(a), zs * (T * 0.62 + 0.1 * w)], Fb))
        else:
            Vb, Fb = _blob_mesh(rng, n=9, r=0.42 * w); parts.append((Vb + [0, 0, T * 0.55 + 0.85 * w], Fb))
            Vb, Fb = _blob_mesh(rng, n=5, r=0.3 * w); parts.append((Vb + [0.1 * w, 0, -T * 0.55 - 0.45 * w], Fb))
    else:
        Vb, Fb = _blob_mesh(rng, n=12, r=0.42 * w, elong=(1, 1, 1.9)); parts.append((Vb, Fb))
    return parts


def _organic(o, voxel, smooth=0.5, iters=5):
    """Voxel-remesh a union of spheres/capsules into one smooth molecular-looking surface."""
    md = o.modifiers.new('remesh', 'REMESH'); md.mode = 'VOXEL'; md.voxel_size = voxel; md.use_smooth_shade = True
    sm = o.modifiers.new('smooth', 'SMOOTH'); sm.factor = smooth; sm.iterations = iters
    return o


def _blob_mesh(rng, n=8, r=0.4, elong=(1, 1, 1), sub=2):
    """Union-of-spheres cluster (cheap protein look, not remeshed)."""
    C, Rr = [np.zeros(3)], [r]
    for k in range(n - 1):
        j = rng.randrange(len(C)); u = np.array([rng.gauss(0, 1) for _ in range(3)]); u /= np.linalg.norm(u)
        rr = r * rng.uniform(0.6, 1.0); C.append(C[j] + u * 0.75 * (Rr[j] + rr) * 0.8); Rr.append(rr)
    C = np.array(C); C -= C.mean(0); C *= np.asarray(elong)
    Vs, Fs = _ico(sub); return _cat([(Vs * rr + c, Fs) for c, rr in zip(C, Rr)])


def membrane_patch(size=(5.0, 3.2), loc=(0, 0, 0), rot=(0, 0, 0), spacing=0.17, thickness=0.62, seed=0,
                   head='#e0773a', tail='#f1dfb4', proteins='default', wave=0.0):
    """Lipid bilayer patch in the xy plane (extracellular side +z) with embedded proteins.
    proteins: 'default', None or [{'kind': 'channel'|'receptor'|'blob', 'pos': (x, y), 'color': hex, 'size': w}].
    Returns (root, anchors)."""
    rng = random.Random(seed); g = _G('membrane', loc, rot); W, D = size; T = thickness
    rh = 0.5 * spacing; Lt = T / 2 - 1.15 * rh
    if proteins == 'default':
        proteins = [dict(kind='channel', pos=(-0.28 * W, 0.05 * D), color='#3a7fc0', size=0.34),
                    dict(kind='receptor', pos=(0.22 * W, -0.05 * D), color='#7b5aa6', size=0.36),
                    dict(kind='blob', pos=(-0.02 * W, 0.28 * D), color='#2f9e7e', size=0.34)]
    proteins = proteins or []
    (Vh, Fh), (Vt, Ft) = _lipid_tpl(rh, Lt)
    zf = lambda x: wave * math.sin(2 * math.pi * x / (0.8 * W))
    dz = lambda x: wave * 2 * math.pi / (0.8 * W) * math.cos(2 * math.pi * x / (0.8 * W))
    Mh, Th = [], []
    ny = int(D / (spacing * 0.866)); nx = int(W / spacing)
    for leaf in (1, -1):
        for j in range(ny):
            for i in range(nx):
                x = -W / 2 + (i + 0.5 + 0.5 * (j % 2)) * spacing + rng.gauss(0, 0.08 * spacing)
                y = -D / 2 + (j + 0.5) * spacing * 0.866 + rng.gauss(0, 0.08 * spacing)
                if abs(x) > W / 2 - 0.3 * spacing: continue
                if any(math.hypot(x - p['pos'][0], y - p['pos'][1]) < p.get('size', 0.35) * 1.05 for p in proteins): continue
                nrm = np.array([-dz(x), 0, 1.0]); nrm /= np.linalg.norm(nrm)
                d = leaf * nrm + np.array([rng.gauss(0, 0.07), rng.gauss(0, 0.07), 0])
                Mh.append(_rot_to(d, rng.uniform(0, 6.3)) * rng.uniform(0.95, 1.05))
                Th.append(np.array([x, y, zf(x)]) + leaf * nrm * (T / 2 - rh))
    Va, Fa = _inst(Vh, Fh, Mh, Th); g.obj('heads', Va, Fa, [bio_mat(head, 'lipid_head')])
    Va, Fa = _inst(Vt, Ft, Mh, Th); g.obj('tails', Va, Fa, [bio_mat(tail, 'lipid_tail')])
    for k, p in enumerate(proteins):
        x, y = p['pos']; w = p.get('size', 0.35)
        parts = _tm_protein(p['kind'], T, w, random.Random(seed * 31 + k))
        Vp, Fp = _cat(parts); Vp = Vp + [x, y, zf(x)]
        _organic(g.obj('protein%d' % k, Vp, Fp, [bio_mat(p.get('color', '#3a7fc0'), 'protein')]), 0.06 * w, 0.7, 8)
        top = {'channel': T * 0.62 + 0.3 * w, 'receptor': T * 0.55 + 1.3 * w, 'blob': 0.9 * w * 1.9}[p['kind']]
        g.a('protein%d' % k, (x, y, zf(x) + top))
    g.a('head_top', (-0.42 * W, -D / 2, T / 2)); g.a('head_bottom', (-0.42 * W, -D / 2, -T / 2))
    g.a('tails', (-0.42 * W, -D / 2, 0)); g.a('extracellular', (0, 0.3 * D, T / 2 + 0.8)); g.a('cytosol', (0, -0.3 * D, -T / 2 - 0.6))
    g.a('corner', (W / 2, -D / 2, T / 2))
    return g.done()


def vesicle(loc=(0, 0, 0), rot=(0, 0, 0), radius=1.2, thickness=0.3, spacing=0.085, seed=0, head='#e0773a',
            tail='#f1dfb4', cutaway='octant', cut_azimuth=-45.0, cargo=40, cargo_color='#d1495b', proteins=8,
            protein_color='#3a7fc0'):
    """Lipid vesicle / liposome built from individual lipids, cut open to show the bilayer and cargo.
    Returns (root, anchors)."""
    rng = random.Random(seed); g = _G('vesicle', loc, rot); R = radius; T = thickness
    rh = 0.5 * spacing; Lt = T / 2 - 1.15 * rh
    cut = _Cut(cutaway, cut_azimuth, 0.0) if cutaway else None
    (Vh, Fh), (Vt, Ft) = _lipid_tpl(rh, Lt, sides=6, pts=6)
    PU = _fib(proteins, rng, 0.2) if proteins else np.zeros((0, 3))
    pw = 0.13 * R
    keep_p = [u for u in PU if cut is None or not cut.inside(u * R, pw)]
    Mh, Th = [], []
    for leaf, rr in ((1, R - rh), (-1, R - T + rh)):
        n = int(4 * math.pi * rr * rr / (0.866 * spacing * spacing) * 0.92)
        for u in _fib(n, rng, 0.25 * spacing / rr):
            p = u * rr
            if cut is not None and cut.inside(p, -0.0): continue
            if any(np.dot(u, q) > math.cos(pw * 1.1 / R) for q in keep_p): continue
            d = leaf * u + np.array([rng.gauss(0, 0.06) for _ in range(3)])
            Mh.append(_rot_to(d, rng.uniform(0, 6.3))); Th.append(p)
    Va, Fa = _inst(Vh, Fh, Mh, Th); g.obj('heads', Va, Fa, [bio_mat(head, 'lipid_head')])
    Va, Fa = _inst(Vt, Ft, Mh, Th); g.obj('tails', Va, Fa, [bio_mat(tail, 'lipid_tail')])
    A_prot = None
    if keep_p:
        parts = []
        for k, u in enumerate(keep_p):
            kind = ['receptor', 'channel', 'blob'][k % 3]
            Vp, Fp = _cat(_tm_protein(kind, T, pw, random.Random(seed * 7 + k)))
            parts.append(_inst(Vp, Fp, [_rot_to(u, rng.uniform(0, 6.3))], [u * (R - T / 2)]))
            if A_prot is None or np.dot(u, _az_dir(cut_azimuth - 40, 35)) > np.dot(A_prot / R, _az_dir(cut_azimuth - 40, 35)):
                A_prot = u * (R + 0.2 * R)
        Vp, Fp = _cat(parts); _organic(g.obj('proteins', Vp, Fp, [bio_mat(protein_color, 'protein')]), 0.06 * pw, 0.7, 8)
    A_cargo = None
    if cargo:
        parts = []
        for k in range(cargo):
            for _ in range(50):
                p = np.array([rng.uniform(-1, 1) for _ in range(3)]) * (R - T - 0.1 * R)
                if np.linalg.norm(p) < R - T - 0.1 * R and (cut is None or not cut.inside(p, 0.04 * R)): break
            Vb, Fb = _blob_mesh(rng, n=rng.randint(2, 4), r=0.05 * R, sub=2); parts.append((Vb + p, Fb))
            if A_cargo is None or (cut is not None and _cut_depth(cut, p) > _cut_depth(cut, A_cargo)): A_cargo = p
        Vc, Fc = _cat(parts); g.obj('cargo', Vc, Fc, [bio_mat(cargo_color, 'protein')])
    g.a('center', (0, 0, 0)); g.a('top', (0, 0, R))
    g.a('outer_leaflet', _az_dir(cut_azimuth - 75, 30) * R)
    if cut:
        g.a('bilayer_cut', cut.to_world([R - T / 2, -0.0, 0.45 * R]) if cut.mode != 'half' else cut.to_world([0.7 * R, 0, 0.3 * R]))
        g.a('inner_leaflet', cut.to_world([(R - T) * 0.62, 0.0, (R - T) * 0.62]))
        g.a('lumen', cut.to_world([0.35 * R, -0.35 * R, 0.0]))
    if A_cargo is not None: g.a('cargo', A_cargo)
    if A_prot is not None: g.a('protein', A_prot)
    return g.done()


liposome = vesicle


def virus(loc=(0, 0, 0), rot=(0, 0, 0), radius=1.0, spikes=48, spike_len=0.32, seed=0, envelope='#c6ccd6',
          spike='#d1495b', mprotein='#e8a33d', n_mprot=120):
    """Enveloped virus-like particle: bumpy envelope, club-shaped trimeric spikes, small envelope proteins."""
    rng = random.Random(seed); g = _G('virus', loc, rot); R = radius
    V, F, rf = _wobbly(5, R, (1, 1, 1), 0.025, seed, 3.0)
    g.obj('envelope', V, F, [bio_mat(envelope, 'membrane', tex=14.0, bump=0.25, mottle=0.12)])
    # spike template: stalk + three-lobed head
    parts = [(lambda VF: (VF[0] + [0, 0, 0.45 * spike_len * R], VF[1]))(_capsule(0.5 * spike_len * R, 0.035 * R, 12, 8))]
    for k in range(3):
        a = 2 * math.pi * k / 3; p = np.array([0.045 * R * math.cos(a), 0.045 * R * math.sin(a), 0.93 * spike_len * R])
        Vc, Fc = _capsule(0.12 * spike_len * R, 0.058 * R, 14, 10)
        tl = np.array([0.35 * math.cos(a), 0.35 * math.sin(a), 1.0]); parts.append(_inst(Vc, Fc, [_rot_to(tl)], [p]))
    Vt, Ft = _cat(parts); Ms, Ts = [], []
    for u in _fib(spikes, rng, 0.1):
        Ms.append(_rot_to(u + np.array([rng.gauss(0, 0.12) for _ in range(3)]), rng.uniform(0, 6.3)) * rng.uniform(0.9, 1.1))
        Ts.append(u * rf(u) * R * 0.98)
    Vs, Fs = _inst(Vt, Ft, Ms, Ts); g.obj('spikes', Vs, Fs, [bio_mat(spike, 'protein')])
    Vb, Fb = _ico(2); Ms, Ts2 = [], []
    for u in _fib(n_mprot, rng, 0.2):
        Ms.append(np.eye(3) * 0.045 * R * rng.uniform(0.8, 1.2)); Ts2.append(u * rf(u) * R * 1.0)
    Vm, Fm = _inst(Vb, Fb, Ms, Ts2); g.obj('mproteins', Vm, Fm, [bio_mat(mprotein, 'protein')])
    view = _az_dir(-120, 35)
    best = max(range(len(Ts)), key=lambda i: np.dot(Ts[i] / R, view))
    g.a('center', (0, 0, 0)); g.a('top', (0, 0, R * (1 + spike_len)))
    g.a('spike', Ts[best] / np.linalg.norm(Ts[best]) * R * (1 + spike_len))
    g.a('envelope', _az_dir(-10, 20) * R)
    return g.done()


def nanoparticle(loc=(0, 0, 0), rot=(0, 0, 0), radius=0.6, core='#e0b24a', core_preset='gold', seed=0,
                 corona=('#3a7fc0', '#d1495b', '#2f9e7e', '#e8a33d'), n_proteins=36, protein_size=0.16, peg=0,
                 peg_color='#9aa7b4'):
    """Core particle (gold by default; core_preset='silica' or any preset) with an adsorbed protein corona and
    optional PEG chains (peg=count)."""
    rng = random.Random(seed); g = _G('nanoparticle', loc, rot); R = radius
    Vc, Fc = _ico(5); g.obj('core', Vc * R, Fc, [bio_mat(core, core_preset)])
    tpls = [_blob_mesh(random.Random(seed * 13 + k), n=rng.randint(4, 8), r=0.5 * protein_size) for k in range(6)]
    per = {c: [] for c in corona}; A_c = None
    for k, u in enumerate(_fib(n_proteins, rng, 0.15)):
        V, F = tpls[k % 6]; cl = corona[rng.randrange(len(corona))]
        M = np.array(Quaternion([rng.gauss(0, 1) for _ in range(4)]).normalized().to_matrix()) * rng.uniform(0.8, 1.25)
        p = u * (R + 0.35 * protein_size); per[cl].append(_inst(V, F, [M], [p]))
        if A_c is None or np.dot(u, _az_dir(-130, 30)) > np.dot(A_c, _az_dir(-130, 30)): A_c = u
    for k, (cl, parts) in enumerate(per.items()):
        if parts: Vp, Fp = _cat(parts); g.obj('corona%d' % k, Vp, Fp, [bio_mat(cl, 'protein')])
    if peg:
        parts = []
        for u in _fib(peg, rng, 0.2):
            t = np.linspace(0, 1, 18); L = rng.uniform(0.35, 0.55) * R
            side = np.cross(u, [rng.gauss(0, 1) for _ in range(3)]); side /= np.linalg.norm(side)
            P = u[None] * (R + L * t[:, None]) + side[None] * (0.04 * R * np.sin(t * 14 + rng.uniform(0, 6)))[:, None]
            parts.append(_tube(P, 0.012 * R, sides=6))
        Vg, Fg = _cat(parts); g.obj('peg', Vg, Fg, [bio_mat(peg_color, 'protein')], recalc=True)
        g.a('peg', _az_dir(-10, 40) * (R * 1.45))
    g.a('center', (0, 0, 0)); g.a('top', (0, 0, R + protein_size)); g.a('core', _az_dir(-90, 5) * R)
    g.a('corona', A_c * (R + protein_size))
    return g.done()


# ----------------------------------------------------------------------------------------------- microbes, molecules
def bacterium(loc=(0, 0, 0), rot=(0, 0, 0), length=1.6, radius=0.34, bend=0.08, seed=0, color='#7cb36a',
              pili=70, pilus_color=None, flagella=1, flagellum_color='#4e6b3a', flagellum_len=2.6):
    """Rod-shaped bacterium along x (poles at +-x) with pili and helical flagella from the -x pole."""
    rng = random.Random(seed); g = _G('bacterium', loc, rot); r = radius; L = length
    V, F = _capsule(L, r, 64, 36, bend=0.0)
    f = _radial(seed, 0.02, 3.0); V = V * np.array([f(v) for v in V / (np.linalg.norm(V, axis=1)[:, None] + 1e-9)])[:, None]
    V = V[:, [2, 1, 0]] * [1, 1, 1]; V[:, 2] += bend * (1 - (V[:, 0] / (L / 2 + r)) ** 2) * r * 2
    F = F[:, ::-1]
    g.obj('body', V, F, [bio_mat(color, 'cell', tex=6.0)])

    def surf_pt(s, a):     # s in [-1,1] along the axis, a angle
        x = s * (L / 2); nrm = np.array([0, math.cos(a), math.sin(a)])
        z_off = bend * (1 - (x / (L / 2 + r)) ** 2) * r * 2
        return np.array([x, 0, z_off]) + nrm * r, nrm
    parts = []
    for k in range(pili):
        p, nrm = surf_pt(rng.uniform(-1, 1), rng.uniform(0, 2 * math.pi))
        ln = rng.uniform(0.07, 0.16) * L; bendv = np.array([rng.gauss(0, 1) for _ in range(3)]) * 0.5
        t = np.linspace(0, 1, 10)[:, None]
        P = p - nrm * 0.01 * L + nrm * ln * t + bendv * ln * t ** 2
        parts.append(_tube(P, 0.0055 * L, sides=6))
    if parts:
        Vp, Fp = _cat(parts); g.obj('pili', Vp, Fp, [bio_mat(pilus_color or _shade(color, 0.8), 'protein')], recalc=True)
    parts = []; tip = None
    for k in range(flagella):
        p0 = np.array([-(L / 2 + r * 0.95), 0, 0]) + np.array([0, rng.gauss(0, 0.08), rng.gauss(0, 0.08)]) * r
        t = np.linspace(0, 1, 260); amp = 0.16 * r * 2 * np.clip(t * 8, 0, 1); w = 2 * math.pi * 5.5
        dirv = np.array([-1.0, rng.gauss(0, 0.15), rng.gauss(0, 0.15)]); dirv /= np.linalg.norm(dirv)
        M = _rot_to(dirv)
        P = p0 + (np.stack([amp * np.cos(w * t), amp * np.sin(w * t), t * flagellum_len * L], -1) @ M.T)
        parts.append(_tube(P, 0.014 * L, sides=8)); tip = tip if tip is not None else P[-1]
    if parts:
        Vf, Ff = _cat(parts); g.obj('flagella', Vf, Ff, [bio_mat(flagellum_color, 'protein')], recalc=True)
    g.a('body', surf_pt(0.1, -math.pi / 2 - 0.3)[0]); g.a('pole', (L / 2 + r, 0, 0)); g.a('pole_back', (-(L / 2 + r), 0, 0))
    g.a('top', (0, 0, r + 2 * bend * r)); g.a('pilus', surf_pt(0.5, math.pi / 2 - 0.2)[0] * 1.0 + np.array([0, 0, 0.12 * L]))
    if tip is not None: g.a('flagellum_tip', tip)
    return g.done()


BASE_COLORS = {'A': '#d1495b', 'T': '#edae49', 'G': '#00798c', 'C': '#66a182'}


def dna_helix(loc=(0, 0, 0), rot=(0, 0, 0), n_bp=24, radius=1.0, rise=0.34, bp_per_turn=10.5, groove=150.0,
              seed=0, sequence=None, strand1='#30638e', strand2='#8e5aa8', base_colors=None, beads=True):
    """B-DNA along +x from loc: two backbones separated by `groove` degrees (minor groove), base pairs as
    two-coloured rods (A-T, G-C). Units: radius 1 = 1 nm."""
    rng = random.Random(seed); g = _G('dna', loc, rot); bc = dict(BASE_COLORS, **(base_colors or {}))
    seq = sequence or ''.join(rng.choice('ATGC') for _ in range(n_bp)); n = len(seq)
    comp = {'A': 'T', 'T': 'A', 'G': 'C', 'C': 'G'}
    Rb = radius; dth = 2 * math.pi / bp_per_turn; gr = math.radians(groove)

    def pt(th, x, rr=Rb): return np.array([x, rr * math.cos(th), rr * math.sin(th)])
    ts = np.linspace(-0.5, n - 0.5, n * 12)
    P1 = np.array([pt(t * dth, t * rise) for t in ts]); P2 = np.array([pt(t * dth + gr, t * rise) for t in ts])
    g.obj('backbone1', *_tube(P1, 0.14 * Rb, sides=14), [bio_mat(strand1, 'protein')], recalc=True)
    g.obj('backbone2', *_tube(P2, 0.14 * Rb, sides=14), [bio_mat(strand2, 'protein')], recalc=True)
    rods = {k: [] for k in 'ATGC'}; beadp = ([], [])
    for i, b in enumerate(seq):
        a1, a2 = pt(i * dth, i * rise, Rb * 0.95), pt(i * dth + gr, i * rise, Rb * 0.95)
        mid = 0.5 * (a1 + a2) + np.array([0, 0, 0]) * 0
        for (p, q, base) in ((a1, mid, b), (mid, a2, comp[b])):
            d = q - p; Vc, Fc = _capsule(np.linalg.norm(d) - 0.05 * Rb, 0.075 * Rb, 12, 8)
            rods[base].append(_inst(Vc, Fc, [_rot_to(d)], [(p + q) / 2]))
        if beads:
            beadp[0].append(pt(i * dth, i * rise)); beadp[1].append(pt(i * dth + gr, i * rise))
    for base, parts in rods.items():
        if parts: V, F = _cat(parts); g.obj('base_' + base, V, F, [bio_mat(bc[base], 'protein')])
    if beads:
        Vb, Fb = _ico(2)
        for k, (pts, cl) in enumerate(zip(beadp, (strand1, strand2))):
            V, F = _inst(Vb, Fb, [np.eye(3) * 0.2 * Rb] * len(pts), pts)
            g.obj('phosphate%d' % (k + 1), V, F, [bio_mat(_shade(cl, 1.15), 'protein')])
    i = n // 2
    g.a('start', (0, 0, 0)); g.a('end', ((n - 1) * rise, 0, 0)); g.a('axis_mid', (i * rise, 0, 0))
    g.a('backbone1', pt(i * dth, i * rise) * [1, 1.15, 1.15]); g.a('backbone2', pt(i * dth + gr, i * rise) * [1, 1.15, 1.15])
    g.a('base_pair', 0.5 * (pt(i * dth, i * rise) + pt(i * dth + gr, i * rise)))
    g.a('minor_groove', pt(i * dth + gr / 2, i * rise, Rb * 1.1)); g.a('major_groove', pt(i * dth + gr / 2 + math.pi, i * rise, Rb * 1.1))
    return g.done()


def protein_blob(loc=(0, 0, 0), rot=(0, 0, 0), size=1.0, n=14, seed=0, color='#3a7fc0', elong=(1, 1, 1),
                 smooth=0.5, voxel=0.025):
    """Smooth globular protein: seeded union of spheres, voxel-remeshed and relaxed (one hero object)."""
    rng = random.Random(seed); g = _G('protein', loc, rot)
    V, F = _blob_mesh(rng, n=n, r=0.3 * size, elong=elong, sub=3)
    fine = []                       # atom-scale lumps over the domains: a molecular-surface texture
    Vi, Fi = _ico(2)
    for k in range(int(n * 9)):
        c = V[rng.randrange(len(V))]; fine.append((Vi * 0.09 * size * rng.uniform(0.7, 1.2) + c * 0.98, Fi))
    V, F = _cat([(V, F)] + fine)
    o = g.obj('protein', V, F, [bio_mat(color, 'protein', tex=10.0 / size)])
    md = o.modifiers.new('remesh', 'REMESH'); md.mode = 'VOXEL'; md.voxel_size = voxel * size; md.use_smooth_shade = True
    sm = o.modifiers.new('smooth', 'SMOOTH'); sm.factor = smooth; sm.iterations = 6
    zt = V[:, 2].max()
    g.a('center', (0, 0, 0)); g.a('top', (0, 0, zt))
    return g.done()


# ----------------------------------------------------------------------------------------------- lab vessels
def microtube(loc=(0, 0, 0), rot=(0, 0, 0), height=3.0, liquid='#e0607e', fill=0.45, lid='open', lid_angle=115.0,
              plastic='#f3f1ea', seed=0):
    """1.5 mL microcentrifuge tube standing on loc (tip at loc), with liquid to `fill` of the body height and the
    lid 'open' (hinged back by lid_angle) or 'closed'. Returns (root, anchors)."""
    g = _G('microtube', loc, rot, height / 40.0)          # model in millimetres
    out = [(0, 0), (0.7, 0.08), (1.3, 0.5), (1.75, 1.4), (5.0, 17.8), (5.35, 19.2), (5.4, 37.2), (6.1, 37.4),
           (6.15, 39.8), (6.0, 40.0)]
    inn = [(4.62, 40.0), (4.62, 19.4), (4.3, 18.3), (1.1, 2.3), (0.6, 1.25), (0, 0.9)]
    V, F = _lathe(out + inn); pm = bio_mat(plastic, 'plastic_frosted')
    g.obj('tube', V, F, [pm], recalc=True)
    rin = lambda z: np.interp(z, [0.9, 1.25, 2.3, 18.3, 19.4, 40.0], [0, 0.6, 1.1, 4.3, 4.62, 4.62])
    zf = 1.0 + fill * 38.0
    zs = [z for z in (1.3, 2.3, 6, 10, 14, 18.3, 19.4, 25, 30, 35) if z < zf - 0.2]
    prof = [(0, 1.0)] + [(max(0.0, rin(z) - 0.06), z) for z in zs] + [(rin(zf) - 0.06, zf), (rin(zf) * 0.7, zf - 0.25), (0, zf - 0.35)]
    V, F = _lathe(prof); g.obj('liquid', V, F, [bio_mat(liquid, 'liquid')], recalc=True)
    # lid: disc + plug + tab, hinge on +x side
    lid_parts = [_lathe([(0, 41.2), (6.3, 41.2), (6.4, 40.0), (6.3, 39.9), (4.55, 39.9), (4.5, 37.6), (4.1, 37.5),
                         (4.1, 39.6), (0, 39.6)])]
    Vb, Fb = _box((-9.2, -1.8, 40.2), (-6.0, 1.8, 41.0)); lid_parts.append((Vb, _tri(Fb)))
    Vl, Fl = _cat(lid_parts)
    hinge = np.array([6.9, 0, 40.2])
    if lid == 'open':
        a = math.radians(lid_angle); Ry = np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])
        Vl = (Vl - hinge) @ Ry.T + hinge
    g.obj('lid', Vl, Fl, [pm], recalc=True)
    ts = np.linspace(0, 1, 12)
    lid_edge = np.array([6.35, 0, 40.6]) if lid != 'open' else ((np.array([6.35, 0, 40.6]) - hinge) @ Ry.T + hinge)
    P = np.array([(1 - t) ** 2 * np.array([6.1, 0, 39.0]) + 2 * t * (1 - t) * (hinge + [0.9, 0, 0.2]) + t ** 2 * lid_edge for t in ts])
    g.obj('hinge', *_tube(P, 0.5, sides=10, flat=0.45, n0=[0, 1, 0]), [pm], recalc=True)
    g.a('liquid', (0, -rin(zf * 0.6), zf * 0.6)); g.a('tip', (0, 0, 0)); g.a('rim', (-6.1, 0, 40)); g.a('body', (0, -5.4, 28))
    g.a('lid', tuple(Vl.mean(0)))
    return g.done()


def _tri(F):
    F = np.asarray(F)
    if F.shape[1] == 3: return F
    return np.vstack([F[:, [0, 1, 2]], F[:, [0, 2, 3]]])


def petri_dish(loc=(0, 0, 0), rot=(0, 0, 0), radius=2.0, agar='#e2c27e', colonies=('#f4ead2',), n_colonies=40,
               seed=0, lid=None, plastic='#eef3f6'):
    """90 mm Petri dish (radius in scene units) with agar and seeded colonies; colonies = list of colours (one colour
    per strain, e.g. ('#f4ead2', '#c0392b')). lid=None | 'beside'. Returns (root, anchors)."""
    rng = random.Random(seed); g = _G('petri', loc, rot, radius / 45.0)
    base = [(0, 0), (44.6, 0), (45.0, 0.4), (45.0, 14.0), (44.2, 14.0), (44.2, 1.0), (0, 1.0)]
    pm = bio_mat(plastic, 'plastic_clear'); V, F = _lathe(base, 120); g.obj('dish', V, F, [pm], recalc=True)
    V, F = _lathe([(0, 1.05), (44.1, 1.05), (44.1, 7.4), (43.2, 6.4), (41.0, 6.05), (0, 6.0)], 120)
    g.obj('agar', V, F, [bio_mat(agar, 'agar')], recalc=True)
    Vd, Fd = _lathe([(0, 1.0), (0.45, 0.93), (0.8, 0.7), (0.97, 0.35), (1.03, 0.05), (1.0, -0.2), (0, -0.2)], 28)
    per = {c: ([], []) for c in colonies}; placed = []
    for k in range(n_colonies * 30):
        if len(placed) >= n_colonies: break
        rc = min(4.0, 0.9 + rng.lognormvariate(0, 0.5) * 1.2)
        rr = 38.0 * math.sqrt(rng.random()); a = rng.uniform(0, 2 * math.pi); x, y = rr * math.cos(a), rr * math.sin(a)
        if any(math.hypot(x - px, y - py) < rc + pr + 0.4 for px, py, pr in placed): continue
        placed.append((x, y, rc)); cl = colonies[rng.randrange(len(colonies))]
        M = np.diag([rc, rc * rng.uniform(0.93, 1.07), rc * rng.uniform(0.28, 0.42)]) @ _rz(rng.uniform(0, 6.3))
        per[cl][0].append(M); per[cl][1].append((x, y, 6.0))
    for k, (cl, (Ms, Ts)) in enumerate(per.items()):
        if Ts: Vc, Fc = _inst(Vd, _fix(Vd, Fd), Ms, Ts); g.obj('colonies%d' % k, Vc, Fc, [bio_mat(cl, 'colony')])
    if lid == 'beside':
        V, F = _lathe([(0, 9.0), (46.4, 9.0), (46.9, 8.6), (46.9, 0.0), (46.1, 0.0), (46.1, 8.0), (0, 8.0)], 120)
        V = V + [100.0, 18.0, 0.0]; g.obj('lid', V, F, [pm], recalc=True); g.a('lid', (100.0, 18.0 - 46.9, 5.0))
    g.a('dish', (0, -45.0, 7.0)); g.a('agar', (-20.0, -30.0, 6.0)); g.a('rim', (0, 45.0, 14.0))
    if placed:
        x, y, rc = min(placed, key=lambda p: p[1] - 0.3 * p[0]); g.a('colony', (x, y, 6.0 + 0.35 * rc))
    return g.done()


PLATES = {6: (2, 3, 39.12, 24.76, 23.16, 17.4, 17.4), 12: (3, 4, 26.0, 24.94, 16.79, 11.05, 17.5),
          24: (4, 6, 19.3, 17.05, 13.67, 8.0, 17.4), 48: (6, 8, 13.08, 18.16, 10.08, 5.6, 17.4),
          96: (8, 12, 9.0, 14.38, 11.24, 3.43, 10.7), 384: (16, 24, 4.5, 12.13, 8.99, 1.85, 11.5)}


def well_plate(loc=(0, 0, 0), rot=(0, 0, 0), wells=96, length=4.0, well_colors='#f2a7b6', fill=0.8, plastic='clear',
               seed=0, empty_color=None):
    """Multiwell plate (ANSI footprint 127.8 x 85.5 mm scaled to `length` along x), A1 at back-left (-x, +y), modelled
    as a moulded plate: thin top deck, thin-walled wells, skirt. well_colors: one hex | callable(row, col) -> hex
    or None | dict {'A1': hex} | 2D list; None = empty. plastic: 'clear' | 'white' | 'black'. Returns (root, anchors)."""
    g = _G('plate', loc, rot, length / 127.76)
    nr, nc, pitch, ox, oy, rw, depth = PLATES[wells]; Lp, Wp, Hp = 127.76, 85.48, 14.35
    wall, deck, sk = 0.9, 1.6, 1.3
    # clear: low IOR + a little diffuse, so it reads as thin clear plastic (real IOR turns wells into mirrors)
    pmat = {'clear': bio_mat('#eef2f6', 'plastic_clear', rough=0.1, ior=1.15, trans=0.82), 'white': bio_mat('#e3e6e9', 'plastic_white'),
            'black': bio_mat('#262a2e', 'matte', rough=0.4)}[plastic]
    Vd, Fd = _box((-Lp / 2 + sk * 0.5, -Wp / 2 + sk * 0.5, Hp - deck), (Lp / 2 - sk * 0.5, Wp / 2 - sk * 0.5, Hp))
    dmat = bio_mat('#dde4ea', 'plastic_clear', rough=0.18, ior=1.2, trans=0.6) if plastic == 'clear' else pmat
    o = g.obj('deck', Vd, _tri(Fd), [dmat], smooth=False)
    centers = {}
    for i in range(nr):
        for j in range(nc):
            centers[(i, j)] = (-Lp / 2 + ox + j * pitch, Wp / 2 - oy - i * pitch)
    Vcy, Fcy = _lathe([(0, Hp - deck - 1), (rw, Hp - deck - 1), (rw, Hp + 1), (0, Hp + 1)], 48); Fcy = _fix(Vcy, Fcy)
    Vh, Fh = _cat([(Vcy + [x, y, 0], Fcy) for (x, y) in centers.values()])
    _boolean(o, _cutter(g, Vh, Fh, pmat, 'holes'))
    zb = Hp - depth
    Vw, Fw = _lathe([(0, zb - wall), (rw + wall * 0.8, zb - wall), (rw + wall, zb - wall * 0.3), (rw + wall, Hp - deck - 0.01),
                     (rw, Hp - deck - 0.01), (rw, zb + 0.3), (rw - 0.3, zb), (0, zb)], 48)
    Fw = _fix(Vw, Fw)
    Vw2, Fw2 = _cat([(Vw + [x, y, 0], Fw) for (x, y) in centers.values()]); g.obj('wells', Vw2, Fw2, [pmat])
    skirt = []
    for lo, hi in [((-Lp / 2, -Wp / 2, 0), (Lp / 2, -Wp / 2 + sk, Hp)), ((-Lp / 2, Wp / 2 - sk, 0), (Lp / 2, Wp / 2, Hp)),
                   ((-Lp / 2, -Wp / 2 + sk, 0), (-Lp / 2 + sk, Wp / 2 - sk, Hp)), ((Lp / 2 - sk, -Wp / 2 + sk, 0), (Lp / 2, Wp / 2 - sk, Hp))]:
        V, F = _box(lo, hi); skirt.append((V, _tri(F)))
    V, F = _cat(skirt); sko = g.obj('skirt', V, F, [pmat], smooth=False)
    bv = sko.modifiers.new('bev', 'BEVEL'); bv.width = 0.4; bv.segments = 2
    names = 'ABCDEFGHIJKLMNOP'

    def colour(i, j):
        wc = well_colors
        if wc is None: return empty_color
        if isinstance(wc, str): return wc
        if callable(wc): return wc(i, j)
        if isinstance(wc, dict): return wc.get('%s%d' % (names[i], j + 1), empty_color)
        return wc[i][j]
    per = {}
    zl = zb + 0.05; zt = zl + fill * (depth - deck - 0.3); rl = rw - 0.05
    Vl, Fl = _lathe([(0, zl), (rl - 0.3, zl), (rl, zl + 0.3), (rl, zt), (0.85 * rl, zt - 0.08 * rl), (0.5 * rl, zt - 0.12 * rl),
                     (0, zt - 0.13 * rl)], 40)
    Fl = _fix(Vl, Fl)
    for (i, j), (x, y) in centers.items():
        cl = colour(i, j)
        if cl: per.setdefault(cl, []).append((Vl + [x, y, 0], Fl))
    for k, (cl, parts) in enumerate(per.items()):
        V, F = _cat(parts); g.obj('liquid%d' % k, V, F, [bio_mat(cl, 'liquid', trans=0.55, sss=0.45, sss_scale=0.8, rough=0.05)])
    for (i, j), (x, y) in centers.items():
        if (i, j) in ((0, 0), (0, nc - 1), (nr - 1, 0), (nr - 1, nc - 1)) or j == 0:
            g.a('%s%d' % (names[i], j + 1), (x, y, Hp))
    g.a('plate', (0, -Wp / 2, Hp / 2)); g.a('corner', (Lp / 2, -Wp / 2, Hp))
    return g.done()


def pipette_tip(loc=(0, 0, 0), rot=(0, 0, 0), length=3.0, color='#f1efe6', liquid=None, fill=0.25, droplet=False,
                seed=0):
    """Pipette tip standing with its point at loc (z up). color: '#f1efe6' natural, '#f2cf4a' 200 uL yellow,
    '#4f8fd6' 1000 uL blue. liquid = hex to draw liquid in the lower `fill` of the tip; droplet adds a hanging drop."""
    g = _G('tip', loc, rot, length / 51.0)
    out = [(0.42, 0.0), (0.55, 2.0), (2.35, 33.5), (2.75, 35.5), (2.95, 39.5), (3.25, 40.2), (3.25, 41.0), (3.05, 41.4),
           (3.55, 44.5), (3.6, 50.6), (3.5, 51.0)]
    inn = [(3.12, 51.0), (3.1, 44.5), (2.6, 40.0), (2.35, 36.0), (1.95, 33.5), (0.25, 1.0), (0.22, 0.0)]
    V, F = _lathe(out + inn, 64); g.obj('tip', V, F, [bio_mat(color, 'plastic_frosted', rough=0.22)], recalc=True)
    if liquid:
        zf = 0.5 + fill * 33.0; rz = lambda z: np.interp(z, [0, 1.0, 33.5], [0.22, 0.25, 1.95]) - 0.04
        prof = [(0, 0.05)] + [(rz(z), z) for z in np.linspace(0.05, zf, 8)] + [(rz(zf) * 0.6, zf - 0.12), (0, zf - 0.16)]
        V, F = _lathe(prof, 48); g.obj('liquid', V, F, [bio_mat(liquid, 'liquid')], recalc=True)
        g.a('liquid', (0, -rz(zf / 2) - 0.2, zf / 2))
        if droplet:
            Vd, Fd = _ico(4); Vd = Vd * [1.2, 1.2, 1.35] + [0, 0, -1.2]
            g.obj('droplet', Vd, Fd, [bio_mat(liquid, 'liquid')]); g.a('droplet', (0, 0, -2.5))
    g.a('tip', (0, 0, 0)); g.a('collar', (0, -3.6, 47.0)); g.a('body', (0, -1.4, 20.0))
    return g.done()
