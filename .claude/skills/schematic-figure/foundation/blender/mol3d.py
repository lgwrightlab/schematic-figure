"""3D coordinates for a SMILES string, for device3d.molecule_3d (runs inside Blender or any Python 3 with numpy).

    python mol3d.py "O=C1OCCO1" [--seed 0] [--out ec.json] [--builtin]
    from mol3d import embed; m = embed('O=C1OCCO1', seed=0)   # {'atoms': [...], 'xyz': [[x,y,z]...], 'bonds': [[i,j,order]...], 'method': ...}

Order of attempts: rdkit in this interpreter; rdkit in an external Python (`python=` argument, env MOL3D_PYTHON,
the Anaconda base, `python` on PATH) run as a subprocess (ETKDG + MMFF); else the built-in embedder below.
The built-in embedder parses SMILES (organic subset, brackets, charges, rings, branches, aromatic lower case),
adds implicit hydrogens, and relaxes bond lengths, bond angles (sp/sp2/sp3 from bond orders), double-bond
planarity and non-bonded clashes by gradient descent that starts in 4D and squeezes to 3D. It gives correct
connectivity, bond lengths within ~0.05 A, planar rings and sensible angles; it ignores stereo marks (@, /, \\)
and conformer energetics, so large flexible molecules get a plausible but not a minimum-energy conformer.
Aromatic bonds come back with order 1.5.
"""
import json, math, os, re, subprocess, sys

COV = {'H': .31, 'B': .84, 'C': .76, 'N': .71, 'O': .66, 'F': .57, 'Si': 1.11, 'P': 1.07, 'S': 1.05, 'Cl': 1.02,
       'Br': 1.20, 'I': 1.39, 'Se': 1.20, 'Li': 1.28, 'Na': 1.66, 'K': 2.03, 'Mg': 1.41, 'Al': 1.21, 'Zn': 1.22,
       'Fe': 1.32, 'Co': 1.26, 'Ni': 1.24, 'Cu': 1.32, 'Pt': 1.36, 'Au': 1.36, 'Ag': 1.45, 'Ti': 1.60}
VDW = {'H': 1.10, 'C': 1.70, 'N': 1.55, 'O': 1.52, 'F': 1.47, 'S': 1.80, 'P': 1.80, 'Cl': 1.75, 'Br': 1.85, 'I': 1.98}
VAL = {'B': (3,), 'C': (4,), 'N': (3, 5), 'O': (2,), 'P': (3, 5), 'S': (2, 4, 6), 'F': (1,), 'Cl': (1,), 'Br': (1,), 'I': (1,)}
ORDER_SHORTEN = {1: 0.0, 1.5: 0.12, 2: 0.18, 3: 0.32}
_BR = re.compile(r'^(\d+)?([A-Z][a-z]?|[a-z][a-z]?|\*)(@*)(H\d*)?([+-]+\d*)?(:\d+)?$')


def parse_smiles(smi):
    atoms, bonds = [], []
    i, prev, stack, ring, pend = 0, None, [], {}, None

    def bond(a, b, o):
        if o is None: o = 1.5 if atoms[a]['arom'] and atoms[b]['arom'] else 1
        bonds.append([a, b, o])

    while i < len(smi):
        ch = smi[i]
        if ch == '(': stack.append(prev); i += 1; continue
        if ch == ')': prev = stack.pop(); i += 1; continue
        if ch in '-=#:$/\\': pend = {'-': 1, '=': 2, '#': 3, ':': 1.5, '$': 3, '/': 1, '\\': 1}[ch]; i += 1; continue
        if ch == '.': prev = None; i += 1; continue
        if ch.isdigit() or ch == '%':
            if ch == '%': num = int(smi[i + 1:i + 3]); i += 3
            else: num = int(ch); i += 1
            if num in ring:
                j, bo = ring.pop(num); bond(prev, j, pend if pend is not None else bo)
            else: ring[num] = (prev, pend)
            pend = None; continue
        if ch == '[':
            k = smi.index(']', i); m = _BR.match(smi[i + 1:k])
            if not m: raise ValueError('bad bracket atom ' + smi[i:k + 1])
            sym = m.group(2); arom = sym.islower(); sym = sym.capitalize()
            h = m.group(4); hc = 0 if not h else (int(h[1:]) if len(h) > 1 else 1)
            c = m.group(5) or ''; chg = 0
            if c: chg = (1 if c[0] == '+' else -1) * (int(c.lstrip('+-')) if c.lstrip('+-') else len(c))
            atoms.append(dict(sym=sym, arom=arom, h=hc, charge=chg)); i = k + 1
        else:
            sym = smi[i:i + 2] if smi[i:i + 2] in ('Cl', 'Br') else ch
            i += len(sym)
            if sym not in VAL and sym.lower() not in ('b', 'c', 'n', 'o', 'p', 's'): raise ValueError('unknown atom ' + sym)
            atoms.append(dict(sym=sym.capitalize(), arom=sym.islower(), h=None, charge=0))
        idx = len(atoms) - 1
        if prev is not None: bond(prev, idx, pend)
        pend = None; prev = idx
    if ring: raise ValueError('unclosed ring in ' + smi)
    # implicit hydrogens
    nat = len(atoms)
    for a in range(nat):
        at = atoms[a]
        if at['h'] is None:
            orders = [o for x, y, o in bonds if a in (x, y)]
            if at['arom']:   # aromatic: lowest valence only, the ring pi bond counts one
                s = sum(1 if o == 1.5 else o for o in orders) + 1
                val = VAL.get(at['sym'], (0,))[0]
            else:
                s = sum(orders)
                val = next((v for v in VAL.get(at['sym'], (0,)) if v >= s), s)
            at['h'] = max(0, int(round(val - s)))
        for _ in range(at['h']):
            atoms.append(dict(sym='H', arom=False, h=0, charge=0)); bonds.append([a, len(atoms) - 1, 1])
    return atoms, bonds


