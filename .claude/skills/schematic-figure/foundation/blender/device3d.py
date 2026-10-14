"""Devices and materials: 3D hero objects for Nature-style figures, rendered headless in Blender on top of scene.py.

Usage from a figure's render script (figure/render3d.py):
    import sys; sys.path.insert(0, '<project>/blender'); from device3d import *      # re-exports scene.py too
    S = setup(width_px=1800, height_px=1200, samples=64)
    objs, A = layer_stack([dict(thickness=0.35, color='#6d7686', kind='semiconductor', label='Si'),
                           dict(thickness=0.12, color='#d9d4e6', kind='oxide', label='SiO2'),
                           dict(thickness=0.03, color='#30343b', kind='graphene', label='graphene', lattice='honeycomb')],
                          footprint=(3.0, 2.0), exploded=0.25, cut='step')
    studio(scale=1.0); camera_look(loc=(4, -8, 5.5), target=(0, 0, 0.3), lens_mm=50)
    finish(S, 'figure/art/stack.png', anchors=A)
Run: blender -b --factory-startup -P figure/render3d.py   (Blender 4.2+ / 5.x, Cycles on a GPU when present, else the CPU; the demo
scenes take 20-45 s at 1600x1100 px, 64 samples on a 32-thread CPU)

Contract. Every builder takes hex colours, an explicit `seed` wherever it draws random numbers, `loc` (the base
centre, z up) and `prefix` (prepended to anchor names), and returns (objects, anchors): anchors maps a name to a 3D
point on the visible surface of that part (for step-cut stacks the exposed terrace, otherwise the front-right edge
or face), ready for finish(..., anchors=A), which writes their pixel positions for leader lines in figure.js.
Merge anchor dicts of several builders with {**A1, **A2} (use prefixes to keep names apart).

Materials: material(kind, color) with kinds metal, gold, copper, aluminium, lithium, steel (satin metals),
oxide, ceramic (matte), semiconductor (silicon-like satin), graphene (dark sheet), carbon (matte black), polymer
(translucent), separator, electrolyte, glass (clear), plastic, rubber, emissive, and coat (clear face-on, coloured rim:
conformal coatings). Coatings, carbon and lithium get a fine noise bump (grain) so they read as materials, not CAD. Satin, low-coat presets: journal
illustration, not glossy toys. Colours stay faithful under scene.setup's Standard view transform when lit by studio().

Builders (units are scene units; a 3-unit footprint fills a 50 mm lens at ~9 units distance):
    layer_stack        heterostructure / thin-film / battery stack, exploded, terraced ('step') or notched ('corner')
    lattice            2D sheet (square, hex, honeycomb, kagome; moire twist) or 3D crystal (sc, bcc, fcc, rocksalt,
                       diamond, perovskite with octahedra) in ball-and-stick or stick style
    molecule_3d        ball-and-stick / space-filling molecule from SMILES (mol3d.py: rdkit if any Python has it,
                       else a built-in embedder), muted CPK colours
    particle_bed       seeded packed particles (sizes, irregular shapes, coated shells, carbon additive, binder fibrils,
                       current-collector foil)
    electrode_interface  rough electrode + conformal coating (cross-section on the front face) + dendrites/grains
    pouch_cell, coin_cell, cylindrical_cell   battery formats, exploded or cut away
    gate_device        FET / microelectrode: substrate, oxide, channel (optional lattice), source, drain, top or back
                       gate, bond pads with wire bonds
    nanowire_array, pillar_array, porous_membrane   nanostructures
    primitives: slab, prism, sweep (lathe / partial sweep with cut faces), rounded_profile, wire_bond, tube
    studio             key/fill/rim lights scaled to the scene, optional shadow-catcher floor
"""
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scene import *          # noqa: F401,F403  (setup, camera_look, finish, fiber_path, emission, hex_rgb, ...)
from scene import _mat, hex_rgb, fiber_path, shadow_floor

TAU = 2 * math.pi

# ---------------------------------------------------------------- materials
DEFAULT_COLOR = {
    'metal': '#b9bec5', 'steel': '#b4b9bf', 'gold': '#d6a74f', 'copper': '#c8825a', 'aluminium': '#c6c9ce',
    'lithium': '#b3b8bf', 'oxide': '#dcd8cf', 'ceramic': '#e6e2da', 'semiconductor': '#5f6878',
    'graphene': '#30343b', 'carbon': '#2e2e30', 'polymer': '#e8edf1', 'separator': '#f3f3ef',
    'electrolyte': '#bcdcec', 'glass': '#e6f2fa', 'plastic': '#9aa3ad', 'rubber': '#34373c', 'emissive': '#e8322b'}
_KIND = {   # Principled BSDF settings per kind (colour comes separately)
    'metal': {'Metallic': 1.0, 'Roughness': 0.38},
    'steel': {'Metallic': 1.0, 'Roughness': 0.42},
    'gold': {'Metallic': 1.0, 'Roughness': 0.4},
    'copper': {'Metallic': 1.0, 'Roughness': 0.36},
    'aluminium': {'Metallic': 1.0, 'Roughness': 0.40},
    'lithium': {'Metallic': 0.85, 'Roughness': 0.45},
    'oxide': {'Roughness': 0.62, 'Specular IOR Level': 0.35},
    'ceramic': {'Roughness': 0.5, 'Specular IOR Level': 0.4, 'Coat Weight': 0.08},
    'semiconductor': {'Metallic': 0.3, 'Roughness': 0.34, 'Coat Weight': 0.15},
    'graphene': {'Metallic': 0.2, 'Roughness': 0.42, 'Coat Weight': 0.2},
    'carbon': {'Roughness': 0.85, 'Specular IOR Level': 0.25},
    'polymer': {'Roughness': 0.38, 'Coat Weight': 0.25, 'Alpha': 0.6},
    'separator': {'Roughness': 0.7, 'Alpha': 0.8, 'Specular IOR Level': 0.3},
    'electrolyte': {'Roughness': 0.12, 'Coat Weight': 0.5, 'Alpha': 0.32},
    'glass': {'Roughness': 0.05, 'Coat Weight': 0.8, 'Alpha': 0.25},
    'plastic': {'Roughness': 0.5, 'Coat Weight': 0.12},
    'rubber': {'Roughness': 0.8, 'Specular IOR Level': 0.3},
}
_GRAIN = {'carbon': 0.5, 'oxide': 0.18, 'ceramic': 0.08, 'lithium': 0.25, 'separator': 0.3, 'rubber': 0.15, 'steel': 0.06}
_MCACHE = {}


def _grain(m, amount, scale=90.0):
    """Fine noise bump in object space: a powder coating / brushed foil look instead of a flat CAD surface."""
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); nz = nt.nodes.new('ShaderNodeTexNoise'); bump = nt.nodes.new('ShaderNodeBump')
    nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = 2.0
    bump.inputs['Strength'].default_value = amount; bump.inputs['Distance'].default_value = 0.02
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector']); nt.links.new(nz.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])


def coat_material(color='#f0c987', edge=0.85, face=0.05):
    """Thin conformal coating: nearly clear where seen face-on, coloured at grazing angles (a rim), so a coated
    particle still shows its core."""
    m = _mat('coat', **{'Base Color': hex_rgb(color), 'Roughness': 0.3, 'Coat Weight': 0.3})
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35
    mp = nt.nodes.new('ShaderNodeMapRange'); mp.inputs['To Min'].default_value = face; mp.inputs['To Max'].default_value = edge
    nt.links.new(lw.outputs['Facing'], mp.inputs['Value']); nt.links.new(mp.outputs['Result'], b.inputs['Alpha'])
    return m


def material(kind='oxide', color=None, alpha=None, rough=None, grain=None):
    """Material preset: kind from _KIND (see module docstring), colour hex (default per kind), optional alpha and
    roughness overrides, grain = strength of a fine surface-noise bump (defaults per kind: coatings, carbon and
    lithium get some, metals and glass none). kind 'coat' gives coat_material(color). Cached."""
    color = color or DEFAULT_COLOR.get(kind, '#9aa3ad')
    if grain is None: grain = _GRAIN.get(kind, 0.0)
    key = (kind, color, alpha, rough, grain)
    try:
        if key in _MCACHE and _MCACHE[key].name in bpy.data.materials: return _MCACHE[key]
    except ReferenceError: _MCACHE.clear()     # a new setup() freed the cached materials
    if kind == 'emissive':
        m = _mat('emit', **{'Base Color': hex_rgb(color), 'Emission Color': hex_rgb(color), 'Emission Strength': 1.0})
    elif kind == 'coat':
        m = coat_material(color)
    else:
        kw = dict(_KIND.get(kind, _KIND['plastic']))
        if alpha is not None: kw['Alpha'] = alpha
        if rough is not None: kw['Roughness'] = rough
        m = _mat(kind, **{'Base Color': hex_rgb(color), **kw})
        if grain: _grain(m, grain)
    _MCACHE[key] = m
    return m


def _m(spec, kind='oxide', color=None):
    """Accept a material, a hex colour, a kind name or a dict(kind=, color=, alpha=)."""
    if isinstance(spec, bpy.types.Material): return spec
    if isinstance(spec, dict): return material(spec.get('kind', kind), spec.get('color', color), spec.get('alpha'), spec.get('rough'), spec.get('grain'))
    if isinstance(spec, str) and spec.startswith('#'): return material(kind, spec)
    if isinstance(spec, str): return material(spec, color)
    return material(kind, color)


def shade(color, f):
    """Hex colour lightened (f > 0) toward white or darkened (f < 0) toward black."""
    c = [int(color.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)]
    c = [v + (255 - v) * f if f > 0 else v * (1 + f) for v in c]
    return '#%02x%02x%02x' % tuple(int(max(0, min(255, round(v)))) for v in c)


# ---------------------------------------------------------------- mesh plumbing
class _Buf:
    """Accumulate vertices and faces of many small parts into one mesh (fast; one object per material)."""
    def __init__(self): self.v, self.f = [], []

    def add(self, verts, faces):
        o = len(self.v); self.v.extend(map(tuple, verts)); self.f.extend([tuple(i + o for i in f) for f in faces]); return self

    def obj(self, name, mat, smooth=True, sharp=None, merge=False):
        if not self.f: return None
        return _object(name, self.v, self.f, mat, smooth, sharp, merge)


def _object(name, verts, faces, mat, smooth=True, sharp=None, merge=False):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    if merge or sharp:
        bm = bmesh.new(); bm.from_mesh(me)
        if merge: bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if sharp:
            for e in bm.edges:
                if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(sharp): e.smooth = False
        bm.to_mesh(me); bm.free()
    me.update()
    if smooth: me.shade_smooth()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    if mat is not None: o.data.materials.append(mat)
    return o


def _bevel(o, width, segments=3):
    md = o.modifiers.new('bev', 'BEVEL'); md.width = width; md.segments = segments
    md.limit_method = 'ANGLE'; md.harden_normals = True; md.use_clamp_overlap = True
    return md


