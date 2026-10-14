"""Apparatus and Earth/environment 3D hero kit: lab equipment, cryogenics, traps, optics, terrain, oceans, globes,
vegetation and infrastructure, rendered headless in Blender and composited under vector labels (built on scene.py).

Usage from a figure's render script (figure/render3d.py):
    import sys; sys.path.insert(0, '<project>/blender'); from scene import *; from apparatus3d import *
    S = setup(width_px=2000, height_px=1400, samples=64); look(S)        # studio world, transparent glass, exposure
    o1, A1 = vessel('beaker', loc=(0, 0, 0), radius=0.5, height=1.0, fill=0.55, liquid_color='#3a8fd0')
    o2, A2 = terrain_block(loc=(4, 0, 0), seed=7, fault={'x': 0.4, 'dip': 60, 'throw': 0.3}, water_table=-0.35)
    o3, A3 = forest(region=(2.2, 5.8, -1.5, 1.5), n=14, seed=3, ground=A2.ground)
    camera_look(loc=(2, -11, 6), target=(2, 0, 0.3), lens_mm=45); studio(target=(2, 0, 0), scale=1.2)
    finish(S, 'figure/art/x.png', anchors={**tag(A1, 'beaker'), **A2, **A3})
Run: blender -b --factory-startup -P figure/render3d.py (Cycles on a GPU when present, else the CPU; 48-96 samples; most scenes 10-40 s on a desktop CPU).

Conventions. Every builder takes hex colours (sRGB, faithful under look()/studio()), an explicit integer seed where anything
is random (same seed = same picture; neighbours built with seed+i are never identical copies), a placement `loc` and a
yaw `rot` in degrees about +z. It returns (objects, anchors): anchors is a dict of named world-space 3D points to pass to
finish() (prefix them with tag() when two parts share names); terrain builders also carry `anchors.ground(x, y)` -> world z,
for standing trees, buildings or turbines on the surface. Units are free; parts are proportioned for scenes a few units
across, like scene.py's. Keep the camera's view of each hero at least ~600 px wide so it survives a 40 mm column.

Materials (return bpy materials; pass them wherever a builder takes mat=):
    brushed_metal(color, rough, streak) stainless / aluminium with anisotropic brushing
    gold_plating(color, rough)          cryostat plates, trap electrodes, attenuators
    copper(color), anodized(color)      coil windings; black optomechanics
    painted(color, rough)               instrument housings, cable jackets, PTFE
    glass_tint(color, edge)             lab glass with a readable tinted rim on white paper
    liquid(color, opacity), water(color, clarity), matte(color), earth(color, var), glow(color) + halo(color) (point
    emitters), limb(color) (atmosphere rim glow)
Apparatus: vessel/beaker/flask/vial, electrochem_cell, vacuum_chamber, dilution_fridge, ion_trap, breadboard,
    post_mount, laser_head, camera_box, helmholtz_coils, cable, peristaltic_pump, flow_cell, flow_loop.
Earth/environment: terrain_block, terrain_surface, ocean_section, globe, atmosphere_layers, cloud, tree, forest,
    city_block, wind_turbine, solar_array, crop_field.
Scene helpers: look(S) (call after setup), studio(target, scale) (key/fill/rim/top lights; only the key casts shadows,
    rim and top never show in reflections), tag(anchors, prefix), no_shadow(objs), lathe(profile), mesh_obj, Anchors.
"""
import bpy, bmesh, math, random, colorsys
from mathutils import Vector, Matrix, Euler, noise
from scene import hex_rgb, _mat, cylinder, fiber_path, emission, beam

TAU = 2 * math.pi


# ----------------------------------------------------------------------------------------------------------- helpers
class Anchors(dict):
    """dict of name -> (x, y, z) world points; `.ground` (terrain builders) maps (x, y) -> world z."""
    ground = None


def tag(anchors, prefix):
    """Prefix every anchor name: tag(A, 'cell') -> {'cell.WE': ...}."""
    return {f'{prefix}.{k}': v for k, v in anchors.items()}


def _rgb(c):
    return hex_rgb(c) if isinstance(c, str) else tuple(c)


def _jitter(hexc, rr, dh=0.02, ds=0.08, dv=0.08):
    """Per-instance colour variation around a hex colour (returns hex)."""
    h = hexc.lstrip('#'); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    H, S, V = colorsys.rgb_to_hsv(r, g, b)
    H = (H + rr.uniform(-dh, dh)) % 1; S = min(1, max(0, S * (1 + rr.uniform(-ds, ds)))); V = min(1, max(0, V * (1 + rr.uniform(-dv, dv))))
    r, g, b = colorsys.hsv_to_rgb(H, S, V)
    return '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))


def _seedvec(seed):
    rr = random.Random(seed * 7919 + 17)
    return Vector((rr.uniform(-500, 500), rr.uniform(-500, 500), rr.uniform(-500, 500)))


def _fbm(x, y, z, seed, octaves=5, gain=0.5, lac=2.03):
    off = _seedvec(seed); s, a, f = 0.0, 1.0, 1.0
    for i in range(octaves):
        s += a * noise.noise(Vector((x * f, y * f, z * f)) + off * (1 + 0.37 * i), noise_basis='PERLIN_ORIGINAL')
        a *= gain; f *= lac
    return s


class _Part:
    """Build in local coordinates, then place everything with one matrix (loc, yaw rot about z, optional tilt)."""
    def __init__(self, loc=(0, 0, 0), rot=0.0, tilt=(0.0, 0.0)):
        self.M = Matrix.Translation(Vector(loc)) @ Euler((math.radians(tilt[0]), math.radians(tilt[1]), math.radians(rot)), 'XYZ').to_matrix().to_4x4()
        self.objs, self.A = [], Anchors()

    def add(self, o):
        if isinstance(o, (list, tuple)):
            for x in o: self.add(x)
            return o
        self.objs.append(o); return o

    def anchor(self, name, p): self.A[name] = tuple(self.M @ Vector(p))

    def done(self):
        bpy.context.view_layer.update()
        for o in self.objs:
            if o.parent is None: o.matrix_world = self.M @ o.matrix_world
        return self.objs, self.A


def _flat_slots(me, flat):
    if flat:
        for p in me.polygons:
            if p.material_index in flat: p.use_smooth = False


def mesh_obj(name, verts, faces, mats, smooth=True, sharp_deg=40, mat_index=None, flat=()):
    """Object from raw verts/faces. mats: material or list; mat_index: per-face material slot; faces in slots
    listed in flat stay flat-shaded (cut faces of slabs, so the surface normals never bleed down the wall)."""
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces]); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    for m in (mats if isinstance(mats, (list, tuple)) else [mats]): me.materials.append(m)
    if mat_index is not None:
        for p, i in zip(me.polygons, mat_index): p.material_index = i
    if smooth:
        me.shade_smooth()
        if sharp_deg: me.set_sharp_from_angle(angle=math.radians(sharp_deg))
        _flat_slots(me, flat)
    return o


def _bm_obj(name, bm, mats, smooth=True, sharp_deg=40, flat=()):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    for m in (mats if isinstance(mats, (list, tuple)) else [mats]): me.materials.append(m)
    if smooth:
        me.shade_smooth()
        if sharp_deg: me.set_sharp_from_angle(angle=math.radians(sharp_deg))
        _flat_slots(me, flat)
    return o


def lathe_data(profile, seg=96, closed=False, a0=0.0):
    """Surface of revolution about z. profile: [(r, z)] (r=0 -> pole). Walk the outer surface upward for outward normals."""
    verts, rings = [], []
    for r, z in profile:
        if r < 1e-7:
            rings.append([len(verts)]); verts.append((0.0, 0.0, z))
        else:
            rings.append(list(range(len(verts), len(verts) + seg)))
            verts += [(r * math.cos(a0 + TAU * k / seg), r * math.sin(a0 + TAU * k / seg), z) for k in range(seg)]
    faces = []
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for A, B in pairs:
        if len(A) == 1 and len(B) == 1: continue
        for k in range(seg):
            k1 = (k + 1) % seg
            if len(A) == 1: faces.append((A[0], B[k1], B[k]))
            elif len(B) == 1: faces.append((A[k], A[k1], B[0]))
            else: faces.append((A[k], A[k1], B[k1], B[k]))
    return verts, faces


def lathe(profile, mat, seg=96, loc=(0, 0, 0), name='lathe', closed=False, smooth=True, sharp_deg=50):
    v, f = lathe_data(profile, seg, closed)
    v = [(x + loc[0], y + loc[1], z + loc[2]) for x, y, z in v]
    return mesh_obj(name, v, f, mat, smooth, sharp_deg)


def _chaikin(pts, it=3, keep_ends=True):
    for _ in range(it):
        out = [pts[0]] if keep_ends else []
        for a, b in zip(pts, pts[1:]):
            out += [(0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]), (0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1])]
        if keep_ends: out.append(pts[-1])
        pts = out
    return pts


