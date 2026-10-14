"""3D hero elements for schematics, rendered headless in Blender and composited under vector labels.

Usage from a figure's render script (figure/render3d.py):
    import sys; sys.path.insert(0, '<project>/blender'); from scene import *
    S = setup(width_px=2400, height_px=1200, samples=96)
    fiber_path([(-3,0,0), (-1,0.6,0), (1,-0.4,0), (3,0,0)], radius=0.12, mat=plastic('#f0c36a'))
    lens(x=1.5, radius=0.9, thickness=0.28)
    beam([(1.8,0,0), (4,0,0)], radius=0.05, color='#e8322b')
    chip(size=(4,2.4,0.25), loc=(0,0,-0.5), top='#eef1f5', waveguides=[[(-1.8,-0.5),(1.8,0.6)]])
    camera_look(loc=(0,-9,5), target=(0.3,0,0), lens_mm=50)   # or ortho=6.0
    soft_lights(); shadow_floor(z=-0.5)
    finish(S, out_png='figure/art/setup.png', anchors={'lens_top': (1.5,0,0.9), 'fiber_in': (-3,0,0)})
Run: blender -b --factory-startup -P figure/render3d.py   (Blender 4.x/5.x; full path if not on PATH)
Writes the PNG (transparent background) and <png>.json {size:[w,h], anchors:{name:[px,py]}}; place it with
L.image(p, 'art/setup.png', x, y, w, {pxw, pxh, anchors, F, prefix: 'r.'}). Renders with Cycles on a GPU when Blender finds one (OptiX, CUDA, Metal, HIP or oneAPI) and on the CPU otherwise.
SCHEMATIC_3D_DEVICE=cpu|gpu|auto (default auto) forces the choice. setup() prints the device it used.
The first GPU render of a new kind of scene can take a few minutes while the driver builds its kernels (one chip scene
in illustration mode took 232 s once, then 8 s). Later renders are fast. Wait for it, do not stop the render.

Illustration mode (for every kit; the default photographic render is unchanged when it is off).
A render beside flat vector panels reads as a second, foreign register. Illustration mode redraws the finished scene
as one illustrator would draw it next to the vector parts. Switch it on in one of these ways:
    S = setup(..., style='illustration', illustrate=dict(fig_width_mm=60))    # scene.py setups
    use_style('illustration', fig_width_mm=60)    # before bio_setup / setup + look / any kit setup
    SCHEMATIC_3D_STYLE=illustration blender -b ... # environment, no script change
    illustrate_scene(S, fig_width_mm=60)          # explicitly, after building, before finish()
finish() then applies illustrate_scene() before rendering. The post-pass does the following:
  - Materials. Every material becomes a flat-lit emission shader built from its own base colour: base, a lighter
    warm tone toward the light and a darker cool tone away from it (bands=2-4, soft steps of width `grade`), with the
    tone ramp of engine/illustrate.js (L.tones). A varied colour (per cell, per object, strata ramps, land/sea masks)
    keeps its variation, because the ramp runs in shader nodes. Noise mottling between similar colours is flattened
    (texture=True keeps it). Metals get a sky/ground reflection split. Crevices get a light AO darkening, and glossy
    parts a small highlight. Glass, liquids and see-through shells become a light tint, clearer face-on and denser at
    the rim. Emissive parts (beams, waveguides, glows) are kept as they are. `palette` remaps or snaps flat base
    colours to the figure's palette.
  - Outlines. Freestyle draws silhouette, border and contour lines at outline_pt, and crease and material-boundary
    lines thinner (`inner`). Each line takes the darker `line` tone of its material's colour. The pixel width makes
    the line print at outline_pt when the PNG is placed at fig_width_mm. Parts only a few line widths across (lipids,
    beads, struts) get lighter lines or none. Lines hidden by glass are drawn again at `through` opacity.
  - Shadows. The kit's lights and soft floor shadows go. shadow='contact' draws one flat footprint shadow at
    shadow_opacity under parts that stand on the kit's shadow_floor. shadow='none' draws no shadow.
  - Sharpness. There is no denoiser (it smears lines), and the pixel filter is 1 px. The render is enlarged when it
    has fewer than 600 px per inch at fig_width_mm. Anchors, the transparent background and the .json stay as they
    are, so figure.js needs no change.
Render cost: about the same as the photographic render (hero objects 16-34 s, demo scenes 4-25 s on a 32-thread CPU).
"""
import bpy, json, math, os
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view


def hex_rgb(h, a=1.0):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c) + (a,)   # sRGB -> linear


_GPU_BACKENDS = ('OPTIX', 'CUDA', 'METAL', 'HIP', 'ONEAPI')   # tried in this order


def use_device(sc, mode=None):
    """Choose the Cycles device and print the choice. mode: 'auto' | 'gpu' | 'cpu'; None reads the environment
    variable SCHEMATIC_3D_DEVICE and falls back to 'auto'. auto and gpu try OptiX, CUDA, Metal, HIP and oneAPI in
    that order and use the first backend that lists a GPU. They fall back to the CPU when there is none, and gpu
    says so. Returns 'CPU' or the backend name."""
    mode = (mode or os.environ.get('SCHEMATIC_3D_DEVICE') or 'auto').strip().lower()
    if mode not in ('auto', 'gpu', 'cpu'):
        raise ValueError("SCHEMATIC_3D_DEVICE must be 'auto', 'gpu' or 'cpu', not %r" % mode)
    found, why = None, 'forced by SCHEMATIC_3D_DEVICE=cpu' if mode == 'cpu' else 'no GPU found'
    if mode != 'cpu':
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            for kind in _GPU_BACKENDS:
                try: prefs.compute_device_type = kind
                except TypeError: continue   # this Blender build has no such backend
                (prefs.refresh_devices if hasattr(prefs, 'refresh_devices') else prefs.get_devices)()
                gpus = [d for d in prefs.devices if d.type == kind] or [d for d in prefs.devices if d.type != 'CPU']
                if gpus:
                    for d in prefs.devices: d.use = d in gpus   # the GPU only: a CPU in the mix slows it down
                    found = (kind, ', '.join(d.name for d in gpus)); break
        except Exception as e:   # no Cycles preferences in this build: render on the CPU
            why = 'GPU setup failed (%s)' % e
    if found:
        sc.cycles.device = 'GPU'
        print('schematic-3d: Cycles device = %s (%s)' % found)
        return found[0]
    sc.cycles.device = 'CPU'
    print('schematic-3d: Cycles device = CPU (%s)' % why)
    return 'CPU'