def _sphere_tpl(seg=24, rings=14):
    V = [(0, 0, 1)]
    for i in range(1, rings):
        t = math.pi * i / rings
        for j in range(seg): V.append((math.sin(t) * math.cos(TAU * j / seg), math.sin(t) * math.sin(TAU * j / seg), math.cos(t)))
    V.append((0, 0, -1)); F = []; last = len(V) - 1
    for j in range(seg): F.append((0, 1 + j, 1 + (j + 1) % seg))
    for i in range(rings - 2):
        a, b = 1 + i * seg, 1 + (i + 1) * seg
        for j in range(seg): F.append((a + j, b + j, b + (j + 1) % seg, a + (j + 1) % seg))
    a = 1 + (rings - 2) * seg
    for j in range(seg): F.append((a + j, last, a + (j + 1) % seg))
    return np.array(V, float), F


def _ico_tpl(sub=3):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    V = np.array([v.co[:] for v in bm.verts]); F = [tuple(v.index for v in f.verts) for f in bm.faces]; bm.free()
    return V / np.linalg.norm(V, axis=1)[:, None], F


def _cyl_tpl(seg=16, caps=True):
    V = [(math.cos(TAU * j / seg), math.sin(TAU * j / seg), z) for z in (0.0, 1.0) for j in range(seg)]
    F = [(j, (j + 1) % seg, seg + (j + 1) % seg, seg + j) for j in range(seg)]
    if caps: F += [tuple(range(seg))[::-1], tuple(range(seg, 2 * seg))]
    return np.array(V, float), F


def _frame(p0, p1):
    """Rotation matrix taking +z to the direction p0->p1, and the length."""
    d = np.asarray(p1, float) - np.asarray(p0, float); L = float(np.linalg.norm(d))
    q = Vector(d / (L + 1e-12)).to_track_quat('Z', 'Y')
    return np.array(q.to_matrix()), L


def _add_cyl(buf, p0, p1, r0, r1=None, tpl=None):
    V, F = tpl or _cyl_tpl()
    R, L = _frame(p0, p1); r1 = r0 if r1 is None else r1
    rr = r0 + (r1 - r0) * V[:, 2]
    local = np.stack([V[:, 0] * rr, V[:, 1] * rr, V[:, 2] * L], 1)
    buf.add(local @ R.T + np.asarray(p0, float), F)


def _add_sphere(buf, c, r, tpl=None, scale=(1, 1, 1)):
    V, F = tpl or _sphere_tpl()
    buf.add(V * r * np.asarray(scale) + np.asarray(c, float), F)


def _pre(prefix, A): return {prefix + k: tuple(float(x) for x in v) for k, v in A.items()}


# ---------------------------------------------------------------- primitives
def prism(poly, z0, z1, mat, bevel=0.0, name='prism', loc=(0, 0, 0)):
    """Extruded polygon (x, y loop) from z0 to z1, optional bevelled edges."""
    n = len(poly); V = [(loc[0] + x, loc[1] + y, loc[2] + z0) for x, y in poly] + [(loc[0] + x, loc[1] + y, loc[2] + z1) for x, y in poly]
    F = [tuple(range(n))[::-1], tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    o = _object(name, V, F, _m(mat), smooth=bool(bevel), merge=True)
    if bevel: _bevel(o, min(bevel, 0.3 * abs(z1 - z0)))
    return o


def rect(w, d, cx=0.0, cy=0.0): return [(cx - w / 2, cy - d / 2), (cx + w / 2, cy - d / 2), (cx + w / 2, cy + d / 2), (cx - w / 2, cy + d / 2)]


def rounded_rect(w, d, rad, cx=0.0, cy=0.0, n=6):
    rad = min(rad, w / 2 - 1e-4, d / 2 - 1e-4); P = []
    for (sx, sy, a0) in [(1, -1, -90), (1, 1, 0), (-1, 1, 90), (-1, -1, 180)]:
        ccx, ccy = cx + sx * (w / 2 - rad), cy + sy * (d / 2 - rad)
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n); P.append((ccx + rad * math.cos(a), ccy + rad * math.sin(a)))
    return P


def slab(size, loc, mat, bevel=0.02, name='slab'):
    """Box with true dimensions (bevel not distorted by object scale); loc is the centre."""
    w, d, t = size
    return prism(rect(w, d, loc[0], loc[1]), loc[2] - t / 2, loc[2] + t / 2, mat, bevel, name)


def _sweep_data(section, a0=0.0, a1=TAU, steps=160, loc=(0, 0, 0)):
    prof = section if callable(section) else (lambda th, P=section: P)
    full = abs((a1 - a0) - TAU) < 1e-9
    N = steps if full else max(2, int(round(steps * abs(a1 - a0) / TAU)) + 1)
    V, F = [], []; m = len(prof(a0))
    for k in range(N):
        th = a0 + (a1 - a0) * k / (N if full else N - 1)
        c, s = math.cos(th), math.sin(th)
        for r, z in prof(th): V.append((loc[0] + r * c, loc[1] + r * s, loc[2] + z))
    for k in range(N if full else N - 1):
        k2 = (k + 1) % N
        for i in range(m): F.append((k * m + i, k * m + (i + 1) % m, k2 * m + (i + 1) % m, k2 * m + i))
    if not full: F += [tuple(range(m))[::-1], tuple((N - 1) * m + i for i in range(m))]
    return V, F


def sweep(section, mat, a0=0.0, a1=TAU, steps=160, loc=(0, 0, 0), name='sweep', sharp=40):
    """Solid swept about the z axis through loc. section is a closed (r, z) loop, or a function theta -> loop with a
    fixed vertex count (spirals, wave springs). a1 - a0 < 2*pi leaves flat end faces: that is the cutaway, and it
    shows wall thickness and layer order."""
    V, F = _sweep_data(section, a0, a1, steps, loc)
    return _object(name, V, F, _m(mat), smooth=True, sharp=sharp, merge=True)