def _offset2d(pts, d):
    """Offset a (r, z) polyline by d to its left (inside of a vessel walked bottom-centre -> rim)."""
    out = []
    for i, p in enumerate(pts):
        a = pts[max(i - 1, 0)]; b = pts[min(i + 1, len(pts) - 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]; L = math.hypot(tx, tz) or 1
        out.append((p[0] - tz / L * d, p[1] + tx / L * d))
    return out


def _cyl(p0, p1, r, mat, seg=48):
    return cylinder(p0, p1, r, mat, seg)


def _box(size, loc, mat, bevel=0.0, rot=(0, 0, 0), name='box'):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = bpy.context.object; o.name = name
    o.scale = size
    if bevel:
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        md = o.modifiers.new('bev', 'BEVEL'); md.width = bevel; md.segments = 3; md.limit_method = 'ANGLE'
        md.harden_normals = False
        o.data.shade_smooth(); o.data.set_sharp_from_angle(angle=math.radians(35))
    o.data.materials.append(mat); return o


def _sphere(loc, r, mat, seg=48, name='sphere'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=r, location=loc)
    o = bpy.context.object; o.name = name; o.data.shade_smooth(); o.data.materials.append(mat); return o


# ----------------------------------------------------------------------------------------------------------- materials
class _N:
    """Tiny shader-graph builder."""
    def __init__(self, name):
        self.m = bpy.data.materials.new(name); self.m.use_nodes = True; self.nt = self.m.node_tree
        self.bsdf = self.nt.nodes.get('Principled BSDF'); self.out = self.nt.nodes.get('Material Output')

    def new(self, t, **props):
        n = self.nt.nodes.new(t)
        for k, v in props.items(): setattr(n, k, v)
        return n

    def put(self, sock, v):
        if isinstance(v, bpy.types.NodeSocket): self.nt.links.new(v, sock)
        elif isinstance(v, str): sock.default_value = hex_rgb(v)
        else: sock.default_value = v

    def set(self, **kw):
        for k, v in kw.items(): self.put(self.bsdf.inputs[k.replace('_', ' ')], v)

    def math(self, op, a, b=0.0, clamp=False):
        n = self.new('ShaderNodeMath', operation=op, use_clamp=clamp); self.put(n.inputs[0], a); self.put(n.inputs[1], b); return n.outputs[0]

    def mix(self, fac, a, b):
        n = self.new('ShaderNodeMix', data_type='RGBA', clamp_factor=True)
        self.put(n.inputs[0], fac); self.put(n.inputs[6], a); self.put(n.inputs[7], b); return n.outputs[2]

    def coord(self, kind='Object'): return self.new('ShaderNodeTexCoord').outputs[kind]

    def xyz(self, vec):
        s = self.new('ShaderNodeSeparateXYZ'); self.put(s.inputs[0], vec); return s.outputs

    def noise(self, vec, scale=5.0, detail=4.0, rough=0.55, w=0.0, out='Fac'):
        n = self.new('ShaderNodeTexNoise', noise_dimensions='4D')
        self.put(n.inputs['Vector'], vec); n.inputs['W'].default_value = w
        n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        return n.outputs[out]

    def ramp(self, fac, stops, interp='LINEAR'):
        n = self.new('ShaderNodeValToRGB'); cr = n.color_ramp; cr.interpolation = interp
        stops = sorted(stops, key=lambda s: s[0])
        while len(cr.elements) < len(stops): cr.elements.new(0.5)
        for e, (p, c) in zip(cr.elements, stops): e.position = min(max(p, 0.0), 1.0); e.color = _rgb(c)
        self.put(n.inputs[0], fac); return n.outputs[0]

    def maprange(self, v, a, b, lo=0.0, hi=1.0, clamp=True):
        n = self.new('ShaderNodeMapRange', clamp=clamp); self.put(n.inputs[0], v)
        n.inputs[1].default_value, n.inputs[2].default_value, n.inputs[3].default_value, n.inputs[4].default_value = a, b, lo, hi
        return n.outputs[0]

    def bump(self, height, strength=0.2, dist=0.02):
        n = self.new('ShaderNodeBump'); n.inputs['Strength'].default_value = strength; n.inputs['Distance'].default_value = dist
        self.put(n.inputs['Height'], height); self.put(self.bsdf.inputs['Normal'], n.outputs['Normal']); return n.outputs['Normal']


def matte(color, rough=0.85):
    return _mat('matte', **{'Base Color': hex_rgb(color), 'Roughness': rough})


def painted(color, rough=0.4, coat=0.25):
    """Satin painted/moulded housing (instrument covers, PTFE, cable jackets)."""
    return _mat('painted', **{'Base Color': hex_rgb(color), 'Roughness': rough, 'Coat Weight': coat, 'Coat Roughness': 0.2})


def anodized(color='#2a2d33', rough=0.42):
    """Black (or coloured) anodised aluminium: satin, faint grain."""
    g = _N('anodized'); g.set(Base_Color=color, Roughness=rough, Metallic=0.35, Coat_Weight=0.15)
    g.bump(g.noise(g.coord(), 180.0, 2.0), 0.04); return g.m


def brushed_metal(color='#c3c8ce', rough=0.3, streak='z', aniso=0.55, grain=0.06):
    """Brushed stainless / aluminium. streak: axis the brush lines run along ('x', 'y', 'z' or 'radial')."""
    g = _N('brushed'); g.set(Base_Color=color, Metallic=1.0, Roughness=rough, Anisotropic=aniso)
    sc = {'x': (2, 260, 260), 'y': (260, 2, 260), 'z': (260, 260, 2), 'radial': (60, 60, 60)}[streak]
    mp = g.new('ShaderNodeMapping'); g.put(mp.inputs['Vector'], g.coord()); mp.inputs['Scale'].default_value = sc
    lines = g.noise(mp.outputs[0], 1.0, 3.0, 0.6)
    g.bump(lines, grain, 0.01)
    g.put(g.bsdf.inputs['Roughness'], g.maprange(g.noise(g.coord(), 3.0, 2.0), 0.3, 0.7, rough * 0.8, rough * 1.25))
    return g.m


def gold_plating(color='#e2b04a', rough=0.2):
    """Gold-plated copper (dilution-fridge plates, trap electrodes): warm metal with soft mottling."""
    g = _N('gold'); g.set(Metallic=1.0)
    n = g.noise(g.coord(), 2.5, 3.0, 0.5)
    g.put(g.bsdf.inputs['Base Color'], g.mix(g.maprange(n, 0.3, 0.7, 0, 0.6), color, _shade(color, 0.93)))
    g.put(g.bsdf.inputs['Roughness'], g.maprange(n, 0.3, 0.7, rough * 0.9, rough * 1.12))
    return g.m


def copper(color='#cf8a5c', rough=0.28):
    return _mat('copper', **{'Base Color': hex_rgb(color), 'Metallic': 1.0, 'Roughness': rough})


def glass_tint(color='#e4f0f4', edge='#7f9bab', edge_amount=0.55, ior=1.47, rough=0.0):
    """Lab glass for white paper: clear body plus a tinted grazing-angle rim so the outline reads without a stroke."""
    g = _N('glass'); g.set(Base_Color=color, Roughness=rough, Transmission_Weight=1.0, IOR=ior)
    rim = g.new('ShaderNodeBsdfPrincipled'); rim.inputs['Base Color'].default_value = hex_rgb(edge)
    rim.inputs['Roughness'].default_value = 0.2; rim.inputs['Coat Weight'].default_value = 0.6
    lw = g.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.3
    f = g.math('MULTIPLY', g.math('POWER', lw.outputs['Facing'], 2.2), edge_amount, clamp=True)
    mx = g.new('ShaderNodeMixShader'); g.put(mx.inputs[0], f); g.put(mx.inputs[1], g.bsdf.outputs[0]); g.put(mx.inputs[2], rim.outputs[0])
    g.put(g.out.inputs['Surface'], mx.outputs[0]); return g.m


def liquid(color='#3a8fd0', opacity=0.45, ior=1.33):
    """Tinted liquid: transmissive tint mixed with a little diffuse body colour so the hue survives on white."""
    g = _N('liquid'); g.set(Base_Color=color, Roughness=0.02, Transmission_Weight=1.0, IOR=ior)
    body = g.new('ShaderNodeBsdfPrincipled'); body.inputs['Base Color'].default_value = hex_rgb(color)
    body.inputs['Roughness'].default_value = 0.15; body.inputs['Coat Weight'].default_value = 0.5
    mx = g.new('ShaderNodeMixShader'); mx.inputs[0].default_value = opacity
    g.put(mx.inputs[1], g.bsdf.outputs[0]); g.put(mx.inputs[2], body.outputs[0]); g.put(g.out.inputs['Surface'], mx.outputs[0]); return g.m


def water(color='#3d8fc6', clarity=0.35, rough=0.05):
    """Open water surface (rivers, lakes, sea). clarity 0 = opaque blue, 1 = clear (bed shows through)."""
    return liquid(color, 1 - clarity, 1.33) if clarity > 0 else _mat('water', **{'Base Color': hex_rgb(color), 'Roughness': rough, 'Coat Weight': 0.8})


def earth(color='#8b6a4a', var=0.12, scale=6.0, bump=0.15, seed=0):
    """Matte earth tone with low-frequency value variation and fine grain (soil, rock, sediment)."""
    g = _N('earth'); g.set(Roughness=0.9)
    n = g.noise(g.coord(), scale, 5.0, 0.6, w=seed * 0.37)
    g.put(g.bsdf.inputs['Base Color'], g.mix(g.maprange(n, 0.3, 0.7), _shade(color, 1 - var), _shade(color, 1 + var)))
    if bump: g.bump(g.noise(g.coord(), scale * 8, 3.0, 0.6, w=seed), bump, 0.02)
    return g.m


def _clear_plastic(edge='#9fb3bd', gloss=0.6):
    """Cheap clear tubing: see-through centre, tinted glossy edges (no refraction, renders fast)."""
    g = _N('clear'); tr = g.new('ShaderNodeBsdfTransparent'); g.set(Base_Color=edge, Roughness=0.1, Coat_Weight=0.8)
    lw = g.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35
    f = g.math('MULTIPLY', g.math('POWER', lw.outputs['Facing'], 1.6), gloss, clamp=True)
    mx = g.new('ShaderNodeMixShader'); g.put(mx.inputs[0], f); g.put(mx.inputs[1], tr.outputs[0]); g.put(mx.inputs[2], g.bsdf.outputs[0])
    g.put(g.out.inputs['Surface'], mx.outputs[0]); return g.m


def glow(color='#3db4f2', strength=3.0):
    """Self-luminous point (trapped ion, fluorophore): hot core; pair with a halo() sphere."""
    return _mat('glow', **{'Base Color': hex_rgb(color), 'Emission Color': hex_rgb(color), 'Emission Strength': strength})


def halo(color='#3db4f2', strength=1.2, power=2.5):
    g = _N('halo'); tr = g.new('ShaderNodeBsdfTransparent'); em = g.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = hex_rgb(color); em.inputs['Strength'].default_value = strength
    lw = g.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    f = g.math('POWER', g.math('SUBTRACT', 1.0, lw.outputs['Facing'], clamp=True), power)
    mx = g.new('ShaderNodeMixShader'); g.put(mx.inputs[0], f); g.put(mx.inputs[1], tr.outputs[0]); g.put(mx.inputs[2], em.outputs[0])
    g.put(g.out.inputs['Surface'], mx.outputs[0]); return g.m


def limb(color='#8cc8ff', strength=1.0, power=3.0):
    """Atmosphere limb glow: transparent face-on, glowing toward the silhouette."""
    g = _N('limb'); tr = g.new('ShaderNodeBsdfTransparent'); em = g.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = hex_rgb(color); em.inputs['Strength'].default_value = strength
    lw = g.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    f = g.math('POWER', lw.outputs['Facing'], power)
    mx = g.new('ShaderNodeMixShader'); g.put(mx.inputs[0], f); g.put(mx.inputs[1], tr.outputs[0]); g.put(mx.inputs[2], em.outputs[0])
    g.put(g.out.inputs['Surface'], mx.outputs[0]); return g.m


def _shade(hexc, k):
    h = hexc.lstrip('#'); c = [min(255, max(0, round(int(h[i:i + 2], 16) * k))) for i in (0, 2, 4)]
    return '#%02x%02x%02x' % tuple(c)


def _objcolor_mat(name, rough=0.8, var=0.15, scale=8.0, pointy=0.0, coat=0.0):
    """One material, per-object colour (object.color) + noise variation: per-instance variation without copies."""
    g = _N(name); oi = g.new('ShaderNodeObjectInfo')
    n = g.noise(g.coord(), scale, 4.0, 0.6)
    k = g.maprange(n, 0.3, 0.7, 1 - var, 1 + var)
    col = g.new('ShaderNodeVectorMath', operation='SCALE'); g.put(col.inputs[0], oi.outputs['Color']); g.put(col.inputs['Scale'], k)
    c = col.outputs[0]
    if pointy:   # darken crevices (Cycles pointiness) for foliage clumps
        geo = g.new('ShaderNodeNewGeometry'); ao = g.maprange(geo.outputs['Pointiness'], 0.45, 0.56, 1 - pointy, 1.0)
        c2 = g.new('ShaderNodeVectorMath', operation='SCALE'); g.put(c2.inputs[0], c); g.put(c2.inputs['Scale'], ao); c = c2.outputs[0]
    g.put(g.bsdf.inputs['Base Color'], c); g.set(Roughness=rough, Coat_Weight=coat); return g.m


def _set_color(o, hexc): o.color = hex_rgb(hexc)


def no_shadow(objs):
    """Stop objects casting shadows (beams, glows, thin glass that would print a grey slab on the floor)."""
    for o in (objs if isinstance(objs, (list, tuple)) else [objs]): o.visible_shadow = False
    return objs


# ----------------------------------------------------------------------------------------------------------- look
def look(S, samples=None, world_top='#ffffff', world_horizon='#dfe4ea', world_bottom='#8a939d', strength=0.55, reflect=0.75):
    """Studio world for journal art: light grey gradient environment (metals and glass get something to reflect),
    transparent film including through glass, flat 'Standard' colour, adaptive sampling. `reflect` brightens the
    world only as seen in reflections (metal, gold, glass) without lifting diffuse colours."""
    sc = S; sc.cycles.film_transparent_glass = True; sc.render.film_transparent = True
    sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.02
    sc.cycles.max_bounces = 10; sc.cycles.transmission_bounces = 10; sc.cycles.glossy_bounces = 4; sc.cycles.diffuse_bounces = 3
    sc.cycles.transparent_max_bounces = 12
    if samples: sc.cycles.samples = samples
    w = sc.world; nt = w.node_tree; bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    rp = nt.nodes.new('ShaderNodeValToRGB'); cr = rp.color_ramp; cr.elements.new(0.5)
    for e, (p, c) in zip(cr.elements, [(0.3, world_bottom), (0.52, world_horizon), (0.85, world_top)]): e.position = p; e.color = hex_rgb(c)
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs[1].default_value = -1; mr.inputs[2].default_value = 1
    nt.links.new(sep.outputs['Z'], mr.inputs[0]); nt.links.new(mr.outputs[0], rp.inputs[0]); nt.links.new(rp.outputs[0], bg.inputs[0])
    lp = nt.nodes.new('ShaderNodeLightPath'); m1 = nt.nodes.new('ShaderNodeMath'); m1.operation = 'MULTIPLY_ADD'
    nt.links.new(lp.outputs['Is Glossy Ray'], m1.inputs[0]); m1.inputs[1].default_value = reflect; m1.inputs[2].default_value = strength
    nt.links.new(m1.outputs[0], bg.inputs[1])
    return sc


def studio(target=(0, 0, 0), scale=1.0, key=1.0, fill=1.0, rim=1.0, top=1.0, key_dir=(-0.5, -0.75, 0.8), shadows=('key',)):
    """Key / fill / rim / top area lights aimed at target, sized for a subject ~scale*4 units across."""
    t = Vector(target); objs = []
    kd = Vector(key_dir).normalized()
    for name, d, e, size in [('key', kd, 650 * key, 3.0), ('fill', Vector((0.85, -0.45, 0.3)), 180 * fill, 5.0),
                             ('rim', Vector((0.2, 0.9, 0.55)), 280 * rim, 3.0), ('top', Vector((0.1, 0.1, 1.0)), 160 * top, 6.0)]:
        loc = t + d.normalized() * 9 * scale
        bpy.ops.object.light_add(type='AREA', location=loc); L = bpy.context.object; L.name = 'L_' + name
        L.data.energy = e * scale ** 2; L.data.size = size * scale; L.data.use_shadow = name in shadows
        L.rotation_euler = (t - loc).to_track_quat('-Z', 'Y').to_euler(); objs.append(L)
        if name in ('rim', 'top'): L.visible_glossy = False    # no big white panes mirrored in flat glass/metal
    return objs


# ----------------------------------------------------------------------------------------------------------- glassware
def _vessel_outer(kind, R, H, rn):
    c = min(0.12 * R, 0.08)
    if kind == 'beaker':
        pts = _chaikin([(0, 0), (R * 0.5, 0), (R, 0), (R, c * 1.5)], 3) + [(R, H * 0.97), (R * 1.035, H)]
    elif kind == 'flask':      # Erlenmeyer
        pts = _chaikin([(0, 0), (R * 0.5, 0), (R, 0), (R, c), (rn * 1.05, H * 0.66), (rn, H * 0.74), (rn, H * 0.86)], 3) + [(rn, H * 0.97), (rn * 1.12, H)]
    elif kind == 'round':      # round-bottom flask
        Rb = R; t1 = math.pi - math.asin(min(rn / Rb, 0.99))
        pts = [(Rb * math.sin(t), Rb * (1 - math.cos(t))) for t in [t1 * i / 40 for i in range(41)]]
        pts = _chaikin(pts + [(rn, 2 * Rb + 0.1 * (H - 2 * Rb)), (rn, 2 * Rb + 0.5 * (H - 2 * Rb))], 2) + [(rn, H * 0.985), (rn * 1.12, H)]
    elif kind == 'vial':
        pts = _chaikin([(0, 0), (R * 0.5, 0), (R, 0), (R, c * 2), (R, H * 0.8), (rn, H * 0.86), (rn, H * 0.9)], 3) + [(rn, H)]
    elif kind == 'tube':       # test tube
        pts = [(R * math.sin(t), R * (1 - math.cos(t))) for t in [math.pi / 2 * i / 16 for i in range(17)]] + [(R, H * 0.98), (R * 1.08, H)]
    else:
        raise ValueError(kind)
    return pts


def vessel(kind='beaker', loc=(0, 0, 0), radius=0.5, height=None, fill=0.55, liquid_color='#3a8fd0', liquid_opacity=0.45,
           wall=None, neck=None, glass=None, spout=True, graduations=4, grad_color='#6f8594', cap='#2f5d9c', rot=0, seed=0):
    """Glass vessel with tinted liquid and a concave meniscus. kind: beaker | flask (Erlenmeyer) | round | vial | tube.
    fill: liquid height as a fraction of the inner height (0 = empty). Anchors: rim, liquid (surface centre),
    liquid_side (on the front wall at the surface), bottom, body (front wall mid-liquid), neck (flasks/vials)."""
    P = _Part(loc, rot)
    H = height or {'beaker': 2.7, 'flask': 3.1, 'round': 3.3, 'vial': 4.2, 'tube': 7.0}[kind] * radius
    rn = neck or {'flask': 0.3, 'round': 0.28, 'vial': 0.72}.get(kind, 1.0) * radius
    wt = wall or max(0.018, 0.045 * radius)
    outer = _vessel_outer(kind, radius, H, rn)
    body = outer[:-1] if kind != 'vial' else outer
    inner = _offset2d(body, wt)
    inner[0] = (0.0, inner[0][1])
    lip = outer[-1]
    top_in = (inner[-1][0], lip[1])
    prof = outer + [((lip[0] + top_in[0]) / 2, lip[1] + wt * 0.35), top_in] + list(reversed(inner))
    v, f = lathe_data(prof, 96)
    if spout and kind == 'beaker':
        for i, (x, y, z) in enumerate(v):
            a = math.atan2(y, x); da = (a - math.radians(-40) + math.pi) % TAU - math.pi
            wgt = math.exp(-(da / 0.28) ** 2) * max(0.0, (z - (H - 0.16 * H)) / (0.16 * H))
            r = math.hypot(x, y)
            if r > 1e-6:
                k = (r + 0.14 * radius * wgt ** 1.5) / r; v[i] = (x * k, y * k, z + 0.03 * H * wgt)
    gm = glass or glass_tint()
    P.add(mesh_obj('vessel', v, f, gm, True, 60))
    zin0 = inner[0][1]; zi_top = max(z for _, z in inner)
    if fill > 0:
        zf = zin0 + fill * (zi_top - zin0)
        lq = [p for p in _offset2d(inner, -0.35 * wt) if p[1] < zf]
        lq[0] = (0.0, zin0 - 0.2 * wt)
        # radius at the fill level
        rf = lq[-1][0]
        for a, b in zip(inner, inner[1:]):
            if a[1] <= zf <= b[1] and b[1] > a[1]: rf = a[0] + (b[0] - a[0]) * (zf - a[1]) / (b[1] - a[1]) + 0.35 * wt; break
        m = min(0.06 * radius, 0.35 * rf)
        men = [(rf - 3 * m * s, zf + m * math.exp(-4 * s) - m * math.exp(-4)) for s in [i / 12 for i in range(13)]]
        lq = lq + [(rf, zf + m)] + men[1:] + [(0.0, zf)]
        v2, f2 = lathe_data(lq, 96)
        P.add(mesh_obj('liquid', v2, f2, liquid(liquid_color, liquid_opacity), True, 70))
        P.anchor('liquid', (0, 0, zf)); P.anchor('liquid_side', (0, -rf, zf)); P.anchor('body', (0, -radius, zin0 + 0.5 * (zf - zin0)))
    if graduations and kind in ('beaker', 'flask'):
        gmat = matte(grad_color, 0.6); top = H * (0.8 if kind == 'beaker' else 0.55)
        for i in range(graduations):
            z = H * 0.2 + (top - H * 0.2) * (i + 1) / graduations
            rr_ = _radius_at(outer, z) + 0.003
            span = 0.28 if i % 2 == 0 else 0.16
            a0 = -math.pi / 2 - 0.55
            vv, ff = [], []
            n = 14
            for k in range(n + 1):
                a = a0 + span * k / n
                for dz in (-0.006 * H, 0.006 * H):
                    vv.append((rr_ * math.cos(a), rr_ * math.sin(a), z + dz))
            for k in range(n): ff.append((2 * k, 2 * k + 2, 2 * k + 3, 2 * k + 1))
            P.add(mesh_obj('grad', vv, ff, gmat, False))
    if kind == 'vial':
        ch = 0.14 * H
        P.add(lathe(_chaikin([(0, H + ch), (rn * 1.18, H + ch), (rn * 1.18, H - 0.02 * H)], 2) + [(rn * 1.0, H - 0.02 * H)], painted(cap, 0.45), 64, name='cap'))
        P.anchor('cap', (0, 0, H + ch))
    P.anchor('rim', (0, 0, H)); P.anchor('bottom', (0, 0, 0)); P.anchor('neck', (0, -rn, H * 0.9))
    return P.done()


def _radius_at(prof, z):
    for a, b in zip(prof, prof[1:]):
        if min(a[1], b[1]) <= z <= max(a[1], b[1]) and a[1] != b[1]: return a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1])
    return prof[-1][0]


def beaker(loc=(0, 0, 0), radius=0.5, **kw): return vessel('beaker', loc, radius, **kw)
def flask(loc=(0, 0, 0), radius=0.5, **kw): return vessel('flask', loc, radius, **kw)
def vial(loc=(0, 0, 0), radius=0.2, **kw): return vessel('vial', loc, radius, **kw)