def _builtin(smi, seed=0, iters=2500):
    import numpy as np
    atoms, bonds = parse_smiles(smi)
    n = len(atoms); sym = [a['sym'] for a in atoms]
    nb = [[] for _ in range(n)]; bo = {}
    for a, b, o in bonds: nb[a].append(b); nb[b].append(a); bo[(a, b)] = bo[(b, a)] = o
    L = lambda a, b: COV.get(sym[a], 1.0) + COV.get(sym[b], 1.0) - ORDER_SHORTEN.get(bo[(a, b)], 0)
    hyb = []
    for a in range(n):
        os_ = [bo[(a, b)] for b in nb[a]]
        hyb.append(180.0 if (3 in os_ or os_.count(2) >= 2) and len(nb[a]) <= 2 else 120.0 if (2 in os_ or 1.5 in os_) else 109.47)
    def ring_size(a, c, b):   # smallest ring through the path a-c-b (0 if none up to 8 atoms)
        seen, fr, d = {a}, [a], 0
        while fr and d < 7:
            d += 1; nx = []
            for u in fr:
                for v in nb[u]:
                    if v == c or v in seen: continue
                    if v == b: return d + 2
                    seen.add(v); nx.append(v)
            fr = nx
        return 0

    def _in_ring(b, c):   # is bond b-c in a ring of up to 8 atoms
        return any(ring_size(b, c, x) for x in nb[c] if x != b) or any(ring_size(c, b, x) for x in nb[b] if x != c)

    cons = []   # (i, j, target, weight)
    for a, b, o in bonds: cons.append((a, b, L(a, b), 1.0))
    for c in range(n):
        if len(nb[c]) >= 5:   # octahedral / bipyramidal: neighbours repel each other instead of fixed angles
            continue
        pairs = [(nb[c][x], nb[c][y]) for x in range(len(nb[c])) for y in range(x + 1, len(nb[c]))]
        tgt = {}
        for a, b in pairs:
            k = ring_size(a, c, b)
            if k and k <= 6:
                tgt[(a, b)] = 180.0 * (k - 2) / k if hyb[c] == 120.0 else {3: 60.0, 4: 88.0, 5: 104.5, 6: 111.0}[k]
        rest = [p for p in pairs if p not in tgt]; ring_sum = sum(tgt.values())
        for p in rest:
            if hyb[c] == 120.0 and len(nb[c]) == 3: tgt[p] = (360.0 - ring_sum) / len(rest)
            elif hyb[c] == 109.47 and any(v < 95 for v in tgt.values()): tgt[p] = 116.0
            else: tgt[p] = hyb[c]
        for (a, b), th in tgt.items():
            th = math.radians(th); la, lb = L(a, c), L(b, c)
            cons.append((a, b, math.sqrt(la * la + lb * lb - 2 * la * lb * math.cos(th)), 0.5))
    # topological distance for non-bonded repulsion
    INF = 99; D = np.full((n, n), INF, int)
    for s in range(n):
        D[s, s] = 0; fr = [s]
        while fr:
            nx = []
            for u in fr:
                for v in nb[u]:
                    if D[s, v] == INF: D[s, v] = D[s, u] + 1; nx.append(v)
            fr = nx
    vd = np.array([VDW.get(s, 1.8) for s in sym])
    lb = 0.62 * (vd[:, None] + vd[None, :])
    heavy = np.array([s != 'H' for s in sym])
    rep = (D >= 3) & ~np.eye(n, dtype=bool)
    frag = (D == INF)   # separate fragments ('.'): keep them apart
    lb = np.where(frag, 2.2 + 0.5 * (vd[:, None] + vd[None, :]), lb)
    rep = rep | frag
    for c in range(n):   # 5- and 6-coordinate centres: neighbours at least 90 deg apart (bipyramid / octahedron)
        if len(nb[c]) >= 5:
            for a in nb[c]:
                for b in nb[c]:
                    if a != b: rep[a, b] = True; lb[a, b] = math.sqrt(2) * 0.5 * (L(a, c) + L(b, c)) * 0.995
    I = np.array([c[0] for c in cons]); J = np.array([c[1] for c in cons]); T = np.array([c[2] for c in cons]); W = np.array([c[3] for c in cons])
    rng = np.random.default_rng(seed)
    X = rng.normal(size=(n, 4)) * (1.0 + 0.4 * n ** (1 / 3))

    def step(X, I, J, T, W, lr, squeeze):
        # Jacobi position-based projection: each distance constraint moves its two atoms halfway to its target,
        # corrections averaged per atom (converges far faster than plain gradient descent on stiff bonds)
        G = np.zeros_like(X); cnt = np.zeros(n)
        d = X[I] - X[J]; r = np.linalg.norm(d, axis=1) + 1e-9
        f = (0.5 * W * (r - T) / r)[:, None] * d
        np.add.at(G, I, f); np.add.at(G, J, -f); np.add.at(cnt, I, W); np.add.at(cnt, J, W)
        dd = X[:, None, :] - X[None, :, :]; rr = np.linalg.norm(dd, axis=2) + 1e-9
        v = np.where(rep & (rr < lb), 0.5 * (rr - lb) / rr, 0.0) * 0.5
        G += (v[:, :, None] * dd).sum(1); cnt += (v != 0).sum(1) * 0.5
        G /= np.maximum(cnt, 1.0)[:, None]
        G[:, 3] += squeeze * X[:, 3] * 0.2
        return X - lr * G

    # planarity is a soft mode for distance constraints, so it gets first-order terms: each sp2 centre lies in its
    # neighbours' plane, and every a-b=c-d (double or aromatic b-c) quadruple is coplanar
    quad = [[nb[c][0], nb[c][1], nb[c][2], c] for c in range(n) if hyb[c] == 120.0 and len(nb[c]) == 3]
    for b, c, o in bonds:
        if o in (1.5, 2) or (hyb[b] == 120.0 and hyb[c] == 120.0 and o == 1 and D[b, c] == 1 and _in_ring(b, c)):
            for a in nb[b]:
                for d_ in nb[c]:
                    if a != c and d_ != b and a != d_: quad += [[a, b, c, d_], [d_, c, b, a]]
    quad = np.array(quad, int).reshape(-1, 4)

    def flatten(X, k=0.25):   # move the 4th atom of each quad into the plane of the first three
        if not len(quad): return X
        A, B, E, C = (X[quad[:, i], :3] for i in range(4))
        nrm = np.cross(B - A, E - A); nrm /= np.linalg.norm(nrm, axis=1)[:, None] + 1e-9
        h = ((C - A) * nrm).sum(1)[:, None] * nrm * k
        G = np.zeros((n, 3)); cnt = np.zeros(n); np.add.at(G, quad[:, 3], -h)
        for i in (0, 1, 2): np.add.at(G, quad[:, i], h / 3)
        for i in range(4): np.add.at(cnt, quad[:, i], 1)
        X = X.copy(); X[:, :3] += G / np.maximum(cnt, 1)[:, None] * 2; return X

    for k in range(iters):
        sq = 0.0 if k < iters * 0.3 else min(1.0, (k - iters * 0.3) / (iters * 0.3)) * 2.0
        X = step(X, I, J, T, W, 1.2, sq)
        if k > iters * 0.62: X = flatten(X)
        if k == int(iters * 0.6):
            X[:, 3] = 0.0
            # double-bond planarity: fix each a-b=c-d 1-4 distance to its nearer planar (cis or trans) value
            extra = []
            for b, c, o in bonds:
                if o != 2 or D[b, c] != 1: continue
                for a in nb[b]:
                    if a == c: continue
                    for d_ in nb[c]:
                        if d_ == b: continue
                        lab, lbc, lcd = L(a, b), L(b, c), L(c, d_)
                        A = np.array([-lab / 2, lab * math.sqrt(3) / 2]); Cc = np.array([lbc, 0.0])
                        cis = np.linalg.norm(Cc + lcd * np.array([0.5, math.sqrt(3) / 2]) - A)
                        tr = np.linalg.norm(Cc + lcd * np.array([0.5, -math.sqrt(3) / 2]) - A)
                        cur = np.linalg.norm(X[a, :3] - X[d_, :3])
                        extra.append((a, d_, cis if abs(cur - cis) < abs(cur - tr) else tr, 0.4))
            if extra:
                I = np.concatenate([I, [e[0] for e in extra]]); J = np.concatenate([J, [e[1] for e in extra]])
                T = np.concatenate([T, [e[2] for e in extra]]); W = np.concatenate([W, [e[3] for e in extra]])
    X = X[:, :3] - X[:, :3].mean(0)
    r = np.linalg.norm(X[I] - X[J], axis=1)
    return dict(atoms=sym, xyz=X.round(4).tolist(), bonds=bonds, charges=[a['charge'] for a in atoms], method='builtin',
                strain=float(np.abs(r - T).max()))