def _arc(cx, cz, rad, a0, a1, n=6):
    return [(cx + rad * math.cos(math.radians(a0 + (a1 - a0) * k / n)), cz + rad * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


def rounded_profile(r0, r1, z0, z1, rad, n=5):
    """Closed (r, z) loop of a rounded rectangle for sweep(); r0 = 0 gives a disc (only the outer corners round)."""
    rad = min(rad, (z1 - z0) / 2 - 1e-5, (r1 - r0) / 2 - 1e-5)
    P = [(r0, z0)] if r0 == 0 else _arc(r0 + rad, z0 + rad, rad, 180, 270, n)
    P += _arc(r1 - rad, z0 + rad, rad, 270, 360, n) + _arc(r1 - rad, z1 - rad, rad, 0, 90, n)
    P += [(r0, z1)] if r0 == 0 else _arc(r0 + rad, z1 - rad, rad, 90, 180, n)
    return P


def tube(points, radius, mat, cyclic=False, name='tube', radii=None):
    """Smooth round tube through points (Bezier, auto handles); cyclic closes the loop; radii = per-point multipliers
    of radius (tapers: dendrites, fibrils)."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = radius; cu.bevel_resolution = 6
    cu.resolution_u = 16; cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(points) - 1); sp.use_cyclic_u = cyclic
    for k, (bp, p) in enumerate(zip(sp.bezier_points, points)):
        bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
        if radii is not None: bp.radius = radii[k]
    o = bpy.data.objects.new(name, cu); bpy.context.collection.objects.link(o); o.data.materials.append(_m(mat)); return o


def wire_bond(p0, p1, loop=0.5, radius=0.012, color='#d6a74f', ball=True):
    """Gold wire bond from pad p0 to p1: ball bond at p0, a rising loop, and a wedge landing at p1."""
    a, b = Vector(p0), Vector(p1); m = material('gold', color)
    top = max(a.z, b.z) + loop
    pts = [a, a + Vector((0, 0, loop * 0.55)), a.lerp(b, 0.28) + Vector((0, 0, top - a.lerp(b, 0.28).z)),
           a.lerp(b, 0.72) + Vector((0, 0, (top - a.lerp(b, 0.72).z) * 0.6)), b]
    objs = [tube([tuple(p) for p in pts], radius, m, name='bondwire')]
    if ball:
        buf = _Buf(); _add_sphere(buf, (a.x, a.y, a.z + radius * 0.6), radius * 2.4, scale=(1, 1, 0.55))
        _add_sphere(buf, (b.x, b.y, b.z + radius * 0.3), radius * 1.9, scale=(1.6, 1, 0.35)); objs.append(buf.obj('bond_balls', m))
    return objs


def studio(scale=1.0, key=260, fill=90, rim=140, floor=None, target=(0, 0, 0), shadows=('key',)):
    """Key / fill / rim area lights placed for a scene of size ~3*scale units around target; floor=z adds a
    shadow-catcher floor at that height for soft contact shadows on the transparent film."""
    t = Vector(target); objs = []
    for name, loc, e, size in [('key', (-3, -4, 6), key, 5), ('fill', (5, -3, 2), fill, 6), ('rim', (0, 5, 5), rim, 4)]:
        p = t + Vector(loc) * scale
        bpy.ops.object.light_add(type='AREA', location=p); L = bpy.context.object
        L.data.energy = e * scale * scale; L.data.size = size * scale
        L.rotation_euler = (t - p).to_track_quat('-Z', 'Y').to_euler(); L.data.use_shadow = name in shadows
        objs.append(L)
    if floor is not None: objs.append(shadow_floor(z=floor, size=40 * scale))
    return objs


# ---------------------------------------------------------------- layer stack
def layer_stack(layers, footprint=(3.0, 2.0), loc=(0, 0, 0), exploded=0.0, cut=False, step=None, bevel=0.02,
                notch=(0.42, 0.5), prefix=''):
    """Heterostructure / thin-film / electrode stack, listed bottom to top.
    layers: [dict(thickness, color, kind='oxide', label, alpha=None, inset=0.0, lattice=None|'honeycomb'|'hex'|'square',
             lattice_color=None, lattice_a=None)]; inset shrinks a layer's footprint (patterned or partial films).
    exploded: gap between layers (0 = assembled). cut: False; 'step' (or True) terraces the right end so every layer's
    top shows (step = recession per layer, default 12% of the width); 'corner' removes a front-right notch from all
    layers above the bottom one, exposing the cross-section on two faces.
    Anchors per layer label: '<label>' (exposed top for step cuts, else front-right edge), '<label>.side' (front face
    centre), '<label>.edge' (right end of the front face); plus 'top', 'bottom'."""
    if cut is True: cut = 'step'
    W, D = footprint; z = loc[2]; objs, A = [], {}
    st = step if step is not None else W * 0.12
    for i, L in enumerate(layers):
        t = L['thickness']; ins = L.get('inset', 0.0); lab = L.get('label', 'layer%d' % i)
        mat = material(L.get('kind', 'oxide'), L.get('color'), L.get('alpha'))
        w, d = W - 2 * ins, D - 2 * ins
        x0 = loc[0] - W / 2 + ins; x1 = x0 + w
        if cut == 'step': x1 = min(x1, loc[0] + W / 2 - st * (i)) if i else x1
        y0, y1 = loc[1] - d / 2, loc[1] + d / 2
        if cut == 'corner' and i > 0:
            xn, yn = x1 - w * notch[0], y0 + d * notch[1]
            poly = [(xn, y0), (xn, yn), (x1, yn), (x1, y1), (x0, y1), (x0, y0)]
        else:
            poly = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        objs.append(prism(poly, z, z + t, mat, bevel=min(bevel, t * 0.3), name=lab))
        if L.get('lattice'):
            lw = x1 - x0 - 0.06; lx = (x0 + x1) / 2
            o, _ = lattice(L['lattice'], a=L.get('lattice_a', 0.075), size=(lw, d - 0.06), loc=(lx, loc[1], z + t + 0.004),
                           colors=[L.get('lattice_color') or shade(L.get('color') or '#30343b', -0.35)], style='stick',
                           bond_radius=L.get('lattice_r', 0.009))
            objs += o
        side_y = y0 if not (cut == 'corner' and i > 0) else y0
        A[lab + '.side'] = ((x0 + (x1 if cut != 'corner' or i == 0 else xn)) / 2, side_y, z + t / 2)
        A[lab + '.edge'] = ((x1 if cut != 'corner' or i == 0 else xn), side_y, z + t / 2)
        if cut == 'step':
            nx = x1 - st if i + 1 < len(layers) else x0
            A[lab] = ((nx + x1) / 2 if i + 1 < len(layers) else (x0 + x1) / 2, loc[1] - d * 0.15, z + t)
        elif cut == 'corner' and i > 0:
            A[lab] = (x1, yn - d * 0.0, z + t / 2)
        else:
            A[lab] = (x1, y0, z + t / 2)
        z += t + (exploded if i + 1 < len(layers) else 0)
    A['top'] = (loc[0], loc[1], z); A['bottom'] = (loc[0], loc[1] - D / 2, loc[2])
    return objs, _pre(prefix, A)


# ---------------------------------------------------------------- lattices
def _lattice_points(kind, a, n, size):
    """Positions (N,3) and species index (N,) for a lattice with nearest-neighbour distance a."""
    s3 = math.sqrt(3)
    two_d = {'square': ([(1, 0), (0, 1)], [(0, 0)]), 'hex': ([(1, 0), (0.5, s3 / 2)], [(0, 0)]),
             'honeycomb': ([(s3, 0), (s3 / 2, 1.5)], [(0, 0), (s3 / 2, 0.5)]),
             'kagome': ([(2, 0), (1, s3)], [(0, 0), (1, 0), (0.5, s3 / 2)])}
    if kind in two_d:
        vecs, basis = two_d[kind]; v1, v2 = np.array(vecs[0]) * a, np.array(vecs[1]) * a
        R = int(max(size) / (a * 0.7)) + 4; P, S = [], []
        for i in range(-R, R + 1):
            for j in range(-R, R + 1):
                for k, b in enumerate(basis):
                    p = i * v1 + j * v2 + np.array(b) * a; P.append((p[0], p[1], 0.0)); S.append(k)
        return np.array(P), np.array(S), 2
    nn = (n, n, n) if isinstance(n, int) else tuple(n)
    if kind == 'perovskite':   # corner-sharing BO6: B on an n^3 grid, O between B neighbours and outside, A in cages
        L = 2 * a; P, S, seen = [], [], set()
        for i in range(nn[0]):
            for j in range(nn[1]):
                for k in range(nn[2]):
                    P.append((i * L, j * L, k * L)); S.append(0)
                    for ax in range(3):
                        for sg in (-0.5, 0.5):
                            q = [i, j, k]; q[ax] += sg; key = tuple(round(v * 2) for v in q)
                            if key not in seen: seen.add(key); P.append(tuple(v * L for v in q)); S.append(2)
                    if i < nn[0] - 1 and j < nn[1] - 1 and k < nn[2] - 1: P.append(((i + .5) * L, (j + .5) * L, (k + .5) * L)); S.append(1)
        P = np.array(P, float); P -= P.mean(0); P[:, 2] -= P[:, 2].min()
        return P, np.array(S), 3
    cells = {'sc': (1.0, [((0, 0, 0), 0)]), 'bcc': (2 / s3, [((0, 0, 0), 0), ((.5, .5, .5), 1)]),
             'fcc': (math.sqrt(2), [((0, 0, 0), 0), ((.5, .5, 0), 0), ((.5, 0, .5), 0), ((0, .5, .5), 0)]),
             'rocksalt': (2.0, [((0, 0, 0), 0), ((.5, .5, 0), 0), ((.5, 0, .5), 0), ((0, .5, .5), 0),
                                ((.5, 0, 0), 1), ((0, .5, 0), 1), ((0, 0, .5), 1), ((.5, .5, .5), 1)]),
             'diamond': (4 / s3, [((0, 0, 0), 0), ((.5, .5, 0), 0), ((.5, 0, .5), 0), ((0, .5, .5), 0),
                                  ((.25, .25, .25), 1), ((.75, .75, .25), 1), ((.75, .25, .75), 1), ((.25, .75, .75), 1)])}
    c, basis = cells[kind]; L = c * a
    P, S = [], []
    for i in range(-1, nn[0] + 1):
        for j in range(-1, nn[1] + 1):
            for k in range(-1, nn[2] + 1):
                for b, sp in basis:
                    p = (np.array((i, j, k)) + np.array(b)) * L
                    if all(-1e-6 <= p[q] <= nn[q] * L + 1e-6 for q in range(3)): P.append(p); S.append(sp)
    P = np.array(P); P -= P.mean(0); P[:, 2] -= P[:, 2].min()
    return P, np.array(S), 3


def _pairs(P, dmax):
    """Index pairs closer than dmax (spatial hash)."""
    cell = {}; key = np.floor(P / dmax).astype(int); out = []
    for i, k in enumerate(map(tuple, key)): cell.setdefault(k, []).append(i)
    for i, k in enumerate(map(tuple, key)):
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for j in cell.get((k[0] + dx, k[1] + dy, k[2] + dz), ()):
                        if j > i and np.sum((P[i] - P[j]) ** 2) < dmax * dmax: out.append((i, j))
    return out


def lattice(kind='honeycomb', n=6, a=0.3, loc=(0, 0, 0), colors=('#3a3f47', '#8a93a0', '#c9483c'), style='ball',
            atom_radius=None, bond_radius=None, bond_color=None, shape='disk', size=None, twist=None, interlayer=None,
            colors2=None, polyhedra=None, polyhedra_color='#7fa6cf', bond_rule=None, bonds=None, prefix='', seed=0):
    """Ball-and-stick lattice. a = nearest-neighbour (bond) distance.
    2D kinds 'square', 'hex', 'honeycomb', 'kagome': a sheet in the z = loc.z plane, cut to a disk of radius n*a (shape
    'disk') or to size=(w, d) (shape 'rect'; given size implies rect). twist=deg adds a second sheet rotated by twist,
    interlayer above (default 2.35 a, graphene's 3.35 A / 1.42 A), colours colors2: a moire bilayer.
    3D kinds 'sc', 'bcc', 'fcc', 'rocksalt', 'diamond', 'perovskite' (ABO3: species 0 = B, 1 = A, 2 = O): n cells per
    side (int or 3-tuple), resting on loc (lowest spheres touch z = loc.z). Perovskite draws corner-sharing BO6
    octahedra (polyhedra, default on; its B-O sticks then default off) with A cations in the cages.
    style 'ball' (atoms ~0.28 a, sticks) or 'stick' (tube network, joints only). colors per species.
    bond_rule(si, sj) -> bool filters bonds by species (default: perovskite B-O only, rocksalt/others any).
    Anchors: 'center', 'top', 'edge', 'atom0', 'atom1' (atoms of species 0/1 near the centre), 'layer2' (twisted)."""
    P, S, dim = _lattice_points(kind, a, n, size or (2 * n * a, 2 * n * a))
    if dim == 2:
        if size is not None or shape == 'rect':
            w, d = size or (2 * n * a, 2 * n * a); keep = (np.abs(P[:, 0]) <= w / 2) & (np.abs(P[:, 1]) <= d / 2)
        else:
            keep = np.hypot(P[:, 0], P[:, 1]) <= n * a
        P, S = P[keep], S[keep]
        for _ in range(4):   # prune dangling edge atoms (one bond) so the sheet edge reads clean
            deg = np.zeros(len(P), int)
            for i, j in _pairs(P, a * 1.08): deg[i] += 1; deg[j] += 1
            keep = deg >= (2 if kind in ('honeycomb', 'kagome') else 3)
            if keep.all(): break
            P, S = P[keep], S[keep]
    if polyhedra is None: polyhedra = kind == 'perovskite'
    if bonds is None: bonds = not polyhedra
    ar = atom_radius if atom_radius is not None else (0.28 * a if style == 'ball' else (bond_radius or 0.07 * a) * 1.0)
    br = bond_radius if bond_radius is not None else (0.08 * a if style == 'ball' else 0.07 * a)
    if bond_rule is None and kind == 'perovskite': bond_rule = lambda i, j: {i, j} == {0, 2}
    if dim == 3:
        rmax = ar * (1.25 if kind == 'perovskite' and style == 'ball' else 1.0); P = P.copy(); P[:, 2] += rmax
    sheets = [(P, S, colors)]
    if twist is not None and dim == 2:
        th = math.radians(twist); Rz = np.array([[math.cos(th), -math.sin(th), 0], [math.sin(th), math.cos(th), 0], [0, 0, 1]])
        P2 = P @ Rz.T; P2[:, 2] += interlayer if interlayer is not None else 2.35 * a
        sheets.append((P2, S, colors2 or [shade(c, 0.35) for c in colors]))
    objs, A = [], {}
    sph = _sphere_tpl(20 if style == 'ball' else 10, 12 if style == 'ball' else 6); cyl = _cyl_tpl(14 if style == 'ball' else 8, caps=False)
    off = np.asarray(loc, float)
    for si, (PP, SS, cols) in enumerate(sheets):
        PP = PP + off
        bufs = {}
        rad = [ar * (1.0 if kind != 'perovskite' else (0.55, 1.25, 0.62)[s]) for s in SS] if style == 'ball' else [ar] * len(SS)
        for p, s, r in zip(PP, SS, rad):
            if polyhedra and kind == 'perovskite' and s == 0: continue      # B sits hidden inside its octahedron
            _add_sphere(bufs.setdefault(cols[s % len(cols)], _Buf()), p, r, sph)
        bb = {}
        for i, j in (_pairs(PP, a * 1.08) if bonds else []):
            if bond_rule and not bond_rule(SS[i], SS[j]): continue
            if bond_color:
                _add_cyl(bb.setdefault(bond_color, _Buf()), PP[i], PP[j], br, tpl=cyl)
            else:   # split bond, each half in its atom's colour
                mid = (PP[i] + PP[j]) / 2
                _add_cyl(bb.setdefault(cols[SS[i] % len(cols)], _Buf()), PP[i], mid, br, tpl=cyl)
                _add_cyl(bb.setdefault(cols[SS[j] % len(cols)], _Buf()), mid, PP[j], br, tpl=cyl)
        kindm = 'graphene' if style == 'stick' else 'ceramic'
        for c, b in list(bufs.items()) + list(bb.items()):
            objs.append(b.obj('lattice', material(kindm, c)))
        if polyhedra and kind == 'perovskite':
            pb = _Buf(); Bs = PP[SS == 0]; Os = PP[SS == 2]
            for b in Bs:
                V = [b + np.array(v) * a * 0.98 for v in [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]]
                F = [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]
                pb.add(V, F)
            o = pb.obj('octahedra', material('ceramic', polyhedra_color, alpha=0.82, rough=0.35), smooth=False)
            if o: objs.append(o)
        c0 = PP.mean(0)
        A['layer%d' % (si + 1) if si else 'center'] = tuple(c0)
        for sp in (0, 1):
            idx = np.where(SS == sp)[0]
            if len(idx) and si == 0:
                if dim == 2: k = idx[np.argmin(np.linalg.norm(PP[idx] - c0, axis=1))]            # near the centre
                else: k = idx[np.argmax(PP[idx, 2] * 10 - PP[idx, 1] + PP[idx, 0])]              # top, front, right
                A['atom%d' % sp] = tuple(PP[k] + np.array([0, 0, rad[k] if style == 'ball' else 0]))
    allP = np.concatenate([s[0] for s in sheets]) + off
    A['top'] = (off[0], off[1], float(allP[:, 2].max()) + ar); A['edge'] = tuple(allP[np.argmax(allP[:, 0] - 0.3 * allP[:, 1])])
    return [o for o in objs if o], _pre(prefix, A)


# ---------------------------------------------------------------- molecules
CPK = {'H': '#eceae6', 'C': '#41454c', 'N': '#4467b5', 'O': '#cf4a3d', 'F': '#86b85f', 'Cl': '#58a05a', 'Br': '#8e3f2f',
       'I': '#6d4290', 'S': '#dcb140', 'P': '#de8c35', 'Li': '#9c72c4', 'Na': '#7160b8', 'K': '#6a4fa8', 'Si': '#c4b08a',
       'B': '#dd9d86', 'Fe': '#c0673d', 'Co': '#6c7ccc', 'Ni': '#6aa47a', 'Cu': '#c7824f', 'Zn': '#8189a6', 'Pt': '#c9c9cf',
       'Au': '#d6a74f', 'Ti': '#a5a9af', 'Mg': '#72aa5d', 'Al': '#b1a9a6', 'Se': '#d59a3c'}
_BS_R = {'H': 0.24, 'C': 0.36, 'N': 0.35, 'O': 0.34, 'F': 0.32, 'S': 0.46, 'P': 0.46, 'Cl': 0.44, 'Br': 0.48, 'I': 0.54,
         'Li': 0.48, 'Na': 0.55, 'K': 0.62, 'B': 0.36, 'Si': 0.46}
_VDW = {'H': 1.1, 'C': 1.7, 'N': 1.55, 'O': 1.52, 'F': 1.47, 'S': 1.8, 'P': 1.8, 'Cl': 1.75, 'Br': 1.85, 'I': 1.98, 'Li': 1.82, 'Na': 2.27}


def molecule_3d(smiles=None, loc=(0, 0, 0), scale=0.35, style='ballstick', seed=0, colors=None, bond_color=None,
                hydrogens=True, orient='flat', rot=(0, 0, 0), coords=None, python=None, bond_radius=0.12, prefix=''):
    """3D molecule from SMILES. scale = scene units per angstrom. style 'ballstick', 'spacefill' or 'stick'.
    Coordinates: coords (dict from mol3d.embed or a JSON path) or computed by mol3d.embed(smiles, seed): rdkit
    (ETKDG + MMFF) when any Python on this machine has it, else the built-in embedder (see mol3d.py).
    orient 'flat' puts the molecule's broadest plane facing a camera on -y (largest extent along x, second along z);
    rot = extra Euler rotation in degrees. Double and triple bonds are drawn as 2-3 thinner sticks in the molecular
    plane; aromatic bonds as single sticks. Bonds split in the two atom colours unless bond_color is given.
    Anchors: 'center', 'top', 'bottom' (lowest sphere bottom: put a floor there), 'left', 'right', and 'a<i>' for
    every heavy atom (SMILES atom order)."""
    import json
    if coords is None:
        from mol3d import embed
        M = embed(smiles, seed=seed, python=python); print('molecule_3d:', smiles, 'via', M['method'])
    else:
        M = json.load(open(coords)) if isinstance(coords, str) else coords
    sym = M['atoms']; X = np.array(M['xyz'], float); bonds = M['bonds']
    heavy = np.array([s != 'H' for s in sym])
    if orient == 'flat' and heavy.sum() >= 3:
        C = X[heavy] - X[heavy].mean(0); _, _, vt = np.linalg.svd(C)
        R = np.stack([vt[0], vt[2], vt[1]])     # x <- largest, y <- smallest (depth), z <- second
        if np.linalg.det(R) < 0: R[1] *= -1
        X = (X - X[heavy].mean(0)) @ R.T
    if any(rot):
        from mathutils import Euler
        Rm = np.array(Euler([math.radians(v) for v in rot], 'XYZ').to_matrix()); X = X @ Rm.T
    X = X * scale + np.asarray(loc, float)
    show = [hydrogens or s != 'H' for s in sym]
    pal = dict(CPK); pal.update(colors or {})
    col = lambda s: pal.get(s, '#d06fc0')
    if style == 'spacefill': rad = [_VDW.get(s, 1.8) * scale for s in sym]
    elif style == 'stick': rad = [bond_radius * scale] * len(sym)
    else: rad = [_BS_R.get(s, 0.5) * scale for s in sym]
    sph = _sphere_tpl(28, 16); cyl = _cyl_tpl(16, caps=False)
    ab, bb = {}, {}
    for i, s in enumerate(sym):
        if show[i]: _add_sphere(ab.setdefault(col(s), _Buf()), X[i], rad[i], sph)
    if style != 'spacefill':
        nb = {}
        for a, b, o in bonds: nb.setdefault(a, []).append(b); nb.setdefault(b, []).append(a)
        for a, b, o in bonds:
            if not (show[a] and show[b]): continue
            d = X[b] - X[a]; u = d / np.linalg.norm(d)
            ref = next((X[c] for c in nb.get(a, []) + nb.get(b, []) if c not in (a, b)), X[a] + np.array([0, 0, 1.0]))
            perp = (ref - X[a]) - np.dot(ref - X[a], u) * u
            perp = perp / (np.linalg.norm(perp) + 1e-9) if np.linalg.norm(perp) > 1e-6 else np.cross(u, [0, 1, 0])
            k = 1 if o in (1, 1.5) or style == 'stick' else int(o)
            r = bond_radius * scale * (1.0 if k == 1 else 0.62 if k == 2 else 0.5)
            sep = bond_radius * scale * (1.7 if k == 2 else 2.2)
            for q in range(k):
                sh = perp * sep * (q - (k - 1) / 2)
                p0, p1 = X[a] + sh, X[b] + sh; mid = (p0 + p1) / 2
                if bond_color: _add_cyl(bb.setdefault(bond_color, _Buf()), p0, p1, r, tpl=cyl)
                else:
                    _add_cyl(bb.setdefault(col(sym[a]), _Buf()), p0, mid, r, tpl=cyl)
                    _add_cyl(bb.setdefault(col(sym[b]), _Buf()), mid, p1, r, tpl=cyl)
    objs = [b.obj('atoms', material('ceramic', c, rough=0.42)) for c, b in ab.items()]
    objs += [b.obj('bonds', material('ceramic', c, rough=0.5)) for c, b in bb.items()]
    A = {'center': tuple(X[heavy].mean(0)), 'top': tuple(X[np.argmax(X[:, 2])] + np.array([0, 0, max(rad)])),
         'left': tuple(X[np.argmin(X[:, 0])]), 'right': tuple(X[np.argmax(X[:, 0])]),
         'bottom': tuple(X[np.argmin(X[:, 2])] - np.array([0, 0, max(rad)]))}
    for i, s in enumerate(sym):
        if s != 'H': A['a%d' % i] = tuple(X[i])
    return objs, _pre(prefix, A)


# ---------------------------------------------------------------- particles and interfaces
def _blob(tpl, c, r, rng, noise=0.12, lobes=4):
    """Irregular particle: unit sphere template displaced by a few random low-order waves."""
    V, F = tpl; disp = np.ones(len(V))
    for _ in range(lobes):
        k = rng.normal(size=3); k /= np.linalg.norm(k); f = rng.uniform(1.2, 3.2)
        disp += noise / lobes * 2 * np.cos(f * (V @ k) * math.pi + rng.uniform(0, TAU))
    return V * (r * disp)[:, None] + c, F, disp


def _drop(items, W, D, floor_z, rng, placed, height=None, near=None, spread=None, tries=40, pick=1):
    """Ballistic deposition: each sphere falls at a random (x, y) until it touches the floor or a placed sphere.
    pick > 1 tries that many landing sites and keeps the lowest (denser, flatter packing)."""
    out = []
    for r in items:
        best = None; got = 0
        for _ in range(tries * pick):
            if near is not None:
                x, y = near[0] + rng.normal() * spread, near[1] + rng.normal() * spread
            else:
                x, y = rng.uniform(-W / 2 + r, W / 2 - r), rng.uniform(-D / 2 + r, D / 2 - r)
            if abs(x) > W / 2 - r or abs(y) > D / 2 - r: continue
            z = floor_z(x, y) + r if callable(floor_z) else floor_z + r
            for (px, py, pz, pr) in placed:
                dx = math.hypot(px - x, py - y); s = pr + r
                if dx < s: z = max(z, pz + math.sqrt(s * s - dx * dx))
            if height is None or z + r <= height:
                if best is None or z < best[2]: best = (x, y, z, r)
                got += 1
                if got >= pick: break
        if best is not None: placed.append(best); out.append(best)
    return out


def particle_bed(size=(3.0, 2.0, 0.9), n=180, radius=(0.1, 0.2), seed=0, color='#6f8fb0', kind='ceramic',
                 noise=0.06, color_jitter=0.08, shell=None, carbon=None, binder=None, foil=None, loc=(0, 0, 0), prefix=''):
    """Packed electrode / catalyst bed by ballistic deposition of near-spherical, slightly irregular particles.
    size = (w, d, max height); radius = (min, max). shell=dict(t=0.02, color='#f0c987') adds a conformal coating
    (coat_material: clear face-on, coloured rim, so the core still shows); carbon=dict(n=300, r=0.025,
    color='#3a3a3d') deposits conductive-additive clusters between the particles as the bed grows, so they sit in the
    pores at every depth; binder=dict(n=60, r=0.012, color='#efe9da') bridges neighbouring particles with sagging
    fibrils; foil=dict(t=0.06, color='#c6c9ce', kind='aluminium', margin=0.1) is the current collector.
    Anchors: 'particle' (a front, high particle's top), 'shell', 'carbon', 'binder', 'foil', 'top', 'front'."""
    rng = np.random.default_rng(seed); W, D, H = size; ox = np.asarray(loc, float); z0 = 0.0
    objs, A = [], {}
    if foil is not None:
        ft = foil.get('t', 0.06); mg = foil.get('margin', 0.1)
        objs.append(slab((W + 2 * mg, D + 2 * mg, ft), (ox[0], ox[1], ox[2] + ft / 2), material(foil.get('kind', 'aluminium'), foil.get('color')), bevel=0.01))
        A['foil'] = (ox[0] + W / 2, ox[1] - D / 2 - mg, ox[2] + ft / 2); z0 = ft
    placed, parts, blacks = [], [], []
    cn = (carbon or {}).get('n', 300); cr = (carbon or {}).get('r', 0.025); batches = 12
    radii = list(rng.uniform(radius[0], radius[1], n * 3))
    for bi in range(batches):
        chunk = radii[bi * len(radii) // batches:(bi + 1) * len(radii) // batches]
        parts += _drop(chunk, W, D, z0, rng, placed, height=H + z0, pick=10)
        if carbon is not None and parts:
            for _ in range(3):
                c = parts[rng.integers(len(parts))][:2]      # clusters land on or between particles
                got = _drop([cr * rng.uniform(0.7, 1.3) for _ in range(max(1, cn // (batches * 3)))], W, D, z0, rng, placed,
                            height=H + z0, near=c, spread=cr * 2.5, pick=4)
                blacks += got
        if len(parts) >= n: break
    tpl = _ico_tpl(3); shades = [shade(color, f) for f in np.linspace(-color_jitter, color_jitter, 5)]
    bufs = [_Buf() for _ in shades]; sbuf = _Buf()
    for (x, y, z, r) in parts:
        V, F, disp = _blob(tpl, np.array([x, y, z]), r, rng, noise)
        bufs[rng.integers(len(shades))].add(V + ox, F)
        if shell is not None: sbuf.add((V - [x, y, z]) * (1 + shell.get('t', 0.02) / r) + [x, y, z] + ox, F)
    for c, b in zip(shades, bufs):
        o = b.obj('particles', material(kind, c))
        if o: objs.append(o)
    if shell is not None:
        objs.append(sbuf.obj('shells', material(shell.get('kind', 'coat'), shell.get('color', '#f0c987'), shell.get('alpha'))))
    front = sorted(parts, key=lambda p: p[1] - 0.6 * p[2] - 0.2 * p[0])
    fx, fy, fz, fr = front[0]
    A['particle'] = (ox[0] + fx, ox[1] + fy, ox[2] + fz + fr * 0.9)
    if shell is not None: A['shell'] = (ox[0] + fx + fr * 0.7, ox[1] + fy - fr * 0.3, ox[2] + fz + fr * 0.75)
    blacks = [b for b in blacks if b[2] - b[3] > z0 + 1e-3]      # none loose on the bare foil
    if blacks:
        cb = _Buf(); tplc = _ico_tpl(2)
        for (x, y, z, r) in blacks:
            V, F, _ = _blob(tplc, np.array([x, y, z]), r, rng, 0.15); cb.add(V + ox, F)
        objs.append(cb.obj('carbon', material('carbon', (carbon or {}).get('color', '#3a3a3d'))))
        g = max(blacks, key=lambda p: p[2] - 2 * p[1]); A['carbon'] = (ox[0] + g[0], ox[1] + g[1], ox[2] + g[2] + g[3])
    if binder is not None:
        P = np.array([p[:3] for p in parts]); Rr = np.array([p[3] for p in parts])
        m = material('polymer', binder.get('color', '#efe9da'), alpha=binder.get('alpha', 1.0), rough=0.55)
        pairs = [(i, j) for i in range(len(P)) for j in range(i + 1, len(P))
                 if (Rr[i] + Rr[j]) * 1.0 < np.linalg.norm(P[i] - P[j]) < (Rr[i] + Rr[j]) * 1.35]
        pairs.sort(key=lambda ij: -(P[ij[0], 2] + P[ij[1], 2]) + 1.5 * (P[ij[0], 1] + P[ij[1], 1]))   # visible first
        pick = pairs[: binder.get('n', 60) // 2] + [pairs[k] for k in rng.permutation(len(pairs))[: binder.get('n', 60) // 2]]
        best = None
        for i, j in pick:
            u = (P[j] - P[i]) / np.linalg.norm(P[j] - P[i]); side = np.cross(u, rng.normal(size=3)); side /= np.linalg.norm(side)
            ea = P[i] + (u * 0.9 + side * 0.4) / np.linalg.norm(u * 0.9 + side * 0.4) * Rr[i] * 0.97
            eb = P[j] + (-u * 0.9 + side * 0.4) / np.linalg.norm(-u * 0.9 + side * 0.4) * Rr[j] * 0.97
            mid = (ea + eb) / 2 + np.array([0, 0, -0.25 * np.linalg.norm(eb - ea)])
            objs.append(tube([tuple(ea + ox), tuple(mid + ox), tuple(eb + ox)], binder.get('r', 0.012), m, name='binder', radii=[1.6, 0.8, 1.6]))
            if best is None or mid[2] - 2 * mid[1] > best[2] - 2 * best[1]: best = mid
        if best is not None: A['binder'] = tuple(best + ox)
    A['top'] = (ox[0], ox[1], ox[2] + z0 + max(p[2] + p[3] for p in parts)); A['front'] = (ox[0] + W / 2, ox[1] - D / 2, ox[2] + z0 + H * 0.4)
    return objs, _pre(prefix, A)


def _field(rng, amp, waves=28, fmin=4.0, fmax=24.0):
    """Isotropic random surface: waves in random directions, amplitude ~ 1/frequency (rough, not rippled); rms ~ amp."""
    ks = []
    for _ in range(waves):
        f = fmin * (fmax / fmin) ** rng.uniform(); th = rng.uniform(0, TAU)
        ks.append((f * math.cos(th), f * math.sin(th), rng.uniform(0, TAU), 1.0 / f))
    norm = math.sqrt(sum(w * w for *_, w in ks) / 2)
    return lambda x, y: amp / norm * sum(w * np.sin(kx * x + ky * y + p) for kx, ky, p, w in ks)


def _heightfield_solid(X, Y, Zb, Zt, mat, name='hf'):
    ny, nx = X.shape; V = []; F = []
    idx = lambda layer, i, j: layer * nx * ny + i * nx + j
    for Z in (Zb, Zt):
        V += list(zip(X.ravel(), Y.ravel(), Z.ravel()))
    for i in range(ny - 1):
        for j in range(nx - 1):
            F.append((idx(1, i, j), idx(1, i, j + 1), idx(1, i + 1, j + 1), idx(1, i + 1, j)))
            F.append((idx(0, i, j), idx(0, i + 1, j), idx(0, i + 1, j + 1), idx(0, i, j + 1)))
    # side walls get their own vertices (one flat wall per side), so the rough top's smoothing never bleeds down them
    sides = [[(0, j) for j in range(nx)], [(i, nx - 1) for i in range(ny)], [(ny - 1, j) for j in range(nx - 1, -1, -1)], [(i, 0) for i in range(ny - 1, -1, -1)]]
    for wall in sides:
        o = len(V)
        for layer in (0, 1):
            Z = Zb if layer == 0 else Zt
            V += [(X[i, j], Y[i, j], Z[i, j]) for i, j in wall]
        m = len(wall)
        F += [(o + k, o + k + 1, o + m + k + 1, o + m + k) for k in range(m - 1)]
    return _object(name, V, F, mat, smooth=True, sharp=60, merge=False)


def electrode_interface(size=(3.2, 2.0), thickness=0.5, seed=0, roughness=0.07, substrate=None, coating=None,
                        deposit=None, electrolyte=None, res=(140, 90), loc=(0, 0, 0), prefix=''):
    """Rough electrode block with an optional conformal coating and deposits, cross-section on the front face.
    substrate=dict(color, kind) (default lithium metal); coating=dict(t=0.05, color='#5aa0c8', kind='ceramic',
    from_x=-0.2) covers x >= from_x (so the bare surface shows on the left and the coating's constant thickness reads on
    the front face); deposit=dict(kind='dendrite'|'grains'|'mossy', n=9, color, kind_m='lithium', height=0.9);
    electrolyte=dict(color, height=1.1, alpha=0.25) a translucent block above.
    Anchors: 'substrate', 'surface', 'coating', 'deposit', 'electrolyte'."""
    rng = np.random.default_rng(seed); W, D = size; ox = np.asarray(loc, float)
    sub = substrate or {}; objs, A = [], {}
    h = _field(rng, roughness)
    xs = np.linspace(-W / 2, W / 2, res[0]); ys = np.linspace(-D / 2, D / 2, res[1]); X, Y = np.meshgrid(xs, ys)
    Zt = h(X, Y); Zb = np.full_like(Zt, -thickness)
    objs.append(_heightfield_solid(X + ox[0], Y + ox[1], Zb + ox[2], Zt + ox[2], material(sub.get('kind', 'lithium'), sub.get('color')), 'substrate'))
    A['substrate'] = (ox[0] + W * 0.3, ox[1] - D / 2, ox[2] - thickness * 0.5)
    A['surface'] = (ox[0] - W * 0.3, ox[1] - D * 0.1, ox[2] + float(h(-W * 0.3, -D * 0.1)))
    top = lambda x, y: h(x, y)
    if coating:
        t = coating.get('t', 0.05); fx = coating.get('from_x', -0.2) * W
        mask = xs >= fx; Xc, Yc = X[:, mask], Y[:, mask]
        objs.append(_heightfield_solid(Xc + ox[0], Yc + ox[1], h(Xc, Yc) - 0.002 + ox[2], h(Xc, Yc) + t + ox[2],
                                       material(coating.get('kind', 'ceramic'), coating.get('color', '#5aa0c8'), coating.get('alpha')), 'coating'))
        A['coating'] = (ox[0] + W * 0.35, ox[1] - D / 2, ox[2] + float(h(W * 0.35, -D / 2)) + t * 0.5)
        top = lambda x, y, fx=fx: h(x, y) + (t if x >= fx else 0)
    if deposit:
        dk = deposit.get('kind', 'dendrite'); m = material(deposit.get('kind_m', 'lithium'), deposit.get('color'))
        Hd = deposit.get('height', 0.9); best = None
        if dk == 'dendrite':
            for s in range(deposit.get('n', 9)):
                x0, y0 = rng.uniform(-W * 0.42, W * 0.42), rng.uniform(-D * 0.35, D * 0.35)
                hh = Hd * rng.uniform(0.45, 1.0); r0 = deposit.get('r', 0.035) * rng.uniform(0.8, 1.2)
                def grow(p, d, L, r, depth):
                    nonlocal best
                    pts = [tuple(p)]; ns = 7
                    for k in range(ns):   # kinked, tapering filament
                        d = d + rng.normal(size=3) * 0.45; d[2] = abs(d[2]) + 0.35; d = d / np.linalg.norm(d)
                        p = p + d * L / ns; pts.append(tuple(p))
                    rr = list(np.linspace(1.0, 0.4, len(pts)))
                    objs.append(tube([tuple(np.array(q) + ox) for q in pts], r, m, name='dendrite', radii=rr))
                    bs = _Buf(); _add_sphere(bs, p + ox, r * 0.42); objs.append(bs.obj('tip', m))
                    if best is None or p[2] - p[1] > best[2] - best[1]: best = p.copy()
                    if depth < deposit.get('branching', 1):
                        for q in range(2):
                            i = rng.integers(2, ns); bp = np.array(pts[i])
                            nd = rng.normal(size=3); nd[2] = abs(nd[2]) * 0.5 + 0.25
                            grow(bp, nd / np.linalg.norm(nd), L * rng.uniform(0.3, 0.5), r * (1 - i / ns * 0.6) * 0.7, depth + 1)
                base = np.array([x0, y0, float(top(x0, y0)) - 0.01])
                grow(base, np.array([0, 0, 1.0]), hh, r0, 0)
                bb = _Buf(); _add_sphere(bb, base + ox, r0 * 2.0, scale=(1, 1, 0.4)); objs.append(bb.obj('root', m))
        else:
            placed = []; tpl = _ico_tpl(2 if dk == 'mossy' else 3); buf = _Buf()
            for s in range(deposit.get('n', 9)):
                cx, cy = rng.uniform(-W * 0.4, W * 0.4), rng.uniform(-D * 0.35, D * 0.35)
                rr = [rng.uniform(0.03, 0.06) if dk == 'mossy' else rng.uniform(0.08, 0.16) for _ in range(40 if dk == 'mossy' else 4)]
                got = _drop(rr, W, D, lambda x, y: float(top(x, y)) - 0.01, rng, placed, height=Hd, near=(cx, cy), spread=0.12)
                for (x, y, z, r) in got:
                    V, F, _ = _blob(tpl, np.array([x, y, z]), r, rng, 0.1); buf.add(V + ox, F)
            objs.append(buf.obj('deposit', m))
            best = np.array(max(placed, key=lambda p: p[2] - p[1])[:3]) if placed else None
        if best is not None: A['deposit'] = tuple(best + ox)
    if electrolyte:
        eh = electrolyte.get('height', 1.1)
        objs.append(slab((W, D, eh), (ox[0], ox[1], ox[2] + eh / 2), material('electrolyte', electrolyte.get('color'), electrolyte.get('alpha', 0.25)), bevel=0.0))
        A['electrolyte'] = (ox[0] + W / 2, ox[1] - D / 2, ox[2] + eh * 0.75)
    return [o for o in objs if o], _pre(prefix, A)


# ---------------------------------------------------------------- battery cells
BATTERY = {'cathode': '#5b6f8f', 'anode': '#3b3e44', 'separator': '#f1f1ec', 'al': '#c6c9ce', 'cu': '#c8825a',
           'pouch': '#c3c6cb', 'steel': '#b4b9bf', 'lithium': '#9aa1ab', 'gasket': '#34373c', 'sleeve': '#2f6aa8',
           'sealant': '#d9b54a'}


def _electrode_sheet(w, d, x, y, z, coat_t, foil_t, coat_col, foil_kind, foil_col, tab_x, tab=(0.28, 0.32), both=True, side=-1):
    """Double-side coated electrode: foil (with a bare tab on the front (side=-1) or back (+1) edge) between two
    coatings."""
    objs = []; m = 0.035
    foil = rect(w, d, x, y)
    tx0 = x + tab_x - tab[0] / 2; tx1 = tx0 + tab[0]; y1 = y + d / 2
    poly = [foil[0], foil[1], (x + w / 2, y1), (tx1, y1), (tx1, y1 + tab[1]), (tx0, y1 + tab[1]), (tx0, y1), (x - w / 2, y1)]
    if side < 0: poly = [(px, 2 * y - py) for px, py in poly]
    zc = z + (coat_t if both else 0)
    objs.append(prism(poly, zc, zc + foil_t, material(foil_kind, foil_col), bevel=foil_t * 0.3, name='foil'))
    cm = material('carbon' if coat_col in ('#3b3e44',) else 'oxide', coat_col, rough=0.72, grain=0.35)
    if both: objs.append(prism(rect(w - m, d - m, x, y), z, z + coat_t, cm, bevel=coat_t * 0.25, name='coat'))
    objs.append(prism(rect(w - m, d - m, x, y), zc + foil_t, zc + foil_t + coat_t, cm, bevel=coat_t * 0.25, name='coat'))
    return objs, zc + foil_t + coat_t, (tx1, y + side * (d / 2 + tab[1] * 0.7), zc + foil_t)


def pouch_cell(size=(2.6, 1.8), exploded=0.28, n_pairs=1, loc=(0, 0, 0), colors=None, coat_t=0.05, tab_side=None, prefix=''):
    """Pouch cell. exploded=0: sealed pillow with flange and two terminal tabs. exploded>0: the laminated pouch tray,
    then n_pairs x (anode | separator | cathode | separator) and the lid, each separated by `exploded`. Electrodes are
    double-side coated foils (Cu for the anode, Al for the cathode) with bare tabs on the tab_side edge ('front' by
    default when exploded, 'back' when sealed); the foil edge reads as a metal line between two coatings.
    Anchors: 'pouch', 'lid', 'anode', 'cathode', 'separator', 'anode_foil', 'cathode_foil', 'tab_pos', 'tab_neg'."""
    C = dict(BATTERY); C.update(colors or {}); W, D = size; x, y, z = loc; objs, A = [], {}
    fl = 0.16; lam = material('aluminium', C['pouch'], rough=0.5)
    side = -1 if (tab_side or ('front' if exploded > 0 else 'back')) == 'front' else 1
    if exploded <= 0:
        objs.append(prism(rounded_rect(W + 2 * fl, D + 2 * fl, 0.1, x, y), z, z + 0.03, lam, bevel=0.01, name='flange'))
        objs.append(prism(rounded_rect(W, D, 0.14, x, y), z, z + 0.32, lam, bevel=0.1, name='pillow'))
        for sx, key, col in ((-1, 'tab_neg', 'cu'), (1, 'tab_pos', 'al')):
            tx = x + sx * W * 0.28
            objs.append(slab((0.34, 0.6, 0.012), (tx, y + side * (D / 2 + fl + 0.12), z + 0.02), material('copper' if col == 'cu' else 'aluminium', C[col]), bevel=0.004))
            objs.append(slab((0.42, 0.12, 0.03), (tx, y + side * (D / 2 + fl - 0.02), z + 0.02), material('plastic', C['sealant'], rough=0.6), bevel=0.008))
            A[key] = (tx, y + side * (D / 2 + fl + 0.35), z + 0.03)
        A['pouch'] = (x + W / 2, y - D / 2, z + 0.16); A['flange'] = (x + W / 2 + fl * 0.5, y - D / 2 - fl * 0.5, z + 0.03)
        return objs, _pre(prefix, A)
    # tray
    th = 0.22
    objs.append(prism(rounded_rect(W + 2 * fl, D + 2 * fl, 0.1, x, y), z + th - 0.025, z + th, lam, bevel=0.008, name='tray_flange'))
    objs.append(prism(rounded_rect(W + 0.06, D + 0.06, 0.12, x, y), z, z + th - 0.02, lam, bevel=0.06, name='tray'))
    A['pouch'] = (x + W / 2 + 0.03, y - D / 2, z + th * 0.4)
    zc = z + th + exploded
    for k in range(n_pairs):
        o, ztop, tab = _electrode_sheet(W - 0.1, D - 0.1, x, y, zc, coat_t, 0.014, C['anode'], 'copper', C['cu'], -W * 0.28, side=side)
        objs += o; A['anode'] = (x + (W - 0.1) / 2, y - (D - 0.1) / 2 + 0.2, zc + coat_t * 0.5); A['anode_foil'] = (x + (W - 0.1) / 2 - 0.3, y - (D - 0.1) / 2, zc + coat_t + 0.007); A['tab_neg'] = tab
        zc = ztop + exploded
        objs.append(prism(rect(W - 0.02, D - 0.02, x, y), zc, zc + 0.012, material('separator', C['separator']), bevel=0.004, name='separator'))
        A['separator'] = (x + (W - 0.02) / 2, y - (D - 0.02) / 2 + 0.2, zc + 0.006)
        zc += 0.012 + exploded
        o, ztop, tab = _electrode_sheet(W - 0.14, D - 0.14, x, y, zc, coat_t, 0.014, C['cathode'], 'aluminium', C['al'], W * 0.28, side=side)
        objs += o; A['cathode'] = (x + (W - 0.14) / 2, y - (D - 0.14) / 2 + 0.2, zc + coat_t * 1.5 + 0.014); A['cathode_foil'] = (x + (W - 0.14) / 2 - 0.3, y - (D - 0.14) / 2, zc + coat_t + 0.007); A['tab_pos'] = tab
        zc = ztop + exploded
        if k + 1 < n_pairs:
            objs.append(prism(rect(W - 0.02, D - 0.02, x, y), zc, zc + 0.012, material('separator', C['separator']), bevel=0.004, name='separator'))
            zc += 0.012 + exploded
    objs.append(prism(rounded_rect(W + 2 * fl, D + 2 * fl, 0.1, x, y), zc, zc + 0.025, lam, bevel=0.008, name='lid'))
    objs.append(prism(rounded_rect(W - 0.1, D - 0.1, 0.1, x, y), zc + 0.02, zc + 0.07, lam, bevel=0.03, name='lid_dome'))
    A['lid'] = (x + W / 2 + fl * 0.5, y - D / 2 - fl * 0.5, zc + 0.025)
    return objs, _pre(prefix, A)


def coin_cell(radius=1.0, exploded=0.3, cut=False, loc=(0, 0, 0), colors=None, prefix=''):
    """CR2032-style coin cell, bottom to top: case (+), cathode, separator, lithium anode, spacer, wave spring,
    gasket, cap (-). exploded = vertical gap between parts (0 = crimped cell); cut=True removes the quadrant facing a
    camera on -x/-y so wall thickness and the internal order show on the cut faces. Every part is a solid of
    revolution with rounded edges. Anchors: one per part name, on its right rim."""
    C = dict(BATTERY); C.update(colors or {}); R = radius; x, y, z = loc
    a0, a1 = (0.0, 1.5 * math.pi) if cut else (0.0, TAU)
    steel = material('steel', C['steel']); objs, A = [], {}
    hc, w = 0.32 * R, 0.035 * R
    can = [(0, 0)] + _arc(R - 0.07 * R, 0.07 * R, 0.07 * R, 270, 360) + [(R, hc - 0.012 * R), (R - w, hc - 0.012 * R)] + \
          _arc(R - w - 0.04 * R, w + 0.04 * R, 0.04 * R, 0, -90) + [(0, w)]
    parts = [('case', can, steel, hc),
             ('cathode', rounded_profile(0, 0.78 * R, 0, 0.075 * R, 0.012 * R), material('oxide', C['cathode'], rough=0.72), 0.075 * R),
             ('separator', rounded_profile(0, 0.86 * R, 0, 0.014 * R, 0.005 * R), material('separator', C['separator']), 0.014 * R),
             ('anode', rounded_profile(0, 0.74 * R, 0, 0.06 * R, 0.015 * R), material('lithium', C['lithium']), 0.06 * R),
             ('spacer', rounded_profile(0, 0.8 * R, 0, 0.04 * R, 0.01 * R), steel, 0.04 * R),
             ('spring', None, steel, 0.13 * R),
             ('gasket', [(0.84 * R, 0), (0.93 * R, 0), (0.93 * R, 0.2 * R), (0.88 * R, 0.2 * R), (0.88 * R, 0.035 * R), (0.84 * R, 0.035 * R)],
              material('rubber', C['gasket']), 0.2 * R),
             ('cap', [(0, 0.24 * R), (0.8 * R, 0.24 * R)] + _arc(0.8 * R, 0.2 * R, 0.04 * R, 90, 0) + [(0.84 * R, 0.0), (0.81 * R, 0.0), (0.81 * R, 0.19 * R)] +
              _arc(0.78 * R, 0.19 * R, 0.03 * R, 0, 90) + [(0, 0.22 * R)], material('steel', shade(C['steel'], 0.12)), 0.24 * R)]
    zc = z; nested = {'cathode': w, 'separator': w + 0.075 * R, 'anode': w + 0.089 * R, 'spacer': w + 0.149 * R,
                      'spring': w + 0.189 * R, 'gasket': hc - 0.2 * R + 0.02 * R, 'cap': hc - 0.2 * R + 0.035 * R}
    for name, prof, m, h in parts:
        zz = zc if exploded > 0 else z + nested.get(name, 0.0)
        if name == 'spring':
            r1, r2, t = 0.5 * R, 0.66 * R, 0.012 * R
            sec = lambda th, r1=r1, r2=r2, t=t: [(r1, h / 2 + (h / 2 - t) * math.sin(3 * th)), (r2, h / 2 + (h / 2 - t) * math.sin(3 * th)),
                                                 (r2, h / 2 + (h / 2 - t) * math.sin(3 * th) + t), (r1, h / 2 + (h / 2 - t) * math.sin(3 * th) + t)]
            sec2 = lambda th, s=sec: [(r, zv - h / 2) for r, zv in s(th)]
            objs.append(sweep(sec2, m, a0, a1, 240, (x, y, zz), name='spring'))
            A['spring'] = (x + r2 * math.cos(a0 + 0.3), y + r2 * math.sin(a0 + 0.3), zz)
        else:
            objs.append(sweep(prof, m, a0, a1, 160, (x, y, zz), name=name))
            rmax = max(p[0] for p in prof)
            A[name] = (x + rmax * math.cos(-0.35), y + rmax * math.sin(-0.35), zz + h * 0.5) if not cut else (x + rmax, y, zz + h * 0.5)
        zc = zz + h + exploded
    return objs, _pre(prefix, A)


def cylindrical_cell(radius=0.9, height=3.2, cut=True, loc=(0, 0, 0), colors=None, layers=None, pitch=None, prefix=''):
    """18650-style cylindrical cell: steel can with shrink sleeve, crimped top cap with positive button, and a jelly
    roll wound as a true Archimedean spiral of (cathode, separator, anode, separator) layers. cut=True removes the
    front-right quadrant (angles 270-360 deg), so the wound layers read as stripes on the two cut faces.
    layers = [(thickness, color, kind)] overrides the repeat unit. Anchors: 'can', 'sleeve', 'cap', 'button',
    'cathode', 'anode', 'separator', 'mandrel' on the cut face (or the rim when uncut)."""
    C = dict(BATTERY); C.update(colors or {}); R, H = radius, height; x, y, z = loc; objs, A = [], {}
    a0, a1 = (0.0, 1.5 * math.pi) if cut else (0.0, TAU)
    w = 0.035 * R; steel = material('steel', C['steel'])
    can = [(0, 0)] + _arc(R - 0.06 * R, 0.06 * R, 0.06 * R, 270, 360) + [(R, H * 0.93), (R - w, H * 0.93)] + \
          _arc(R - w - 0.03 * R, w + 0.03 * R, 0.03 * R, 0, -90) + [(0, w)]
    objs.append(sweep(can, steel, a0, a1, 180, loc, name='can'))
    sl = 0.012 * R
    objs.append(sweep(rounded_profile(R + 0.001, R + sl, 0.02 * H, 0.9 * H, sl * 0.45), material('plastic', C['sleeve'], rough=0.45), a0, a1, 180, loc, name='sleeve'))
    # crimp, gasket, cap and button
    objs.append(sweep(rounded_profile(R - w - 0.05 * R, R, H * 0.925, H * 0.965, 0.02 * R), steel, a0, a1, 180, loc, name='crimp'))
    objs.append(sweep(rounded_profile(R - w - 0.07 * R, R - w, H * 0.885, H * 0.93, 0.01 * R), material('rubber', C['gasket']), a0, a1, 180, loc, name='gasket'))
    objs.append(sweep(rounded_profile(0, R - w - 0.02 * R, H * 0.9, H * 0.925, 0.008 * R), steel, a0, a1, 180, loc, name='cap'))
    button = [(0, H * 0.925), (0.42 * R, H * 0.925)] + _arc(0.36 * R, H * 0.975, 0.05 * R, 0, 90) + [(0, H * 0.975 + 0.05 * R)]
    objs.append(sweep(button, material('steel', shade(C['steel'], 0.15)), a0, a1, 180, loc, name='button'))
    A['cap'] = (x - (R - 0.1 * R), y - 0.0, z + H * 0.96); A['button'] = (x, y, z + H * 0.975 + 0.05 * R)
    # jelly roll
    unit = layers or [(0.036 * R, C['cathode'], 'oxide'), (0.012 * R, C['separator'], 'ceramic'),
                      (0.036 * R, C['anode'], 'carbon'), (0.012 * R, C['separator'], 'ceramic')]
    P = pitch or sum(t for t, _, _ in unit); r_in = 0.14 * R; r_out = R - w - 0.012 * R
    z0, z1 = H * 0.06, H * 0.86; turns = (r_out - r_in) / P - 0.2
    offs = np.cumsum([0] + [t for t, _, _ in unit])
    bufs = {}
    for li, (t, col, kind) in enumerate(unit):
        for k in range(int(math.ceil(turns)) + 1):
            s0, s1 = k * TAU + a0, min(k * TAU + a1, turns * TAU)
            if s1 <= s0 + 1e-3: continue
            ri = lambda s, li=li: r_in + P * s / TAU + offs[li]
            sec = lambda th, k=k, t=t, ri=ri: [(ri(th + k * TAU), z0), (ri(th + k * TAU) + t, z0), (ri(th + k * TAU) + t, z1), (ri(th + k * TAU), z1)]
            V, F = _sweep_data(sec, s0 - k * TAU, s1 - k * TAU, 200, loc)
            bufs.setdefault((col, kind), _Buf()).add(V, F)
    names = {}
    for (col, kind), b in bufs.items():
        o = b.obj('roll', material(kind, col, rough=0.7), sharp=40); objs.append(o)
    objs.append(sweep(rounded_profile(0.0, r_in * 0.7, H * 0.04, H * 0.88, 0.01), steel, a0, a1, 64, loc, name='mandrel'))
    # anchors on the cut face at angle 0 (the +x half-plane), mid-height
    zm = z + (z0 + z1) * 0.55; kk = int(turns * 0.6)
    for li, key in enumerate(('cathode', 'separator', 'anode')):
        A[key] = (x + r_in + P * kk + offs[li] + unit[li][0] / 2, y - 0.0, zm)
    A['can'] = (x + R - w / 2, y, z + H * 0.3) if cut else (x + R, y, z + H * 0.3)
    A['sleeve'] = (x - R * 0.7, y - R * 0.72, z + H * 0.5); A['mandrel'] = (x + r_in * 0.35, y, z + H * 0.7)
    return objs, _pre(prefix, A)


# ---------------------------------------------------------------- devices
def gate_device(substrate=(3.2, 2.2, 0.35), oxide_t=0.08, channel=None, gate='top', electrode_color='#d6a74f',
                gap=None, wire_bonds=True, carrier=True, loc=(0, 0, 0), colors=None, prefix=''):
    """Field-effect / microelectrode device on a chip: substrate (Si), oxide, a channel sheet (optionally a honeycomb
    lattice for a 2D material), source and drain electrodes that fan out to bond pads, and a top gate (dielectric +
    gate strip + pad) or a back gate (a metal plane under the substrate). carrier=True seats the chip on a ceramic
    carrier with gold bond fingers; wire_bonds runs gold wires from the pads to those fingers.
    channel=dict(l=1.5, w=0.8, color='#30343b', kind='graphene', lattice=True, t=0.012).
    Anchors: 'substrate', 'oxide', 'channel', 'source', 'drain', 'gate', 'dielectric', 'pad_s', 'pad_d', 'pad_g',
    'carrier', 'finger_s', 'finger_d', 'finger_g'."""
    Cc = {'substrate': '#6b7384', 'oxide': '#d4cfe3', 'dielectric': '#bcd6e6', 'carrier': '#e7e3da'}; Cc.update(colors or {})
    W, D, T = substrate; x, y, z = loc; objs, A = [], {}
    ch = dict(l=1.5, w=0.8, color='#30343b', kind='graphene', lattice=True, t=0.012); ch.update(channel or {})
    gm = material('gold', electrode_color)
    if carrier:
        ct = 0.08; objs.append(slab((W + 2.4, D + 1.5, ct), (x, y + 0.2, z - ct / 2), material('ceramic', Cc['carrier']), bevel=0.02, name='carrier'))
        A['carrier'] = (x + W / 2 + 1.2, y + 0.2 - (D + 1.5) / 2, z - ct / 2)
    zb = z
    if gate == 'back':
        objs.append(slab((W, D, 0.04), (x, y, z + 0.02), gm, bevel=0.008, name='backgate')); zb = z + 0.04
        A['gate'] = (x + W / 2, y - D / 2, z + 0.02)
    objs.append(slab((W, D, T), (x, y, zb + T / 2), material('semiconductor', Cc['substrate']), bevel=0.02, name='substrate'))
    zo = zb + T; objs.append(slab((W, D, oxide_t), (x, y, zo + oxide_t / 2), material('oxide', Cc['oxide']), bevel=0.01, name='oxide'))
    A['substrate'] = (x + W / 2, y - D / 2, zb + T * 0.5); A['oxide'] = (x + W / 2, y - D / 2, zo + oxide_t / 2)
    zs = zo + oxide_t
    objs.append(slab((ch['l'], ch['w'], ch['t']), (x, y, zs + ch['t'] / 2), material(ch['kind'], ch['color']), bevel=0.0, name='channel'))
    if ch.get('lattice'):
        o, _ = lattice('honeycomb', a=0.045, size=(ch['l'] - 0.04, ch['w'] - 0.04), loc=(x, y, zs + ch['t'] + 0.003),
                       colors=[shade(ch['color'], 0.28)], style='stick', bond_radius=0.0075)
        objs += o
    et = 0.07; g = gap or ch['l'] * 0.7; pw = max(0.62, ch['w'] + 0.34); hw = ch['w'] / 2 + 0.06
    for sx, key in ((-1, 'source'), (1, 'drain')):
        xi = x + sx * g / 2; xo = x + sx * (W / 2 - 0.12); pl = min(0.62, abs(xo - xi) - 0.45)
        poly = [(xi, y - hw), (xi + sx * 0.2, y - hw), (xo - sx * pl, y - pw / 2), (xo, y - pw / 2),
                (xo, y + pw / 2), (xo - sx * pl, y + pw / 2), (xi + sx * 0.2, y + hw), (xi, y + hw)]
        objs.append(prism(poly, zs, zs + et, gm, bevel=0.012, name=key))
        A[key] = (xi + sx * 0.12, y - hw, zs + et * 0.6)
        A['pad_' + key[0]] = (xo - sx * pl / 2, y, zs + et)
    gw = g * 0.36
    A['channel'] = (x + (g / 2 + gw / 2) / 2 + 0.02, y - ch['w'] * 0.25, zs + ch['t'])
    if gate == 'top':
        dm = material('polymer', Cc['dielectric'], alpha=0.6)
        objs.append(slab((gw + 0.16, ch['w'] + 0.3, 0.04), (x, y, zs + ch['t'] + 0.02), dm, bevel=0.008, name='dielectric'))
        A['dielectric'] = (x + gw / 2 + 0.08, y - (ch['w'] + 0.3) / 2, zs + ch['t'] + 0.02)
        gz = zs + ch['t'] + 0.04
        poly = [(x - gw / 2, y - ch['w'] / 2 - 0.1), (x + gw / 2, y - ch['w'] / 2 - 0.1), (x + gw / 2, y + ch['w'] / 2 + 0.1),
                (x + 0.3, y + D / 2 - 0.5), (x + 0.3, y + D / 2 - 0.12), (x - 0.3, y + D / 2 - 0.12), (x - 0.3, y + D / 2 - 0.5), (x - gw / 2, y + ch['w'] / 2 + 0.1)]
        objs.append(prism(poly, gz, gz + et, gm, bevel=0.012, name='gate'))
        A['gate'] = (x, y - ch['w'] / 2 - 0.1, gz + et); A['pad_g'] = (x, y + D / 2 - 0.31, gz + et)
    if wire_bonds:
        ends = [('s', np.array([x - W / 2 - 0.55, y, z])), ('d', np.array([x + W / 2 + 0.55, y, z]))]
        if gate == 'top': ends.append(('g', np.array([x, y + D / 2 + 0.45, z])))
        for k, e in ends:
            p = np.array(A['pad_' + k])
            if carrier:
                fw = (0.34, 0.2) if k != 'g' else (0.2, 0.34)
                objs.append(slab((fw[0], fw[1], 0.016), (e[0], e[1], e[2] + 0.008), gm, bevel=0.004, name='finger'))
                A['finger_' + k] = (e[0], e[1] - fw[1] / 2, e[2] + 0.016)
            objs += wire_bond(tuple(p), tuple(e + np.array([0, 0, 0.016])), loop=0.45, radius=0.012, color=electrode_color, ball=True)
    return objs, _pre(prefix, A)


def _prism_mesh(buf, c, r, h, sides, taper=0.0, tilt=(0, 0), cap=True):
    top_r = r * (1 - taper); V = []
    tx, ty = tilt
    for k in range(sides):
        a = TAU * k / sides + (math.pi / sides if sides == 4 else 0)
        V.append((c[0] + r * math.cos(a), c[1] + r * math.sin(a), c[2]))
    for k in range(sides):
        a = TAU * k / sides + (math.pi / sides if sides == 4 else 0)
        V.append((c[0] + tx * h + top_r * math.cos(a), c[1] + ty * h + top_r * math.sin(a), c[2] + h))
    F = [(k, (k + 1) % sides, sides + (k + 1) % sides, sides + k) for k in range(sides)] + [tuple(range(sides))[::-1]]
    if cap: F.append(tuple(range(sides, 2 * sides)))
    buf.add(V, F)


def nanowire_array(n=(7, 5), pitch=0.42, radius=0.07, height=1.2, sides=6, taper=0.1, jitter=0.12, seed=0,
                   color='#6f8fb0', kind='semiconductor', tip=None, shell=None, substrate=None, hex_grid=True,
                   loc=(0, 0, 0), prefix=''):
    """Vertical nanowire array: faceted prisms (sides=6 for III-V wires, 4 or 48 for pillars) on a substrate slab,
    seeded variation in height and tilt (jitter), optional catalyst tips (tip=dict(color='#d6a74f', r=1.25)) and
    core-shell coats (shell=dict(t=0.02, color, alpha)). substrate=dict(t=0.2, color, kind, margin=0.3).
    Anchors: 'wire' (a front wire's mid-height side), 'tip', 'shell', 'substrate', 'base'."""
    rng = np.random.default_rng(seed); x, y, z = loc; objs, A = [], {}
    sub = dict(t=0.2, color='#9aa3ad', kind='semiconductor', margin=0.3); sub.update(substrate or {})
    nx, ny = n; W = (nx - 1) * pitch + (pitch / 2 if hex_grid else 0) + 2 * sub['margin']; D = (ny - 1) * pitch * (math.sqrt(3) / 2 if hex_grid else 1) + 2 * sub['margin']
    objs.append(slab((W, D, sub['t']), (x, y, z - sub['t'] / 2), material(sub['kind'], sub['color']), bevel=0.02, name='substrate'))
    A['substrate'] = (x + W / 2, y - D / 2, z - sub['t'] / 2)
    wb, tb, sb = _Buf(), _Buf(), _Buf(); front = None
    for j in range(ny):
        for i in range(nx):
            px = x - W / 2 + sub['margin'] + i * pitch + (pitch / 2 if hex_grid and j % 2 else 0)
            py = y - D / 2 + sub['margin'] + j * pitch * (math.sqrt(3) / 2 if hex_grid else 1)
            h = height * (1 + jitter * rng.normal() * 0.6); tl = (rng.normal() * jitter * 0.05, rng.normal() * jitter * 0.05)
            _prism_mesh(wb, (px, py, z), radius, h, sides, taper, tl)
            top = (px + tl[0] * h, py + tl[1] * h, z + h)
            if shell is not None: _prism_mesh(sb, (px, py, z), radius + shell.get('t', 0.02), h * 0.96, sides, taper, tl)
            if tip is not None: _add_sphere(tb, (top[0], top[1], top[2] + radius * 0.35), radius * (1 - taper) * tip.get('r', 1.25), scale=(1, 1, 0.8))
            if j == 0 and i == nx // 2 + 1: front = (px, py, z, h, top)
    objs.append(wb.obj('wires', material(kind, color), sharp=30))
    if shell is not None: objs.append(sb.obj('shells', material(shell.get('kind', 'polymer'), shell.get('color', '#e0c27a'), shell.get('alpha', 0.5)), sharp=30))
    if tip is not None: objs.append(tb.obj('tips', material('gold', tip.get('color', '#d6a74f'))))
    px, py, pz, h, top = front
    A['wire'] = (px + radius, py - radius * 0.5, pz + h * 0.5); A['tip'] = (top[0], top[1], top[2] + radius * 0.9)
    A['shell'] = (px + radius * 1.2, py - radius * 0.5, pz + h * 0.7); A['base'] = (px, py - radius, z)
    return objs, _pre(prefix, A)


def pillar_array(shape='round', **kw):
    """Micro/nano-pillar array: nanowire_array with round (48 sides) or square (4 sides) pillars and no taper."""
    kw.setdefault('sides', 48 if shape == 'round' else 4); kw.setdefault('taper', 0.0); kw.setdefault('jitter', 0.0)
    kw.setdefault('color', '#a9b3c0'); kw.setdefault('kind', 'semiconductor')
    return nanowire_array(**kw)


def porous_membrane(size=(3.0, 2.0), thickness=0.28, pore_radius=0.1, pitch=0.3, arrangement='hex', jitter=0.0,
                    seed=0, color='#cfd6de', kind='ceramic', loc=(0, 0, 0), front_cut=True, prefix=''):
    """Membrane slab with through-pores (hexagonal, square or random arrangement). front_cut=True lets the first pore
    row straddle the front edge, so open half-channels show the pore walls in cross-section.
    Anchors: 'membrane', 'pore' (a pore mouth on the top face), 'channel' (a cut channel on the front face)."""
    rng = np.random.default_rng(seed); W, D = size; x, y, z = loc; objs, A = [], {}
    body = slab((W, D, thickness), (x, y, z + thickness / 2), material(kind, color), bevel=0.0, name='membrane')
    cut = _Buf(); tpl = _cyl_tpl(40); pores = []
    rows = int(D / (pitch * (math.sqrt(3) / 2 if arrangement == 'hex' else 1))) + 2
    cols = int(W / pitch) + 2
    if arrangement == 'random':
        for _ in range(rows * cols): pores.append((rng.uniform(-W / 2 + pore_radius * 1.5, W / 2 - pore_radius * 1.5), rng.uniform(-D / 2, D / 2 - pore_radius * 1.5)))
    else:
        dy = pitch * (math.sqrt(3) / 2 if arrangement == 'hex' else 1)
        y0 = -D / 2 if front_cut else -D / 2 + pitch * 0.7
        for j in range(rows):
            for i in range(cols):
                px = -W / 2 + pitch * 0.7 + i * pitch + (pitch / 2 if arrangement == 'hex' and j % 2 else 0)
                py = y0 + j * dy
                px += rng.normal() * jitter * pitch; py += rng.normal() * jitter * pitch
                if abs(px) < W / 2 - pore_radius * 1.4 and py < D / 2 - pore_radius * 1.4: pores.append((px, py))
    for px, py in pores:
        _add_cyl(cut, (x + px, y + py, z - 0.1), (x + px, y + py, z + thickness + 0.1), pore_radius, tpl=tpl)
    cutter = cut.obj('pores_cutter', None, smooth=True); cutter.hide_render = True; cutter.hide_viewport = True
    md = body.modifiers.new('pores', 'BOOLEAN'); md.operation = 'DIFFERENCE'; md.object = cutter
    try: md.solver = 'MANIFOLD'
    except TypeError: md.solver = 'EXACT'
    body.data.shade_smooth()
    for p in body.data.polygons: p.use_smooth = False
    objs.append(body)
    A['membrane'] = (x + W / 2, y - D / 2, z + thickness / 2)
    top = min(pores, key=lambda p: (p[1] - D / 2 * 0.2) ** 2 + (p[0] - W * 0.2) ** 2) if pores else (0, 0)
    A['pore'] = (x + top[0], y + top[1], z + thickness)
    fr = min(pores, key=lambda p: abs(p[1] + D / 2) + abs(p[0]) * 0.1) if pores else (0, -D / 2)
    A['channel'] = (x + fr[0], y - D / 2, z + thickness * 0.5)
    return objs, _pre(prefix, A)