def electrochem_cell(loc=(0, 0, 0), radius=0.6, height=1.25, electrolyte='#8ec3e6', we='#2e9d57', ce='#d6453d', re='#e2b43a',
                     cable_out=(1, 0.6), cable_reach=2.2, rot=0, seed=0):
    """Three-electrode cell: glass beaker, PTFE lid, working electrode (PTFE-shrouded disc), Pt coil counter electrode and a
    glass reference electrode with frit and Ag/AgCl wire; cables leave toward cable_out (x, y direction) and land
    cable_reach radii away.
    Anchors: WE, CE, RE (immersed parts), WE_tip, lid, electrolyte, cable_WE, cable_CE, cable_RE (cable ends)."""
    P = _Part(loc, rot)
    o, A = vessel('beaker', (0, 0, 0), radius, height, fill=0.7, liquid_color=electrolyte, liquid_opacity=0.35, spout=False, graduations=0)
    P.add(o)
    zl = height + 0.02; P.add(lathe(_chaikin([(0, zl + 0.1), (radius * 1.08, zl + 0.1), (radius * 1.08, zl), (radius * 0.95, zl), (radius * 0.95, zl - 0.12)], 2) + [(0, zl - 0.12)], painted('#efeee8', 0.5, 0.1), 96, name='lid'))
    ztop = zl + 0.1; zliq = A['liquid'][2]
    ptfe = painted('#f1f0ea', 0.45, 0.1); pt = brushed_metal('#d9dcdf', 0.18, 'z')
    # working electrode (centre-front)
    wx, wy = -0.05 * radius, -0.28 * radius; wtip = 0.25 * height
    P.add(_cyl((wx, wy, wtip), (wx, wy, ztop + 0.35), 0.075 * radius / 0.6, ptfe))
    P.add(_cyl((wx, wy, wtip - 0.004), (wx, wy, wtip + 0.01), 0.04 * radius / 0.6, painted('#1d1f22', 0.15, 0.6)))
    P.add(_cyl((wx, wy, ztop + 0.35), (wx, wy, ztop + 0.5), 0.03, pt))
    # counter electrode: Pt wire + coil
    cx, cy = 0.42 * radius, 0.1 * radius
    pts = [(cx, cy, ztop + 0.35), (cx, cy, 0.5 * height)]
    for i in range(1, 60):
        t = i / 59; a = t * 7 * TAU
        pts.append((cx + 0.07 * radius * math.cos(a), cy + 0.07 * radius * math.sin(a), 0.5 * height - t * 0.3 * height))
    P.add(fiber_path(pts, 0.012, pt, 6))
    # reference electrode: glass tube, internal solution, Ag/AgCl wire, frit, cap
    rx, ry = -0.38 * radius, 0.22 * radius; rb = 0.3 * height; rr_ = 0.07 * radius / 0.6
    P.add(lathe(_chaikin([(0, rb), (rr_ * 0.9, rb), (rr_, rb + 0.02)], 2) + [(rr_, ztop + 0.3), (0, ztop + 0.3)], glass_tint('#e9f3f5', '#7c96a5', 0.5), 48, (rx, ry, 0), 'RE'))
    P.add(_cyl((rx, ry, rb - 0.005), (rx, ry, rb + 0.05), rr_ * 0.92, matte('#cdb892', 0.95)))
    P.add(lathe([(0, rb + 0.05), (rr_ * 0.8, rb + 0.05), (rr_ * 0.8, ztop - 0.05), (0, ztop - 0.05)], liquid('#f2e7c4', 0.3), 32, (rx, ry, 0), 'REfill'))
    P.add(_cyl((rx, ry, rb + 0.15), (rx, ry, ztop + 0.3), 0.012, brushed_metal('#cfd2d4', 0.25)))
    P.add(_cyl((rx, ry, rb + 0.12), (rx, ry, rb + 0.2), 0.016, matte('#4b3f3a', 0.7)))
    P.add(_cyl((rx, ry, ztop + 0.3), (rx, ry, ztop + 0.42), rr_ * 1.25, painted(re, 0.4)))
    # cables
    dx, dy = cable_out; L = math.hypot(dx, dy); dx, dy = dx / L, dy / L
    ends = {}
    for nm, (x, y, z0), col in [('WE', (wx, wy, ztop + 0.5), we), ('CE', (cx, cy, ztop + 0.35), ce), ('RE', (rx, ry, ztop + 0.42), re)]:
        k = cable_reach / 2.2
        e = (x + dx * cable_reach * radius, y + dy * cable_reach * radius, 0.03)
        P.add(fiber_path([(x, y, z0 - 0.02), (x, y, z0 + 0.3), (x + dx * 0.35 * k * radius, y + dy * 0.35 * k * radius, z0 + 0.5), (x + dx * 1.3 * k * radius, y + dy * 1.3 * k * radius, z0 + 0.1),
                          (x + dx * 1.9 * k * radius, y + dy * 1.9 * k * radius, 0.2), e], 0.022, painted(col, 0.35), 32))
        P.add(_cyl((x, y, z0 - 0.02), (x, y, z0 + 0.08), 0.035, brushed_metal('#c9ccd0', 0.3)))
        ends[nm] = e
    P.anchor('WE', (wx, wy - 0.08, zliq * 0.7)); P.anchor('WE_tip', (wx, wy, wtip)); P.anchor('CE', (cx, cy, 0.35 * height))
    P.anchor('RE', (rx, ry, rb)); P.anchor('lid', (0, -radius * 1.08, ztop)); P.anchor('electrolyte', (0, -radius, zliq * 0.5))
    for k, e in ends.items(): P.anchor('cable_' + k, e)
    return P.done()


# ----------------------------------------------------------------------------------------------------------- vacuum
def _flange(P, c, d, r_tube, r_fl, th, bolts, mat, kind='blank', gap=True, bolt_mat=None, glass=None, seed=0, inside=None):
    """CF-style flange pair at centre c facing direction d (unit). Returns the outer face centre."""
    d = Vector(d).normalized(); c = Vector(c)
    P.add(_cyl(c, c + d * th, r_fl, mat, 96))
    c2 = c + d * (th + (0.006 if gap else 0))
    P.add(_cyl(c2, c2 + d * th, r_fl, mat, 96))
    face = c2 + d * th
    q = d.to_track_quat('Z', 'Y')
    bm_ = bolt_mat or brushed_metal('#d4d7da', 0.35, 'radial')
    for k in range(bolts):
        a = TAU * (k + 0.5) / bolts; off = q @ Vector((0.82 * r_fl * math.cos(a), 0.82 * r_fl * math.sin(a), 0))
        P.add(cylinder(face + off, face + off + d * th * 0.55, th * 0.42, bm_, 6))
        P.add(cylinder(c - d * th * 0.5 + off, c + off, th * 0.42, bm_, 6))
    if kind == 'viewport':
        if inside:   # glow brightest at the window centre, fading to the dark rim
            g = _N('lit'); g.set(Base_Color='#14171b', Roughness=0.9, Emission_Color=inside)
            sp = g.xyz(g.coord()); rr_ = g.math('SQRT', g.math('ADD', g.math('MULTIPLY', sp[0], sp[0]), g.math('MULTIPLY', sp[1], sp[1])))
            g.put(g.bsdf.inputs['Emission Strength'], g.math('POWER', g.maprange(rr_, 0.0, r_tube * 0.95, 1.0, 0.0), 1.6))
            back = g.m
        else: back = matte('#14171b', 0.9)
        P.add(_cyl(face - d * 0.3 * th, face + d * 0.004, r_tube * 0.95, back, 64))
        P.add(_cyl(face + d * 0.002, face + d * 0.012, r_tube * 0.93, glass or glass_tint('#cfe3ee', '#5f8497', 0.6), 64))
        P.add(_ring(face + d * 0.004, d, r_tube * 0.93, r_tube * 1.08, th * 0.25, mat))
    elif kind == 'feedthrough':
        cer = painted('#f3efe6', 0.35, 0.3); pin = gold_plating()
        for k in range(4):
            a = TAU * k / 4 + 0.4; off = q @ Vector((0.4 * r_tube * math.cos(a), 0.4 * r_tube * math.sin(a), 0))
            P.add(cylinder(face + off, face + off + d * th * 1.2, r_tube * 0.14, cer, 32))
            P.add(cylinder(face + off, face + off + d * th * 2.4, r_tube * 0.04, pin, 16))
    return face


def _ring(c, d, r0, r1, th, mat, seg=96):
    v, f = lathe_data([(r0, 0), (r1, 0), (r1, th), (r0, th)], seg, closed=True)
    o = mesh_obj('ring', v, f, mat, True, 40)
    o.matrix_world = Matrix.Translation(Vector(c)) @ Vector(d).to_track_quat('Z', 'Y').to_matrix().to_4x4()
    return o


def vacuum_chamber(loc=(0, 0, 0), radius=1.0, kind='octagon', ports=None, color='#c6cbd1', inside=None, rot=0, seed=0):
    """UHV chamber: kind 'sphere' | 'octagon' (spherical-octagon cold-atom cell) | 'cylinder'. ports: list of dicts
    {dir:(x,y,z), len, r, type:'viewport'|'blank'|'feedthrough'}; default: a sensible set for the kind.
    inside: optional hex colour: viewports glow with it, as if lit by a sample or atom cloud inside.
    Anchors: centre, port<i> (outer face of each port), top, bottom, and 'window<i>' for viewports."""
    P = _Part(loc, rot); R = radius
    st = brushed_metal(color, 0.28, 'radial', 0.4)
    if kind == 'sphere':
        P.add(_sphere((0, 0, 0), R, st, 96))
        ports = ports or [{'dir': (math.cos(a), math.sin(a), 0), 'type': 'viewport' if i % 2 == 0 else 'blank'} for i, a in enumerate([TAU * k / 6 + 0.3 for k in range(6)])] + [{'dir': (0, 0, 1), 'type': 'feedthrough', 'r': 0.3 * R}]
    elif kind == 'octagon':
        h = 0.55 * R
        v, f = lathe_data([(0, -h / 2), (R, -h / 2), (R, h / 2), (0, h / 2)], 8, a0=math.pi / 8)
        P.add(mesh_obj('octagon', v, f, st, True, 30))
        ap = R * math.cos(math.pi / 8)
        ports = ports or [{'dir': (math.cos(TAU * k / 8), math.sin(TAU * k / 8), 0), 'len': 0.22 * R, 'r': 0.2 * R, 'type': 'viewport' if k % 2 == 1 else ('blank' if k in (0, 4) else 'viewport'), 'start': ap} for k in range(8)] + \
            [{'dir': (0, 0, 1), 'len': 0.05 * R, 'r': 0.62 * R, 'type': 'viewport', 'start': h / 2}, {'dir': (0, 0, -1), 'len': 0.05 * R, 'r': 0.62 * R, 'type': 'viewport', 'start': h / 2}]
    else:
        h = 1.4 * R
        P.add(lathe([(0, -h / 2), (R, -h / 2), (R, h / 2), (0, h / 2)], st, 128, name='cyl', sharp_deg=30))
        ports = ports or [{'dir': (math.cos(a), math.sin(a), 0), 'type': t, 'r': 0.22 * R} for a, t in [(-1.9, 'viewport'), (-0.7, 'viewport'), (0.8, 'feedthrough'), (2.4, 'blank')]] + [{'dir': (0, 0, 1), 'type': 'blank', 'r': 0.95 * R, 'len': 0.02, 'start': h / 2}]
    wi = 0
    for i, p in enumerate(ports):
        d = Vector(p['dir']).normalized(); r = p.get('r', 0.22 * R); L = p.get('len', 0.35 * R); s0 = p.get('start', R * 0.8)
        if L > 0.03: P.add(cylinder(d * s0 * 0.9, d * (s0 + L), r, st, 64))
        th = max(0.05 * R, 0.25 * r)
        face = _flange(P, d * (s0 + L), d, r, r * 1.55, th, 8 if r < 0.4 * R else 16, st, p.get('type', 'blank'), seed=seed + i, inside=inside)
        P.anchor(f'port{i}', tuple(face))
        if p.get('type') == 'viewport': P.anchor(f'window{wi}', tuple(face)); wi += 1
    P.anchor('centre', (0, 0, 0)); P.anchor('top', (0, 0, R)); P.anchor('bottom', (0, 0, -R))
    return P.done()


# ----------------------------------------------------------------------------------------------------------- cryostat
def dilution_fridge(loc=(0, 0, 0), stages=('300 K', '50 K', '4 K', 'Still', 'Cold plate', 'MXC'), radii=(1.15, 1.02, 0.92, 0.78, 0.68, 0.6),
                    spacing=0.62, n_lines=4, sample=True, gold='#e2b04a', rot=0, seed=0):
    """Dilution-refrigerator insert ('chandelier'): stainless top plate, gold-plated copper stages joined by standoff
    tubes, coaxial lines with attenuators at each stage, still and mixing chamber pots, and a sample box.
    Anchors: stage.<name> (right-hand plate edge, for leader lines), stage_c.<name> (plate centre), sample, line<i>."""
    P = _Part(loc, rot); rr = random.Random(seed)
    au = gold_plating(gold, 0.2); ss = brushed_metal('#c9cdd2', 0.3, 'radial'); g10 = painted('#b8b27a', 0.5, 0.2)
    coax = brushed_metal('#c8c2b8', 0.25, 'z'); att = gold_plating('#d8a640', 0.25)
    zs = [-i * spacing for i in range(len(stages))]
    for i, (nm, r, z) in enumerate(zip(stages, radii, zs)):
        th = 0.07 if i == 0 else 0.045
        mat = ss if i == 0 else au
        P.add(lathe(_chaikin([(0, z - th), (r - 0.02, z - th), (r, z - th + 0.01), (r, z - 0.01), (r - 0.02, z)], 1) + [(0, z)], mat, 128, name='plate', sharp_deg=45))
        for k in range(10 if i == 0 else 8):
            a = TAU * (k + 0.5) / (10 if i == 0 else 8)
            P.add(cylinder((0.9 * r * math.cos(a), 0.9 * r * math.sin(a), z), (0.9 * r * math.cos(a), 0.9 * r * math.sin(a), z + 0.018), 0.022, ss, 6))
        P.anchor('stage.' + nm, (r, 0, z - th / 2)); P.anchor('stage_c.' + nm, (0, 0, z))
        if i + 1 < len(stages):
            rn_ = radii[i + 1]; zn = zs[i + 1]
            for k in range(3):
                a = TAU * k / 3 + 0.5
                x, y = 0.78 * rn_ * math.cos(a), 0.78 * rn_ * math.sin(a)
                P.add(cylinder((x, y, zn), (x, y, z - th), 0.035 if i < 2 else 0.025, g10 if i < 3 else au, 32))
    # still pot between still and cold plate, mixing chamber below MXC
    if 'Still' in stages:
        j = stages.index('Still'); z = zs[j]
        P.add(lathe(_chaikin([(0, z - 0.3), (0.2, z - 0.3), (0.2, z - 0.05)], 2) + [(0.2, z - 0.045), (0, z - 0.045)], au, 64, (0.18, 0.15, 0), 'still'))
    zm = zs[-1] - 0.045
    P.add(lathe(_chaikin([(0, zm - 0.3), (0.16, zm - 0.3), (0.16, zm)], 2) + [(0, zm)], au, 64, (-0.3, 0.12, 0), 'mxc'))
    # coaxial lines with attenuators
    for n in range(n_lines):
        a = math.radians(-120 + 60 * n / max(1, n_lines - 1)) if n_lines > 1 else -math.pi / 2
        rl = 0.42 * radii[-1]; x, y = rl * math.cos(a), rl * math.sin(a)
        P.add(cylinder((x, y, zs[0] + 0.25), (x, y, zs[-1] - 0.25), 0.012, coax, 16))
        P.add(cylinder((x, y, zs[0] + 0.1), (x, y, zs[0] + 0.25), 0.028, ss, 24))
        for i in range(1, len(stages)):
            P.add(cylinder((x, y, zs[i] + 0.05), (x, y, zs[i] + 0.17), 0.028, att, 24))
        P.anchor(f'line{n}', (x, y, zs[0] + 0.25))
    if sample:
        zb = zs[-1] - 0.05
        P.add(cylinder((0.1, -0.05, zb), (0.1, -0.05, zb - 0.45), 0.05, au, 32))
        P.add(_box((0.46, 0.34, 0.2), (0.1, -0.05, zb - 0.55), au, 0.015))
        P.anchor('sample', (0.1, -0.22, zb - 0.55))
    return P.done()


# ----------------------------------------------------------------------------------------------------------- ion trap
def _ions(P, xs, z, y, color, r):
    core = glow(color, 5.0); hal = halo(color, 1.3, 2.2)
    for i, x in enumerate(xs):
        h_ = _sphere((x, y, z), r * 3.2, hal, 32); h_.visible_glossy = False
        no_shadow([P.add(_sphere((x, y, z), r, core, 24)), P.add(h_)]); P.anchor(f'ion{i}', (x, y, z))