def _builtin_best(smi, seed=0, tries=4):
    """Several seeded embeddings; keep the least strained (largest bond/angle-distance error, in A)."""
    best = None
    for t in range(tries):
        m = _builtin(smi, seed * 101 + t)
        if best is None or m['strain'] < best['strain']: best = m
        if best['strain'] < 0.03: break
    return best


def _rdkit(smi, seed=0):
    from rdkit import Chem
    from rdkit.Chem import AllChem
    m = Chem.AddHs(Chem.MolFromSmiles(smi))
    p = AllChem.ETKDGv3(); p.randomSeed = seed
    if AllChem.EmbedMolecule(m, p) != 0: raise RuntimeError('rdkit embed failed')
    try: AllChem.MMFFOptimizeMolecule(m)
    except Exception: pass
    xyz = m.GetConformer().GetPositions()
    bonds = [[b.GetBeginAtomIdx(), b.GetEndAtomIdx(), 1.5 if b.GetIsAromatic() else int(b.GetBondTypeAsDouble())] for b in m.GetBonds()]
    return dict(atoms=[a.GetSymbol() for a in m.GetAtoms()], xyz=(xyz - xyz.mean(0)).round(4).tolist(), bonds=bonds,
                charges=[a.GetFormalCharge() for a in m.GetAtoms()], method='rdkit')


