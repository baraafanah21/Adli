"use client";

/*
  The one WebGL canvas on the site: the Adli bottle on the seal plinth.
  Ported from docs/prototypes/hero-bottle-prototype.html. Loaded only through HeroStage
  (dynamic import, ssr: false, after first paint). Brass cap, horizontal drag only, no zoom.
*/

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { BRAND, SCENE } from "@/lib/brand";

type Props = {
  className?: string;
  /** Called once, after the first frame is on screen. */
  onReady: () => void;
  /** WebGL failed or the context was lost: the caller keeps the poster. */
  onError: () => void;
};

const MAX_DPR = 1.75;


/** The logo file, the only source of the seal (public/brand/README.md): never redrawn. */
const SEAL_SVG = "/brand/adli-seal.svg";

type Seal = { ain: THREE.Vector2[]; outer: number; ringOuter: number; ringInner: number };

/**
 * Reads the seal from adli-seal.svg. Its forest fill is two paths, each of two contours: the outer ring (its outside
 * and inside edges), and the disc (its edge, and the ع cut out of it in cream). The thin cream ring is the gap
 * between the outer ring's inside edge and the disc's edge. Returned in logo px around the seal's centre, y up.
 */
function readSeal(svgText: string): Seal {
  const forest = new SVGLoader()
    .parse(svgText)
    .paths.filter((p) => String((p.userData?.style as { fill?: string } | undefined)?.fill).toLowerCase() === BRAND.forest.toLowerCase())
    .map((p) => {
      // Each contour as points, largest first. 3 points per curve: the ع is ~800 points, ~9k triangles extruded.
      const contours = p.subPaths.map((sp) => {
        const pts = sp.getPoints(3);
        const box = new THREE.Box2().setFromPoints(pts);
        return { pts, box, half: box.getSize(new THREE.Vector2()).x / 2 };
      });
      return contours.sort((x, y) => y.half - x.half);
    })
    .sort((x, y) => y[0].half - x[0].half);
  const [ring, disc] = forest;
  if (forest.length !== 2 || ring.length !== 2 || disc.length !== 2) throw new Error("adli-seal.svg: unexpected structure");

  const centre = disc[0].box.getCenter(new THREE.Vector2());
  return {
    ain: disc[1].pts.map((v) => new THREE.Vector2(v.x - centre.x, centre.y - v.y)),
    outer: ring[0].half,
    ringOuter: ring[1].half,
    ringInner: disc[0].half,
  };
}