def ion_trap(kind='blade', loc=(0, 0, 0), n_ions=5, ion_color='#3fb6f2', spacing=0.2, length=2.6, segments=5,
             electrode='#e2b04a', substrate='#2b2e36', rot=0, seed=0):
    """Ion trap with a glowing ion string along x. kind: 'blade' (four knife-edge blades: two RF, two segmented DC,
    on alumina holders) or 'surface' (gold electrodes on a chip: centre rail, RF rails, segmented DC electrodes,
    ions hovering above). Anchors: ion<i>, axis_l, axis_r, rf, dc, dc<i> (segment centres), chip (surface kind)."""
    P = _Part(loc, rot); au = gold_plating(electrode, 0.22)
    xs = [(i - (n_ions - 1) / 2) * spacing for i in range(n_ions)]
    if kind == 'blade':
        r0 = 0.2; depth = 0.5; tw = 0.012; bw = 0.07
        cer = painted('#efe9dc', 0.5, 0.15)
        for bi, ang in enumerate([45, 135, 225, 315]):
            a = math.radians(ang); segd = bi % 2 == 1
            ey, ez = math.cos(a), math.sin(a); ny, nz = -ez, ey
            pieces = [(-length / 2, length / 2)] if not segd else [(-length / 2 + k * length / segments + 0.03, -length / 2 + (k + 1) * length / segments - 0.03) for k in range(segments)]
            for pi_, (x0, x1) in enumerate(pieces):
                verts = []
                for x in (x0, x1):
                    for (rad, w) in [(r0, tw), (r0 + depth, bw)]:
                        for s in (-1, 1): verts.append((x, rad * ey + s * w / 2 * ny, rad * ez + s * w / 2 * nz))
                # verts per x: [tip-, tip+, back-, back+]
                f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 2, 6, 4), (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6)]
                o = mesh_obj('blade', verts, f, au, False)
                md = o.modifiers.new('bev', 'BEVEL'); md.width = 0.006; md.segments = 2
                P.add(o)
                if segd: P.anchor(f'dc{pi_}' if bi == 1 else f'dcb{pi_}', ((x0 + x1) / 2, (r0 + 0.3) * ey, (r0 + 0.3) * ez))
            # alumina holder at the back of each blade
            rad = r0 + depth + 0.05
            for xh in (-length / 2 + 0.12, length / 2 - 0.12):
                P.add(_box((0.12, 0.1, 0.14), (xh, rad * ey, rad * ez), cer, 0.012, rot=(a, 0, 0)))
        P.anchor('rf', (0.4, (r0 + 0.35) * math.cos(math.radians(45)), (r0 + 0.35) * math.sin(math.radians(45))))
        P.anchor('dc', (-0.4, (r0 + 0.35) * math.cos(math.radians(135)), (r0 + 0.35) * math.sin(math.radians(135))))
        _ions(P, xs, 0.0, 0.0, ion_color, 0.032)
        P.anchor('axis_l', (-length / 2 - 0.3, 0, 0)); P.anchor('axis_r', (length / 2 + 0.3, 0, 0))
    else:
        W = 1.8; th = 0.1; et = 0.012
        P.add(_box((length + 0.4, W, th), (0, 0, -th / 2), painted(substrate, 0.35, 0.3), 0.01))
        z = et / 2

        def strip(x0, x1, y0, y1, nm=None):
            P.add(_box((x1 - x0, y1 - y0, et), ((x0 + x1) / 2, (y0 + y1) / 2, z), au, 0.003))
        g = 0.025
        strip(-length / 2, length / 2, -0.06, 0.06)                       # centre ground rail
        for s in (-1, 1):
            strip(-length / 2, length / 2, *sorted((s * (0.06 + g), s * (0.26 + g))))        # RF rails
            for k in range(segments):
                x0 = -length / 2 + k * length / segments + g / 2; x1 = x0 + length / segments - g
                strip(x0, x1, *sorted((s * (0.26 + 2 * g), s * (W / 2 - 0.08))))
                if s < 0: P.anchor(f'dc{k}', ((x0 + x1) / 2, -0.55, z))
        P.anchor('rf', (0.6 * length / 2, -0.17, z)); P.anchor('dc', (0, -0.55, z)); P.anchor('chip', (length / 2, -W / 2, -th / 2))
        _ions(P, xs, 0.2, 0.0, ion_color, 0.03)
        P.anchor('axis_l', (-length / 2, 0, 0.2)); P.anchor('axis_r', (length / 2, 0, 0.2))
    return P.done()


# ----------------------------------------------------------------------------------------------------------- optics bench
def breadboard(loc=(0, 0, 0), size=(5.0, 3.0, 0.14), pitch=0.25, color='#b9bec4', rot=0):
    """Optical breadboard: brushed plate with a tapped-hole grid (shader; costs nothing) and dark side skin.
    Anchors: top (centre of top face), corner_fl/fr/bl/br; anchors.hole(i, j) -> world point of hole (i, j) from corner."""
    P = _Part(loc, rot); sx, sy, sz = size
    g = _N('breadboard'); g.set(Base_Color=color, Metallic=1.0, Roughness=0.35)
    co = g.coord(); sep = g.xyz(co)
    fx = g.math('SUBTRACT', g.math('FRACT', g.math('DIVIDE', g.math('ADD', sep[0], sx / 2), pitch)), 0.5)
    fy = g.math('SUBTRACT', g.math('FRACT', g.math('DIVIDE', g.math('ADD', sep[1], sy / 2), pitch)), 0.5)
    rad = g.math('SQRT', g.math('ADD', g.math('MULTIPLY', fx, fx), g.math('MULTIPLY', fy, fy)))
    top = g.maprange(sep[2], sz / 2 - 0.004, sz / 2 - 0.001)
    hole = g.math('MULTIPLY', g.maprange(rad, 0.17, 0.13), top)
    g.put(g.bsdf.inputs['Base Color'], g.mix(hole, g.mix(top, '#3a3e44', color), '#2c3035'))
    g.put(g.bsdf.inputs['Metallic'], g.math('SUBTRACT', 1.0, g.math('MAXIMUM', hole, g.math('SUBTRACT', 1.0, top))))
    mp = g.new('ShaderNodeMapping'); g.put(mp.inputs['Vector'], co); mp.inputs['Scale'].default_value = (2, 300, 300)
    g.bump(g.math('ADD', g.math('MULTIPLY', hole, -1.0), g.math('MULTIPLY', g.noise(mp.outputs[0], 1, 3), 0.05)), 0.4, 0.01)
    P.add(_box((sx, sy, sz), (0, 0, 0), g.m, 0.012))
    P.anchor('top', (0, 0, sz / 2))
    for nm, (x, y) in {'corner_fl': (-sx / 2, -sy / 2), 'corner_fr': (sx / 2, -sy / 2), 'corner_bl': (-sx / 2, sy / 2), 'corner_br': (sx / 2, sy / 2)}.items():
        P.anchor(nm, (x, y, sz / 2))
    objs, A = P.done(); M = P.M
    A.hole = lambda i, j: tuple(M @ Vector((-sx / 2 + (i + 0.5) * pitch, -sy / 2 + (j + 0.5) * pitch, sz / 2)))
    return objs, A


def post_mount(loc=(0, 0, 0), height=0.75, kind='mirror', face=0.0, optic_radius=0.16, optic_color='#d7dde2', seed=0):
    """Post + post holder + mount on a breadboard at loc (bottom). kind: 'mirror' (kinematic mount, two adjusters),
    'lens' (ring mount with biconvex lens), 'iris', 'post'. face: degrees; the optic's normal points along
    (cos face, sin face) in the horizontal plane. Anchors: optic (centre of the optical surface), base, top."""
    P = _Part(loc, face); rr = random.Random(seed)
    blk = anodized('#24272c'); steel = brushed_metal('#cfd3d7', 0.22, 'z')
    hold = 0.36 * height
    P.add(lathe(_chaikin([(0, 0), (0.13, 0), (0.13, 0.03), (0.075, 0.035)], 1) + [(0.075, hold), (0, hold)], blk, 48, name='holder'))
    P.add(cylinder((0.06, 0, hold * 0.7), (0.15, 0, hold * 0.7), 0.025, blk, 24))
    zc = height
    P.add(cylinder((0, 0, hold - 0.05), (0, 0, zc - optic_radius * 1.05), 0.05, steel, 48))
    r = optic_radius
    if kind == 'mirror':
        s = 2.5 * r
        P.add(_box((0.05, s, s), (0.0, 0, zc), blk, 0.01))
        P.add(_box((0.05, s, s), (-0.1, 0, zc), blk, 0.01))
        P.add(cylinder((0.028, 0, zc), (0.05, 0, zc), r * 1.06, blk, 64))
        mir = _mat('mirror', **{'Base Color': hex_rgb(optic_color), 'Metallic': 1.0, 'Roughness': 0.03, 'Coat Weight': 0.3})
        P.add(cylinder((0.03, 0, zc), (0.052, 0, zc), r, mir, 64))
        for dy, dz in [(0.38 * s, 0.38 * s), (-0.38 * s, -0.38 * s)]:
            P.add(cylinder((-0.12, dy, zc + dz), (-0.26, dy, zc + dz), 0.035, steel, 24))
            P.add(cylinder((-0.2, dy, zc + dz), (-0.3, dy, zc + dz), 0.06, blk, 24))
        P.anchor('optic', (0.052, 0, zc))
    elif kind in ('lens', 'iris'):
        P.add(_ring((0, 0, zc), (1, 0, 0), r * 1.02, r * 1.45, 0.07, blk)); P.objs[-1].location.x -= 0.035
        if kind == 'lens':
            bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=r, location=(0, 0, zc))
            o = bpy.context.object; o.scale = (0.28, 1, 1); o.data.shade_smooth(); o.data.materials.append(glass_tint('#e8f2f6', '#7896a8', 0.6)); P.add(o)
        else:
            P.add(_ring((0.0, 0, zc), (1, 0, 0), r * 0.25, r * 1.03, 0.012, matte('#1b1d21', 0.6))); P.objs[-1].location.x -= 0.006
            P.add(cylinder((0, 0, zc + r * 1.45), (0, 0, zc + r * 1.8), 0.015, steel, 12))
        P.anchor('optic', (0, 0, zc))
    else:
        P.anchor('optic', (0, 0, zc))
    P.anchor('base', (0, 0, 0)); P.anchor('top', (0, 0, zc + r * 1.3))
    return P.done()


def laser_head(loc=(0, 0, 0), size=(1.5, 0.5, 0.42), color='#2b2f36', front='#d9dde1', beam_color='#e8322b', beam_length=2.0,
               beam_radius=0.03, rot=0, label='#f2c230', seed=0):
    """Laser head on its base: bevelled housing, lighter front bezel, aperture with shutter ring, heat-sink fins,
    warning label, rear cable; beam exits along +x (after rot). loc = bottom centre.
    Anchors: aperture, beam_end, body, top."""
    P = _Part(loc, rot); L, W, Hh = size
    body = painted(color, 0.38, 0.35); fr = painted(front, 0.35, 0.3); blk = anodized('#1d2025')
    zc = Hh / 2 + 0.06
    P.add(_box((L * 1.02, W * 1.2, 0.06), (0, 0, 0.03), blk, 0.01))
    P.add(_box((L, W, Hh), (0, 0, zc), body, 0.03))
    P.add(_box((0.1, W * 1.04, Hh * 1.04), (L / 2 - 0.03, 0, zc), fr, 0.02))
    P.add(_box((L * 0.62, W * 0.7, 0.02), (-L * 0.1, 0, zc + Hh / 2 + 0.005), blk, 0.006))
    for k in range(7):
        x = -L * 0.1 - L * 0.28 + k * (L * 0.56) / 6
        P.add(_box((0.025, W * 0.62, 0.035), (x, 0, zc + Hh / 2 + 0.025), blk, 0.005))
    P.add(_box((0.16, 0.004, 0.08), (L * 0.18, -W / 2 - 0.002, zc + 0.06), matte(label, 0.6), 0))
    P.add(_box((0.36, 0.004, 0.025), (-L * 0.15, -W / 2 - 0.002, zc + 0.08), matte('#e9ebee', 0.6), 0))
    ax = L / 2 + 0.07
    P.add(cylinder((ax - 0.05, 0, zc), (ax + 0.07, 0, zc), 0.085, brushed_metal('#c7ccd1', 0.25, 'radial'), 48))
    P.add(cylinder((ax + 0.066, 0, zc), (ax + 0.072, 0, zc), 0.045, matte('#0f1114', 0.9), 32))
    P.add(fiber_path([(-L / 2 - 0.02, 0.05, zc - 0.05), (-L / 2 - 0.35, 0.1, zc - 0.1), (-L / 2 - 0.6, 0.35, 0.03)], 0.03, painted('#1f2227', 0.5), 16))
    if beam_length > 0:
        no_shadow(P.add(beam([(ax + 0.07, 0, zc), (ax + 0.07 + beam_length, 0, zc)], beam_radius, beam_color, 1.0)))
    P.anchor('aperture', (ax + 0.07, 0, zc)); P.anchor('beam_end', (ax + 0.07 + beam_length, 0, zc))
    P.anchor('body', (0, -W / 2, zc)); P.anchor('top', (0, 0, zc + Hh / 2 + 0.08))
    return P.done()


def camera_box(loc=(0, 0, 0), size=(0.6, 0.55, 0.55), color='#22252a', lens_length=0.45, rot=0, seed=0):
    """Scientific camera / detector: finned body, C-mount, lens barrel with grip rings, coated front glass; the lens
    looks along -x (after rot). loc = bottom centre of the body on its mount. Anchors: lens (front glass), body, sensor, top."""
    P = _Part(loc, rot); L, W, Hh = size
    body = anodized(color, 0.45); steel = brushed_metal('#c5cad0', 0.25, 'radial'); blk = anodized('#16181c', 0.5)
    zc = Hh / 2 + 0.05
    P.add(_box((L * 0.9, W * 0.9, 0.05), (0, 0, 0.025), blk, 0.008))
    P.add(_box((L, W, Hh), (0, 0, zc), body, 0.035))
    for k in range(6):
        x = -L / 2 + 0.08 + k * (L - 0.16) / 5
        for s in (-1, 1): P.add(_box((0.025, 0.05, Hh * 0.8), (x, s * (W / 2 + 0.02), zc), body, 0.006))
    x0 = -L / 2
    P.add(cylinder((x0 + 0.01, 0, zc), (x0 - 0.06, 0, zc), 0.15, steel, 64))
    P.add(cylinder((x0 - 0.06, 0, zc), (x0 - 0.06 - lens_length, 0, zc), 0.13, blk, 64))
    for k in range(3):
        xx = x0 - 0.12 - k * lens_length * 0.3
        P.add(cylinder((xx, 0, zc), (xx - 0.07, 0, zc), 0.138, anodized('#2d3036', 0.6), 64))
    xf = x0 - 0.06 - lens_length
    coat = _mat('coat', **{'Base Color': hex_rgb('#3b3f7a'), 'Metallic': 0.2, 'Roughness': 0.05, 'Coat Weight': 1.0, 'Thin Film Thickness': 350.0})
    P.add(cylinder((xf + 0.02, 0, zc), (xf - 0.004, 0, zc), 0.1, coat, 64))
    P.add(fiber_path([(L / 2, 0.08, zc), (L / 2 + 0.3, 0.12, zc - 0.05), (L / 2 + 0.55, 0.4, 0.03)], 0.03, painted('#1f2227', 0.5), 16))
    P.anchor('lens', (xf - 0.004, 0, zc)); P.anchor('body', (0, -W / 2, zc)); P.anchor('sensor', (x0, 0, zc)); P.anchor('top', (0, 0, Hh + 0.05))
    return P.done()


# ----------------------------------------------------------------------------------------------------------- magnets, cables, fluidics
def helmholtz_coils(loc=(0, 0, 0), radius=1.0, width=0.2, depth=0.2, separation=None, axis='x', color='#c9804f',
                    bobbin='#2a2d33', turns=60, rot=0):
    """Pair of coaxial coils (separation = radius for Helmholtz) with visible copper windings on dark bobbins.
    axis: 'x' | 'y' | 'z'. Anchors: coil_a, coil_b (coil tops), centre, axis_a, axis_b (on axis beyond each coil)."""
    tilt = {'z': (0, 0), 'x': (0, 90), 'y': (90, 0)}[axis]
    P = _Part(loc, rot, tilt); sep = radius if separation is None else separation
    g = _N('winding'); g.set(Base_Color=color, Metallic=1.0, Roughness=0.3)
    sp = g.xyz(g.coord()); ang = g.math('ARCTAN2', sp[1], sp[0])
    wv = g.math('SINE', g.math('MULTIPLY', sp[2], turns / depth * math.pi))
    g.bump(g.math('ABSOLUTE', wv), 0.35, 0.01)
    bob = anodized(bobbin, 0.5)
    for s in (-1, 1):
        zc = s * sep / 2
        P.add(lathe([(radius - width / 2, zc - depth / 2), (radius + width / 2, zc - depth / 2), (radius + width / 2, zc + depth / 2), (radius - width / 2, zc + depth / 2)], g.m, 160, closed=True, name='coil', sharp_deg=30))
        for e in (-1, 1):
            z = zc + e * (depth / 2 + 0.015)
            P.add(lathe([(radius - width / 2 - 0.02, z - 0.012), (radius + width / 2 + 0.025, z - 0.012), (radius + width / 2 + 0.025, z + 0.012), (radius - width / 2 - 0.02, z + 0.012)], bob, 160, closed=True, name='flange', sharp_deg=30))
        P.add(lathe([(radius - width / 2 - 0.02, zc - depth / 2 - 0.02), (radius - width / 2 + 0.001, zc - depth / 2 - 0.02), (radius - width / 2 + 0.001, zc + depth / 2 + 0.02), (radius - width / 2 - 0.02, zc + depth / 2 + 0.02)], bob, 160, closed=True, name='core', sharp_deg=30))
        P.anchor('coil_a' if s < 0 else 'coil_b', (0, radius + width / 2, zc))
        P.anchor('axis_a' if s < 0 else 'axis_b', (0, 0, zc + s * 0.6 * radius))
    P.anchor('centre', (0, 0, 0))
    return P.done()