def setup(width_px=2400, height_px=1200, samples=None, world=0.35, style=None, illustrate=None):
    """style: None (the process default, see use_style; 'render' unless changed) | 'render' | 'illustration'.
    'illustration' makes finish() run illustrate_scene(sc, **(illustrate or {})) before rendering.
    samples: None gives 96 on the CPU and 192 on a GPU. The device comes from use_device (SCHEMATIC_3D_DEVICE)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    dev = use_device(sc)
    if samples is None: samples = 96 if dev == 'CPU' else 192
    sc.cycles.samples = samples; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = width_px, height_px
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'   # flat colours stay faithful (Filmic/AgX desaturate)
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (1, 1, 1, 1); bg.inputs[1].default_value = world
    _IL_STATE.pop(sc.name, None)
    st = style or _STYLE3D['style']
    if st == 'illustration':
        _IL_STATE[sc.name] = {'pending': dict(_STYLE3D['opts'], **(illustrate or {}))}
    elif st != 'render':
        raise ValueError("style must be 'render' or 'illustration', not %r" % st)
    return sc


def _mat(name, **kw):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    for k, v in kw.items(): b.inputs[k].default_value = v
    return m


def plastic(color, rough=0.35, coat=0.6): return _mat('plastic', **{'Base Color': hex_rgb(color), 'Roughness': rough, 'Coat Weight': coat})
def metal(color='#b8bec6', rough=0.25): return _mat('metal', **{'Base Color': hex_rgb(color), 'Metallic': 1.0, 'Roughness': rough})
def glass(color='#e6f2fa', ior=1.5): return _mat('glass', **{'Base Color': hex_rgb(color), 'Roughness': 0.0, 'Transmission Weight': 1.0, 'IOR': ior})
def emission(color='#e8322b', strength=1.0):   # keep strength near 1 under 'Standard' or the hue clips
    return _mat('emit', **{'Base Color': hex_rgb(color), 'Emission Color': hex_rgb(color), 'Emission Strength': strength})


def _obj(): o = bpy.context.object; bpy.ops.object.shade_smooth(); return o


def cylinder(p0, p1, radius, mat, vertices=96):
    a, b = Vector(p0), Vector(p1); d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=d.length, location=(a + b) / 2)
    o = _obj(); o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = d.to_track_quat('Z', 'Y'); o.data.materials.append(mat); return o


def beam(points, radius=0.05, color='#e8322b', strength=1.0):
    """Emissive tube through points (straight segments)."""
    m = emission(color, strength)
    return [cylinder(points[i], points[i + 1], radius, m, 32) for i in range(len(points) - 1)]


def cone(p0, p1, r0, r1, color='#e8322b', alpha=0.35):
    """Translucent light cone (focusing/diverging beam)."""
    a, b = Vector(p0), Vector(p1); d = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=r0, radius2=r1, depth=d.length, location=(a + b) / 2)
    o = _obj(); o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    m = _mat('cone', **{'Base Color': hex_rgb(color), 'Emission Color': hex_rgb(color), 'Emission Strength': 0.6, 'Alpha': alpha})
    o.data.materials.append(m); return o


def fiber_path(points, radius=0.12, mat=None, resolution=24):
    """Smooth tube along a Bezier through points: fibres, cables, waveguide ribbons."""
    cu = bpy.data.curves.new('fib', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = radius; cu.bevel_resolution = 8
    cu.resolution_u = resolution
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points): bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new('fiber', cu); bpy.context.collection.objects.link(o)
    o.data.materials.append(mat or plastic('#f0c36a')); return o


def lens(x=0.0, y=0.0, z=0.0, radius=0.9, thickness=0.25, axis='x', mat=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=radius, location=(x, y, z))
    o = _obj(); s = thickness / (2 * radius) * 2.2
    o.scale = (s, 1, 1) if axis == 'x' else (1, s, 1) if axis == 'y' else (1, 1, s)
    o.data.materials.append(mat or glass()); return o


def box(size, loc, mat, bevel=0.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = bpy.context.object; o.scale = size
    if bevel:
        md = o.modifiers.new('bev', 'BEVEL'); md.width = bevel; md.segments = 3
    o.data.materials.append(mat); return o


def chip(size=(4, 2.4, 0.25), loc=(0, 0, 0), top='#eef1f5', substrate='#d9d4c9', waveguides=(), wg_color='#0072B2', wg_radius=0.025):
    """Photonic chip slab; waveguides are 2D polylines in chip-top coordinates (x, y) relative to the centre."""
    sx, sy, sz = size
    box((sx, sy, sz * 0.7), (loc[0], loc[1], loc[2] - sz * 0.15), plastic(substrate, 0.6, 0.1))
    box((sx, sy, sz * 0.3), (loc[0], loc[1], loc[2] + sz * 0.35), plastic(top, 0.4, 0.3))
    ztop = loc[2] + sz * 0.5 + wg_radius
    m = emission(wg_color, 0.8)
    for wg in waveguides:
        fiber_path([(loc[0] + u, loc[1] + v, ztop) for u, v in wg], radius=wg_radius, mat=m)


def pixel_array(n=8, m=8, pitch=0.2, loc=(0, 0, 0), values=None, height=0.04, lo='#1b2a41', hi='#e8eef7'):
    """SLM / DMD / detector array: n x m raised pixels coloured by values[i][j] in [0,1]."""
    lo_c, hi_c = hex_rgb(lo), hex_rgb(hi)
    for i in range(n):
        for j in range(m):
            t = values[i][j] if values else 0.5 + 0.5 * math.sin(i * 1.3 + j * 0.7)
            col = tuple(lo_c[k] * (1 - t) + hi_c[k] * t for k in range(3)) + (1,)
            mat = _mat('px', **{'Base Color': col, 'Roughness': 0.3})
            box((pitch * 0.9, pitch * 0.9, height), (loc[0] + (i - n / 2 + 0.5) * pitch, loc[1] + (j - m / 2 + 0.5) * pitch, loc[2]), mat, bevel=0)


def camera_look(loc=(0, -9, 5), target=(0, 0, 0), lens_mm=50, ortho=None):
    bpy.ops.object.camera_add(location=loc); cam = bpy.context.object; bpy.context.scene.camera = cam
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else: cam.data.lens = lens_mm
    return cam


def camera_oblique(target=(0, 0, 0), scale=6.0, elev=20.0, azim=0.0, dist=40.0):
    """Orthographic camera for a figure whose beam axis is world x and whose verticals are world z.
    Verticals (z) are always vertical on the page, because the camera's up vector stays in the plane of z and the view.
    elev: degrees above the table (0 = side elevation). azim: degrees the camera moves from the -y side toward +x.
      azim = 0   the beam axis (x) is exactly level on the page. You see the front face (-y side) and the top face,
                 and never an end face (+x or -x). Use this when a level beam matters more than a side face.
      azim != 0  you also see the +x end face, but x tilts on the page by the angle that this function returns.
    Trade-off (one orthographic camera cannot do both): a level x axis needs the page's up vector perpendicular to x.
    With elev > 0 that forces the view direction to have no x component, so no end face shows. A true oblique view
    (level x, vertical z, a side face as a parallelogram) shears the image, which a rotation of one camera cannot do.
    Best three-quarter preset: elev = 25, azim = 30 (x falls to the right by about 14 degrees, +x end face and front face both seen).
    A level beam with a visible side face needs the shear in post: render with azim = 0 and place the render with
    L.image, or draw that part with L.obliqueBox and L.lightScene3 (vector 3D, cabinet projection) instead.
    Returns (camera, tilt_deg): tilt_deg is the page angle of the world x axis (0 when level, positive = rising to the right).
    The existing camera_look is unchanged."""
    e, a = math.radians(elev), math.radians(azim)
    off = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    loc = Vector(target) + off
    cam = camera_look(loc=tuple(loc), target=target, ortho=scale)
    bpy.context.view_layer.update()
    M = cam.matrix_world.to_3x3(); X = Vector((1, 0, 0))
    tilt = math.degrees(math.atan2(X.dot(M @ Vector((0, 1, 0))), X.dot(M @ Vector((1, 0, 0)))))
    return cam, tilt


def soft_lights(key=250, fill=80, rim=120, shadows=('key',)):
    """Key/fill/rim area lights. Only lights named in `shadows` cast shadows (default: key only), so the fill
    and rim lights do not throw hard-edged grey patches across a shadow-catcher floor."""
    for name, loc, e, size in [('key', (-3, -4, 6), key, 5), ('fill', (5, -3, 2), fill, 6), ('rim', (0, 5, 5), rim, 4)]:
        bpy.ops.object.light_add(type='AREA', location=loc); L = bpy.context.object; L.data.energy = e; L.data.size = size
        L.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        L.data.use_shadow = name in shadows


def shadow_floor(z=0.0, size=40.0):
    """Invisible floor that only receives shadows: soft contact shadows on the transparent film."""
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z)); o = bpy.context.object
    o.is_shadow_catcher = True
    o.data.materials.append(_mat('catcher', **{'Base Color': (1, 1, 1, 1), 'Roughness': 1.0}))
    return o


def torus(loc=(0, 0, 0), major=2.0, minor=0.08, mat=None, rot=(0, 0, 0)):
    """Ring cavity, resonator or fibre loop."""
    bpy.ops.mesh.primitive_torus_add(location=loc, rotation=rot, major_radius=major, minor_radius=minor, major_segments=192, minor_segments=24)
    o = _obj(); o.data.materials.append(mat or plastic('#8fcbe8', 0.25, 0.6)); return o


def gaussian_solid(loc=(0, 0, 0), height=0.6, sigma=0.15, mat=None, segments=64):
    """Radially symmetric Gaussian bump (a pulse drawn as a solid peak) standing on loc."""
    import bmesh
    me = bpy.data.meshes.new('gauss'); bm = bmesh.new(); rings = 24
    prof = [(sigma * 3.2 * i / rings, height * math.exp(-((sigma * 3.2 * i / rings) ** 2) / (2 * sigma ** 2))) for i in range(rings + 1)]
    verts = []
    for r, h in prof:
        ring = [bm.verts.new((loc[0] + r * math.cos(2 * math.pi * k / segments), loc[1] + r * math.sin(2 * math.pi * k / segments), loc[2] + h)) for k in range(segments)]
        verts.append(ring)
    for a, b in zip(verts, verts[1:]):
        for k in range(segments): bm.faces.new((a[k], a[(k + 1) % segments], b[(k + 1) % segments], b[k]))
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('gauss', me); bpy.context.collection.objects.link(o)
    for poly in o.data.polygons: poly.use_smooth = True
    o.data.materials.append(mat or plastic('#e8603c', 0.3, 0.5)); return o


def finish(sc, out_png, anchors=None):
    """Render to out_png and write out_png + '.json' with pixel anchors of named 3D points.
    In illustration mode (setup(style='illustration'), use_style, or an earlier illustrate_scene call) it first
    applies the post-pass and afterwards restores outlines seen through transparent objects (see illustrate_scene)."""
    st = _IL_STATE.get(sc.name)
    if st and 'pending' in st and 'applied' not in st: illustrate_scene(sc, **st['pending'])
    sc.render.filepath = out_png
    bpy.ops.render.render(write_still=True)
    st = _IL_STATE.get(sc.name)
    if st and st.get('applied'): _il_post(sc, out_png, st['applied'])
    A, off = {}, []
    for name, p in (anchors or {}).items():
        v = world_to_camera_view(sc, sc.camera, Vector(p))
        px = [v.x * sc.render.resolution_x, (1 - v.y) * sc.render.resolution_y]
        A[name] = px
        if not (0 <= px[0] <= sc.render.resolution_x and 0 <= px[1] <= sc.render.resolution_y) or v.z < 0: off.append(name)
    json.dump({'size': [sc.render.resolution_x, sc.render.resolution_y], 'anchors': A, 'off_frame': off}, open(out_png + '.json', 'w'), indent=1)
    print('RENDERED', out_png, 'anchors', A, 'OFF-FRAME' if off else '', off)


# ==================================================================================================== illustration mode
# A post-pass that redraws a finished scene the way an illustrator draws it: every material becomes a flat-lit toon
# material built from its own base colour (the tone ramp of engine/illustrate.js), Freestyle draws the outlines in a
# darker tone of each object's colour, photographic floor shadows become a small flat contact shadow (or none).
import os as _os

_STYLE3D = {'style': (_os.environ.get('SCHEMATIC_3D_STYLE') or 'render').strip().lower(), 'opts': {}}
_IL_STATE = {}          # scene name -> {'pending': opts} (set by setup) / {'applied': info} (set by illustrate_scene)


def use_style(style='illustration', **opts):
    """Process-wide default style for later setup() calls, including the kits' own setups (bio_setup builds on
    setup). opts are illustrate_scene keyword arguments. The environment variable SCHEMATIC_3D_STYLE=illustration
    sets the same default without touching a script."""
    if style not in ('render', 'illustration'): raise ValueError(style)
    _STYLE3D['style'] = style; _STYLE3D['opts'] = dict(opts)


# ---- colour: a port of engine/illustrate.js tones() (HSL on sRGB, lightness shifts at near-constant chroma) ------
def _s2l(v): return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
def _l2s(v): v = min(max(v, 0.0), 1.0); return v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
def _clamp(v, a=0.0, b=1.0): return min(b, max(a, v))


def _rgb_hsl(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b); l = (mx + mn) / 2; h = s = 0.0
    if mx != mn:
        d = mx - mn; s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
        h = 60 * (((g - b) / d + (6 if g < b else 0)) if mx == r else ((b - r) / d + 2) if mx == g else ((r - g) / d + 4))
    return h, s, l


def _hsl_rgb(h, s, l):
    h = h % 360; s = _clamp(s); l = _clamp(l); a = s * min(l, 1 - l)
    def f(n):
        k = (n + h / 30) % 12; return l - a * max(-1, min(k - 3, 9 - k, 1))
    return (f(0), f(8), f(4))


def _toward(h, target, amt):
    d = ((target - h + 540) % 360) - 180
    return h + math.copysign(min(abs(d), amt), d)


def _tone_params(name, c=1.0):
    """(hue target deg, hue shift per unit of min(1, 3 s), chroma factor k, up_frac, up_max, dn_frac, dn_max):
    new lightness = l + min(up_frac (1 - l), up_max) - min(dn_frac l, dn_max). Same numbers as illustrate.js."""
    return {'light': (50, 7 * c, 1 - 0.1 * c, 0.5 * c, 0.16 * c, 0, 0),
            'glow': (50, 7 * c, 0.6, 0.75, 1.0, 0, 0),
            'dark': (235, 10 * c, 1 + 0.12 * c, 0, 0, 0.24 * c, 0.16 * c),
            'deep': (235, 10 * c, 1 + 0.2 * c, 0, 0, 0.4 * c, 0.28 * c),
            'line': (235, 8, 1.15, 0, 0, 0.42, 1.0)}[name]


def _tone_srgb(srgb, name, c=1.0):
    h, s, l = _rgb_hsl(*srgb[:3]); hs = min(1.0, 3 * s); C = s * (1 - abs(2 * l - 1))
    tgt, amt, k, uf, um, df, dm = _tone_params(name, c)
    ll = _clamp(l + min(uf * (1 - l), um) - min(df * l, dm)); room = 1 - abs(2 * ll - 1)
    return _hsl_rgb(_toward(h, tgt, amt * hs), min(1.0, C * k / room) if room > 1e-6 else 0.0, ll)


def illus_tones(color, contrast=1.0):
    """'#rrggbb' -> {base, light, glow, dark, deep, line} as hex: the same ramp as L.tones in engine/illustrate.js."""
    srgb = tuple(int(color.lstrip('#')[i:i + 2], 16) / 255 for i in (0, 2, 4))
    hx = lambda c: '#%02x%02x%02x' % tuple(int(round(_clamp(v) * 255)) for v in c)
    return dict(base=hx(srgb), **{n: hx(_tone_srgb(srgb, n, contrast)) for n in ('light', 'glow', 'dark', 'deep', 'line')})


def _lin_tone(lin, name, c=1.0):
    return tuple(_s2l(v) for v in _tone_srgb(tuple(_l2s(v) for v in lin[:3]), name, c)) + (1.0,)


# ---- shader-graph helpers -------------------------------------------------------------------------------------------
class _G:
    def __init__(self, nt): self.nt = nt; self.N = nt.nodes; self.L = nt.links

    def node(self, t, **props):
        n = self.N.new(t)
        for k, v in props.items(): setattr(n, k, v)
        return n

    def put(self, sock, v):
        if isinstance(v, bpy.types.NodeSocket): self.L.new(v, sock)
        else: sock.default_value = v

    def math(self, op, a, b=0.0, clamp=False):
        n = self.node('ShaderNodeMath', operation=op, use_clamp=clamp); self.put(n.inputs[0], a); self.put(n.inputs[1], b)
        return n.outputs[0]

    def mix(self, fac, a, b):
        n = self.node('ShaderNodeMix', data_type='RGBA', clamp_factor=True)
        self.put(n.inputs[0], fac); self.put(n.inputs[6], a); self.put(n.inputs[7], b); return n.outputs[2]

    def smooth(self, v, lo, hi):
        n = self.node('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP', clamp=True); self.put(n.inputs[0], v)
        n.inputs[1].default_value, n.inputs[2].default_value, n.inputs[3].default_value, n.inputs[4].default_value = lo, hi, 0.0, 1.0
        return n.outputs[0]

    def shader_mix(self, fac, a, b):
        n = self.node('ShaderNodeMixShader'); self.put(n.inputs[0], fac); self.L.new(a, n.inputs[1]); self.L.new(b, n.inputs[2])
        return n.outputs[0]

    def tone(self, col, name, c):
        n = self.node('ShaderNodeGroup'); n.node_tree = _tone_group()
        self.put(n.inputs['Color'], col)
        for k, v in zip(('Target', 'Amt', 'K', 'UpFrac', 'UpMax', 'DnFrac', 'DnMax'), _tone_params(name, c)): n.inputs[k].default_value = v
        return n.outputs[0]


def _tone_group():
    """Node group 'IL_tone': the tones() shift of a (possibly per-face or per-object) linear colour, in shader nodes.
    HSL is taken on a gamma-2.2 encoding (close to sRGB), so it matches illus_tones to about 1 %."""
    g = bpy.data.node_groups.get('IL_tone')
    if g: return g
    g = bpy.data.node_groups.new('IL_tone', 'ShaderNodeTree')
    g.interface.new_socket('Color', in_out='INPUT', socket_type='NodeSocketColor')
    for k in ('Target', 'Amt', 'K', 'UpFrac', 'UpMax', 'DnFrac', 'DnMax'): g.interface.new_socket(k, in_out='INPUT', socket_type='NodeSocketFloat')
    g.interface.new_socket('Color', in_out='OUTPUT', socket_type='NodeSocketColor')
    G = _G(g); gi = G.node('NodeGroupInput'); go = G.node('NodeGroupOutput'); I = gi.outputs
    gm = G.node('ShaderNodeGamma'); G.put(gm.inputs[0], I['Color']); gm.inputs[1].default_value = 1 / 2.2
    sp = G.node('ShaderNodeSeparateColor', mode='HSL'); G.put(sp.inputs[0], gm.outputs[0])
    h = G.math('MULTIPLY', sp.outputs[0], 360.0); s = sp.outputs[1]; l = sp.outputs[2]
    hs = G.math('MINIMUM', G.math('MULTIPLY', s, 3.0), 1.0)
    C = G.math('MULTIPLY', s, G.math('SUBTRACT', 1.0, G.math('ABSOLUTE', G.math('SUBTRACT', G.math('MULTIPLY', l, 2.0), 1.0))))
    up = G.math('MINIMUM', G.math('MULTIPLY', I['UpFrac'], G.math('SUBTRACT', 1.0, l)), I['UpMax'])
    dn = G.math('MINIMUM', G.math('MULTIPLY', I['DnFrac'], l), I['DnMax'])
    ll = G.math('SUBTRACT', G.math('ADD', l, up), dn, clamp=True)
    room = G.math('MAXIMUM', G.math('SUBTRACT', 1.0, G.math('ABSOLUTE', G.math('SUBTRACT', G.math('MULTIPLY', ll, 2.0), 1.0))), 1e-4)
    s2 = G.math('MINIMUM', G.math('DIVIDE', G.math('MULTIPLY', C, I['K']), room), 1.0)
    d = G.math('SUBTRACT', G.math('FLOORED_MODULO', G.math('ADD', G.math('SUBTRACT', I['Target'], h), 540.0), 360.0), 180.0)
    h2 = G.math('ADD', h, G.math('MULTIPLY', G.math('SIGN', d), G.math('MINIMUM', G.math('ABSOLUTE', d), G.math('MULTIPLY', I['Amt'], hs))))
    hn = G.math('DIVIDE', G.math('FLOORED_MODULO', h2, 360.0), 360.0)
    cb = G.node('ShaderNodeCombineColor', mode='HSL'); G.put(cb.inputs[0], hn); G.put(cb.inputs[1], s2); G.put(cb.inputs[2], ll)
    g2 = G.node('ShaderNodeGamma'); G.put(g2.inputs[0], cb.outputs[0]); g2.inputs[1].default_value = 2.2
    G.put(go.inputs[0], g2.outputs[0])
    return g


# ---- reading a kit material: what kind of surface, which colour --------------------------------------------------
def _upstream(sock, pred, depth=8):
    """First node upstream of a socket that satisfies pred (breadth first)."""
    front = [l.from_node for l in sock.links]; seen = set()
    for _ in range(depth):
        nxt = []
        for n in front:
            if n.name in seen: continue
            seen.add(n.name)
            if pred(n): return n
            for i in n.inputs: nxt += [l.from_node for l in i.links]
        front = nxt
    return None


def _face_edge(sock, default=(0.12, 0.8)):
    """Opacity face-on and at the rim from a facing-driven factor (the kits map Layer Weight through a Map Range)."""
    if not sock.is_linked: v = float(sock.default_value); return v, v
    mr = _upstream(sock, lambda n: n.bl_idname == 'ShaderNodeMapRange')
    if mr: a, b = mr.inputs[3].default_value, mr.inputs[4].default_value; return min(a, b), max(a, b)
    return default


def _il_info(node):
    """Classify a surface shader: {'kind': 'opaque' | 'tint' | 'emit' | 'clear', 'col': base colour socket, ...}."""
    t = node.bl_idname; I = node.inputs
    if t == 'ShaderNodeBsdfPrincipled':
        es, ec = I['Emission Strength'], I['Emission Color']
        if (es.is_linked or es.default_value >= 0.4) and (ec.is_linked or max(ec.default_value[:3]) > 0.01):
            return dict(kind='emit')         # a faint emission (a warm glow on a cut face) is drawn as a colour
        info = dict(kind='opaque', col=I['Base Color'], rough=I['Roughness'].default_value, metal=I['Metallic'].default_value)
        al, tw = I['Alpha'], I['Transmission Weight']
        if tw.default_value >= 0.5 and not tw.is_linked:
            info.update(kind='tint', face=0.1, edge=0.6)
        elif al.is_linked or al.default_value < 0.95:
            f, e = _face_edge(al); info.update(kind='tint', face=f, edge=max(e, min(1.0, f + 0.4)))
        return info
    if t in ('ShaderNodeBsdfDiffuse', 'ShaderNodeBsdfToon'): return dict(kind='opaque', col=I['Color'], rough=1.0, metal=0.0)
    if t == 'ShaderNodeEmission': return dict(kind='emit')
    if t == 'ShaderNodeBsdfTransparent': return dict(kind='clear')
    if t in ('ShaderNodeBsdfGlass', 'ShaderNodeBsdfRefraction'): return dict(kind='tint', col=I['Color'], face=0.1, edge=0.6, rough=0.0, metal=0.0)
    if t == 'ShaderNodeMixShader':
        sub = [(_il_info(I[k].links[0].from_node) if I[k].is_linked else dict(kind='clear')) for k in (1, 2)]
        if None in sub: return None
        kinds = [s['kind'] for s in sub]
        if 'emit' in kinds: return dict(kind='emit')
        fac = I[0]
        if 'clear' in kinds:
            j = 1 - kinds.index('clear'); o = sub[j]
            if o['kind'] == 'clear': return dict(kind='clear')
            if fac.is_linked: f, e = _face_edge(fac, (0.15, 0.8))
            else: f = e = fac.default_value if j == 1 else 1 - fac.default_value
            return dict(o, kind='tint', face=f * o.get('face', 1.0), edge=max(e * o.get('edge', 1.0), min(1.0, f + 0.4)))
        if kinds == ['opaque', 'opaque']: return sub[1] if (fac.is_linked or fac.default_value >= 0.5) else sub[0]
        ti = kinds.index('tint'); t_, o = sub[ti], sub[1 - ti]
        if o['kind'] != 'opaque': return t_
        if fac.is_linked:     # clear body with a coloured grazing rim (lab glass)
            return dict(t_, rim=o['col'], face=t_.get('face', 0.1), edge=max(t_.get('edge', 0.6), 0.7))
        w = fac.default_value if ti == 0 else 1 - fac.default_value       # weight of the opaque body (a liquid)
        f = t_.get('face', 0.1) + (1 - t_.get('face', 0.1)) * 0.95 * w
        return dict(o, kind='tint', face=f, edge=min(1.0, f + 0.3))
    return None


def _rep(sock, users, depth=0):
    """Representative linear RGB of a colour socket (for the line colour of a material whose colour varies)."""
    if sock is None: return (0.5, 0.5, 0.5)
    if not sock.is_linked or depth > 12: return tuple(sock.default_value[:3])
    n = sock.links[0].from_node; t = n.bl_idname; fs = sock.links[0].from_socket
    avg = lambda cs: tuple(sum(c[i] for c in cs) / max(1, len(cs)) for i in range(3))
    if t == 'ShaderNodeMix':
        f = n.inputs[0].default_value if not n.inputs[0].is_linked else 0.5
        a, b = _rep(n.inputs[6], users, depth + 1), _rep(n.inputs[7], users, depth + 1)
        return tuple(a[i] * (1 - f) + b[i] * f for i in range(3))
    if t == 'ShaderNodeMixRGB': return avg([_rep(n.inputs[1], users, depth + 1), _rep(n.inputs[2], users, depth + 1)])
    if t in ('ShaderNodeHueSaturation', 'ShaderNodeGamma', 'ShaderNodeBrightContrast', 'ShaderNodeInvert'):
        return _rep(n.inputs['Color'], users, depth + 1)
    if t == 'ShaderNodeValToRGB': return avg([tuple(e.color[:3]) for e in n.color_ramp.elements])
    if t == 'ShaderNodeVectorMath':
        v = _rep(n.inputs[0], users, depth + 1)
        k = n.inputs['Scale'].default_value if n.operation == 'SCALE' and not n.inputs['Scale'].is_linked else 1.0
        return tuple(c * k for c in v)
    if t == 'ShaderNodeRGB': return tuple(fs.default_value[:3])
    if t == 'ShaderNodeObjectInfo': return avg([tuple(o.color[:3]) for o in users]) if users else (0.5, 0.5, 0.5)
    if t in ('ShaderNodeVertexColor', 'ShaderNodeAttribute'):
        name = getattr(n, 'layer_name', '') or getattr(n, 'attribute_name', ''); cs = []
        for o in users:
            ca = getattr(getattr(o, 'data', None), 'color_attributes', None)
            if ca is not None and len(ca):
                a = ca[name] if name in ca else ca[0]; k = max(1, len(a.data) // 400)
                cs += [tuple(a.data[i].color[:3]) for i in range(0, len(a.data), k)]
        if cs: return avg(cs)
    return (0.5, 0.5, 0.5)


def _flatten(sock):
    """Take noise-driven mottling out of a colour chain: a Mix of two similar colours (sRGB distance < 0.3) whose
    factor comes from a noise texture, or a Scale by noise, is pinned to its midpoint. Patterns (a land / sea mask,
    ice caps: a noise-driven mix of different colours), per-face, per-object and ramp colour (strata) stay."""
    if sock is None or not sock.is_linked: return 0
    noisy = lambda s: s.is_linked and _upstream(s, lambda n: n.bl_idname in ('ShaderNodeTexNoise', 'ShaderNodeTexVoronoi', 'ShaderNodeTexMusgrave', 'ShaderNodeTexWave')) is not None
    k, front, seen = 0, [sock.links[0].from_node], set()
    while front:
        n = front.pop()
        if n.name in seen: continue
        seen.add(n.name); nt = n.id_data
        ab = (6, 7) if n.bl_idname == 'ShaderNodeMix' else (1, 2)
        if n.bl_idname in ('ShaderNodeMix', 'ShaderNodeMixRGB') and noisy(n.inputs[0]) and sum(
                (_l2s(a) - _l2s(b)) ** 2 for a, b in zip(_rep(n.inputs[ab[0]], []), _rep(n.inputs[ab[1]], []))) ** 0.5 < 0.3:
            for l in list(n.inputs[0].links): nt.links.remove(l)
            n.inputs[0].default_value = 0.5; k += 1
        if n.bl_idname == 'ShaderNodeVectorMath' and n.operation == 'SCALE' and noisy(n.inputs['Scale']):
            for l in list(n.inputs['Scale'].links): nt.links.remove(l)
            n.inputs['Scale'].default_value = 1.0; k += 1
        if n.bl_idname == 'ShaderNodeMapRange' and n.data_type == 'FLOAT' and noisy(n.inputs[0]):
            pass
        for i in n.inputs:
            if i.type in ('RGBA', 'VECTOR') or n.bl_idname in ('ShaderNodeMix', 'ShaderNodeMixRGB'):
                front += [l.from_node for l in i.links if l.from_node.bl_idname not in ('ShaderNodeTexNoise', 'ShaderNodeTexCoord', 'ShaderNodeMapping')]
    return k


def _palette_map(lin, palette, snap):
    if not palette: return lin
    srgb = tuple(_l2s(v) for v in lin[:3]); hx = '#%02x%02x%02x' % tuple(int(round(v * 255)) for v in srgb)
    if isinstance(palette, dict):
        m = {k.lower(): v for k, v in palette.items()}
        return hex_rgb(m[hx])[:3] if hx in m else lin
    best, bd = None, 9.0
    for p in palette:
        q = tuple(int(p.lstrip('#')[i:i + 2], 16) / 255 for i in (0, 2, 4)); d = sum((a - b) ** 2 for a, b in zip(q, srgb)) ** 0.5
        if d < bd: best, bd = p, d
    return hex_rgb(best)[:3] if bd <= snap else lin


# ---- the post-pass ------------------------------------------------------------------------------------------------
def illustrate_scene(sc=None, outline_pt=0.5, fig_width_mm=None, bands=3, palette=None, snap=0.12, shadow='contact',
                     shadow_opacity=0.22, light=(-135.0, 30.0), edges=(-0.1, 0.82), grade=0.06, contrast=1.0, ao=0.3,
                     highlight=0.55, inner=0.55, crease=140.0, through=0.75, texture=False, weight_by_size=True,
                     dpi=600, samples=None, lines=True):
    """Rewrite a built scene into illustration style. Call after building, before finish(); setup(style=
    'illustration') or use_style('illustration') makes finish() call it for you. Keyword arguments:
      outline_pt     outer line weight in pt as printed; inner (crease, material-boundary) lines are `inner` x that.
      fig_width_mm   width the PNG will be placed at in the figure. Line pixels are computed from it, and the render
                     is enlarged if it has fewer than `dpi` (600) pixels per inch at that width. None: the PNG is
                     assumed to be placed at `dpi`.
      bands          2 (shade, base), 3 (+ light) or 4 (+ deep core shadow). `edges` are the terminator and the light
                     edge on n.l in camera space, `grade` the half-width of each band's smooth step (0 = hard cel).
      light          (page angle deg, elevation toward the viewer deg); -135 = upper left, as in illustrate.js.
      palette        {hex: hex} remap or [hex, ...] snapped to when within `snap` (sRGB distance); flat base colours only.
      shadow         'contact' (a flat, hard, light contact shadow on the kit's shadow_floor at shadow_opacity) or 'none'.
      ao             crevice darkening toward the deep tone (0 = none). highlight: small specular spot on glossy parts.
      texture        keep the kits' noise mottling and grain (False: flat fills; per-cell and per-object colour stay).
      through        opacity of outlines seen through glass and liquids (0 = hidden, as Freestyle alone draws them).
      weight_by_size lighter (or no) lines on parts only a few line widths across (lipids, beads, pili).
      lines=False    toon shading without outlines.
    Returns a summary dict (also stored for finish())."""
    sc = sc or bpy.context.scene
    st = _IL_STATE.setdefault(sc.name, {})
    if 'applied' in st: return st['applied']
    R = sc.render
    # -- resolution: enough pixels for `dpi` at the placed width
    if fig_width_mm:
        need = int(math.ceil(fig_width_mm / 25.4 * dpi))
        if R.resolution_x < need:
            f = need / R.resolution_x
            R.resolution_x, R.resolution_y = need, int(round(R.resolution_y * f))
            print('ILLUSTRATE: resolution raised to %dx%d for %d dpi at %.0f mm' % (R.resolution_x, R.resolution_y, dpi, fig_width_mm))
    width_mm = fig_width_mm or R.resolution_x / dpi * 25.4
    px_per_pt = R.resolution_x / (width_mm / 25.4 * 72.0)
    # -- colour management and sampling: flat colours, no denoiser smear, few bounces (surfaces are emissive)
    vs = sc.view_settings; vs.view_transform = 'Standard'; vs.look = 'None'; vs.exposure = 0.0; vs.gamma = 1.0
    c = sc.cycles; c.use_denoising = False; c.use_adaptive_sampling = True; c.adaptive_threshold = 0.01
    if samples: c.samples = samples
    c.max_bounces = 4; c.diffuse_bounces = 1; c.glossy_bounces = 0; c.transmission_bounces = 0; c.volume_bounces = 0
    c.transparent_max_bounces = max(c.transparent_max_bounces, 24); c.caustics_reflective = c.caustics_refractive = False
    R.filter_size = 1.0; R.film_transparent = True
    # -- camera-space light and half vector (Cycles camera space: +x right, +y up, +z away from the viewer)
    a, e = math.radians(light[0]), math.radians(light[1])
    Lc = Vector((math.cos(e) * math.cos(a), -math.cos(e) * math.sin(a), -math.sin(e))).normalized()
    Hc = (Lc + Vector((0, 0, -1))).normalized()
    objs = [o for o in sc.objects if o.type in ('MESH', 'CURVE', 'SURFACE', 'META', 'FONT') and not o.hide_render]
    users = {}
    for o in objs:
        for s in o.material_slots:
            if s.material: users.setdefault(s.material.name, []).append(o)
    size = 1.0
    pts = [o.matrix_world @ Vector(b) for o in objs if not o.is_shadow_catcher for b in o.bound_box]
    if pts: size = max((max(p[i] for p in pts) - min(p[i] for p in pts)) for i in range(3))
    kinds = {}
    for m in list(bpy.data.materials):     # all of them: boolean cut faces use the (hidden) cutter's material
        if not m.use_nodes or not m.node_tree: continue
        out = m.node_tree.get_output_node('CYCLES')
        if out is None or not out.inputs['Surface'].is_linked: continue
        if m.name in users and all(o.is_shadow_catcher for o in users[m.name]): continue
        info = _il_info(out.inputs['Surface'].links[0].from_node)
        if info is None or info['kind'] == 'clear': kinds[m.name] = 'skip'; continue
        kinds[m.name] = info['kind']
        if info['kind'] == 'emit': continue
        _il_rewrite(m, out, info, users.get(m.name, []), dict(Lc=Lc, Hc=Hc, bands=bands, edges=edges, grade=grade, contrast=contrast,
                                                     ao=ao, ao_dist=0.02 * size, highlight=highlight, palette=palette, snap=snap, texture=texture))
    # -- lights and shadows: the kit's lights go; a floor keeps only a flat contact shadow from a near-vertical sun
    catchers = [o for o in objs if o.is_shadow_catcher]
    for o in sc.objects:
        if o.type == 'LIGHT': o.hide_render = True
    w = sc.world or bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    nt = w.node_tree; nt.nodes.clear()
    bg = nt.nodes.new('ShaderNodeBackground'); wo = nt.nodes.new('ShaderNodeOutputWorld'); nt.links.new(bg.outputs[0], wo.inputs[0])
    bg.inputs[0].default_value = (1, 1, 1, 1); bg.inputs[1].default_value = 0.0
    if shadow == 'contact' and catchers:
        M = sc.camera.matrix_world.to_3x3()
        right = M @ Vector((1, 0, 0)); right.z = 0
        fwd = M @ Vector((0, 0, -1)); fwd.z = 0
        d = Vector((0, 0, -1)) + 0.12 * (right.normalized() if right.length else Vector()) + 0.06 * (fwd.normalized() if fwd.length else Vector())
        # one near-vertical sun: the shadow is the object's footprint, just under and slightly right of it (an
        # illustrator's ground shadow). finish() renders it as a separate pass and lays it under the main render
        # as one flat tone at shadow_opacity (see _il_post); the floor and sun stay out of the main render.
        bpy.ops.object.light_add(type='SUN', location=(0, 0, 10)); sun = bpy.context.object; sun.name = 'IL_sun'
        sun.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); sun.data.angle = math.radians(1.0); sun.data.energy = 3.0
        sun.hide_render = True
        for o in catchers:
            for sl in o.material_slots:
                if sl.material: sl.material['il_catcher'] = 1
    for o in catchers: o.hide_render = True
    # -- outlines (Freestyle): outer lines at outline_pt, inner lines thinner, colour = each material's line tone
    noline = bpy.data.collections.get('IL_noline') or bpy.data.collections.new('IL_noline')
    if noline.name not in sc.collection.children: sc.collection.children.link(noline)
    tint_objs = []
    px = outline_pt * px_per_pt
    # line weight follows feature size: an object's features are ~sqrt(projected bbox area / islands) pixels across
    # (islands from the Euler characteristic of its evaluated mesh). Parts under ~6 line widths get lighter lines,
    # parts under ~0.6 line widths none, so a vesicle of lipids does not turn into a ball of outline.
    classes = [(1.0, 6.0), (0.65, 3.0), (0.4, 1.5), (0.25, 0.6)] if weight_by_size else [(1.0, 0.0)]
    wcol = []
    for k, (f_, _) in enumerate(classes):
        c_ = bpy.data.collections.get('IL_w%d' % k) or bpy.data.collections.new('IL_w%d' % k)
        if c_.name not in sc.collection.children: sc.collection.children.link(c_)
        wcol.append(c_)
    dg = bpy.context.evaluated_depsgraph_get(); nclass = [0] * (len(classes) + 1)
    for o in objs:
        ks = [kinds.get(s.material.name, 'opaque') for s in o.material_slots if s.material] or ['opaque']
        if all(k == 'tint' for k in ks): tint_objs.append(o.name)
        if o.is_shadow_catcher or all(k in ('emit', 'skip') for k in ks): target = noline
        else:
            fp = _feature_px(o, sc, dg) / max(px, 1e-6)
            target = next((wcol[k] for k, (_, lo) in enumerate(classes) if fp >= lo), noline)
        nclass[wcol.index(target) if target in wcol else -1] += 1
        if o.name not in target.objects: target.objects.link(o)
    if lines:
        R.use_freestyle = True; R.line_thickness_mode = 'ABSOLUTE'; R.line_thickness = 1.0
        for vl in sc.view_layers:
            vl.use_freestyle = True; fs = vl.freestyle_settings; fs.mode = 'EDITOR'; fs.use_smoothness = True
            fs.crease_angle = math.radians(crease); fs.use_culling = False; fs.as_render_pass = False
            for ls in list(fs.linesets): fs.linesets.remove(ls)
            for (nm, wgt, types), (k, (cf, _)) in [(a_, b_) for b_ in enumerate(classes) for a_ in (
                    ('IL_outline', 1.0, ('silhouette', 'border', 'contour', 'external_contour')),
                    ('IL_inner', inner, ('crease', 'material_boundary')))]:
                if not wcol[k].objects: continue
                nm = '%s%d' % (nm, k); wgt = wgt * cf
                ls = fs.linesets.new(nm); ls.select_by_visibility = True; ls.visibility = 'VISIBLE'
                ls.select_by_edge_types = True; ls.edge_type_combination = 'OR'
                for t in ('silhouette', 'border', 'contour', 'external_contour', 'crease', 'material_boundary', 'ridge_valley',
                          'suggestive_contour', 'edge_mark'):
                    setattr(ls, 'select_' + t, t in types)
                ls.select_by_collection = True; ls.collection = wcol[k]; ls.collection_negation = 'INCLUSIVE'
                sty = bpy.data.linestyles.new(nm); ls.linestyle = sty
                sty.color = (0.1, 0.1, 0.12); sty.thickness = max(0.6, px * wgt); sty.thickness_position = 'CENTER'
                sty.caps = 'ROUND'; sty.use_chaining = True; sty.chaining = 'PLAIN'; sty.use_same_object = True
                cm = sty.color_modifiers.new('mat', 'MATERIAL'); cm.material_attribute = 'LINE'; cm.blend = 'MIX'; cm.influence = 1.0
    info = dict(px=px, px_per_pt=px_per_pt, tint_objs=tint_objs, through=through if lines else 0.0, kinds=kinds,
                catchers=[o.name for o in catchers], size=size, sun='IL_sun' if (shadow == 'contact' and catchers) else None,
                shadow=shadow_opacity if (shadow == 'contact' and catchers) else 0.0,
                shadow_rgb=tuple(v / 255 for v in (0x2a, 0x30, 0x3c)))
    st['applied'] = info; st.pop('pending', None)
    vals = list(kinds.values())
    print('ILLUSTRATE: %d materials (%s), outline %.2f px (%.2f pt at %.0f mm), objects per line weight %s, shadow %s' % (
        len(kinds), ', '.join('%s %d' % (k, vals.count(k)) for k in sorted(set(vals))), px, outline_pt, width_mm,
        '/'.join(map(str, nclass)), shadow if catchers else 'none (no floor)'))
    return info


def _feature_px(o, sc, dg):
    """Typical projected size (px) of one part of the object: the smaller of sqrt(projected bbox area / parts)
    (parts from the Euler characteristic) and, for a closed mesh, its projected thickness 4V/A (a tube's diameter,
    a sphere's 1.3 radii, a sheet's twice thickness)."""
    import numpy as np
    R = sc.render; wc = [o.matrix_world @ Vector(c) for c in o.bound_box]
    pts = [world_to_camera_view(sc, sc.camera, c) for c in wc]
    if all(p.z <= 0 for p in pts): return 0.0
    xs = [min(max(p.x, -0.5), 1.5) * R.resolution_x for p in pts]; ys = [min(max(p.y, -0.5), 1.5) * R.resolution_y for p in pts]
    area = max(1.0, (max(xs) - min(xs)) * (max(ys) - min(ys)))
    feat = math.sqrt(area)
    try:
        oe = o.evaluated_get(dg); me = oe.to_mesh()
        try:
            chi = len(me.vertices) - len(me.edges) + len(me.polygons)
            feat = math.sqrt(area / max(1, abs(chi) // 2))   # closed parts (chi 2 each) or lattice holes (chi -2 each)
            nl = len(me.loops)
            if nl and len(me.polygons):
                ei = np.empty(nl, np.int32); me.loops.foreach_get('edge_index', ei)
                if np.bincount(ei, minlength=len(me.edges)).min() >= 2:       # closed: thickness from volume / area
                    me.calc_loop_triangles(); nt = len(me.loop_triangles)
                    tv = np.empty(nt * 3, np.int32); me.loop_triangles.foreach_get('vertices', tv)
                    co = np.empty(len(me.vertices) * 3, np.float64); me.vertices.foreach_get('co', co)
                    M = np.array(o.matrix_world); co = co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
                    a, b, c = (co[tv.reshape(-1, 3)[:, k]] for k in range(3))
                    cr = np.cross(b - a, c - a); A = 0.5 * np.linalg.norm(cr, axis=1).sum()
                    V = abs((a * np.cross(b, c)).sum()) / 6.0
                    if A > 0:
                        ctr = sum(wc, Vector()) / 8; right = sc.camera.matrix_world.to_3x3() @ Vector((1, 0, 0))
                        p0, p1 = world_to_camera_view(sc, sc.camera, ctr), world_to_camera_view(sc, sc.camera, ctr + right)
                        ppu = abs(p1.x - p0.x) * R.resolution_x
                        feat = min(feat, 4 * V / A * ppu)
        finally: oe.to_mesh_clear()
    except Exception: pass
    return feat


def _il_rewrite(m, out, info, users, o):
    """Replace the material's surface by a flat-lit toon (opaque) or a tinted see-through (tint) emission shader.
    Camera rays see the emission; every other ray sees black diffuse, so nothing lights the contact-shadow floor."""
    G = _G(m.node_tree)
    col = info.get('col')
    if not o['texture']: _flatten(col)
    rep = _rep(col, users)
    if col is not None and not col.is_linked:
        base = tuple(_palette_map(tuple(col.default_value[:3]), o['palette'], o['snap'])) + (1.0,); rep = base[:3]
    elif col is not None: base = col.links[0].from_socket
    else: base = (0.5, 0.5, 0.5, 1.0)
    c = o['contrast'] * (1.35 if info.get('metal', 0) > 0.5 else 1.0)
    if isinstance(base, bpy.types.NodeSocket): tone = lambda name: G.tone(base, name, c)
    else: tone = lambda name: _lin_tone(base, name, c)
    lp = G.node('ShaderNodeLightPath')
    black = G.node('ShaderNodeBsdfDiffuse'); black.inputs[0].default_value = (0, 0, 0, 1)
    if info['kind'] == 'tint':
        rimc = info.get('rim'); rim_rep = _rep(rimc, users) if rimc is not None else rep
        rim_col = _lin_tone(tuple(rim_rep) + (1.0,), 'dark', c) if rimc is not None else tone('dark')
        lw = G.node('ShaderNodeLayerWeight'); lw.inputs[0].default_value = 0.3
        f = G.math('POWER', lw.outputs['Facing'], 1.5, clamp=True)
        alpha = G.math('ADD', G.math('MULTIPLY', f, info['edge'] - info['face']), info['face'], clamp=True)
        em = G.node('ShaderNodeEmission'); G.put(em.inputs[0], G.mix(f, tone('light'), rim_col)); em.inputs[1].default_value = 1.0
        tr = G.node('ShaderNodeBsdfTransparent'); tr.inputs[0].default_value = (1, 1, 1, 1)
        tr2 = G.node('ShaderNodeBsdfTransparent'); tr2.inputs[0].default_value = (1, 1, 1, 1)
        cam = G.shader_mix(alpha, tr.outputs[0], em.outputs[0])
        other = G.shader_mix(alpha, tr2.outputs[0], black.outputs[0])
        m.line_color = _lin_tone(tuple(rim_rep) + (1.0,), 'line', c)
    else:
        geo = G.node('ShaderNodeNewGeometry')
        vt = G.node('ShaderNodeVectorTransform', vector_type='NORMAL', convert_from='WORLD', convert_to='CAMERA')
        G.put(vt.inputs[0], geo.outputs['Normal'])
        flip = G.math('SUBTRACT', 1.0, G.math('MULTIPLY', geo.outputs['Backfacing'], 2.0))
        nsc = G.node('ShaderNodeVectorMath', operation='SCALE'); G.put(nsc.inputs[0], vt.outputs[0]); G.put(nsc.inputs['Scale'], flip)
        dl = G.node('ShaderNodeVectorMath', operation='DOT_PRODUCT'); G.put(dl.inputs[0], nsc.outputs[0]); dl.inputs[1].default_value = tuple(o['Lc'])
        d = dl.outputs['Value']; e1, e2 = o['edges']; w = o['grade'] + 1e-4
        shade = G.mix(G.smooth(d, e1 - w, e1 + w), tone('dark'), base)
        if info.get('metal', 0) > 0.5:
            # an illustrator's metal: the reflected sky / ground split, a light upper and a dark lower band
            iv = G.node('ShaderNodeVectorTransform', vector_type='VECTOR', convert_from='WORLD', convert_to='CAMERA')
            G.put(iv.inputs[0], geo.outputs['Incoming'])
            rf = G.node('ShaderNodeVectorMath', operation='REFLECT'); G.put(rf.inputs[0], iv.outputs[0]); G.put(rf.inputs[1], nsc.outputs[0])
            ry = G.node('ShaderNodeSeparateXYZ'); G.put(ry.inputs[0], rf.outputs[0])
            sky = G.smooth(G.math('MULTIPLY', ry.outputs['Y'], -1.0), -0.12 - w, -0.12 + w)
            shade = G.mix(sky, G.mix(G.smooth(d, e1 - w, e1 + w), tone('deep'), tone('dark')), shade)
        if o['bands'] >= 4: shade = G.mix(G.smooth(d, e1 - 0.45 - w, e1 - 0.45 + w), tone('deep'), shade)
        if o['bands'] >= 3: shade = G.mix(G.smooth(d, e2 - w, e2 + w), shade, tone('light'))
        if o['ao'] > 0:
            aon = G.node('ShaderNodeAmbientOcclusion', samples=8, only_local=False); aon.inputs['Distance'].default_value = o['ao_dist']
            k = G.math('MULTIPLY', G.math('SUBTRACT', 1.0, G.smooth(aon.outputs['AO'], 0.2, 0.7)), o['ao'])
            shade = G.mix(k, shade, tone('deep'))
        rough, metal = info.get('rough', 0.5), info.get('metal', 0.0)
        hl = o['highlight'] * (1.0 if (metal > 0.5 or rough < 0.3) else 0.6 if rough < 0.5 else 0.0)
        if hl > 0:
            dh = G.node('ShaderNodeVectorMath', operation='DOT_PRODUCT'); G.put(dh.inputs[0], nsc.outputs[0]); dh.inputs[1].default_value = tuple(o['Hc'])
            th = 0.985 - 0.05 * rough
            shade = G.mix(G.math('MULTIPLY', G.smooth(dh.outputs['Value'], th - 0.004, th + 0.004), hl), shade, tone('glow'))
        em = G.node('ShaderNodeEmission'); G.put(em.inputs[0], shade); em.inputs[1].default_value = 1.0
        cam, other = em.outputs[0], black.outputs[0]
        m.line_color = _lin_tone(tuple(rep) + (1.0,), 'line', c)
    final = G.shader_mix(lp.outputs['Is Camera Ray'], other, cam)
    for l in list(out.inputs['Surface'].links): m.node_tree.links.remove(l)
    m.node_tree.links.new(final, out.inputs['Surface'])


def _il_image(path):
    import numpy as np
    img = bpy.data.images.load(path, check_existing=False); w, h = img.size
    a = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(a); bpy.data.images.remove(img)
    return a.reshape(h, w, 4), (w, h)


def _il_post(sc, out_png, info):
    """Extra passes after the main render, composited into out_png:
    - contact shadow: sun only, every surface a holdout, the kit's shadow-catcher floor visible, no lines. Its alpha
      is a hard 0/1 footprint; it goes under the main render at shadow_opacity in one flat cool-grey tone.
    - see-through lines: Freestyle lets glass hide the lines behind it, so the lines are drawn once more with the
      see-through objects removed (every surface a holdout, so only strokes remain), plus a coverage mask of those
      objects; the recovered lines go on top at `through` opacity, only where the see-through objects are."""
    import numpy as np
    tint = [n for n in info['tint_objs'] if n in sc.objects]
    need_lines = bool(tint) and info.get('through', 0) > 0 and sc.render.use_freestyle
    cat = [sc.objects[n] for n in info['catchers'] if n in sc.objects]
    sun = sc.objects.get(info.get('sun') or '')
    need_shadow = info.get('shadow', 0) > 0 and bool(cat) and sun is not None
    if not (need_lines or need_shadow): return
    white = bpy.data.materials.new('IL_mask'); white.use_nodes = True
    we = white.node_tree.nodes.new('ShaderNodeEmission'); we.inputs[0].default_value = (1, 1, 1, 1)
    white.node_tree.links.new(we.outputs[0], white.node_tree.get_output_node('CYCLES').inputs['Surface'])
    saved = []
    for m in bpy.data.materials:
        if m == white or not m.use_nodes or not m.node_tree or m.get('il_catcher'): continue
        out = m.node_tree.get_output_node('CYCLES')
        if out is None: continue
        src = out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].is_linked else None
        saved.append((m, src))
        ho = m.node_tree.nodes.new('ShaderNodeHoldout'); m.node_tree.links.new(ho.outputs[0], out.inputs['Surface'])
    base = out_png[:-4] if out_png.lower().endswith('.png') else out_png
    paths = {k: base + '.il_%s.png' % k for k in ('lines', 'mask', 'shadow')}
    R = sc.render; fs0 = R.use_freestyle; samples = sc.cycles.samples; sc.cycles.samples = min(samples, 32); swaps = []; floated = []
    try:
        if need_lines:
            for n in tint: sc.objects[n].hide_render = True
            R.filepath = paths['lines']; bpy.ops.render.render(write_still=True)
            for n in tint: sc.objects[n].hide_render = False
            for n in tint:
                for s in sc.objects[n].material_slots: swaps.append((s, s.material)); s.material = white
            R.use_freestyle = False; R.filepath = paths['mask']; bpy.ops.render.render(write_still=True)
            for s, mm in swaps: s.material = mm
            swaps = []
        if need_shadow:
            R.use_freestyle = False
            for o in cat: o.hide_render = False
            sun.hide_render = False
            zf = max(o.matrix_world.translation.z for o in cat); gap = 0.02 * info.get('size', 1.0)
            for o in sc.objects:     # parts floating clear of the floor cast no contact shadow
                if o.type in ('MESH', 'CURVE', 'SURFACE', 'META', 'FONT') and not o.hide_render and o not in cat and o.visible_shadow:
                    if min((o.matrix_world @ Vector(c)).z for c in o.bound_box) > zf + gap:
                        o.visible_shadow = False; floated.append(o)
            R.filepath = paths['shadow']; bpy.ops.render.render(write_still=True)
    finally:
        R.use_freestyle = fs0; sc.cycles.samples = samples; R.filepath = out_png
        for s, mm in swaps: s.material = mm
        for o in cat: o.hide_render = True
        for o in floated: o.visible_shadow = True
        if sun is not None: sun.hide_render = True
        for m, src in saved:
            out = m.node_tree.get_output_node('CYCLES')
            for l in list(out.inputs['Surface'].links): m.node_tree.links.remove(l)
            if src is not None: m.node_tree.links.new(src, out.inputs['Surface'])
    A, (w, h) = _il_image(out_png)
    rgb, al = A[..., :3], A[..., 3:4]

    def over(frgb, fa, brgb, ba):      # straight-alpha "front over back"
        oa = fa + ba * (1 - fa)
        return np.where(oa > 1e-6, (frgb * fa + brgb * ba * (1 - fa)) / np.maximum(oa, 1e-6), 0), oa
    if need_shadow:
        S, _ = _il_image(paths['shadow'])
        sa = np.clip(S[..., 3:4], 0, 1) * info['shadow']
        rgb, al = over(rgb, al, np.broadcast_to(np.array(info['shadow_rgb'], np.float32), rgb.shape), sa)
    if need_lines:
        Ln, _ = _il_image(paths['lines']); Mk, _ = _il_image(paths['mask'])
        la = Ln[..., 3:4] * np.clip(Mk[..., 3:4], 0, 1) * info['through']
        rgb, al = over(Ln[..., :3], la, rgb, al)
    res = np.concatenate([rgb, al], axis=2).astype(np.float32).ravel()
    img = bpy.data.images.new('IL_out', w, h, alpha=True); img.pixels.foreach_set(res)
    img.filepath_raw = out_png; img.file_format = 'PNG'; img.save(); bpy.data.images.remove(img)
    for p in paths.values():
        try: _os.remove(p)
        except OSError: pass
    print('ILLUSTRATE: post-pass%s%s' % (' contact shadow' if need_shadow else '', ', lines behind %d see-through objects' % len(tint) if need_lines else ''))