export default function HeroBottle({ className, onReady, onError }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onReady, onError });
  useEffect(() => {
    callbacks.current = { onReady, onError };
  }, [onReady, onError]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      callbacks.current.onError();
      return;
    }

    const small = Math.min(window.innerWidth, window.innerHeight) < 720;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = renderer.domElement;
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);

    const forest = new THREE.Color(BRAND.forest);
    const scene = new THREE.Scene();
    scene.background = forest.clone();
    scene.fog = new THREE.Fog(forest, 22, 46);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environment = envTexture;
    scene.environmentIntensity = 0.9;

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 6.5, 30);

    // ---------- Controls: horizontal drag only ----------
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 4.9, 0);
    controls.update();
    const polar = controls.getPolarAngle();
    controls.minPolarAngle = polar;
    controls.maxPolarAngle = polar;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;
    // OrbitControls sets touch-action: none; give vertical swipes back to the page.
    canvas.style.touchAction = "pan-y";

    // ---------- Materials ----------
    const brass = new THREE.MeshPhysicalMaterial({ color: BRAND.brass, metalness: 1, roughness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.2 });
    const brassPolished = new THREE.MeshPhysicalMaterial({ color: BRAND.brassBright, metalness: 1, roughness: 0.12 });
    // Glass shell: a reflective transparent skin. The juice inside does the refraction,
    // because WebGL transmission can't see one transmissive object through another.
    const glass = new THREE.MeshPhysicalMaterial({
      color: SCENE.glass, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.1,
      clearcoat: 1, clearcoatRoughness: 0.01, specularIntensity: 1, envMapIntensity: 3.2,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const juice = new THREE.MeshPhysicalMaterial({
      color: SCENE.juice, metalness: 0, roughness: 0.04, transmission: 1, thickness: 2.2, ior: 1.36,
      attenuationColor: new THREE.Color(SCENE.juiceAttenuation), attenuationDistance: 3.2,
      clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.4,
    });
    const tube = new THREE.MeshPhysicalMaterial({ color: SCENE.dipTube, roughness: 0.4, opacity: 0.85, transparent: true });

    // ---------- Bottle ----------
    const bottle = new THREE.Group();
    scene.add(bottle);

    const W = 5.4, H = 6.8, D = 2.8, BASE = 0.55;
    const body = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 8, 0.45), glass);
    body.position.y = H / 2;
    body.renderOrder = 2;
    bottle.add(body);

    const juiceH = 4.7;
    const liquid = new THREE.Mesh(new RoundedBoxGeometry(W - 0.75, juiceH, D - 0.75, 6, 0.28), juice);
    liquid.position.y = BASE + juiceH / 2;
    liquid.castShadow = true;
    bottle.add(liquid);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.86, 0.42, 64), brass);
    collar.position.y = H + 0.21;
    collar.castShadow = true;
    bottle.add(collar);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, H - BASE - 0.2, 12), tube);
    stem.position.y = BASE + (H - BASE - 0.2) / 2 + 0.1;
    bottle.add(stem);

    // ---------- Cap: the seal, carved, in brass ----------
    const RC = 1.85;
    const CAP_DEPTH = 0.9;

    const capGroup = new THREE.Group();
    capGroup.position.y = H + 0.42 + RC + 0.02;
    bottle.add(capGroup);

    const discShape = new THREE.Shape();
    discShape.absarc(0, 0, RC, 0, Math.PI * 2, false);
    const capBodyGeo = new THREE.ExtrudeGeometry(discShape, {
      depth: CAP_DEPTH, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.14, bevelSegments: 8, curveSegments: 96,
    });
    capBodyGeo.translate(0, 0, -CAP_DEPTH / 2);
    const capBody = new THREE.Mesh(capBodyGeo, brass);
    capBody.castShadow = true;
    capGroup.add(capBody);

    // The logo's cream parts (the ع and the thin ring) stand out in polished brass on both faces, read from the file.
    function carveSeal(seal: Seal) {
      const S = (RC * 0.86) / seal.outer; // logo px → world units

      const ringShape = new THREE.Shape();
      ringShape.absarc(0, 0, seal.ringOuter * S, 0, Math.PI * 2, false);
      const ringHole = new THREE.Path();
      ringHole.absarc(0, 0, seal.ringInner * S, 0, Math.PI * 2, true);
      ringShape.holes.push(ringHole);
      const ainShape = new THREE.Shape(seal.ain.map((v) => v.clone().multiplyScalar(S)));

      const reliefOpts = { depth: 0.07, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.012, bevelSegments: 2 };
      const ringGeo = new THREE.ExtrudeGeometry(ringShape, { ...reliefOpts, curveSegments: 128 });
      const ainGeo = new THREE.ExtrudeGeometry(ainShape, reliefOpts);

      const faceZ = CAP_DEPTH / 2 + 0.16 - 0.01;
      for (const side of [1, -1]) {
        const face = new THREE.Group();
        face.rotation.y = side === 1 ? 0 : Math.PI;
        const ring = new THREE.Mesh(ringGeo, brassPolished);
        const ain = new THREE.Mesh(ainGeo, brassPolished);
        ring.position.z = faceZ;
        ain.position.z = faceZ;
        ring.castShadow = ain.castShadow = true;
        face.add(ring, ain);
        capGroup.add(face);
      }
    }

    // ---------- Plinth: the seal turntable ----------
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(5.2, 5.4, 0.5, 128),
      new THREE.MeshPhysicalMaterial({ color: BRAND.forest, roughness: 0.6, clearcoat: 0.25, clearcoatRoughness: 0.35, envMapIntensity: 0.15 }),
    );
    plinth.position.y = -0.25;
    plinth.receiveShadow = true;
    scene.add(plinth);

    const inlay = new THREE.Mesh(new THREE.TorusGeometry(4.75, 0.045, 12, 200), brassPolished);
    inlay.rotation.x = Math.PI / 2;
    inlay.position.y = 0.005;
    scene.add(inlay);

    const edge = new THREE.Mesh(new THREE.TorusGeometry(5.3, 0.06, 12, 200), brass);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = -0.02;
    scene.add(edge);

    // Soft contact shadow under the glass (the glass itself casts none).
    const cs = document.createElement("canvas");
    cs.width = cs.height = 256;
    const g = cs.getContext("2d")!;
    const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 1.5, D * 2.6),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cs), transparent: true, depthWrite: false }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.012;
    scene.add(contact);

    // ---------- Light ----------
    const key = new THREE.SpotLight(SCENE.keyLight, 900, 40, 0.5, 0.65, 2);
    key.position.set(7, 14, 9);
    key.target.position.set(0, 3, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    key.shadow.bias = -0.0004;
    key.shadow.radius = 6;
    scene.add(key, key.target);

    const rim = new THREE.DirectionalLight(BRAND.brassBright, 2.2);
    rim.position.set(-6, 8, -10);
    scene.add(rim);
    scene.add(new THREE.HemisphereLight(BRAND.cream, BRAND.forest, 0.35));

    // Backlight card: a warm glow that always sits behind the bottle; the juice refracts it.
    const hc = document.createElement("canvas");
    hc.width = hc.height = 512;
    const hg = hc.getContext("2d")!;
    const hgrad = hg.createRadialGradient(256, 256, 0, 256, 256, 256);
    // Opaque on purpose: the transmission pass only samples opaque objects.
    hgrad.addColorStop(0, SCENE.haloCore);
    hgrad.addColorStop(0.3, SCENE.haloMid);
    hgrad.addColorStop(0.62, SCENE.haloEdge);
    hgrad.addColorStop(0.98, BRAND.forest);
    hgrad.addColorStop(1, BRAND.forest);
    hg.fillStyle = BRAND.forest;
    hg.fillRect(0, 0, 512, 512);
    hg.fillStyle = hgrad;
    hg.fillRect(0, 0, 512, 512);
    const haloTex = new THREE.CanvasTexture(hc);
    haloTex.colorSpace = THREE.SRGBColorSpace;
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(7, 96),
      new THREE.MeshBasicMaterial({ map: haloTex, toneMapped: false, fog: false }),
    );
    scene.add(halo);
    const haloCentre = new THREE.Vector3(0, 4.2, 0);
    const toCam = new THREE.Vector3();


    // ---------- Size ----------
    function resize() {
      const w = host!.clientWidth;
      const h = host!.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = w / h < 0.75 ? 40 : 30; // keep the whole bottle in frame when narrow
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    // ---------- Loop: only while visible ----------
    let readySent = false;
    function frame() {
      controls.update();
      toCam.copy(camera.position).sub(haloCentre).setY(0).normalize();
      halo.position.copy(haloCentre).addScaledVector(toCam, -4.5);
      halo.lookAt(camera.position.x, halo.position.y, camera.position.z);
      renderer.render(scene, camera);
      if (!readySent) {
        readySent = true;
        // Next frame: the first image is on screen before the poster fades.
        requestAnimationFrame(() => callbacks.current.onReady());
      }
    }

    // The loop starts once the seal is carved, so the first frame (and the poster's fade) already has it.
    let carved = false;
    let disposed = false;
    let inView = true;
    // Drawing stops entirely while the hero is off screen or in a hidden tab, and resumes when it shows again.
    const sync = () => renderer.setAnimationLoop(carved && inView && !document.hidden ? frame : null);
    const io = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    io.observe(host);
    document.addEventListener("visibilitychange", sync);

    fetch(SEAL_SVG)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${SEAL_SVG}: ${r.status}`))))
      .then((text) => {
        if (disposed) return;
        carveSeal(readSeal(text));
        carved = true;
        sync();
      })
      .catch(() => {
        if (!disposed) callbacks.current.onError();
      });

    const onLost = (e: Event) => {
      e.preventDefault();
      renderer.setAnimationLoop(null);
      callbacks.current.onError();
    };
    canvas.addEventListener("webglcontextlost", onLost);

    // ---------- Full cleanup ----------
    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", sync);
      canvas.removeEventListener("webglcontextlost", onLost);
      controls.dispose();

      const materials = new Set<THREE.Material>();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const m = mesh.material;
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => materials.add(x));
      });
      materials.forEach((m) => {
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
        m.dispose();
      });
      envTexture.dispose();
      pmrem.dispose();
      key.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  return <div ref={hostRef} className={className} />;
}