def cable(points, radius=0.03, color='#2a2d33', kind='cable', liquid_color=None, connectors=True, resolution=24):
    """Cable, coax or transparent tube along a smooth path through world points. kind 'tube' shows the liquid core
    (liquid_color). Anchors: start, end, mid."""
    objs, A = [], Anchors()
    if kind == 'tube':
        objs.append(fiber_path(points, radius, _clear_plastic(), resolution)); no_shadow(objs[-1])
        if liquid_color: objs.append(fiber_path(points, radius * 0.55, painted(liquid_color, 0.2, 0.5), resolution))
    elif kind == 'coax':
        objs.append(fiber_path(points, radius, brushed_metal('#c8c2b8', 0.25), resolution))
    else:
        objs.append(fiber_path(points, radius, painted(color, 0.45, 0.15), resolution))
    if connectors and kind != 'tube':
        m = brushed_metal('#d0d4d8', 0.22, 'radial')
        for a, b in [(points[0], points[1]), (points[-1], points[-2])]:
            a, b = Vector(a), Vector(b); d = (b - a).normalized()
            objs.append(cylinder(a - d * 0.02, a + d * radius * 4, radius * 1.5, m, 6 if kind == 'coax' else 32))
    A['start'] = tuple(points[0]); A['end'] = tuple(points[-1]); A['mid'] = tuple(points[len(points) // 2])
    return objs, A


def peristaltic_pump(loc=(0, 0, 0), size=(1.1, 0.8, 0.6), color='#c9ced5', rot=0, seed=0):
    """Peristaltic pump: housing, front head with roller rotor under a clear cover, tubing loop, small display.
    Tubing enters and leaves toward -x / +x at the head. loc = bottom centre. Anchors: head, tube_in, tube_out, body."""
    P = _Part(loc, rot); L, W, Hh = size
    P.add(_box((L, W, Hh), (0, 0, Hh / 2), painted(color, 0.4, 0.3), 0.04))
    P.add(_box((L * 0.4, 0.01, Hh * 0.22), (-L * 0.22, -W / 2 - 0.004, Hh * 0.72), _mat('lcd', **{'Base Color': hex_rgb('#27405c'), 'Roughness': 0.1, 'Emission Color': hex_rgb('#5aa0d8'), 'Emission Strength': 0.25})))
    for k in range(3):
        P.add(cylinder((-L * 0.36 + k * 0.14, -W / 2, Hh * 0.35), (-L * 0.36 + k * 0.14, -W / 2 - 0.03, Hh * 0.35), 0.04, painted('#3b3f46', 0.4), 24))
    hx, hz, rh = L * 0.22, Hh * 0.52, Hh * 0.3
    y0 = -W / 2
    P.add(cylinder((hx, y0, hz), (hx, y0 - 0.08, hz), rh * 1.15, anodized('#30343a'), 64))
    steel = brushed_metal('#cfd3d7', 0.2, 'radial')
    P.add(cylinder((hx, y0 - 0.08, hz), (hx, y0 - 0.17, hz), rh * 0.55, steel, 48))
    for k in range(4):
        a = TAU * k / 4 + 0.3
        P.add(cylinder((hx + rh * 0.62 * math.cos(a), y0 - 0.08, hz + rh * 0.62 * math.sin(a)), (hx + rh * 0.62 * math.cos(a), y0 - 0.17, hz + rh * 0.62 * math.sin(a)), rh * 0.2, steel, 32))
    tpts = [(hx - rh * 2.2, y0 - 0.125, hz - rh * 0.9)] + [(hx + rh * 0.86 * math.cos(a), y0 - 0.125, hz + rh * 0.86 * math.sin(a)) for a in [math.pi + 0.35 - (math.pi + 0.7) * t / 12 for t in range(13)]] + [(hx + rh * 2.2, y0 - 0.125, hz - rh * 0.9)]
    P.add(fiber_path(tpts, 0.03, painted('#e9c9a0', 0.3, 0.4), 32))
    P.add(cylinder((hx, y0 - 0.17, hz), (hx, y0 - 0.19, hz), rh * 1.12, glass_tint('#eef5f7', '#8fa8b5', 0.45), 64))
    P.anchor('head', (hx, y0 - 0.19, hz + rh)); P.anchor('tube_in', tpts[0]); P.anchor('tube_out', tpts[-1]); P.anchor('body', (-L * 0.2, -W / 2, Hh))
    return P.done()


def flow_cell(loc=(0, 0, 0), size=(2.2, 1.0), liquid_color='#e0564a', turns=4, rot=0, seed=0):
    """Microfluidic flow cell: glass slide, clear PDMS block with a serpentine channel filled with coloured liquid,
    inlet/outlet ports. loc = bottom centre. Anchors: inlet, outlet, channel, chip."""
    P = _Part(loc, rot); L, W = size
    no_shadow(P.add(_box((L, W, 0.05), (0, 0, 0.025), glass_tint('#e6f1f4', '#7d9aa9', 0.6), 0.004)))
    no_shadow(P.add(_box((L * 0.8, W * 0.82, 0.22), (0, 0, 0.16), glass_tint('#f1f5f2', '#93a8a4', 0.45, 1.41), 0.03)))
    zc = 0.075; pts = []
    x0, x1 = -L * 0.3, L * 0.3; ys = [W * 0.28 - k * (W * 0.56) / (turns - 1) for k in range(turns)] if turns > 1 else [0]
    pts.append((-L * 0.36, W * 0.28, zc))
    for k, y in enumerate(ys):
        a, b = (x0, x1) if k % 2 == 0 else (x1, x0)
        pts += [(a, y, zc), (b, y, zc)]
    pts.append((L * 0.36 if len(ys) % 2 else -L * 0.36, ys[-1], zc))
    rounded = _chaikin([(p[0], p[1]) for p in pts], 3)
    P.add(fiber_path([(x, y, zc) for x, y in rounded], 0.025, painted(liquid_color, 0.25, 0.4), 4))
    port = brushed_metal('#cdd1d5', 0.2, 'z')
    for nm, p in [('inlet', pts[0]), ('outlet', pts[-1])]:
        P.add(cylinder((p[0], p[1], zc), (p[0], p[1], 0.36), 0.045, port, 32))
        P.anchor(nm, (p[0], p[1], 0.36))
    P.anchor('channel', (0, ys[len(ys) // 2], 0.27)); P.anchor('chip', (L * 0.4, -W * 0.41, 0.2))
    return P.done()


def flow_loop(loc=(0, 0, 0), liquid_color='#e0564a', rot=0, seed=0):
    """Composite: reservoir vial -> peristaltic pump -> flow cell -> waste beaker, joined by liquid-filled tubing.
    Anchors: reservoir, pump.head, cell.channel, cell.inlet, waste, plus tube mids."""
    P = _Part(loc, rot); A = Anchors()
    o, a = vial((-2.6, 0.2, 0), 0.26, fill=0.7, liquid_color=liquid_color); P.add(o); A.update(tag(a, 'reservoir'))
    o, a = peristaltic_pump((-1.1, 0.1, 0), seed=seed); P.add(o); A.update(tag(a, 'pump'))
    o, a = flow_cell((1.1, -0.2, 0), liquid_color=liquid_color, seed=seed); P.add(o); A.update(tag(a, 'cell'))
    o, a = beaker((2.9, 0.3, 0), 0.34, fill=0.3, liquid_color=liquid_color, graduations=2); P.add(o); A.update(tag(a, 'waste'))
    tubes = [[(-2.6, 0.2, 0.55), (-2.6, 0.2, 1.1), (-2.0, -0.2, 1.0), (-1.7, -0.525, 0.35), (A['pump.tube_in'][0], A['pump.tube_in'][1], A['pump.tube_in'][2])],
             [A['pump.tube_out'], (-0.3, -0.53, 0.2), (0.2, -0.3, 0.8), (A['cell.inlet'][0], A['cell.inlet'][1], A['cell.inlet'][2] + 0.3), A['cell.inlet']],
             [A['cell.outlet'], (A['cell.outlet'][0] + 0.1, A['cell.outlet'][1], 0.8), (2.6, 0.1, 0.9), (2.85, 0.3, 0.45)]]
    for i, t in enumerate(tubes):
        o, a = cable(t, 0.035, kind='tube', liquid_color=liquid_color); P.add(o); A[f'tube{i}'] = a['mid']
    objs, _ = P.done()
    M = P.M; A2 = Anchors({k: tuple(M @ Vector(v)) for k, v in A.items()})
    return objs, A2


# ----------------------------------------------------------------------------------------------------------- terrain
def _height_fn(seed, sx, sy, relief, scale=0.35, river=False, coast=False, river_depth=0.12, river_width=0.14, valley=0.55, coast_x=0.25):
    rr = random.Random(seed); p1, p2, p3 = rr.uniform(0, TAU), rr.uniform(0, TAU), rr.uniform(0, TAU)
    floor = -0.35 * relief

    def ry(x): return 0.16 * sy * math.sin(TAU * 0.8 * x / sx + p1) + 0.06 * sy * math.sin(TAU * 1.9 * x / sx + p2)

    def h(x, y):
        z = relief * _fbm(x * scale, y * scale, 0.0, seed)
        if river:
            d = y - ry(x); gv = math.exp(-(d / valley) ** 2)
            k = 12.0 / max(relief, 1e-3); z = floor + math.log1p(math.exp(k * (z - floor))) / k    # no pits below the valley floor
            z = z * (1 - gv) + floor * gv - river_depth * math.exp(-(d / river_width) ** 4)
        if coast:
            xc = coast_x * sx / 2 + 0.1 * sx * math.sin(TAU * 0.7 * y / sy + p3)
            z += 1.1 * relief * math.tanh((xc - x) / (0.12 * sx)) - 0.2 * relief
        return z
    h.river_y = ry; h.water = floor - 0.45 * river_depth
    return h


def _river_strip(h, sx, sy, zw, half, mat, n=240):
    """Water surface as a band following the river centre line (so low ground elsewhere never floods)."""
    vv, ff = [], []
    for i in range(n + 1):
        x = -sx / 2 + sx * i / n; yc = h.river_y(x)
        for t in (-1, 1): vv.append((x, max(-sy / 2, min(sy / 2, yc + t * half)), zw))
    for i in range(n): ff.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
    return mesh_obj('river', vv, ff, mat, False)


def _strata_mat(name, z0, z1, layers, und, und_seed, offset=0.0, wt=None, wt_color='#3f7fc4', wt_tint=0.1,
                soil='#6a4a32', soil_depth=0.07, surface='#7aa352'):
    """Strata by depth z (object space), boundaries undulating with x, y; hanging-wall offset; saturated-zone tint."""
    g = _N(name); g.set(Roughness=0.92); sp = g.xyz(g.coord())
    rr = random.Random(und_seed); k1, k2, q1, q2 = rr.uniform(0.6, 1.0), rr.uniform(0.5, 0.9), rr.uniform(0, TAU), rr.uniform(0, TAU)
    u1 = g.math('MULTIPLY', g.math('SINE', g.math('ADD', g.math('MULTIPLY', sp[0], k1), q1)), und)
    u2 = g.math('MULTIPLY', g.math('SINE', g.math('ADD', g.math('MULTIPLY', sp[1], k2), q2)), und * 0.6)
    u3 = g.math('MULTIPLY', g.math('SUBTRACT', g.noise(g.coord(), 1.2, 2.0, 0.5, w=und_seed), 0.5), und * 0.5)
    u = g.math('ADD', g.math('SUBTRACT', g.math('SUBTRACT', g.math('SUBTRACT', sp[2], u1), u2), u3), offset)
    t = g.maprange(u, z0, z1)
    stops, zb = [], z1
    bounds = []
    for th, col in layers:
        bounds.append((zb, col)); zb -= th
    # ramp: from bottom up; each element starts a layer
    last_col = layers[-1][1]
    stops.append((0.0, last_col))
    for i in range(len(layers) - 1):
        zbound = z1 - sum(l[0] for l in layers[:i + 1])
        stops.append(((zbound - z0) / (z1 - z0), layers[i][1]))
    col = g.ramp(t, stops, 'CONSTANT')
    grain = g.maprange(g.noise(g.coord(), 9.0, 6.0, 0.6, w=und_seed * 0.3), 0.3, 0.7, 0.9, 1.08)
    lam = g.maprange(g.math('SINE', g.math('MULTIPLY', u, 190.0)), -1, 1, 0.965, 1.0)
    cs = g.new('ShaderNodeVectorMath', operation='SCALE'); g.put(cs.inputs[0], col); g.put(cs.inputs['Scale'], g.math('MULTIPLY', grain, lam))
    col = cs.outputs[0]
    if wt is not None:
        below = g.maprange(sp[2], wt + 0.004, wt - 0.004)
        col = g.mix(g.math('MULTIPLY', below, wt_tint), col, wt_color)
        line = g.maprange(g.math('ABSOLUTE', g.math('SUBTRACT', sp[2], wt)), 0.012, 0.007)
        col = g.mix(line, col, wt_color)
    # soil band and grass fringe below the surface (hsurf attribute = surface height at this column)
    at = g.new('ShaderNodeAttribute', attribute_name='hsurf'); depth = g.math('SUBTRACT', at.outputs['Fac'], sp[2])
    col = g.mix(g.maprange(depth, soil_depth + 0.004, soil_depth - 0.004), col, soil)
    col = g.mix(g.maprange(depth, 0.016, 0.01), col, surface)
    g.put(g.bsdf.inputs['Base Color'], col)
    return g.m


def _surface_mat(name, color='#7aa352', dry='#a9a766', seed=0, sand=None, sand_z=None):
    g = _N(name); g.set(Roughness=0.9)
    n = g.noise(g.coord(), 1.6, 4.0, 0.55, w=seed * 0.21)
    col = g.mix(g.maprange(n, 0.4, 0.66, 0.0, 0.45), _shade(color, 0.95), dry)
    fine = g.maprange(g.noise(g.coord(), 22.0, 3.0, 0.6, w=seed), 0.3, 0.7, 0.9, 1.08)
    cs = g.new('ShaderNodeVectorMath', operation='SCALE'); g.put(cs.inputs[0], col); g.put(cs.inputs['Scale'], fine); col = cs.outputs[0]
    if sand is not None:
        sp = g.xyz(g.coord()); col = g.mix(g.maprange(sp[2], sand_z + 0.03, sand_z - 0.005), col, sand)
    g.put(g.bsdf.inputs['Base Color'], col)
    g.bump(g.noise(g.coord(), 30.0, 3.0), 0.12, 0.02); return g.m


def terrain_block(loc=(0, 0, 0), size=(6.0, 4.0, 2.2), seed=1, layers=None, relief=0.22, scale=0.35, res=120, fault=None,
                  water_table=None, river=True, surface='#7aa352', soil='#6a4a32', undulation=0.1, gap=0.018, rot=0):
    """Cut-away block of ground: displaced top surface (grass), cut faces showing strata, optional normal fault
    (dict x, dip deg, throw; hanging wall on +x side dropped by throw), optional water table (z, relative to loc; the
    saturated zone is tinted and a blue line marks it on the cut faces) and optional river channel along x with water.
    layers: [(thickness, hex), ...] from the top down; the last layer runs to the base.
    Anchors: surface, river, layer<i> (front face, mid-layer), water_table, fault_top, fault_mid, corner_* ;
    anchors.ground(x, y) -> world z of the surface (after loc/rot... use for placing trees at local x, y)."""
    P = _Part(loc, rot); sx, sy, sz = size
    layers = layers or [(0.35, '#d8c08a'), (0.3, '#b7875a'), (0.4, '#e2d3a8'), (0.35, '#9c6b4e'), (0.5, '#7f7a74')]
    h = _height_fn(seed, sx, sy, relief, scale, river)
    ztop, zbot = sz / 2, -sz / 2
    nx, ny = res, max(8, int(res * sy / sx))
    xs = [-sx / 2 + sx * i / nx for i in range(nx + 1)]; ys = [-sy / 2 + sy * j / ny for j in range(ny + 1)]
    H = {(i, j): ztop + h(xs[i], ys[j]) for i in range(nx + 1) for j in range(ny + 1)}

    def build():
        bm = bmesh.new(); hl = bm.verts.layers.float.new('hsurf')
        T = {}
        for i in range(nx + 1):
            for j in range(ny + 1):
                v = bm.verts.new((xs[i], ys[j], H[i, j])); v[hl] = H[i, j]; T[i, j] = v
        for i in range(nx):
            for j in range(ny):
                f = bm.faces.new((T[i, j], T[i + 1, j], T[i + 1, j + 1], T[i, j + 1])); f.material_index = 0
        per = [(i, 0) for i in range(nx)] + [(nx, j) for j in range(ny)] + [(i, ny) for i in range(nx, 0, -1)] + [(0, j) for j in range(ny, 0, -1)]
        B = {}
        for k in per:
            v = bm.verts.new((xs[k[0]], ys[k[1]], zbot)); v[hl] = H[k]; B[k] = v
        for a, b in zip(per, per[1:] + per[:1]):
            f = bm.faces.new((T[a], B[a], B[b], T[b])); f.material_index = 1
        f = bm.faces.new([B[k] for k in reversed(per)]); f.material_index = 1
        bm.normal_update()
        return bm
    top_m = _surface_mat('grass', surface, '#b3ad6c', seed)
    z0, z1 = zbot - 0.3, ztop + relief + 0.1
    lay = [(layers[0][0] + (z1 - ztop), layers[0][1])] + list(layers[1:])
    if fault:
        fx = fault.get('x', 0.0); dip = math.radians(fault.get('dip', 60)); throw = fault.get('throw', 0.3)
        n = Vector((math.sin(dip), 0, math.cos(dip))); c = Vector((fx, 0, 0))
        for side in (1, -1):
            bm = build()
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=c, plane_no=n,
                                   clear_inner=(side == 1), clear_outer=(side == -1))
            edges = [e for e in bm.edges if e.is_boundary]
            res_ = bmesh.ops.holes_fill(bm, edges=edges, sides=0)
            for f in res_['faces']: f.material_index = 1
            bmesh.ops.translate(bm, verts=bm.verts, vec=n * (gap / 2) * side)
            off = throw if side == 1 else 0.0
            sm = _strata_mat('strata', z0, z1, lay, undulation, seed, off, water_table)
            P.add(_bm_obj('terrain', bm, [top_m, sm], True, 50, flat=(1,)))
        xt = fx - ztop * math.cos(dip) / math.sin(dip)
        P.anchor('fault_top', (xt, -sy / 2, ztop + h(xt, -sy / 2))); P.anchor('fault_mid', (fx, -sy / 2, 0.0))
        P.anchor('fault_bottom', (fx - zbot * math.cos(dip) / math.sin(dip), -sy / 2, zbot))
    else:
        P.add(_bm_obj('terrain', build(), [top_m, _strata_mat('strata', z0, z1, lay, undulation, seed, 0.0, water_table)], True, 50, flat=(1,)))
    if river:
        zw = ztop + h.water; wm = water('#3d8fc6', 0.25)
        P.add(_river_strip(h, sx, sy, zw, 0.5, wm))
        # water cross-section on the four cut faces where the bed is below the water level
        ws = water('#2f79b3', 0)
        for (ax0, ay0, ax1, ay1) in [(-sx / 2, -sy / 2, sx / 2, -sy / 2), (sx / 2, sy / 2, -sx / 2, sy / 2), (-sx / 2, sy / 2, -sx / 2, -sy / 2), (sx / 2, -sy / 2, sx / 2, sy / 2)]:
            N = 400; vv, ff = [], []
            for k in range(N + 1):
                x = ax0 + (ax1 - ax0) * k / N; y = ay0 + (ay1 - ay0) * k / N; zb = ztop + h(x, y)
                vv += [(x, y, min(zb, zw)), (x, y, zw)]
            for k in range(N):
                if vv[2 * k][2] < zw - 1e-5 or vv[2 * k + 2][2] < zw - 1e-5: ff.append((2 * k, 2 * k + 2, 2 * k + 3, 2 * k + 1))
            if ff:
                o = mesh_obj('river_cut', vv, ff, ws, False)
                # push a hair outward so it is not coplanar with the wall
                dxn, dyn = (ay1 - ay0), -(ax1 - ax0); L = math.hypot(dxn, dyn); o.location = (dxn / L * 0.002, dyn / L * 0.002, 0)
                P.add(o)
        ryc = h.river_y(0.0); P.anchor('river', (0.0, ryc, zw))
        P.anchor('river_front', (-sx / 2 + 0.3, h.river_y(-sx / 2 + 0.3), zw))
    P.anchor('surface', (-0.25 * sx, -0.25 * sy, ztop + h(-0.25 * sx, -0.25 * sy)))
    zc = ztop
    for i, (th, _) in enumerate(layers):
        zm = zc - th / 2 if i < len(layers) - 1 else (zc + zbot) / 2
        P.anchor(f'layer{i}', (0.3 * sx, -sy / 2, zm)); zc -= th
    if water_table is not None: P.anchor('water_table', (-0.35 * sx, -sy / 2, water_table))
    for nm, (x, y) in {'corner_fl': (-sx / 2, -sy / 2), 'corner_fr': (sx / 2, -sy / 2), 'corner_bl': (-sx / 2, sy / 2), 'corner_br': (sx / 2, sy / 2)}.items():
        P.anchor(nm, (x, y, zbot))
    objs, A = P.done(); M = P.M; Mi = M.inverted()

    def ground(x, y):
        p = Mi @ Vector((x, y, 0)); return (M @ Vector((p.x, p.y, ztop + h(p.x, p.y)))).z
    A.ground = ground; A.river_y = lambda x: h.river_y(x); A.inside = lambda x, y: abs((Mi @ Vector((x, y, 0))).x) < sx / 2 and abs((Mi @ Vector((x, y, 0))).y) < sy / 2
    return objs, A


def terrain_surface(loc=(0, 0, 0), size=(8.0, 6.0), seed=3, relief=0.9, scale=0.3, res=180, river=False, coast=True,
                    sea='#3f8fc4', sea_clarity=0.45, palette=None, skirt=0.5, layers=None, snow=False, rot=0):
    """Displaced landscape with hypsometric colouring (bathymetry, beach, lowland, upland, rock, snow), optional
    coast (sea on +x) and/or river along x, transparent-ish water, and a cut-face skirt showing strata (layers as in
    terrain_block; None = default sediments) so it reads as a slab. palette: [(height, hex)] ramp stops in scene units;
    snow=True caps the highest ground. Anchors: peak, coast, sea, river, lowland, skirt; anchors.ground."""
    P = _Part(loc, rot); sx, sy = size
    h = _height_fn(seed, sx, sy, relief, scale, river, coast, river_depth=0.15 * relief, river_width=0.1, valley=0.5)
    nx, ny = res, max(8, int(res * sy / sx))
    xs = [-sx / 2 + sx * i / nx for i in range(nx + 1)]; ys = [-sy / 2 + sy * j / ny for j in range(ny + 1)]
    Z = [[h(x, y) for y in ys] for x in xs]
    zmin = min(min(r) for r in Z) - skirt
    verts, faces, idx = [], [], {}
    for i in range(nx + 1):
        for j in range(ny + 1): idx[i, j] = len(verts); verts.append((xs[i], ys[j], Z[i][j]))
    for i in range(nx):
        for j in range(ny): faces.append((idx[i, j], idx[i + 1, j], idx[i + 1, j + 1], idx[i, j + 1]))
    per = [(i, 0) for i in range(nx)] + [(nx, j) for j in range(ny)] + [(i, ny) for i in range(nx, 0, -1)] + [(0, j) for j in range(ny, 0, -1)]
    bidx = {}; base_n = len(verts)
    for k in per: bidx[k] = len(verts); verts.append((xs[k[0]], ys[k[1]], zmin))
    for a, b in zip(per, per[1:] + per[:1]): faces.append((idx[a], bidx[a], bidx[b], idx[b]))
    faces.append(tuple(bidx[k] for k in reversed(per)))
    mi = [0] * (nx * ny) + [1] * (len(per) + 1)
    sea_z = 0.0 if coast else -9.0
    g = _N('hypso'); g.set(Roughness=0.88); sp = g.xyz(g.coord())
    zt = max(max(r) for r in Z); zb_ = min(min(r) for r in Z)
    z0 = 0.0 if coast else (h.water if river else zb_)          # colour 'sea level': the sea, the river, or the lowest ground
    d = max(zt - z0, 1e-3)
    pal = palette or [(min(zb_, z0 - 0.05), '#2d6a9e'), (z0 - 0.02, '#79b7cf'), (z0, '#e3d3a4'), (z0 + 0.03 * d, '#9cc06a'), (z0 + 0.3 * d, '#6d9a4c'),
                      (z0 + 0.62 * d, '#9c9a62'), (z0 + 0.85 * d, '#9a8f80'), (z0 + d + 1e-3, '#a9a39b')] + ([(z0 + d + 2e-3, '#f7f8fa')] if snow else [])
    lo, hi = pal[0][0], pal[-1][0]
    col = g.ramp(g.maprange(g.math('ADD', sp[2], g.math('MULTIPLY', g.math('SUBTRACT', g.noise(g.coord(), 2.0, 3.0, 0.5, w=seed), 0.5), 0.12 * relief)), lo, hi), [((p - lo) / (hi - lo), c) for p, c in pal])
    geo = g.new('ShaderNodeNewGeometry'); nz = g.xyz(geo.outputs['Normal'])[2]
    col = g.mix(g.math('MULTIPLY', g.maprange(nz, 0.8, 0.6), g.maprange(sp[2], 0.1 * relief, 0.3 * relief)), col, '#8a8279')
    fine = g.maprange(g.noise(g.coord(), 18.0, 4.0, 0.6, w=seed), 0.3, 0.7, 0.9, 1.07)
    cs = g.new('ShaderNodeVectorMath', operation='SCALE'); g.put(cs.inputs[0], col); g.put(cs.inputs['Scale'], fine)
    g.put(g.bsdf.inputs['Base Color'], cs.outputs[0]); g.bump(g.noise(g.coord(), 25.0, 4.0), 0.15, 0.02)
    lay = layers or [(0.1, '#c9a979'), (0.12, '#a77b55'), (0.14, '#d8c79e'), (0.5, '#8f7d6a')]
    lay = [(lay[0][0] + zt + 0.05, lay[0][1])] + list(lay[1:])
    skirt_m = _strata_mat('strata', zmin - 0.05, zt + 0.05, lay, 0.03, seed, 0.0, None, soil='#6a4a32', soil_depth=0.05, surface='#7fa656')
    o = mesh_obj('land', verts, faces, [g.m, skirt_m], True, 60, mi, flat=(1,))
    at = o.data.attributes.new('hsurf', 'FLOAT', 'POINT'); vals = [v[2] for v in verts[:base_n]] + [Z[k[0]][k[1]] for k in per]
    at.data.foreach_set('value', vals); P.add(o); P.anchor('skirt', (-0.3 * sx, -sy / 2, (zmin + 0.0) / 2))
    wm = water(sea, sea_clarity)
    if coast:   # sea: transparent top plus a water cross-section on the cut faces, inset a hair inside the land skirt
        e = 0.004; zlo = zmin + 0.01
        v = [(-sx / 2 + e, -sy / 2 + e, zlo), (sx / 2 - e, -sy / 2 + e, zlo), (sx / 2 - e, sy / 2 - e, zlo), (-sx / 2 + e, sy / 2 - e, zlo)]
        v += [(x, y, 0.0) for x, y, _ in v]
        side = _N('sea_cut'); side.set(Roughness=0.3, Coat_Weight=0.4); sp2 = side.xyz(side.coord())
        side.put(side.bsdf.inputs['Base Color'], side.ramp(side.maprange(sp2[2], zlo, 0.0), [(0, _shade(sea, 0.45)), (1, _shade(sea, 0.95))]))
        P.add(mesh_obj('sea', v, [(4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], [wm, side.m], False, mat_index=[0, 1, 1, 1, 1]))
    if river:
        zw = h.water; P.add(_river_strip(h, sx, sy, zw, 0.45, water(sea, 0.3)))
        P.anchor('river', (-0.2 * sx, h.river_y(-0.2 * sx), zw))
    ipk = max(((i, j) for i in range(nx + 1) for j in range(ny + 1)), key=lambda k: Z[k[0]][k[1]])
    P.anchor('peak', (xs[ipk[0]], ys[ipk[1]], Z[ipk[0]][ipk[1]]))
    if coast:
        for i in range(nx):
            if Z[i][ny // 2] > 0 >= Z[i + 1][ny // 2]: P.anchor('coast', (xs[i], 0, 0)); break
        P.anchor('sea', (0.4 * sx, -0.2 * sy, 0))
    P.anchor('lowland', (-0.3 * sx, -0.3 * sy, h(-0.3 * sx, -0.3 * sy)))
    objs, A = P.done(); M = P.M; Mi = M.inverted()

    def ground(x, y):
        p = Mi @ Vector((x, y, 0)); return (M @ Vector((p.x, p.y, max(h(p.x, p.y), sea_z)))).z
    A.ground = ground; A.height = h
    return objs, A


def ocean_section(loc=(0, 0, 0), size=(6.0, 3.0), depth=1.6, seed=5, amp=0.1, wavelength=1.4, res=160, surface='#3d8fc6',
                  deep='#0e3563', floor='#c8b48a', floor_th=0.22, rot=0):
    """Block of ocean cut open: second-order (Stokes) waves with whitish crests on top, a light-to-deep blue gradient
    on the cut faces and a sediment floor. Anchors: surface, crest, trough, mid_water, deep, floor."""
    P = _Part(loc, rot); sx, sy = size; rr = random.Random(seed)
    comps = [(amp, TAU / wavelength, rr.uniform(-0.15, 0.15), rr.uniform(0, TAU)), (amp * 0.4, TAU / (wavelength * 0.55), rr.uniform(-0.6, 0.6), rr.uniform(0, TAU)),
             (amp * 0.18, TAU / (wavelength * 0.3), rr.uniform(-1, 1), rr.uniform(0, TAU))]

    def eta(x, y):
        z = 0.0
        for a, k, th, ph in comps:
            s = k * (x * math.cos(th) + y * math.sin(th)) + ph; z += a * math.cos(s) + 0.5 * k * a * a * math.cos(2 * s)
        return z + 0.3 * amp * _fbm(x * 1.5, y * 1.5, 0, seed + 1, 3)
    nx, ny = res, max(8, int(res * sy / sx))
    xs = [-sx / 2 + sx * i / nx for i in range(nx + 1)]; ys = [-sy / 2 + sy * j / ny for j in range(ny + 1)]
    bm = bmesh.new(); T = {}
    for i in range(nx + 1):
        for j in range(ny + 1): T[i, j] = bm.verts.new((xs[i], ys[j], eta(xs[i], ys[j])))
    for i in range(nx):
        for j in range(ny): bm.faces.new((T[i, j], T[i + 1, j], T[i + 1, j + 1], T[i, j + 1])).material_index = 0
    zb = -depth + floor_th
    per = [(i, 0) for i in range(nx)] + [(nx, j) for j in range(ny)] + [(i, ny) for i in range(nx, 0, -1)] + [(0, j) for j in range(ny, 0, -1)]
    B = {k: bm.verts.new((xs[k[0]], ys[k[1]], zb)) for k in per}
    for a, b in zip(per, per[1:] + per[:1]): bm.faces.new((T[a], B[a], B[b], T[b])).material_index = 1
    bm.faces.new([B[k] for k in reversed(per)]).material_index = 1
    top = _N('sea_top'); top.set(Roughness=0.22, Specular_IOR_Level=0.12); sp = top.xyz(top.coord())
    E = [T[k].co.z for k in T]; e0, e1 = min(E), max(E)
    tcol = top.ramp(top.maprange(sp[2], e0, e1), [(0, _shade(surface, 0.78)), (0.6, surface), (0.9, _mix_hex(surface, '#bfe0f0', 0.45)), (1.0, '#e6f2f8')])
    top.put(top.bsdf.inputs['Base Color'], tcol)
    dif = top.new('ShaderNodeBsdfDiffuse'); top.put(dif.inputs['Color'], tcol)     # mostly diffuse: glints, not white sheets
    mx = top.new('ShaderNodeMixShader'); mx.inputs[0].default_value = 0.7
    top.put(mx.inputs[1], top.bsdf.outputs[0]); top.put(mx.inputs[2], dif.outputs[0]); top.put(top.out.inputs['Surface'], mx.outputs[0])
    side = _N('sea_side'); side.set(Roughness=0.3, Coat_Weight=0.4); sp2 = side.xyz(side.coord())
    side.put(side.bsdf.inputs['Base Color'], side.ramp(side.maprange(sp2[2], zb, 0.0), [(0, deep), (0.55, _mix_hex(deep, surface, 0.55)), (0.97, _shade(surface, 0.86)), (1, _shade(surface, 0.72))]))
    P.add(_bm_obj('ocean', bm, [top.m, side.m], True, 50, flat=(1,)))
    fl = earth(floor, 0.1, 4.0, 0.2, seed)
    P.add(_box((sx, sy, floor_th), (0, 0, -depth + floor_th / 2 - 0.001), fl, 0.0))
    P.anchor('surface', (-0.3 * sx, -sy / 2, eta(-0.3 * sx, -sy / 2)))
    ic = max(range(nx + 1), key=lambda i: eta(xs[i], -sy / 2)); P.anchor('crest', (xs[ic], -sy / 2, eta(xs[ic], -sy / 2)))
    it = min(range(nx + 1), key=lambda i: eta(xs[i], -sy / 2)); P.anchor('trough', (xs[it], -sy / 2, eta(xs[it], -sy / 2)))
    P.anchor('mid_water', (0, -sy / 2, zb / 2)); P.anchor('deep', (0.3 * sx, -sy / 2, zb + 0.15)); P.anchor('floor', (0, -sy / 2, -depth + floor_th / 2))
    return P.done()


def _mix_hex(a, b, t):
    A = [int(a.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)]; B = [int(b.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)]
    return '#%02x%02x%02x' % tuple(round(x + (y - x) * t) for x, y in zip(A, B))


# ----------------------------------------------------------------------------------------------------------- globe, atmosphere, clouds
def _octant_cut(v, f, cut):
    if not cut: return f
    return [fc for fc in f if not all(v[i][0] >= -1e-9 and v[i][1] <= 1e-9 and v[i][2] >= -1e-9 for i in fc)]


def globe(loc=(0, 0, 0), radius=1.5, seed=11, land=0.5, cutaway=True, layers=None, atmosphere='#8cc8ff', ocean='#2a6fb3',
          deep_ocean='#1b4e8c', green='#5f8f3e', desert='#cdb27a', ice='#f3f6f9', tilt=23.4, spin=0, seg=192):
    """Planet with a procedural land/sea mask (4D noise, no data files), latitude ice caps, green/desert land,
    optional octant cutaway showing the interior layers, and a thin limb-glow atmosphere.
    layers: [(outer radius fraction, hex)] from the centre out (default inner core, outer core, lower/upper mantle, crust).
    Anchors: north, south, surface, cut_centre, layer<i> (on the cut face), atmosphere."""
    P = _Part(loc, spin, (0, tilt))
    R = radius
    prof = [(R * math.sin(math.pi * k / 96), -R * math.cos(math.pi * k / 96)) for k in range(97)]
    prof[0] = (0, -R); prof[-1] = (0, R)
    v, f = lathe_data(prof, seg)
    f = _octant_cut(v, f, cutaway)
    g = _N('earth_surface'); co = g.coord(); nv = g.new('ShaderNodeVectorMath', operation='NORMALIZE'); g.put(nv.inputs[0], co)
    nrm = nv.outputs[0]; sp = g.xyz(nrm)
    fac = g.noise(nrm, 1.25, 8.0, 0.62, w=seed * 0.618)
    lat = g.math('ABSOLUTE', sp[2])
    landm = g.maprange(fac, land - 0.002, land + 0.002)
    oc = g.ramp(fac, [(0.0, deep_ocean), (land - 0.09, deep_ocean), (land - 0.03, ocean), (land - 0.002, _mix_hex(ocean, '#8fd0e6', 0.55)), (land, _mix_hex(ocean, '#8fd0e6', 0.55))])
    dry = g.noise(nrm, 2.2, 4.0, 0.5, w=seed * 1.7 + 3)
    desert_m = g.math('MULTIPLY', g.maprange(dry, 0.5, 0.62), g.maprange(g.math('ABSOLUTE', g.math('SUBTRACT', lat, 0.38)), 0.25, 0.12))
    lc = g.mix(desert_m, green, desert)
    lc = g.mix(g.maprange(lat, 0.55, 0.75), lc, '#6b7a4c')
    lc = g.mix(g.maprange(g.noise(nrm, 6.0, 6.0, 0.6, w=seed), 0.35, 0.7), _shade_sock(g, lc, 0.85), lc)
    col = g.mix(landm, oc, lc)
    icem = g.maprange(g.math('ADD', lat, g.math('MULTIPLY', g.math('SUBTRACT', g.noise(nrm, 4.0, 4.0, 0.5, w=seed + 9), 0.5), 0.12)), 0.83, 0.845)
    col = g.mix(icem, col, ice)
    g.put(g.bsdf.inputs['Base Color'], col)
    g.put(g.bsdf.inputs['Roughness'], g.maprange(landm, 0, 1, 0.45, 0.85))
    g.put(g.bsdf.inputs['Coat Weight'], g.maprange(landm, 0, 1, 0.08, 0.0))
    g.bump(g.math('MULTIPLY', g.noise(nrm, 14.0, 6.0, 0.6, w=seed), g.math('MAXIMUM', landm, icem)), 0.35, 0.01)
    P.add(mesh_obj('globe', v, f, g.m, True, 0))
    layers = layers or [(0.19, '#fbe27a'), (0.55, '#f5a340'), (0.78, '#e2703a'), (0.97, '#c24d33'), (1.0, '#7a5a44')]
    if cutaway:
        w = _N('interior'); w.set(Roughness=0.7); r = w.new('ShaderNodeVectorMath', operation='LENGTH'); w.put(r.inputs[0], w.coord())
        rn = w.math('DIVIDE', r.outputs['Value'], R)
        stops, prev = [], 0.0
        for rf, c in layers:
            stops += [(prev + 0.0005, _shade(c, 1.12)), (rf - 0.0005, _shade(c, 0.92))]; prev = rf
        stops[0] = (0.0, stops[0][1])
        w.put(w.bsdf.inputs['Base Color'], w.ramp(rn, stops, 'LINEAR'))
        w.put(w.bsdf.inputs['Emission Color'], w.ramp(rn, stops, 'LINEAR')); w.set(Emission_Strength=0.12)
        nr, na = 64, 48
        for plane in ('x', 'y', 'z'):
            vv, ff = [], []
            for i in range(nr + 1):
                rr_ = R * i / nr
                for j in range(na + 1):
                    a = 0.5 * math.pi * j / na; s, c_ = rr_ * math.cos(a), rr_ * math.sin(a)
                    vv.append({'x': (0, -s, c_), 'y': (s, 0, c_), 'z': (s, -c_, 0)}[plane])
            for i in range(nr):
                for j in range(na):
                    a_, b_ = i * (na + 1) + j, (i + 1) * (na + 1) + j
                    ff.append((a_, b_, b_ + 1, a_ + 1) if plane != 'y' else (a_, a_ + 1, b_ + 1, b_))
            P.add(mesh_obj('cut_' + plane, vv, ff, w.m, False))
        prev = 0.0
        for i, (rf, _) in enumerate(layers):
            rm = R * (prev + rf) / 2; P.anchor(f'layer{i}', (rm * 0.7071, 0, rm * 0.7071)); prev = rf
        P.anchor('cut_centre', (0, 0, 0))
    if atmosphere:
        v2, f2 = lathe_data([(p[0] * 1.025, p[1] * 1.025) for p in prof], 128)
        f2 = _octant_cut(v2, f2, cutaway)
        no_shadow(P.add(mesh_obj('atmosphere', v2, f2, limb(atmosphere, 1.0, 2.5), True, 0)))
        P.anchor('atmosphere', (-R * 0.72, -R * 0.72, R * 0.2))
    P.anchor('north', (0, 0, R)); P.anchor('south', (0, 0, -R)); P.anchor('surface', (-R * 0.6, -R * 0.6, -R * 0.5))
    return P.done()


def _shade_sock(g, sock, k):
    n = g.new('ShaderNodeVectorMath', operation='SCALE'); g.put(n.inputs[0], sock); n.inputs['Scale'].default_value = k; return n.outputs[0]


def atmosphere_layers(loc=(0, 0, 0), radius=14.0, arc_deg=26.0, depth=1.2, layers=None, ground=(0.35, '#7c5f48'), grass='#6f9a4a', rot=0):
    """Curved section through the atmosphere above a patch of ground: each layer a band with its own vertical
    gradient and a crisp boundary. layers: [(thickness, bottom hex, top hex, name)] from the ground up.
    loc = ground surface at the centre of the arc. Anchors: <name> (front face, mid-layer, centre), <name>_top, ground."""
    P = _Part(loc, rot)
    layers = layers or [(0.9, '#cfe6f6', '#b7d8f1', 'troposphere'), (0.8, '#a9cdef', '#8fb9e6', 'stratosphere'),
                        (0.7, '#86acdf', '#6f93d0', 'mesosphere'), (0.9, '#6585c6', '#3e4f99', 'thermosphere')]
    g0, gcol = ground; r0 = radius - g0; r1 = radius + sum(l[0] for l in layers)
    a0, a1 = math.radians(90 - arc_deg / 2), math.radians(90 + arc_deg / 2)
    na, nr = 160, 24
    Rs = [r0 + (r1 - r0) * i / nr for i in range(nr + 1)]
    verts, faces = [], []

    def V(r, a, y): verts.append((r * math.cos(a), y, r * math.sin(a) - radius)); return len(verts) - 1
    F = {}; Bk = {}
    for i, r in enumerate(Rs):
        for j in range(na + 1):
            a = a0 + (a1 - a0) * j / na; F[i, j] = V(r, a, -depth / 2); Bk[i, j] = V(r, a, depth / 2)
    for i in range(nr):
        for j in range(na):
            faces.append((F[i, j], F[i + 1, j], F[i + 1, j + 1], F[i, j + 1]))
            faces.append((Bk[i, j], Bk[i, j + 1], Bk[i + 1, j + 1], Bk[i + 1, j]))
    for j in range(na):
        faces.append((F[nr, j], Bk[nr, j], Bk[nr, j + 1], F[nr, j + 1])); faces.append((F[0, j], F[0, j + 1], Bk[0, j + 1], Bk[0, j]))
    for i in range(nr):
        faces.append((F[i, 0], Bk[i, 0], Bk[i + 1, 0], F[i + 1, 0])); faces.append((F[i, na], F[i + 1, na], Bk[i + 1, na], Bk[i, na]))
    g = _N('atmos'); g.set(Roughness=0.9); sp = g.xyz(g.coord())
    cx = g.new('ShaderNodeCombineXYZ'); g.put(cx.inputs[0], sp[0]); g.put(cx.inputs[2], g.math('ADD', sp[2], radius))
    ln = g.new('ShaderNodeVectorMath', operation='LENGTH'); g.put(ln.inputs[0], cx.outputs[0])
    t = g.maprange(ln.outputs['Value'], r0, r1)
    span = r1 - r0; stops = [(0.0, _shade(gcol, 1.05)), ((g0 - 0.004) / span, _shade(gcol, 0.85)), ((g0 - 0.003) / span, grass), (g0 / span, grass)]
    rb = radius
    for th, cb, ct, nm in layers:
        stops += [((rb - r0) / span + 0.0005, cb), ((rb + th - r0) / span - 0.0015, ct)]
        P.anchor(nm, (0, -depth / 2, rb + th / 2 - radius)); P.anchor(nm + '_top', (0, -depth / 2, rb + th - radius)); rb += th
    g.put(g.bsdf.inputs['Base Color'], g.ramp(t, stops, 'LINEAR'))
    P.add(mesh_obj('atmos', verts, faces, g.m, True, 30))
    P.anchor('ground', (0, -depth / 2, -g0 / 2))
    objs, A = P.done(); M = P.M
    A.ground = lambda x, y: (M @ Vector((0, 0, math.sqrt(max(radius ** 2 - (Matrix.inverted(M) @ Vector((x, y, 0))).x ** 2, 0)) - radius))).z
    return objs, A


def cloud(loc=(0, 0, 0), size=1.0, seed=0, puffs=7, flat_base=True, color='#ffffff', shade='#d9e3ee', rot=0):
    """Cumulus cloud: overlapping billowy puffs (noise-displaced spheres, big in the middle, small at the ends) on a
    flat base; soft blue-grey shading toward the edges. loc = centre of the base. Anchors: top, base, centre."""
    P = _Part(loc, rot); rr = random.Random(seed * 53 + 1); bm = bmesh.new()
    W = size; blobs = []
    for k in range(puffs):
        t = (k + 0.5) / puffs; prof = math.sqrt(max(0.0, 1 - (2 * t - 1) ** 2))
        r = size * (0.2 + 0.3 * prof) * rr.uniform(0.85, 1.15)
        blobs.append(((t - 0.5) * 2 * W * 0.9, rr.uniform(-0.2, 0.2) * size, r * rr.uniform(0.3, 0.6) + 0.35 * size * prof * rr.uniform(0.5, 1.0), r))
    for k in range(2):
        blobs.append((rr.uniform(-0.3, 0.3) * W, rr.uniform(-0.1, 0.1) * size, size * rr.uniform(0.45, 0.65), size * rr.uniform(0.3, 0.38)))
    for bi, (x, y, z, r) in enumerate(blobs):
        res = bmesh.ops.create_icosphere(bm, subdivisions=4, radius=r); off = _seedvec(seed * 31 + bi)
        for v in res['verts']:
            n = v.co.normalized(); d = 1 + 0.12 * noise.noise(n * 2.5 + off) + 0.05 * noise.noise(n * 6.0 + off * 1.7)
            zz = z + n.z * r * d
            v.co = Vector((x + n.x * r * d, y + n.y * r * d, max(zz, 0.0) if flat_base else zz))
    cm = _N('cloud'); cm.set(Roughness=1.0, Sheen_Weight=0.5, Sheen_Tint='#eef3f8')
    lw = cm.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35
    zf = cm.maprange(cm.xyz(cm.coord())[2], 0.0, 0.5 * size, 1.0, 0.0)
    cm.put(cm.bsdf.inputs['Base Color'], cm.mix(cm.math('MAXIMUM', cm.math('MULTIPLY', lw.outputs['Facing'], 0.45), cm.math('MULTIPLY', zf, 0.5)), color, shade))
    o = _bm_obj('cloud', bm, cm.m, True, 0); P.add(o)
    P.anchor('top', (0, 0, max(b[2] + b[3] for b in blobs))); P.anchor('base', (0, -0.3 * size, 0)); P.anchor('centre', (0, 0, 0.4 * size))
    return P.done()


# ----------------------------------------------------------------------------------------------------------- vegetation
def _shared(name, make):
    """One material per scene shared by many instances (per-instance colour comes from object.color)."""
    m = bpy.data.materials.get(name)
    if m is None: m = make(); m.name = name
    return m


def _foliage_mat(): return _shared('kit_foliage', lambda: _objcolor_mat('foliage', 0.8, 0.18, 6.0, 0.35, 0.05))


def tree(loc=(0, 0, 0), seed=0, kind='broadleaf', height=1.0, crown='#4f8a3c', trunk='#6b4f3a', lean=4.0):
    """One tree, shaped and coloured from its seed (no two alike). kind: 'broadleaf' | 'conifer' | 'round' | 'poplar'.
    loc = base of the trunk. Anchors: top, base, crown."""
    rr = random.Random(seed * 131 + 7); H = height * rr.uniform(0.85, 1.15)
    P = _Part(loc, rr.uniform(0, 360), (rr.uniform(-lean, lean), rr.uniform(-lean, lean)))
    bark = _shared('kit_bark', lambda: _objcolor_mat('bark', 0.85, 0.1, 20.0))
    col = _jitter(crown, rr, 0.025, 0.12, 0.12)
    if kind == 'conifer':
        th = 0.25 * H
        tr = lathe([(0.035 * H, -0.02), (0.03 * H, th), (0.0, th + 0.05)], bark, 12, name='trunk'); _set_color(tr, _jitter(trunk, rr)); P.add(tr)
        bm = bmesh.new(); tiers = rr.randint(5, 7)
        for k in range(tiers):
            t = k / tiers; zb = th * 0.6 + (H - th * 0.6) * t * 0.92; ht = (H - th) * rr.uniform(0.3, 0.38)
            rb_ = 0.3 * H * (1 - t) ** 0.9 * rr.uniform(0.9, 1.1) + 0.04 * H
            seg = 28; ring_b, ring_t = [], None
            for s in range(seg):
                a = TAU * s / seg; jr = rb_ * (1 + 0.14 * math.sin(a * rr.randint(5, 8) + rr.uniform(0, TAU)) + rr.uniform(-0.06, 0.06))
                ring_b.append(bm.verts.new((jr * math.cos(a), jr * math.sin(a), zb + rr.uniform(-0.02, 0.02) * H)))
            mid = [bm.verts.new((0.55 * v.co.x, 0.55 * v.co.y, zb + ht * 0.45)) for v in ring_b]
            apex = bm.verts.new((rr.uniform(-0.01, 0.01), 0, zb + ht)); bot = bm.verts.new((0, 0, zb + 0.08 * ht))
            for s in range(seg):
                s1 = (s + 1) % seg
                bm.faces.new((ring_b[s], ring_b[s1], mid[s1], mid[s])); bm.faces.new((mid[s], mid[s1], apex)); bm.faces.new((ring_b[s1], ring_b[s], bot))
        o = _bm_obj('crown', bm, _foliage_mat(), True, 0); _set_color(o, col); P.add(o)
        P.anchor('crown', (0, 0, 0.55 * H))
    else:
        th = {'broadleaf': 0.42, 'round': 0.38, 'poplar': 0.2}[kind] * H
        bend = rr.uniform(-0.04, 0.04) * H
        tv, tf = lathe_data([(0.06 * H, -0.02), (0.05 * H, th * 0.3), (0.035 * H, th), (0.02 * H, th * 1.35), (0, th * 1.4)], 12)
        tv = [(x + bend * (z / th) ** 2, y, z) for x, y, z in tv]
        tr = mesh_obj('trunk', tv, tf, bark, True, 0); _set_color(tr, _jitter(trunk, rr)); P.add(tr)
        bm = bmesh.new()
        if kind == 'poplar': blobs = [(0, 0, th + 0.38 * H, 0.2 * H, 2.6)]
        elif kind == 'round': blobs = [(bend, 0, th + 0.28 * H, 0.33 * H, 0.95)]
        else: blobs = [(bend, 0, th + 0.3 * H, 0.3 * H, 0.85)]
        nb = rr.randint(3, 6)
        for k in range(nb):
            a = TAU * k / nb + rr.uniform(-0.4, 0.4); rr_ = blobs[0][3]
            blobs.append((bend + 0.6 * rr_ * math.cos(a), 0.6 * rr_ * math.sin(a), blobs[0][2] + rr.uniform(-0.25, 0.3) * rr_, rr_ * rr.uniform(0.5, 0.75), blobs[0][4]))
        for bi, (x, y, z, r, sq) in enumerate(blobs):
            res = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=r)
            off = _seedvec(seed * 17 + bi)
            for v in res['verts']:
                n = v.co.normalized()
                d = 1 + 0.2 * noise.noise(n * 2.2 + off) + 0.1 * noise.noise(n * 5.5 + off * 1.3)
                v.co = Vector((x + n.x * r * d, y + n.y * r * d, z + n.z * r * d * sq))
        o = _bm_obj('crown', bm, _foliage_mat(), True, 0); _set_color(o, col); P.add(o)
        P.anchor('crown', (0, -blobs[0][3], blobs[0][2]))
    P.anchor('top', (0, 0, H)); P.anchor('base', (0, 0, 0))
    return P.done()


def forest(region=(-2, 2, -1, 1), n=20, seed=0, ground=None, kinds=('broadleaf', 'conifer'), weights=None, height=(0.45, 0.75),
           crown=('#4f8a3c', '#3f7a45', '#5d9444', '#2f6b4a'), trunk='#6b4f3a', min_dist=None, avoid=None):
    """Stand of trees scattered with a minimum spacing inside region (x0, x1, y0, y1) (world), each from its own seed;
    ground(x, y) -> z (e.g. anchors.ground of a terrain) sets each base; avoid(x, y) -> True skips a spot (a river).
    Anchors: forest (centroid top), tree<i> (tops)."""
    rr = random.Random(seed); x0, x1, y0, y1 = region; pts = []
    md = min_dist or 0.9 * math.sqrt((x1 - x0) * (y1 - y0) / max(n, 1))
    tries = 0
    while len(pts) < n and tries < n * 200:
        tries += 1; x, y = rr.uniform(x0, x1), rr.uniform(y0, y1)
        if avoid and avoid(x, y): continue
        if all((x - a) ** 2 + (y - b) ** 2 > md * md for a, b in pts): pts.append((x, y))
    pts.sort(key=lambda p: -p[1])
    objs, A = [], Anchors(); cx = cy = cz = 0
    for i, (x, y) in enumerate(pts):
        z = ground(x, y) if ground else 0.0
        k = rr.choices(kinds, weights=weights)[0] if weights else rr.choice(kinds)
        o, a = tree((x, y, z - 0.01), seed * 1000 + i, k, rr.uniform(*height), rr.choice(crown), trunk)
        objs += o; A[f'tree{i}'] = a['top']; cx += x; cy += y; cz += a['top'][2]
    if pts: A['forest'] = (cx / len(pts), cy / len(pts), cz / len(pts))
    return objs, A


def crop_field(loc=(0, 0, 0), size=(3.0, 2.0), rows=12, per_row=26, seed=0, plant='#6fa33c', soil='#7a5a3e', plant_height=0.14, rot=0):
    """Ploughed field: furrowed soil slab and rows of leafy crop plants, each plant with its own size, yaw and tint.
    Rows run along x. Anchors: field, row0, edge."""
    P = _Part(loc, rot); rr = random.Random(seed); sx, sy = size
    pitch = sy / rows; nx, ny = 60, rows * 8
    verts, faces = [], []
    for i in range(nx + 1):
        for j in range(ny + 1):
            x = -sx / 2 + sx * i / nx; y = -sy / 2 + sy * j / ny
            verts.append((x, y, 0.025 * (0.5 + 0.5 * math.cos(TAU * (y + sy / 2) / pitch - math.pi))))
    for i in range(nx):
        for j in range(ny): faces.append((i * (ny + 1) + j, (i + 1) * (ny + 1) + j, (i + 1) * (ny + 1) + j + 1, i * (ny + 1) + j + 1))
    base = len(verts)
    for (x, y) in [(-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2)]: verts.append((x, y, -0.12))
    faces += [tuple(i * (ny + 1) for i in range(nx + 1)) + (base + 1, base)]
    faces[-1] = tuple([base] + [i * (ny + 1) for i in range(nx + 1)] + [base + 1])[::-1]
    P.add(mesh_obj('field', verts, faces, earth(soil, 0.14, 7.0, 0.3, seed), True, 50))
    P.add(_box((sx, sy, 0.12), (0, 0, -0.06), earth(_shade(soil, 0.85), 0.1, 7.0, 0.2, seed), 0.0))
    bm = bmesh.new(); cl = bm.loops.layers.float_color.new('Col')
    for r in range(rows):
        y = -sy / 2 + (r + 0.5) * pitch
        for k in range(per_row):
            x = -sx / 2 + (k + 0.5 + rr.uniform(-0.25, 0.25)) * sx / per_row
            h = plant_height * rr.uniform(0.7, 1.25); c = hex_rgb(_jitter(plant, rr, 0.02, 0.12, 0.14))
            nl = rr.randint(4, 6); yaw = rr.uniform(0, TAU)
            for l in range(nl):
                a = yaw + TAU * l / nl + rr.uniform(-0.3, 0.3); L = h * rr.uniform(0.8, 1.2); w = 0.22 * L
                ca, sa = math.cos(a), math.sin(a); ring = []
                for s in range(6):
                    t = s / 5; rad = L * 0.75 * t; z = 0.02 + L * (1.1 * t - 0.75 * t * t); ww = w * math.sin(math.pi * min(t * 1.1, 1)) * 0.5
                    ring.append((bm.verts.new((x + rad * ca - ww * sa, y + rad * sa + ww * ca, z)), bm.verts.new((x + rad * ca + ww * sa, y + rad * sa - ww * ca, z + 0.2 * ww))))
                for s in range(5):
                    f = bm.faces.new((ring[s][0], ring[s][1], ring[s + 1][1], ring[s + 1][0]))
                    for lp in f.loops: lp[cl] = c
    g = _N('crop'); at = g.new('ShaderNodeVertexColor', layer_name='Col'); g.put(g.bsdf.inputs['Base Color'], at.outputs['Color']); g.set(Roughness=0.6, Sheen_Weight=0.3)
    o = _bm_obj('plants', bm, g.m, True, 0); P.add(o)
    P.anchor('field', (0, 0, plant_height)); P.anchor('row0', (0, -sy / 2 + pitch / 2, plant_height)); P.anchor('edge', (0, -sy / 2, 0))
    return P.done()


# ----------------------------------------------------------------------------------------------------------- built environment
def city_block(loc=(0, 0, 0), lots=(4, 3), lot=0.55, seed=0, heights=(0.3, 1.8), palette=('#e7e1d6', '#d5dbe2', '#cbbfae', '#b9c4cf', '#e2d2bc', '#c7cdd3'),
               window='#2e3d52', street='#55595f', sidewalk='#c9c8c3', rot=0):
    """City block on a sidewalk slab ringed by street: boxy buildings with random heights, setbacks, rooftop plant,
    per-building facade colours and a procedural window grid (no two buildings alike). Anchors: tallest, block, street."""
    P = _Part(loc, rot); rr = random.Random(seed); nx, ny = lots
    W, D = nx * lot, ny * lot
    P.add(_box((W + 0.5, D + 0.5, 0.04), (0, 0, 0.02), matte(street, 0.8), 0))
    P.add(_box((W + 0.16, D + 0.16, 0.06), (0, 0, 0.05), matte(sidewalk, 0.85), 0.01))
    g = _N('facade'); oi = g.new('ShaderNodeObjectInfo'); co = g.coord(); sp = g.xyz(co); nrm = g.xyz(g.coord('Normal'))
    hcoord = g.math('ADD', sp[0], sp[1])
    wx = g.math('ABSOLUTE', g.math('SUBTRACT', g.math('FRACT', g.math('DIVIDE', hcoord, 0.07)), 0.5))
    wz = g.math('ABSOLUTE', g.math('SUBTRACT', g.math('FRACT', g.math('DIVIDE', sp[2], 0.085)), 0.55))
    win = g.math('MULTIPLY', g.maprange(wx, 0.3, 0.26), g.maprange(wz, 0.28, 0.24))
    side = g.maprange(g.math('ABSOLUTE', nrm[2]), 0.5, 0.3)
    win = g.math('MULTIPLY', g.math('MULTIPLY', win, side), g.maprange(sp[2], 0.07, 0.1))
    wall = oi.outputs['Color']
    roof = g.maprange(nrm[2], 0.6, 0.9)
    col = g.mix(roof, wall, '#9ea3a8')
    col = g.mix(win, col, window)
    g.put(g.bsdf.inputs['Base Color'], col); g.put(g.bsdf.inputs['Roughness'], g.maprange(win, 0, 1, 0.8, 0.12))
    g.put(g.bsdf.inputs['Coat Weight'], g.math('MULTIPLY', win, 0.8))
    best = (0, None)
    for i in range(nx):
        for j in range(ny):
            cx, cy = -W / 2 + (i + 0.5) * lot, -D / 2 + (j + 0.5) * lot
            fw, fd = lot * rr.uniform(0.72, 0.9), lot * rr.uniform(0.72, 0.9)
            t = rr.random() ** 1.6; h = heights[0] + (heights[1] - heights[0]) * t * (1.0 if (i, j) != (nx // 2, ny // 2) else 1.3)
            col_ = _jitter(rr.choice(palette), rr, 0.01, 0.1, 0.05)
            o = _box((fw, fd, h), (cx, cy, 0.08 + h / 2), g.m, 0.004); o.name = 'bldg'; _set_color(o, col_); P.add(o)
            top = 0.08 + h
            if h > 0.8 and rr.random() < 0.6:
                h2 = h * rr.uniform(0.15, 0.35); o = _box((fw * 0.7, fd * 0.7, h2), (cx, cy, top + h2 / 2), g.m, 0.004); _set_color(o, col_); P.add(o); top += h2
            ru = rr.uniform(0.04, 0.07)
            P.add(_box((fw * rr.uniform(0.2, 0.35), fd * rr.uniform(0.2, 0.35), ru), (cx + rr.uniform(-0.1, 0.1) * fw, cy + rr.uniform(-0.1, 0.1) * fd, top + ru / 2), matte('#8d9197', 0.6), 0.003))
            if top > best[0]: best = (top, (cx, cy, top))
    P.anchor('tallest', best[1]); P.anchor('block', (0, -D / 2, 0.3)); P.anchor('street', (0, -D / 2 - 0.2, 0.04))
    return P.done()


def wind_turbine(loc=(0, 0, 0), hub_height=2.0, blade=0.85, yaw=0.0, seed=0, color='#dde1e5', rotor_angle=None):
    """Three-blade horizontal-axis wind turbine: tapered tower, nacelle, spinner, twisted tapered blades.
    The rotor faces -y (toward a camera in front) at yaw=0. Anchors: hub, base, tip, nacelle."""
    P = _Part(loc, yaw); rr = random.Random(seed)
    wm = painted(color, 0.35, 0.3)
    H = hub_height
    P.add(lathe([(0.05 * H, 0), (0.046 * H, 0.02), (0.028 * H, H * 0.97), (0, H * 0.97)], wm, 48, name='tower', sharp_deg=60))
    P.add(_box((0.1 * H, 0.2 * H, 0.085 * H), (0, 0.04 * H, H), wm, 0.02 * H))
    yh = -0.07 * H
    sp = lathe(_chaikin([(0, 0), (0.035 * H, 0.0), (0.042 * H, 0.03 * H), (0.03 * H, 0.07 * H), (0, 0.1 * H)], 2), wm, 48, name='spinner')
    sp.rotation_euler = (math.pi / 2, 0, 0); sp.location = (0, yh, H); P.add(sp)
    bm = bmesh.new(); ang0 = rr.uniform(0, TAU / 3) if rotor_angle is None else math.radians(rotor_angle)
    L = blade * H; ns = 16
    for b in range(3):
        rot = ang0 + TAU * b / 3; secs = []
        for s in range(ns + 1):
            t = s / ns; r = 0.03 * H + t * L
            chord = (0.022 * H if t < 0.04 else L * (0.075 * min(1, (t - 0.04) / 0.16 + 0.55) * (1 - 0.75 * max(0, t - 0.2) / 0.8)))
            thk = chord * (0.35 - 0.23 * t); tw = math.radians(16 * (1 - t))
            ring = []
            for k in range(10):
                a = TAU * k / 10; u = 0.5 * chord * math.cos(a) - 0.15 * chord; w = 0.5 * thk * math.sin(a) * (1 if math.sin(a) > 0 else 0.6)
                cu, cw = u * math.cos(tw) - w * math.sin(tw), u * math.sin(tw) + w * math.cos(tw)
                x, z = cu, r
                X = x * math.cos(rot) - z * math.sin(rot); Z = x * math.sin(rot) + z * math.cos(rot)
                ring.append(bm.verts.new((X, yh - 0.03 * H + cw, H + Z)))
            secs.append(ring)
        for a, c in zip(secs, secs[1:]):
            for k in range(10): bm.faces.new((a[k], a[(k + 1) % 10], c[(k + 1) % 10], c[k]))
        bm.faces.new(list(reversed(secs[0]))); bm.faces.new(secs[-1])
        if b == 0:
            P.anchor('tip', (-L * math.sin(rot), yh, H + L * math.cos(rot)))
    P.add(_bm_obj('blades', bm, wm, True, 60))
    P.anchor('hub', (0, yh - 0.1 * H, H)); P.anchor('base', (0, 0, 0)); P.anchor('nacelle', (0, 0.12 * H, H + 0.05 * H))
    return P.done()


def solar_array(loc=(0, 0, 0), rows=3, cols=5, module=(0.42, 0.7), tilt=25.0, row_gap=0.55, seed=0, cell='#1c2e55', frame='#c9ced4', rot=0):
    """Ground-mounted PV array: rows of tilted modules (dark blue cells, silver busbars, aluminium frames) on legs,
    facing -y. Anchors: array, row<i>, module (front-left module centre)."""
    P = _Part(loc, rot); rr = random.Random(seed); mw, mh = module
    g = _N('pv'); sp = g.xyz(g.coord())
    cx = g.math('ABSOLUTE', g.math('SUBTRACT', g.math('FRACT', g.math('DIVIDE', g.math('ADD', sp[0], mw / 2), mw / 6)), 0.5))
    cy = g.math('ABSOLUTE', g.math('SUBTRACT', g.math('FRACT', g.math('DIVIDE', g.math('ADD', sp[1], mh / 2), mh / 10)), 0.5))
    gap = g.math('MAXIMUM', g.maprange(cx, 0.46, 0.49), g.maprange(cy, 0.44, 0.48))
    bus = g.maprange(g.math('ABSOLUTE', g.math('SUBTRACT', g.math('FRACT', g.math('DIVIDE', g.math('ADD', sp[0], mw / 2), mw / 18)), 0.5)), 0.03, 0.015)
    col = g.mix(gap, cell, '#dfe3e8'); col = g.mix(g.math('MULTIPLY', bus, 0.8), col, '#b8bec6')
    g.put(g.bsdf.inputs['Base Color'], col); g.set(Roughness=0.12, Coat_Weight=1.0, Coat_Roughness=0.03, Metallic=0.1)
    fm = brushed_metal(frame, 0.3, 'x'); leg = brushed_metal('#aeb4bb', 0.35, 'z')
    tr = math.radians(tilt); depth = mh * math.cos(tr)
    for r in range(rows):
        y = r * (depth + row_gap); zlow = 0.22
        for c in range(cols):
            x = (c - (cols - 1) / 2) * (mw + 0.02)
            zc = zlow + 0.5 * mh * math.sin(tr)
            o = _box((mw, mh, 0.025), (0, 0, 0), g.m, 0.003); o.rotation_euler = (tr, 0, 0); o.location = (x, y, zc); P.add(o)
            f = _box((mw + 0.02, mh + 0.02, 0.018), (0, 0, 0), fm, 0.004); f.rotation_euler = (tr, 0, 0); f.location = (x, y, zc - 0.012); P.add(f)
        W = cols * (mw + 0.02)
        for k in range(max(2, cols // 2 + 1)):
            x = -W / 2 + 0.1 + k * (W - 0.2) / max(1, max(2, cols // 2 + 1) - 1)
            P.add(cylinder((x, y - 0.3 * depth, 0), (x, y - 0.3 * depth, zlow + 0.2 * mh * math.sin(tr)), 0.015, leg, 12))
            P.add(cylinder((x, y + 0.3 * depth, 0), (x, y + 0.3 * depth, zlow + 0.8 * mh * math.sin(tr)), 0.015, leg, 12))
        P.anchor(f'row{r}', (W / 2, y, zlow + mh * math.sin(tr)))
    P.anchor('array', (0, (rows - 1) * (depth + row_gap) / 2, 0.6)); P.anchor('module', (-(cols - 1) / 2 * (mw + 0.02), 0, 0.22 + 0.5 * mh * math.sin(tr)))
    return P.done()