def embed(smi, seed=0, python=None, allow_builtin=True):
    try: return _rdkit(smi, seed)
    except ImportError: pass
    cands = [python, os.environ.get('MOL3D_PYTHON'),
             os.path.expanduser('~/AppData/Local/anaconda3/python.exe'), os.path.expanduser('~/anaconda3/bin/python'),
             os.path.expanduser('~/miniconda3/bin/python'), 'python3', 'python']
    for py in [c for c in cands if c]:
        if os.sep in py and not os.path.exists(py): continue
        try:
            r = subprocess.run([py, os.path.abspath(__file__), smi, '--seed', str(seed), '--rdkit-only'],
                               capture_output=True, text=True, timeout=60)
        except Exception: continue
        if r.returncode == 0 and r.stdout.strip().startswith('{'): return json.loads(r.stdout)
    if not allow_builtin: raise RuntimeError('no rdkit found')
    return _builtin_best(smi, seed)


if __name__ == '__main__':
    import argparse
    a = argparse.ArgumentParser(); a.add_argument('smiles'); a.add_argument('--seed', type=int, default=0)
    a.add_argument('--out'); a.add_argument('--builtin', action='store_true'); a.add_argument('--rdkit-only', action='store_true')
    g = a.parse_args()
    if g.rdkit_only:
        try: res = _rdkit(g.smiles, g.seed)
        except ImportError: sys.exit(3)
    else:
        res = _builtin_best(g.smiles, g.seed) if g.builtin else embed(g.smiles, g.seed)
    s = json.dumps(res)
    if g.out: open(g.out, 'w').write(s); print('wrote', g.out, len(res['atoms']), 'atoms via', res['method'])
    else: print(s)
