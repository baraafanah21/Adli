"""Adli barber shears: photoreal Cycles scene, same studio as the hero bottle.

Run:  python3 scene.py [--still out.png --angle DEG] [--turntable outdir frames start --end N]
                       [--res-pct N] [--samples N] [--open DEG] [--save scene.blend]
Z is up, the camera looks along +Y. The shears stand tips-up, floating over the plinth.
Mirror-polished steel blades, brushed brass handles, a brass pivot carved with the Adli seal (ع).
"""
import bpy, bmesh, json, math, sys, os, time
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
def arg(name, default=None, n=1):
    if name in args:
        i = args.index(name)
        return args[i + 1] if n == 1 else args[i + 1:i + 1 + n]
    return default

RES_PCT = int(arg('--res-pct', 100))
SAMPLES = int(arg('--samples', 128))
OPEN = float(arg('--open', 24))   # opening angle between the blades, degrees
STUDIO = '--studio' in args       # default: transparent cut-out for the site

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c) + (1.0,)

FOREST = srgb('#0B300F')

# ---------------------------------------------------------------- materials
def principled(name, **kw):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    for k, v in kw.items():
        b.inputs[k].default_value = v
    return m

steel = principled('Steel mirror', **{
    'Base Color': (0.86, 0.87, 0.89, 1), 'Metallic': 1.0, 'Roughness': 0.06,
})
steel_edge = principled('Steel ground edge', **{
    'Base Color': (0.80, 0.81, 0.83, 1), 'Metallic': 1.0, 'Roughness': 0.22, 'Anisotropic': 0.6,
})
brass = principled('Brass brushed', **{
    'Base Color': (0.82, 0.54, 0.17, 1), 'Metallic': 1.0, 'Roughness': 0.28, 'Anisotropic': 0.5,
})
brass_pol = principled('Brass polished', **{
    'Base Color': (0.93, 0.76, 0.42, 1), 'Metallic': 1.0, 'Roughness': 0.07,
})
enamel = principled('Forest enamel', **{
    'Base Color': srgb('#0C3812'), 'Roughness': 0.38, 'Coat Weight': 0.35, 'Coat Roughness': 0.18,
})
brass_face = principled('Brass face', **{
    'Base Color': (0.95, 0.72, 0.30, 1), 'Metallic': 1.0, 'Roughness': 0.22, 'Anisotropic': 0.3,
})
plinth_mat = principled('Plinth enamel', **{
    'Base Color': FOREST, 'Roughness': 0.42, 'Coat Weight': 0.6, 'Coat Roughness': 0.12,
})
backdrop_mat = principled('Backdrop', **{
    'Base Color': tuple(c * 0.22 for c in FOREST[:3]) + (1.0,), 'Roughness': 0.95,
})

# ---------------------------------------------------------------- helpers
def link(obj):
    if obj.name not in scene.collection.objects:
        scene.collection.objects.link(obj)
    return obj

def apply_mods(obj):
    bpy.context.view_layer.objects.active = obj
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)

def smooth(obj, angle=0.55):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_auto_smooth(angle=angle)
    obj.select_set(False)

def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)

def flat_piece(name, loops, half_thick, bevel, mat, y=0.0, parent=None, res=4):
    """A flat part: closed 2D outlines (x, z) extruded along Y, edges rounded.
    The first loop is the outline, later loops are holes."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '2D'; cu.fill_mode = 'BOTH'
    cu.extrude = half_thick
    cu.bevel_depth = bevel; cu.bevel_resolution = res
    for pts in loops:
        sp = cu.splines.new('POLY')
        sp.points.add(len(pts) - 1)
        for p, (x, z) in zip(sp.points, pts):
            p.co = (x, z, 0, 1)
        sp.use_cyclic_u = True
    o = bpy.data.objects.new(name, cu); link(o)
    o.rotation_euler = (math.pi / 2, 0, 0)   # curve XY -> world XZ, extrude -> world Y
    o.location = (0, y, 0)
    o.data.materials.append(mat)
    if parent: o.parent = parent
    return o

def ellipse(cx, cz, rx, rz, n=96, reverse=False):
    pts = [(cx + rx * math.cos(2 * math.pi * i / n), cz + rz * math.sin(2 * math.pi * i / n)) for i in range(n)]
    return pts[::-1] if reverse else pts

def quad_bezier(p0, p1, p2, n):
    out = []
    for i in range(n + 1):
        t = i / n
        a, b, c = (1 - t) ** 2, 2 * (1 - t) * t, t * t
        out.append((a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]))
    return out

def ribbon(center, w0, w1):
    """Outline of a tapered band along a polyline."""
    left, right = [], []
    n = len(center)
    for i, (x, z) in enumerate(center):
        a = center[max(i - 1, 0)]; b = center[min(i + 1, n - 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(tx, tz) or 1
        nx, nz = -tz / L, tx / L
        w = (w0 + (w1 - w0) * i / (n - 1)) / 2
        left.append((x + nx * w, z + nz * w)); right.append((x - nx * w, z - nz * w))
    return left + right[::-1]

# ---------------------------------------------------------------- the shears
# Local 2D frame of one half (blade "A", the front one), pivot at the origin:
# the blade rises along +z with its cutting edge on x = 0, the body to +x;
# the shank crosses under the pivot to a finger ring on the -x side.
BLADE_LEN = 5.7
HUB_R = 0.64

def blade_outline():
    pts = []
    z0 = -0.55
    n = 70
    # cutting edge, bottom to tip (very slightly convex, like hair shears)
    for i in range(n + 1):
        t = i / n
        z = z0 + (BLADE_LEN - z0) * t
        pts.append((-0.025 * math.sin(math.pi * t), z))
    # back of the blade, tip to bottom
    for i in range(1, n + 1):
        t = 1 - i / n
        z = z0 + (BLADE_LEN - z0) * t
        w = 0.78 * (1 - t) ** 0.7 + 0.02 * math.sin(math.pi * t)
        pts.append((w, z))
    return pts

def edge_bevel_outline():
    """The ground cutting bevel: a thin strip along the cutting edge, slightly proud."""
    pts = []
    n = 60
    z0, z1 = 0.4, BLADE_LEN - 0.25
    for i in range(n + 1):
        t = i / n; z = z0 + (z1 - z0) * t
        pts.append((-0.02 * math.sin(math.pi * t), z))
    for i in range(n, -1, -1):
        t = i / n; z = z0 + (z1 - z0) * t
        pts.append((0.15 * (1 - t) ** 0.8 + 0.01, z))
    return pts

RING_C = (-1.2, -3.35)

def build_half(name, mirror, y, root):
    """mirror = +1 for blade A, -1 for blade B (mirrored across x)."""
    pivot = bpy.data.objects.new(name, None); link(pivot)
    pivot.parent = root
    m = lambda pts: [(mirror * x, z) for x, z in pts][:: mirror]
    thick = 0.045
    flat_piece(f'{name} blade', [m(blade_outline())], thick, 0.022, steel, y, pivot)
    side = -1 if y < 0 else 1   # the bevel faces the camera on the front blade
    flat_piece(f'{name} bevel', [m(edge_bevel_outline())], 0.012, 0.01, steel_edge,
               y + side * (thick + 0.02), pivot)
    flat_piece(f'{name} hub', [m(ellipse(0.0, 0.0, HUB_R, HUB_R))], 0.06, 0.03, steel, y, pivot)
    shank = ribbon(quad_bezier((0.18, -0.2), (-0.05, -1.7), (RING_C[0] + 0.25, RING_C[1] + 0.8), 40), 0.46, 0.3)
    flat_piece(f'{name} shank', [m(shank)], 0.07, 0.06, brass, y, pivot, res=6)
    ring = [m(ellipse(*RING_C, 0.98, 0.86)), m(ellipse(*RING_C, 0.7, 0.6, reverse=True))]
    flat_piece(f'{name} ring', ring, 0.075, 0.07, brass, y, pivot, res=6)
    if mirror < 0:
        # finger rest (tang) under blade B's ring, ending in a small polished bead
        a = math.radians(-128)
        p0 = (RING_C[0] + 0.9 * math.cos(a), RING_C[1] + 0.8 * math.sin(a))
        tang = ribbon(quad_bezier(p0, (p0[0] - 0.2, p0[1] - 0.55), (p0[0] - 0.62, p0[1] - 0.78), 30), 0.24, 0.1)
        flat_piece(f'{name} tang', [m(tang)], 0.05, 0.045, brass, y, pivot, res=6)
        bx, bz = -(p0[0] - 0.66), p0[1] - 0.79
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.12, segments=48, ring_count=24, location=(bx, y, bz))
        bead = bpy.context.active_object; bead.name = f'{name} bead'
        assign(bead, brass_pol); smooth(bead, 1.2); bead.parent = pivot
    return pivot

PZ = 6.3   # pivot height above the plinth
SCALE = 1.2
root = bpy.data.objects.new('Shears', None); link(root)
root.location = (0, 0, PZ)
root.scale = (SCALE, SCALE, SCALE)
half_a = build_half('A', +1, -0.085, root)
half_b = build_half('B', -1, +0.085, root)
half_a.rotation_euler = (0, math.radians(OPEN / 2), 0)
half_b.rotation_euler = (0, math.radians(-OPEN / 2), 0)

# pivot screw: brass, carved with the seal on both faces
PR = 0.6
bpy.ops.mesh.primitive_cylinder_add(radius=PR, depth=0.5, vertices=128, location=(0.0, 0, 0),
                                    rotation=(math.pi / 2, 0, 0))
screw = bpy.context.active_object; screw.name = 'Pivot'
bv = screw.modifiers.new('bevel', 'BEVEL'); bv.width = 0.06; bv.segments = 6; bv.limit_method = 'ANGLE'
apply_mods(screw); assign(screw, brass); smooth(screw, 0.7); screw.parent = root

import re as _re
# The exact Adli seal, traced from the logo (public/brand/adli-seal.svg). seal_paths.txt holds the
# forest regions (outer ring + inner disc with the ع cut out) as vtracer paths in 3x crop pixels.
SEAL_CX, SEAL_CY, SEAL_R = 799.5, 638.0, 576.5        # in original 1600px logo pixels
K = (PR * 0.93) / SEAL_R

def seal_splines():
    out = []
    for line in open(os.path.join(HERE, 'seal_paths.txt')):
        tx, ty, d = line.rstrip('\n').split(' ', 2)
        tx, ty = float(tx), float(ty)
        toks = _re.findall(r'[MCLZ]|-?\d+(?:\.\d+)?', d)
        i = 0; cur = None; sp = None; cmd = None
        def P(x, y):
            ox = 213 + (tx + x) / 3.0; oy = 52 + (ty + y) / 3.0
            return ((ox - SEAL_CX) * K, -(oy - SEAL_CY) * K)
        while i < len(toks):
            t = toks[i]
            if t in 'MCLZ':
                cmd = t; i += 1
                if t == 'Z':
                    if sp and len(sp) > 1 and abs(sp[-1][0][0] - sp[0][0][0]) < 1e-6 and abs(sp[-1][0][1] - sp[0][0][1]) < 1e-6:
                        sp[0][1] = sp[-1][1]; sp.pop()
                    if sp: out.append(sp)
                    sp = None
                continue
            if cmd == 'M':
                p = P(float(toks[i]), float(toks[i+1])); i += 2
                sp = [[p, p, p]]       # [co, handle_left, handle_right]
                cmd = 'L'
            elif cmd == 'L':
                p = P(float(toks[i]), float(toks[i+1])); i += 2
                a = sp[-1][0]
                sp[-1][2] = (a[0] + (p[0]-a[0])/3, a[1] + (p[1]-a[1])/3)
                sp.append([p, (p[0] - (p[0]-a[0])/3, p[1] - (p[1]-a[1])/3), p])
            elif cmd == 'C':
                c1 = P(float(toks[i]), float(toks[i+1])); c2 = P(float(toks[i+2]), float(toks[i+3]))
                p = P(float(toks[i+4]), float(toks[i+5])); i += 6
                sp[-1][2] = c1
                sp.append([p, c2, p])
        if sp: out.append(sp)
    return out

SEAL = seal_splines()

def seal_relief(name, depth):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '2D'; cu.fill_mode = 'BOTH'
    cu.resolution_u = 12
    cu.extrude = depth
    cu.bevel_depth = 0.0025; cu.bevel_resolution = 2
    for pts in SEAL:
        sp = cu.splines.new('BEZIER')
        sp.bezier_points.add(len(pts) - 1)
        for bp, (co, hl, hr) in zip(sp.bezier_points, pts):
            bp.handle_left_type = bp.handle_right_type = 'FREE'
            bp.co = (*co, 0); bp.handle_left = (*hl, 0); bp.handle_right = (*hr, 0)
        sp.use_cyclic_u = True
    return link(bpy.data.objects.new(name, cu))

# polished brass face = the cream of the logo; forest enamel inlay = the green of the logo
for side in (-1, 1):
    face_y = side * 0.25
    rz = 0 if side == -1 else math.pi
    bpy.ops.mesh.primitive_cylinder_add(radius=PR * 0.95, depth=0.01, vertices=128,
                                        location=(0, face_y + side * 0.004, 0), rotation=(math.pi / 2, 0, 0))
    plate = bpy.context.active_object; plate.name = f'Seal plate {side}'
    assign(plate, brass_face); smooth(plate, 0.7); plate.parent = root
    o = seal_relief(f'Seal {side}', 0.006)
    o.location = (0, face_y + side * 0.012, 0)
    o.rotation_euler = (math.pi / 2, 0, rz)
    o.data.materials.append(enamel)
    o.parent = root

# ---------------------------------------------------------------- set (same as the bottle)
bpy.ops.mesh.primitive_cylinder_add(radius=5.4, depth=0.5, vertices=256, location=(0, 0, -0.25))
plinth = bpy.context.active_object; plinth.name = 'Plinth'
bv = plinth.modifiers.new('bevel', 'BEVEL'); bv.width = 0.06; bv.segments = 5
apply_mods(plinth); assign(plinth, plinth_mat); smooth(plinth, 0.7)

for name, R, minor, z in (('Inlay', 4.8, 0.035, 0.0), ('Edge', 5.42, 0.07, -0.02)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=minor, major_segments=256,
                                     minor_segments=16, location=(0, 0, z))
    t = bpy.context.active_object; t.name = name
    assign(t, brass_pol if name == 'Inlay' else brass); smooth(t, 1.2)

bpy.ops.mesh.primitive_plane_add(size=1)
bd = bpy.context.active_object; bd.name = 'Backdrop'
bm = bmesh.new()
pts = [(-60.0, 0.0)] + [(14 * math.sin(i / 24 * math.pi / 2), 14 - 14 * math.cos(i / 24 * math.pi / 2)) for i in range(25)] + [(14, 60)]
verts = []
for x in (-60, 60):
    for (yy, zz) in pts:
        verts.append(bm.verts.new((x, yy + 10, zz - 0.5)))
n = len(pts)
for i in range(n - 1):
    bm.faces.new((verts[i], verts[i + 1], verts[n + i + 1], verts[n + i]))
bm.to_mesh(bd.data); bm.free()
assign(bd, backdrop_mat); smooth(bd, 1.0)

# warm glow card behind: the polished steel mirrors it, so the blades glow amber
bpy.ops.mesh.primitive_circle_add(vertices=128, radius=9.0, fill_type='NGON', location=(0, 9.0, 6.4),
                                  rotation=(math.pi / 2, 0, 0))
card = bpy.context.active_object; card.name = 'Glow card'
cm = bpy.data.materials.new('Glow'); cm.use_nodes = True
n_ = cm.node_tree.nodes; l_ = cm.node_tree.links
for x in list(n_):
    if x.type != 'OUTPUT_MATERIAL': n_.remove(x)
tc = n_.new('ShaderNodeTexCoord'); grad = n_.new('ShaderNodeTexGradient'); grad.gradient_type = 'SPHERICAL'
mp = n_.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.111, 0.111, 0.111)
fall = n_.new('ShaderNodeMath'); fall.operation = 'POWER'; fall.inputs[1].default_value = 2.2
col = n_.new('ShaderNodeValToRGB')
col.color_ramp.elements[0].color = (0.45, 0.18, 0.04, 1)
col.color_ramp.elements[1].color = (1.0, 0.70, 0.36, 1)
em = n_.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 2.0
tr = n_.new('ShaderNodeBsdfTransparent')
mix = n_.new('ShaderNodeMixShader')
l_.new(tc.outputs['Object'], mp.inputs['Vector']); l_.new(mp.outputs[0], grad.inputs['Vector'])
l_.new(grad.outputs['Fac'], fall.inputs[0])
l_.new(fall.outputs[0], col.inputs['Fac']); l_.new(col.outputs['Color'], em.inputs['Color'])
l_.new(fall.outputs[0], mix.inputs['Fac'])
l_.new(tr.outputs[0], mix.inputs[1]); l_.new(em.outputs[0], mix.inputs[2])
l_.new(mix.outputs[0], n_['Material Output'].inputs['Surface'])
assign(card, cm)
card.visible_shadow = False

if not STUDIO:
    for ob in (plinth, bd, card):
        ob.visible_camera = False
    for ob in bpy.data.objects:
        if ob.name in ('Inlay', 'Edge'):
            ob.visible_camera = False
    scene.render.film_transparent = True

# ---------------------------------------------------------------- lights
def area(name, size, size_y, power, loc, look=(0, 0, 6), color=(1, 0.93, 0.84), spread=None):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.shape = 'RECTANGLE'; ld.size = size; ld.size_y = size_y
    ld.energy = power; ld.color = color
    if spread: ld.spread = spread
    o = bpy.data.objects.new(name, ld); link(o)
    o.visible_camera = False
    o.location = loc
    d = Vector(look) - Vector(loc)
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return o

area('Key softbox', 5, 9, 2400, (-11, -9, 9), color=(1, 0.95, 0.88))
area('Strip left', 0.9, 13, 2000, (-9, 3, 8.2), color=(1, 0.97, 0.92), spread=math.radians(22))
area('Strip right', 0.9, 13, 2000, (9, 3, 8.2), color=(1, 0.95, 0.86), spread=math.radians(22))
area('Front strip', 10, 0.8, 900, (0, -14, 13), look=(0, 0, 6), color=(1, 0.97, 0.92))
area('Top', 6, 4, 900, (0, -2, 18), look=(0, 0, 8))
area('Brass rim', 3, 3, 700, (6, 8, 14), look=(0, 0, 9), color=(1, 0.8, 0.5))

w = bpy.data.worlds.new('World'); scene.world = w
w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = FOREST
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.25

# ---------------------------------------------------------------- camera
cam_d = bpy.data.cameras.new('Camera'); cam_d.lens = 70; cam_d.sensor_fit = 'AUTO'
cam_d.dof.use_dof = True; cam_d.dof.aperture_fstop = 8.0
cam = bpy.data.objects.new('Camera', cam_d); link(cam)
cam.location = (0, -36, 7.6)
target = Vector((0, 0, 6.5))
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam_d.dof.focus_distance = (target - cam.location).length
scene.camera = cam

# ---------------------------------------------------------------- render
scene.render.engine = 'CYCLES'
cy = scene.cycles
cy.device = 'CPU'
cy.samples = SAMPLES
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.02
cy.use_denoising = True
cy.denoiser = 'OPENIMAGEDENOISE'
cy.max_bounces = 10; cy.glossy_bounces = 8; cy.transmission_bounces = 2
cy.diffuse_bounces = 3; cy.transparent_max_bounces = 8
cy.caustics_reflective = False; cy.caustics_refractive = False
cy.blur_glossy = 0.6
cy.sample_clamp_indirect = 8
scene.render.resolution_x = 1080
scene.render.resolution_y = 1350
scene.render.resolution_percentage = RES_PCT
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'AgX'
try:
    scene.view_settings.look = 'AgX - Medium High Contrast'
except TypeError:
    pass

if arg('--save'):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(arg('--save')))

bd_ = arg('--border', n=4)
if bd_:
    scene.render.use_border = True; scene.render.use_crop_to_border = True
    scene.render.border_min_x, scene.render.border_max_x, scene.render.border_min_y, scene.render.border_max_y = map(float, bd_)

still = arg('--still')
if still:
    t = time.time()
    root.rotation_euler = (0, 0, math.radians(float(arg('--angle', -18))))
    scene.render.filepath = os.path.abspath(still)
    bpy.ops.render.render(write_still=True)
    print(f'RENDERED {still} in {time.time() - t:.1f}s')

tt = arg('--turntable', n=3)
if tt:
    outdir, frames, start = tt[0], int(tt[1]), int(tt[2])
    os.makedirs(outdir, exist_ok=True)
    end = int(arg('--end', frames))
    for i in range(start, end):
        out = os.path.join(os.path.abspath(outdir), f'f{i:03d}.png')
        if os.path.exists(out):
            continue
        root.rotation_euler = (0, 0, math.radians(-18 + 360 * i / frames))   # the shears are not symmetric: full turn
        scene.render.filepath = out
        t = time.time()
        bpy.ops.render.render(write_still=True)
        print(f'FRAME {i} {time.time() - t:.1f}s', flush=True)
