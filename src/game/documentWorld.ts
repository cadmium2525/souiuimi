import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Choice, Collider, DocumentCasePlan } from './types';

const C = {
  cream: 0xf1eadb, paper: 0xfff9eb, edge: 0x394a48, wood: 0xad7854,
  sage: 0x78958a, teal: 0x326c65, dark: 0x233d3c, orange: 0xef8e4b,
  gold: 0xe2b65e, skin: 0xf5c4a1, metal: 0x526b67, blue: 0xa6c6c8, blush: 0xe7c8ae,
};
const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const smooth = (t: number) => { const v = THREE.MathUtils.clamp(t, 0, 1); return v * v * (3 - 2 * v); };
type Arm = { shoulder: THREE.Group; elbow: THREE.Group; hand: THREE.Group };

/** The document workshop is a view of the chosen action. The case solver owns its meaning. */
export class DocumentWorld {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  readonly colliders: Collider[] = [];
  private room = new THREE.Group();
  private hero = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private leftLeg = new THREE.Group();
  private rightLeg = new THREE.Group();
  private leftShin = new THREE.Group();
  private rightShin = new THREE.Group();
  private left: Arm = { shoulder: new THREE.Group(), elbow: new THREE.Group(), hand: new THREE.Group() };
  private right: Arm = { shoulder: new THREE.Group(), elbow: new THREE.Group(), hand: new THREE.Group() };
  private boss = new THREE.Group();
  private bossBody = new THREE.Group();
  private bossHead = new THREE.Group();
  private bossLeft: Arm = { shoulder: new THREE.Group(), elbow: new THREE.Group(), hand: new THREE.Group() };
  private bossRight: Arm = { shoulder: new THREE.Group(), elbow: new THREE.Group(), hand: new THREE.Group() };
  private summary = new THREE.Group();
  private carriedSet = new THREE.Group();
  private pen = new THREE.Group();
  private collatingPage = new THREE.Group();
  private finishedSets: THREE.Group[] = [];
  private cart = new THREE.Group();
  private cartWheels: THREE.Mesh[] = [];
  private paperTower = new THREE.Group();
  private towerBundles: THREE.Group[] = [];
  private movingBundle = new THREE.Group();
  private giantClip = new THREE.Group();
  private stepStool = new THREE.Group();
  private upperTray = new THREE.Group();
  private upperSourcePaper = new THREE.Group();
  private looseSheet = new THREE.Group();
  private contactMaterial: THREE.MeshBasicMaterial | null = null;
  private materials = new Map<number, THREE.MeshStandardMaterial>();
  private batchMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.83 });
  private cameraTarget = new THREE.Vector3();
  private desiredCamera = new THREE.Vector3();
  private heroFacing = 0;
  private gaitPhase = 0;
  private motion = 0;
  private playerUpdated = false;
  private cinematic: Choice | null = null;
  private endingTime = 0;
  private actionStage = 'idle';
  private completedSets = 0;
  private addedBundles = 0;
  private clipAttached = false;
  private cartMoved = 0;
  private handedOver = false;
  private walkingSpeed = 0;
  private maximumWalkingSpeed = 0;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(canvas: HTMLCanvasElement, private readonly plan?: DocumentCasePlan) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.07; this.renderer.shadowMap.enabled = false;
    this.renderer.setClearColor(0xe3e9df); this.scene.background = new THREE.Color(0xe3e9df); this.scene.fog = new THREE.Fog(0xe3e9df, 42, 85);
    this.scene.add(new THREE.HemisphereLight(0xfff2d9, 0x84988d, 2.15));
    const sun = new THREE.DirectionalLight(0xffe1b8, 2.65); sun.position.set(-8, 13, 8); this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xd4edeb, 0.8); fill.position.set(7, 8, -4); this.scene.add(fill);
    this.room.name = 'Yoshinani document preparation workshop';
    this.scene.add(this.room, this.hero, this.boss, this.summary, this.carriedSet, this.pen, this.collatingPage, this.cart, this.movingBundle, this.stepStool, this.upperTray, this.looseSheet);
    this.buildRoom(); this.buildEvidenceProps(); this.buildCharacter(); this.buildBoss(); this.buildActionProps();
    this.batch(this.room); this.batch(this.body, new Set([this.head, this.leftLeg, this.rightLeg, this.left.shoulder, this.right.shoulder])); this.batch(this.head);
    for (const [leg, shin] of [[this.leftLeg, this.leftShin], [this.rightLeg, this.rightShin]]) { this.batch(leg, new Set([shin])); this.batch(shin); }
    this.batch(this.bossBody, new Set([this.bossHead, this.bossLeft.shoulder, this.bossRight.shoulder])); this.batch(this.bossHead);
    for (const arm of [this.left, this.right, this.bossLeft, this.bossRight]) { this.batch(arm.shoulder, new Set([arm.elbow])); this.batch(arm.elbow, new Set([arm.hand])); this.batch(arm.hand); }
    this.batch(this.cart, new Set([this.paperTower, ...this.cartWheels])); this.batch(this.paperTower, new Set([...this.towerBundles, this.giantClip]));
    this.batch(this.upperTray, new Set([this.upperSourcePaper])); this.batch(this.upperSourcePaper);
    for (const group of [this.summary, this.carriedSet, this.pen, this.collatingPage, this.movingBundle, this.stepStool, this.looseSheet, this.giantClip, ...this.finishedSets, ...this.towerBundles]) this.batch(group);
    this.reset(); this.showTitle(0);
  }

  private get packetId() { return this.plan?.packetId ?? '研修資料'; }
  private get setCount() { return this.plan?.setCount ?? 6; }
  private get pageCount() { return this.plan?.pageCount ?? 240; }
  private get intendedChoice(): Choice { return this.plan?.intendedChoice ?? 'C'; }
  private material(color: number) {
    let material = this.materials.get(color);
    if (!material) { material = new THREE.MeshStandardMaterial({ color, roughness: color === C.gold ? 0.42 : 0.84, metalness: color === C.gold ? 0.42 : 0 }); this.materials.set(color, material); }
    return material;
  }
  private box(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, radius = 0): THREE.Mesh {
    const geometry = radius ? new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 3, h / 3, d / 3)) : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geometry, this.material(color)); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  private round(parent: THREE.Object3D, radius: number, color: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), this.material(color)); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
  }
  private cylinder(parent: THREE.Object3D, top: number, bottom: number, height: number, color: number, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, 12), this.material(color)); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  private batch(root: THREE.Object3D, excluded = new Set<THREE.Object3D>()) {
    root.updateWorldMatrix(true, true); const inverse = root.matrixWorld.clone().invert(); const geometries: THREE.BufferGeometry[] = []; const sources: THREE.Mesh[] = [];
    const visit = (object: THREE.Object3D) => {
      if (excluded.has(object)) return;
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial && !object.material.map && !(object instanceof THREE.InstancedMesh)) {
        let geometry = object.geometry.clone(); if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
        geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld)); const colors = new Float32Array(geometry.getAttribute('position').count * 3); const color = object.material.color;
        for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometries.push(geometry); sources.push(object);
      }
      for (const child of object.children) visit(child);
    };
    for (const child of root.children) visit(child);
    if (geometries.length) {
      const merged = mergeGeometries(geometries, false); if (merged) { for (const source of sources) { source.removeFromParent(); source.geometry.dispose(); } root.add(new THREE.Mesh(merged, this.batchMaterial)); }
      for (const geometry of geometries) geometry.dispose();
    }
  }
  private collision(x: number, z: number, w: number, d: number) { this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }); }
  private shadow(parent: THREE.Object3D, x: number, z: number, w: number, d: number) {
    if (!this.contactMaterial) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32); gradient.addColorStop(0, 'rgba(65,57,42,.25)'); gradient.addColorStop(0.5, 'rgba(65,57,42,.14)'); gradient.addColorStop(1, 'rgba(65,57,42,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      this.contactMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.contactMaterial); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.046, z); mesh.renderOrder = 1; parent.add(mesh);
  }
  private sign(parent: THREE.Object3D, text: string[], w: number, h: number, x: number, y: number, z: number, flat = false, background = '#fff9eb', color = '#326c65') {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = Math.max(128, Math.min(768, Math.round(512 * h / w))); const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.min(62, canvas.height / (text.length + 0.8))}px "Yu Gothic", sans-serif`;
    text.forEach((line, i) => ctx.fillText(line, 256, canvas.height * (i + 0.9) / (text.length + 0.8), 465)); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })); mesh.position.set(x, y, z); if (flat) mesh.rotation.x = -Math.PI / 2; parent.add(mesh); return mesh;
  }
  private lines(key: string, fallback: string[]) { return this.plan?.signage[key]?.split('\n') ?? fallback; }
  private paperStack(parent: THREE.Object3D, w: number, h: number, d: number, x = 0, y = 0, z = 0, tab = true) {
    this.box(parent, w, h, d, C.paper, x, y + h / 2, z, 0.006);
    for (let i = 1; i < 5; i++) this.box(parent, w + 0.005, 0.003, d + 0.004, 0xd9d5c6, x, y + h * i / 5, z);
    this.box(parent, w * 0.82, 0.004, 0.015, C.teal, x, y + h + 0.004, z - d * 0.29);
    for (let i = 0; i < 3; i++) this.box(parent, w * (0.7 - 0.09 * i), 0.003, 0.007, 0xc8c8b7, x - w * 0.04 * i, y + h + 0.004, z - d * 0.1 + i * d * 0.16);
    if (tab) this.box(parent, w * 0.2, 0.007, d * 0.11, C.blush, x + w * 0.32, y + h + 0.005, z + d * 0.47);
  }
  private shelf(x: number, z: number, w = 1.3, d = 0.8) {
    this.box(this.room, w, 0.1, d, C.wood, x, 0.91, z, 0.035); for (const px of [x - w * 0.38, x + w * 0.38]) this.box(this.room, 0.08, 0.85, 0.08, C.teal, px, 0.47, z);
    this.collision(x, z, w, d); this.shadow(this.room, x, z, w + 0.35, d + 0.3);
  }
  private buildRoom() {
    this.box(this.room, 12.2, 0.36, 9.2, C.edge, 0, -0.22, 0, 0.07); this.box(this.room, 12, 0.12, 9, 0xd6c8ac, 0, -0.005, 0);
    this.box(this.room, 3.2, 0.36, 4.9, C.edge, 7.5, -0.22, 2, 0.07); this.box(this.room, 3.1, 0.12, 4.8, 0xe1d8bd, 7.5, -0.005, 2);
    for (let x = -5.7; x < 6; x += 0.8) this.box(this.room, 0.012, 0.006, 8.95, 0xc2b59a, x, 0.059, 0);
    for (let z = -4; z < 4.5; z += 0.8) this.box(this.room, 11.9, 0.006, 0.012, 0xc2b59a, 0, 0.059, z);
    this.box(this.room, 12.15, 3.45, 0.2, C.cream, 0, 1.73, -4.58, 0.045); this.box(this.room, 0.18, 2.7, 9.1, C.cream, -6.04, 1.35, -0.05, 0.045);
    this.box(this.room, 0.18, 2.7, 4.1, C.cream, 6.04, 1.35, -2.55, 0.045); this.box(this.room, 12, 0.13, 0.09, C.wood, 0, 0.14, -4.44);
    this.sign(this.room, ['Y O S H I N A N I', '資 料 作 業 室'], 3.4, 0.62, -2.5, 2.86, -4.455, false, '#326c65', '#fff9eb');
    // Bound files, an analogue clock, a copier and open passage give this room its own identity.
    for (const x of [-4.6, -2.9]) {
      this.box(this.room, 1.45, 2.1, 0.61, C.sage, x, 1.1, -3.95, 0.03); this.box(this.room, 1.3, 1.94, 0.08, C.cream, x, 1.13, -4.25);
      for (const y of [0.48, 1.03, 1.58]) {
        this.box(this.room, 1.4, 0.07, 0.65, C.wood, x, y, -3.92);
        for (let i = 0; i < 7; i++) { const color = [C.teal, C.blush, C.blue, C.cream][i % 4]; this.box(this.room, 0.12, 0.41, 0.4, color, x - 0.53 + i * 0.17, y + 0.24, -3.81, 0.008); this.box(this.room, 0.07, 0.11, 0.005, C.paper, x - 0.53 + i * 0.17, y + 0.27, -3.606); }
      }
      this.collision(x, -3.95, 1.45, 0.7);
    }
    this.cylinder(this.room, 0.3, 0.3, 0.07, C.wood, 0.6, 2.77, -4.4).rotation.x = Math.PI / 2;
    this.cylinder(this.room, 0.26, 0.26, 0.075, C.paper, 0.6, 2.77, -4.35).rotation.x = Math.PI / 2;
    this.box(this.room, 0.017, 0.16, 0.02, C.dark, 0.6, 2.83, -4.3).rotation.z = -0.85; this.box(this.room, 0.015, 0.21, 0.02, C.dark, 0.6, 2.86, -4.29).rotation.z = 0.32;
    this.box(this.room, 1.4, 0.85, 1.08, C.sage, 4.55, 0.51, -3.67, 0.055); this.box(this.room, 1.42, 0.15, 1.1, C.cream, 4.55, 1.0, -3.67, 0.05);
    this.box(this.room, 0.63, 0.05, 0.48, C.dark, 4.34, 1.1, -3.75, 0.02); this.box(this.room, 0.45, 0.11, 0.28, C.teal, 4.97, 1.11, -3.45, 0.02);
    this.box(this.room, 0.6, 0.2, 0.12, C.dark, 4.35, 0.72, -3.08); this.paperStack(this.room, 0.46, 0.035, 0.35, 4.35, 0.64, -3.0); this.collision(4.55, -3.65, 1.5, 1.2);
    this.sign(this.room, ['資 料 搬 出 口 →'], 1.55, 0.38, 5.88, 2.4, -0.8, false, '#326c65', '#fff9eb');
    this.box(this.room, 2.6, 0.012, 1.1, C.sage, 7.3, 0.064, 2.1, 0.07);
    this.cylinder(this.room, 0.31, 0.24, 0.42, C.blush, -5.15, 0.29, 3.65);
    for (let i = 0; i < 7; i++) { const leaf = this.round(this.room, 0.25, i % 2 ? C.sage : C.teal, -5.15 + Math.sin(i * 2) * 0.22, 0.76 + i * 0.08, 3.65 + Math.cos(i * 2) * 0.22, 0.65, 1.4, 0.35); leaf.rotation.z = Math.sin(i * 2) * 0.65; }
    this.collision(-5.15, 3.65, 0.7, 0.7);
  }
  private buildEvidenceProps() {
    this.box(this.room, 3.15, 0.12, 1.5, C.wood, 0, 0.72, -0.1, 0.07); this.box(this.room, 2.98, 0.025, 1.34, 0xd8b28b, 0, 0.793, -0.1, 0.025);
    for (const x of [-1.24, 1.24]) for (const z of [-0.64, 0.44]) this.box(this.room, 0.1, 0.66, 0.1, C.dark, x, 0.35, z, 0.02);
    this.collision(0, -0.1, 3.15, 1.5); this.shadow(this.room, 0, -0.1, 3.8, 2.1);
    this.box(this.room, 0.68, 0.025, 0.73, C.paper, -1, 0.825, 0.1); this.sign(this.room, this.lines('request', ['依頼票', this.packetId]), 0.62, 0.65, -1, 0.841, 0.1, true);
    this.paperStack(this.room, 0.64, 0.16, 0.75, 0.95, 0.817, -0.4); this.sign(this.room, this.lines('source', ['元資料', this.packetId]), 0.59, 0.56, 0.95, 0.985, -0.4, true);
    for (const [x, z, key, fallback] of [[-4.8, -2, 'assignments', '午後の予定'], [-4.9, 1.6, 'intakes', '当日の案内'], [4.5, -1.9, 'counter', '受取相手の伝言'], [3.4, 1.6, 'oldMemo', '原本の保管メモ']] as const) {
      this.shelf(x, z); this.box(this.room, 0.95, 0.035, 0.65, key === 'intakes' ? C.blush : C.sage, x, 0.99, z); this.sign(this.room, this.lines(key, [fallback, '資料作業室']), 0.88, 0.58, x, 1.012, z, true);
    }
    // C07 is a physical clipboard on a low back workbench, without an advance marker.
    this.box(this.room, 2.4, 0.12, 0.65, C.wood, 0.1, 0.88, -3.5, 0.025); this.collision(0.1, -3.5, 2.4, 0.65);
    for (const x of [-0.85, 1.05]) this.box(this.room, 0.07, 0.83, 0.07, C.teal, x, 0.45, -3.5);
    this.box(this.room, 0.82, 0.025, 0.53, C.gold, 0.1, 0.96, -3.25); this.sign(this.room, this.lines('equipment', ['備品台帳', '資料作業室']), 0.76, 0.47, 0.1, 0.976, -3.25, true, '#f1d98d');
    // All three tools remain available in every generated case.
    this.box(this.room, 0.34, 0.04, 0.26, C.teal, -0.25, 0.83, -0.48, 0.02); this.box(this.room, 0.22, 0.065, 0.07, C.orange, -0.25, 0.88, -0.48, 0.02);
    this.box(this.room, 0.3, 0.03, 0.12, C.metal, 0.22, 0.83, -0.5, 0.02); this.box(this.room, 0.26, 0.04, 0.07, C.dark, 0.22, 0.86, -0.5, 0.015);
    this.box(this.room, 0.04, 0.012, 0.34, C.orange, -0.62, 0.833, -0.2, 0.006);
  }
  private buildArm(parent: THREE.Object3D, arm: Arm, x: number, y: number, sleeve: number) {
    arm.shoulder.position.set(x, y, 0); parent.add(arm.shoulder); this.round(arm.shoulder, 0.1, sleeve, 0, -0.055, 0, 1, 1.3, 1);
    this.cylinder(arm.shoulder, 0.059, 0.056, 0.105, C.skin, 0, -0.148, 0); arm.elbow.position.y = -0.2; arm.shoulder.add(arm.elbow);
    this.round(arm.elbow, 0.058, C.skin, 0, 0, 0); this.cylinder(arm.elbow, 0.053, 0.047, 0.16, C.skin, 0, -0.08, 0);
    arm.hand.position.y = -0.182; arm.elbow.add(arm.hand); this.round(arm.hand, 0.064, C.skin, 0, 0, 0, 0.94, 0.65, 1.08);
  }
  private buildCharacter() {
    this.hero.name = 'Salaryman preparing documents'; this.hero.add(this.body); this.shadow(this.hero, 0, 0.01, 0.92, 0.8);
    this.round(this.body, 0.29, C.cream, 0, 0.74, 0, 1.06, 1.18, 0.79); this.box(this.body, 0.06, 0.23, 0.025, C.orange, 0, 0.8, -0.238, 0.008);
    for (const x of [-0.055, 0.055]) this.box(this.body, 0.05, 0.055, 0.018, C.paper, x, 0.94, -0.211).rotation.z = x < 0 ? 0.3 : -0.3;
    this.head.position.set(0, 1.2, 0); this.body.add(this.head); this.round(this.head, 0.28, C.skin, 0, 0.05, -0.015, 0.94, 1.06, 0.9);
    this.round(this.head, 0.286, C.dark, 0, 0.17, 0.032, 0.98, 0.72, 0.91).rotation.x = -0.18; this.round(this.head, 0.1, C.dark, -0.17, 0.18, -0.14, 1.1, 0.85, 0.65);
    for (const x of [-0.087, 0.087]) this.round(this.head, 0.025, C.dark, x, 0.065, -0.252, 0.75, 1.1, 0.4);
    this.round(this.head, 0.04, C.skin, 0, 0.02, -0.269, 0.8, 0.8, 0.8); for (const x of [-0.258, 0.258]) this.round(this.head, 0.047, C.skin, x, 0.035, -0.007, 0.6, 1, 1);
    this.buildArm(this.body, this.left, -0.29, 0.88, C.cream); this.buildArm(this.body, this.right, 0.29, 0.88, C.cream);
    this.body.add(this.leftLeg, this.rightLeg); this.leftLeg.position.set(-0.12, 0.49, 0); this.rightLeg.position.set(0.12, 0.49, 0);
    for (const [leg, shin] of [[this.leftLeg, this.leftShin], [this.rightLeg, this.rightShin]]) {
      this.cylinder(leg, 0.092, 0.086, 0.2, C.edge, 0, -0.09, 0); shin.position.y = -0.19; leg.add(shin); this.cylinder(shin, 0.086, 0.079, 0.17, C.edge, 0, -0.075, 0);
      this.round(shin, 0.104, C.dark, 0, -0.165, -0.042, 0.9, 0.6, 1.6); this.box(shin, 0.16, 0.018, 0.24, C.dark, 0, -0.208, -0.045, 0.005);
    }
  }
  private buildBoss() {
    this.boss.name = 'Boss receiving the prepared documents'; this.boss.add(this.bossBody); this.shadow(this.boss, 0, 0, 1.0, 0.85);
    this.round(this.bossBody, 0.32, C.sage, 0, 0.78, 0, 1.05, 1.21, 0.8); this.box(this.bossBody, 0.24, 0.39, 0.025, C.cream, 0, 0.83, -0.25, 0.009);
    for (const x of [-0.145, 0.145]) this.box(this.bossBody, 0.1, 0.3, 0.028, C.teal, x, 0.88, -0.265).rotation.z = x < 0 ? -0.25 : 0.25;
    this.box(this.bossBody, 0.057, 0.27, 0.028, C.orange, 0, 0.81, -0.279); this.bossHead.position.set(0, 1.27, 0); this.bossBody.add(this.bossHead);
    this.round(this.bossHead, 0.29, C.skin, 0, 0.04, -0.01, 0.97, 1.02, 0.9); this.round(this.bossHead, 0.292, C.dark, 0, 0.16, 0.035, 0.99, 0.64, 0.9);
    for (const x of [-0.25, 0.25]) { this.round(this.bossHead, 0.08, 0xaab6a7, x, 0.11, 0.005, 0.39, 0.8, 0.8); this.round(this.bossHead, 0.049, C.skin, x * 1.08, 0.03, 0.005, 0.6, 1, 1); }
    for (const x of [-0.098, 0.098]) {
      this.round(this.bossHead, 0.024, C.dark, x, 0.055, -0.263, 0.65, 0.9, 0.45); const glasses = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.013, 5, 16), this.material(C.teal)); glasses.position.set(x, 0.058, -0.283); this.bossHead.add(glasses);
    }
    this.box(this.bossHead, 0.052, 0.012, 0.015, C.teal, 0, 0.067, -0.294); this.round(this.bossHead, 0.041, C.skin, 0, 0.013, -0.295, 0.75, 0.8, 0.8); this.box(this.bossHead, 0.075, 0.012, 0.018, C.wood, 0, -0.072, -0.27);
    for (const x of [-0.125, 0.125]) { this.cylinder(this.bossBody, 0.098, 0.085, 0.37, C.edge, x, 0.33, 0); this.round(this.bossBody, 0.108, C.dark, x, 0.14, -0.045, 0.93, 0.66, 1.6); }
    this.buildArm(this.bossBody, this.bossLeft, -0.32, 0.91, C.sage); this.buildArm(this.bossBody, this.bossRight, 0.32, 0.91, C.sage);
  }
  private buildActionProps() {
    this.paperStack(this.summary, 0.55, 0.012, 0.39, 0, 0, 0, false); this.sign(this.summary, [this.packetId, '要点'], 0.4, 0.13, 0, 0.018, -0.07, true);
    this.paperStack(this.carriedSet, 0.58, 0.06, 0.42); this.sign(this.carriedSet, [this.packetId], 0.36, 0.12, 0, 0.068, -0.1, true);
    this.cylinder(this.pen, 0.014, 0.014, 0.23, C.orange, 0, 0.07, 0).rotation.z = -0.35; this.cylinder(this.pen, 0.005, 0.014, 0.035, C.dark, -0.03, -0.055, 0).rotation.z = -0.35;
    this.paperStack(this.collatingPage, 0.49, 0.009, 0.34, 0, 0, 0, false);
    for (let i = 0; i < this.setCount; i++) { const set = new THREE.Group(); this.paperStack(set, 0.38, 0.05, 0.35); this.scene.add(set); this.finishedSets.push(set); }
    this.box(this.cart, 0.95, 0.12, 0.8, C.teal, 0, 0.22, 0, 0.05); this.shadow(this.cart, 0, 0, 1.25, 1.05);
    this.collision(3.0, 2.85, 0.95, 0.8);
    for (const x of [-0.37, 0.37]) for (const z of [-0.28, 0.28]) { const wheel = this.cylinder(this.cart, 0.11, 0.11, 0.055, C.dark, x, 0.13, z); wheel.rotation.z = Math.PI / 2; this.cartWheels.push(wheel); }
    for (const x of [-0.36, 0.36]) this.box(this.cart, 0.035, 0.77, 0.035, C.metal, x, 0.61, 0.39, 0.01); this.box(this.cart, 0.78, 0.05, 0.055, C.wood, 0, 1.0, 0.39, 0.018);
    this.cart.add(this.paperTower); this.paperTower.position.y = 0.28;
    this.paperStack(this.paperTower, 0.73, 1.35, 0.58); this.sign(this.paperTower, [this.packetId], 0.46, 0.15, 0, 0.8, 0.294, false);
    for (let i = 0; i < 3; i++) { const bundle = new THREE.Group(); bundle.position.set((i % 2 ? -1 : 1) * 0.008, 1.35 + i * 0.13, 0); this.paperTower.add(bundle); this.paperStack(bundle, 0.73, 0.13, 0.58); this.towerBundles.push(bundle); }
    this.paperStack(this.movingBundle, 0.73, 0.13, 0.58);
    this.paperTower.add(this.giantClip); this.giantClip.position.set(0, 1.74, 0); this.box(this.giantClip, 0.76, 0.16, 0.24, C.dark, 0, 0.08, 0, 0.015);
    for (const z of [-0.1, 0.1]) {
      this.box(this.giantClip, 0.44, 0.025, 0.025, C.gold, 0, 0.35, z, 0.008);
      for (const x of [-0.21, 0.21]) this.box(this.giantClip, 0.025, 0.2, 0.025, C.gold, x, 0.25, z, 0.008);
    }
    // The steps stand beside the trolley. Its handle and the return walking path stay clear.
    this.stepStool.position.set(1.4, 0, 1.65); this.stepStool.rotation.y = -Math.PI / 2;
    for (let i = 0; i < 3; i++) { this.box(this.stepStool, 0.82, (i + 1) / 3, 0.32, C.wood, 0, (i + 1) / 6 + 0.065, 0.6 - i * 0.32, 0.025); this.box(this.stepStool, 0.8, 0.018, 0.3, C.sage, 0, (i + 1) / 3 + 0.07, 0.6 - i * 0.32, 0.01); }
    this.box(this.upperTray, 0.55, 0.035, 0.5, C.sage, 0, 0, 0); this.upperTray.add(this.upperSourcePaper); this.paperStack(this.upperSourcePaper, 0.49, 0.39, 0.4, 0, 0.02, 0);
    this.upperTray.position.set(2.0, 1.42, 1.0); this.box(this.upperTray, 0.04, 1.35, 0.04, C.metal, 0.18, -0.675, -0.12);
    this.paperStack(this.looseSheet, 0.43, 0.007, 0.31, 0, 0, 0, false);
  }

  resize(width: number, height: number, dpr: number) { this.camera.aspect = Math.max(width, 1) / Math.max(height, 1); this.camera.updateProjectionMatrix(); this.renderer.setPixelRatio(Math.min(dpr, 1.5)); this.renderer.setSize(width, height, false); }
  setClues(_found: Set<string>, _nearest: string | null) { /* Evidence is ordinary furniture and paper, without advance markers. */ }
  updatePlayer(x: number, z: number, facing: number, moving: boolean, dt: number) {
    this.hero.position.set(x, 0, z); const turn = THREE.MathUtils.euclideanModulo(facing - this.heroFacing + Math.PI, Math.PI * 2) - Math.PI; this.heroFacing += turn * (this.reducedMotion ? 1 : 1 - Math.exp(-18 * Math.min(dt, 0.1))); this.hero.rotation.y = this.heroFacing;
    this.motion = THREE.MathUtils.damp(this.motion, moving ? 1 : 0, moving ? 10 : 15, Math.min(dt, 0.1)); this.playerUpdated = true;
  }
  updateExplorationCamera(x: number, z: number, yaw: number, pitch: number, dt: number, instant = false) {
    this.camera.clearViewOffset(); const mobile = this.camera.aspect < 0.8; const distance = mobile ? 9.2 : 8.4; const angle = THREE.MathUtils.clamp(pitch, 0.4, 1.05); const horizontal = Math.cos(angle) * distance;
    this.desiredCamera.set(Math.max(-5.55, x + Math.sin(yaw) * horizontal), 0.8 + Math.sin(angle) * distance, Math.max(-4.1, z + Math.cos(yaw) * horizontal));
    const target = point(THREE.MathUtils.clamp(x - Math.sin(yaw), -5.3, 8.2), 0.75, THREE.MathUtils.clamp(z - Math.cos(yaw), -3.8, 3.9)); const factor = instant || this.reducedMotion ? 1 : 1 - Math.exp(-7 * Math.min(dt, 0.1));
    this.camera.position.lerp(this.desiredCamera, factor); this.cameraTarget.lerp(target, factor); this.camera.lookAt(this.cameraTarget); this.camera.fov = mobile ? 56 : 53; this.camera.updateProjectionMatrix();
  }
  showTitle(time: number) {
    const portrait = this.camera.aspect < 0.8; const framing = portrait ? 1.72 : this.camera.aspect < 1.2 ? 1.25 : 1; const drift = this.reducedMotion ? 0 : Math.sin(time * 0.09) * 0.22;
    this.camera.position.set((12.4 + drift) * framing, 12.1 * framing, 16.1 * framing); this.cameraTarget.set(0.2, 0.8, -0.3); this.camera.lookAt(this.cameraTarget); this.camera.fov = 40;
    if (this.camera.aspect > 1.2) { const w = this.renderer.domElement.width; const h = this.renderer.domElement.height; this.camera.setViewOffset(w, h, -w * 0.18, 0, w, h); } else this.camera.clearViewOffset(); this.camera.updateProjectionMatrix();
  }
  private pose(time: number, walking: number) {
    const amount = this.reducedMotion ? 0 : walking; const gait = time * 10.6;
    this.leftLeg.rotation.x = Math.sin(gait) * 0.35 * amount; this.rightLeg.rotation.x = -Math.sin(gait) * 0.35 * amount; this.leftShin.rotation.x = -Math.max(0, Math.cos(gait)) * 0.55 * amount; this.rightShin.rotation.x = -Math.max(0, -Math.cos(gait)) * 0.55 * amount;
    this.left.shoulder.rotation.set(-Math.sin(gait - 0.2) * 0.32 * amount, 0, -0.04); this.right.shoulder.rotation.set(Math.sin(gait - 0.2) * 0.32 * amount, 0, 0.04);
    for (const arm of [this.left, this.right]) { arm.elbow.rotation.set(0.1, 0, 0); arm.hand.rotation.set(0, 0, 0); }
    this.body.rotation.set(-0.025 * amount, 0, Math.sin(gait) * 0.012 * amount); this.body.position.y = this.reducedMotion ? 0 : Math.sin(gait * 2) * 0.014 * amount;
    this.head.rotation.set(0, 0, 0);
  }
  /** Two rigid links end at the actual prop contact, so wrists do not detach while carrying. */
  private reach(parent: THREE.Group, arm: Arm, worldTarget: THREE.Vector3, side: number) {
    parent.updateWorldMatrix(true, false); const target = parent.worldToLocal(worldTarget.clone()); const origin = arm.shoulder.position.clone(); const direction = target.clone().sub(origin); const distance = THREE.MathUtils.clamp(direction.length(), 0.025, 0.3815); direction.normalize();
    const pole = point(side, 0, -0.35); pole.addScaledVector(direction, -pole.dot(direction)).normalize(); const a = (0.2 ** 2 - 0.182 ** 2 + distance ** 2) / (2 * distance); const h = Math.sqrt(Math.max(0, 0.2 ** 2 - a ** 2));
    const elbow = origin.clone().addScaledVector(direction, a).addScaledVector(pole, h); const endpoint = origin.clone().addScaledVector(direction, distance); const down = point(0, -1, 0);
    const upper = new THREE.Quaternion().setFromUnitVectors(down, elbow.clone().sub(origin).normalize()); const lower = new THREE.Quaternion().setFromUnitVectors(down, endpoint.sub(elbow).normalize());
    arm.shoulder.quaternion.copy(upper); arm.elbow.quaternion.copy(upper.clone().invert().multiply(lower)); arm.hand.rotation.set(0, 0, 0);
  }
  private heroReach(localLeft: THREE.Vector3, localRight: THREE.Vector3) {
    this.body.updateWorldMatrix(true, false); this.reach(this.body, this.left, this.body.localToWorld(localLeft.clone()), -1); this.reach(this.body, this.right, this.body.localToWorld(localRight.clone()), 1);
  }
  update(dt: number, elapsed: number) {
    if (this.cinematic) return; if (!this.playerUpdated) this.motion = THREE.MathUtils.damp(this.motion, 0, 12, Math.min(dt, 0.1)); this.playerUpdated = false; this.gaitPhase += Math.min(dt, 0.1) * this.motion; this.pose(this.gaitPhase, this.motion);
    if (!this.reducedMotion && this.motion < 0.05) { this.body.position.y = Math.sin(elapsed * 2.15) * 0.005; this.head.rotation.y = Math.sin(elapsed * 0.45) * 0.045; }
    this.bossHead.rotation.y = this.reducedMotion ? 0 : Math.sin(elapsed * 0.45) * 0.04;
  }
  startEnding(choice: Choice) { this.reset(); this.cinematic = choice; this.camera.clearViewOffset(); this.updateEnding(0, choice); }
  private walk(time: number, start: number, duration: number, points: THREE.Vector3[]): number {
    const t = THREE.MathUtils.clamp((time - start) / duration, 0, 1); const lengths = points.slice(1).map((p, i) => p.distanceTo(points[i])); const total = lengths.reduce((a, b) => a + b, 0); let distance = smooth(t) * total;
    this.walkingSpeed = time > start && t < 1 ? 6 * t * (1 - t) * total / duration : 0; this.maximumWalkingSpeed = Math.max(this.maximumWalkingSpeed, 1.5 * total / duration);
    for (let i = 0; i < lengths.length; i++) { if (distance <= lengths[i] || i === lengths.length - 1) { this.hero.position.lerpVectors(points[i], points[i + 1], Math.min(distance / lengths[i], 1)); this.hero.rotation.y = Math.atan2(points[i].x - points[i + 1].x, points[i].z - points[i + 1].z); break; } distance -= lengths[i]; }
    return time > start && t < 1 ? 1 : 0;
  }
  private holdPaper(prop: THREE.Group, height = 1.02) {
    this.body.updateWorldMatrix(true, false); prop.position.copy(this.body.localToWorld(point(0, height, -0.3))); prop.quaternion.copy(this.body.getWorldQuaternion(new THREE.Quaternion())); this.heroReach(point(-0.23, height, -0.3), point(0.23, height, -0.3));
  }
  updateEnding(t: number, choice: Choice) {
    const duration = choice === 'A' ? 10 : choice === 'B' ? 12 : 14; const time = THREE.MathUtils.clamp(t, 0, duration);
    this.cinematic = choice; this.endingTime = time; this.actionStage = 'preparing'; this.completedSets = 0; this.addedBundles = 0; this.clipAttached = false; this.cartMoved = 0; this.handedOver = false; this.walkingSpeed = 0;
    this.summary.visible = choice === 'A'; this.carriedSet.visible = false; this.pen.visible = false; this.collatingPage.visible = false; this.movingBundle.visible = false; this.looseSheet.visible = false;
    this.cart.visible = true; this.cart.position.set(choice === 'C' ? 2.1 : 3.0, 0, choice === 'C' ? 1.65 : 2.85); this.cart.rotation.set(0, 0, 0); this.paperTower.visible = choice === 'C'; this.giantClip.visible = false;
    this.stepStool.visible = choice === 'C'; this.upperTray.visible = choice === 'C'; this.boss.visible = true; this.boss.position.set(2.15, 0, -1.28); this.boss.rotation.set(0, Math.PI, 0); this.bossBody.position.set(0, 0, 0); this.bossBody.rotation.set(0, 0, 0); this.bossHead.rotation.set(0, 0, 0);
    for (const arm of [this.bossLeft, this.bossRight]) { arm.shoulder.rotation.set(0, 0, 0); arm.elbow.rotation.set(0.1, 0, 0); arm.hand.rotation.set(0, 0, 0); }
    for (const set of this.finishedSets) set.visible = false; for (const bundle of this.towerBundles) bundle.visible = false;
    if (choice === 'A') this.animateSummary(time); else if (choice === 'B') this.animateSets(time); else this.animateTower(time);
    this.setEndingCamera(choice);
  }
  private animateSummary(time: number) {
    const walking = this.walk(time, 3.3, 3.5, [point(0, 0, 0.97), point(2.15, 0, 0.97), point(2.15, 0, -0.65)]); this.pose(time, walking);
    if (time < 3.3) {
      this.hero.rotation.y = 0; this.head.rotation.x = -0.13; this.body.rotation.x = -0.03; this.summary.position.set(0.02, 0.84, 0.58); this.summary.rotation.set(0, 0, 0);
      this.heroReach(point(-0.2, 0.86, -0.3), point(0.19, 0.88, -0.29));
      if (time < 2.6) {
        this.actionStage = 'summarizing'; this.pen.visible = true; this.scene.updateWorldMatrix(true, true); this.pen.position.copy(this.right.hand.getWorldPosition(new THREE.Vector3())); this.pen.position.y += 0.04; this.pen.position.x += this.reducedMotion ? 0 : Math.sin(time * 4) * 0.025; this.pen.rotation.set(-0.2, 0, -0.25);
      } else { this.actionStage = 'lifting-summary'; const lift = smooth((time - 2.6) / 0.7); this.holdPaper(this.summary, THREE.MathUtils.lerp(0.86, 1.02, lift)); }
    } else { this.actionStage = time < 6.8 ? 'carrying-summary' : 'presenting-summary'; this.holdPaper(this.summary); }
    if (time >= 6.8) { this.hero.rotation.y = 0; this.holdPaper(this.summary); this.receivePaper(this.summary, time, 7.4); }
  }
  private animateSets(time: number) {
    const done = THREE.MathUtils.clamp((time - 0.3) / 4.1, 0, 1); this.completedSets = Math.min(this.setCount, Math.floor(done * this.setCount));
    for (let i = 0; i < this.finishedSets.length; i++) { const set = this.finishedSets[i]; set.visible = i < this.completedSets; set.position.set(-0.43 + (i % 3) * 0.43, 0.82, 0.38 - Math.floor(i / 3) * 0.4); }
    const walking = this.walk(time, 5.1, 3.7, [point(0, 0, 0.97), point(2.15, 0, 0.97), point(2.15, 0, -0.65)]); this.pose(time, walking);
    if (time < 4.4) {
      this.actionStage = 'collating'; this.hero.rotation.y = 0; this.head.rotation.x = -0.12; const phase = ((Math.max(time - 0.3, 0) / 4.1 * this.setCount) % 1); const movement = smooth(phase);
      this.collatingPage.visible = true; this.collatingPage.position.set(0.11 + movement * 0.17, 0.9 + Math.sin(movement * Math.PI) * 0.04, 0.64 - movement * 0.11); this.collatingPage.rotation.set(0, (1 - movement) * 0.1, 0);
      this.heroReach(point(-0.2, 0.88, -0.3), point(0.24, 0.9, -0.3));
    } else {
      this.actionStage = time < 5.1 ? 'aligning-sets' : time < 8.8 ? 'carrying-sets' : 'presenting-sets'; this.carriedSet.visible = true; this.holdPaper(this.carriedSet);
      if (this.finishedSets[0]) this.finishedSets[0].visible = false;
    }
    if (time >= 8.8) { this.hero.rotation.y = 0; this.holdPaper(this.carriedSet); this.receivePaper(this.carriedSet, time, 9.3); }
  }
  private receivePaper(prop: THREE.Group, time: number, start: number) {
    const take = smooth((time - start) / 0.75); this.handedOver = time >= start + 0.75; this.actionStage = this.handedOver ? 'boss-reaction' : this.actionStage;
    const reaction = smooth((time - start - 0.8) / 0.7); const accepted = this.cinematic === this.intendedChoice;
    if (take > 0) {
      const target = point(2.15, 1.02, -0.96 - take * 0.06); prop.position.lerp(target, take); this.scene.updateWorldMatrix(true, true);
      this.reach(this.bossBody, this.bossLeft, point(2.38, 1.02, -1.02), -1); this.reach(this.bossBody, this.bossRight, point(1.92, 1.02, -1.02), 1);
      if (this.handedOver) { this.left.shoulder.rotation.set(0.1, 0, -0.04); this.right.shoulder.rotation.set(0.1, 0, 0.04); this.left.elbow.rotation.set(0.1, 0, 0); this.right.elbow.rotation.set(0.1, 0, 0); }
    }
    this.bossHead.rotation.x = accepted ? Math.sin(reaction * Math.PI) * 0.12 : -0.09 * reaction; this.bossHead.rotation.z = accepted ? 0 : 0.12 * reaction;
    if (!accepted) this.head.rotation.z = -0.07 * reaction;
  }
  private animateTower(time: number) {
    // Keep this whole performance in the open floor in front of the workbench.
    const p = (x: number, y: number, z: number) => point(x + 0.2, y, z + 1.2);
    this.boss.position.copy(p(2.65, 0, -1.25)); this.boss.rotation.y = Math.PI / 2;
    this.hero.position.copy(p(1.2, 1.0, 0.45)); this.hero.rotation.set(0, -Math.PI / 2, 0); this.pose(time, 0);
    this.addedBundles = Math.min(3, Math.floor(THREE.MathUtils.clamp(time / 4.5, 0, 1) * 3));
    this.upperSourcePaper.scale.y = Math.max(0, 1 - (this.addedBundles + Number(time < 4.5)) / 3);
    for (let i = 0; i < this.towerBundles.length; i++) this.towerBundles[i].visible = i < this.addedBundles;
    if (time < 4.5) {
      this.actionStage = 'finishing-tower'; const cycle = (time / 1.5) % 1; const bundleIndex = Math.min(2, Math.floor(time / 1.5)); const progress = smooth(cycle);
      const source = p(1.8, 1.82 - bundleIndex * 0.13, 0.25); const destination = p(1.9, 1.63 + bundleIndex * 0.13, 0.45); this.movingBundle.visible = true; this.movingBundle.position.lerpVectors(source, destination, progress); this.movingBundle.position.y += Math.sin(progress * Math.PI) * 0.09; this.body.position.y = -0.12 * (1 - progress);
      this.reach(this.body, this.left, this.movingBundle.position.clone().add(point(-0.365, 0.03, -0.23)), -1); this.reach(this.body, this.right, this.movingBundle.position.clone().add(point(-0.365, 0.03, 0.23)), 1); this.head.rotation.x = -0.1;
    } else if (time < 6.0) {
      this.actionStage = 'clipping-tower'; const attach = smooth((time - 4.5) / 1.1); this.giantClip.visible = true; this.giantClip.position.set(0, 1.74 + (1 - attach) * 0.15, 0); this.clipAttached = time >= 5.6;
      this.reach(this.body, this.left, p(1.55, 2.02, 0.22), -1); this.reach(this.body, this.right, p(1.55, 2.02, 0.68), 1); this.head.rotation.x = -0.04;
    } else {
      this.giantClip.visible = true; this.giantClip.position.set(0, 1.74, 0); this.clipAttached = true;
      if (time < 8.2) {
        this.actionStage = 'descending-step';
        const walking = this.walk(time, 6, 2.2, [p(1.2, 1, 0.45), p(0.95, 1, 0.45), p(0.84, 2 / 3, 0.45), p(0.63, 2 / 3, 0.45), p(0.52, 1 / 3, 0.45), p(0.31, 1 / 3, 0.45), p(0.2, 0, 0.45)]); this.pose(time, walking * 0.65);
      } else if (time < 10.0) {
        this.actionStage = 'taking-handle'; const walking = this.walk(time, 8.2, 1.8, [p(0.2, 0, 0.45), p(0.2, 0, 1.4), p(1.9, 0, 1.4), p(1.9, 0, 1.18)]); this.pose(time, walking * 0.7);
      } else {
        // Only a short, slow push remains. The camera never chases the trolley.
        const move = smooth((time - 10.0) / 2.4); this.cartMoved = move * 1.7; this.cart.position.z = 1.65 - this.cartMoved;
        this.hero.position.set(2.1, 0, this.cart.position.z + 0.73); this.hero.rotation.y = 0; this.pose(time, time < 12.4 ? 0.55 : 0); this.actionStage = time < 12.4 ? 'pushing-cart' : 'boss-reaction';
        this.walkingSpeed = time > 10.0 && time < 12.4 ? 6 * ((time - 10.0) / 2.4) * (1 - (time - 10.0) / 2.4) * 1.7 / 2.4 : 0; this.maximumWalkingSpeed = Math.max(this.maximumWalkingSpeed, 1.5 * 1.7 / 2.4);
        this.reach(this.body, this.left, point(1.8, 1.0, this.cart.position.z + 0.39), -1); this.reach(this.body, this.right, point(2.4, 1.0, this.cart.position.z + 0.39), 1);
        for (const wheel of this.cartWheels) wheel.rotation.x = this.cartMoved / 0.11;
        if (time >= 12.4) {
          const reaction = smooth((time - 12.4) / 1.4); const accepted = this.intendedChoice === 'C'; this.handedOver = accepted && time >= 13.0;
          this.bossHead.rotation.x = accepted ? Math.sin(reaction * Math.PI) * 0.12 : -0.08 * reaction; this.bossHead.rotation.z = accepted ? 0 : -0.13 * reaction;
          if (accepted) this.reach(this.bossBody, this.bossLeft, p(2.31, 1.1, -1.03), -1);
          else {
            // One sheet stays caught in the enormous clipped bundle: the joke is visible without a camera spin.
            this.looseSheet.visible = this.intendedChoice === 'A'; this.looseSheet.position.copy(p(2.28 + (this.reducedMotion ? 0 : Math.sin(time * 3) * 0.012) * reaction, 1.1, -1.18)); this.looseSheet.rotation.set(0, 0, Math.PI / 2);
            this.reach(this.bossBody, this.bossLeft, p(2.31, 1.1, -1.03), -1);
          }
        }
      }
    }
  }
  private setEndingCamera(choice: Choice) {
    this.camera.clearViewOffset(); const portrait = this.camera.aspect < 0.8;
    this.cameraTarget.set(choice === 'C' ? 1.8 : 0.9, choice === 'C' ? 1.1 : 0.75, choice === 'C' ? 1.0 : -0.1);
    this.camera.position.copy(portrait ? point(-3.4, 5.6, 9.0) : point(-5.6, 6.0, 9.5)); this.camera.fov = portrait ? 46 : 41; this.camera.updateProjectionMatrix(); this.camera.lookAt(this.cameraTarget);
  }
  reset() {
    this.cinematic = null; this.endingTime = 0; this.actionStage = 'idle'; this.completedSets = 0; this.addedBundles = 0; this.clipAttached = false; this.cartMoved = 0; this.handedOver = false; this.walkingSpeed = 0; this.maximumWalkingSpeed = 0;
    this.hero.position.set(0, 0, 3); this.hero.rotation.set(0, 0, 0); this.heroFacing = 0; this.motion = 0; this.gaitPhase = 0; this.playerUpdated = false; this.pose(0, 0); this.body.position.set(0, 0, 0); this.body.rotation.set(0, 0, 0);
    for (const prop of [this.summary, this.carriedSet, this.pen, this.collatingPage, this.movingBundle, this.stepStool, this.upperTray, this.looseSheet, ...this.finishedSets]) prop.visible = false;
    this.cart.visible = true; this.cart.position.set(3.0, 0, 2.85); this.cart.rotation.set(0, 0, 0); for (const wheel of this.cartWheels) wheel.rotation.x = 0;
    this.paperTower.visible = false; this.giantClip.visible = false; this.giantClip.position.set(0, 1.74, 0); for (const bundle of this.towerBundles) bundle.visible = false;
    this.upperSourcePaper.scale.set(1, 1, 1);
    this.boss.visible = true; this.boss.position.set(2.15, 0, -1.28); this.boss.rotation.set(0, Math.PI, 0); this.bossBody.position.set(0, 0, 0); this.bossBody.rotation.set(0, 0, 0); this.bossHead.rotation.set(0, 0, 0);
    for (const arm of [this.bossLeft, this.bossRight]) { arm.shoulder.rotation.set(0, 0, 0); arm.elbow.rotation.set(0.1, 0, 0); arm.hand.rotation.set(0, 0, 0); }
  }
  diagnostics() {
    this.scene.updateWorldMatrix(true, true); const coordinates = (v: THREE.Vector3) => ({ x: v.x, y: v.y, z: v.z });
    return {
      clueMarkers: 0, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, hero: { x: this.hero.position.x, y: this.hero.position.y, z: this.hero.position.z, bodyY: this.body.position.y, leftKnee: this.leftShin.rotation.x, rightKnee: this.rightShin.rotation.x },
      camera: { position: coordinates(this.camera.position), target: coordinates(this.cameraTarget), fixed: !!this.cinematic }, ending: this.cinematic, endingTime: this.endingTime,
      document: {
        choice: this.cinematic, intendedChoice: this.intendedChoice, packetId: this.packetId, setCount: this.setCount, pageCount: this.pageCount,
        stage: this.actionStage, completedSets: this.completedSets, visibleSets: this.finishedSets.filter(set => set.visible).length + Number(this.carriedSet.visible), addedBundles: this.addedBundles,
        bundleHeight: this.paperTower.visible ? 1.35 + this.addedBundles * 0.13 : 0, totalHeight: this.paperTower.visible ? 1.63 + this.addedBundles * 0.13 : 0, clipAttached: this.clipAttached, cartMoved: this.cartMoved, cartPosition: coordinates(this.cart.position),
        handedOver: this.handedOver, bossReaction: !this.cinematic ? 'idle' : this.actionStage !== 'boss-reaction' ? 'waiting' : this.cinematic === this.intendedChoice ? 'accepted' : this.intendedChoice === 'A' ? 'needs-summary' : this.intendedChoice === 'B' ? 'needs-sets' : 'needs-originals',
        summaryVisible: this.summary.visible, summaryReady: this.cinematic === 'A' && this.endingTime >= 2.6, carriedSetVisible: this.carriedSet.visible, towerVisible: this.paperTower.visible, fixedCamera: !!this.cinematic, reducedMotion: this.reducedMotion,
        leftHand: coordinates(this.left.hand.getWorldPosition(new THREE.Vector3())), rightHand: coordinates(this.right.hand.getWorldPosition(new THREE.Vector3())), leftElbow: this.left.elbow.rotation.x, rightElbow: this.right.elbow.rotation.x,
        walkingSpeed: this.walkingSpeed, maximumWalkingSpeed: this.maximumWalkingSpeed, signage: this.plan?.signage ?? {},
      },
    };
  }
  render() { this.renderer.render(this.scene, this.camera); }
  dispose() {
    const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>(this.materials.values()); const textures = new Set<THREE.Texture>(); materials.add(this.batchMaterial); if (this.contactMaterial) materials.add(this.contactMaterial);
    this.scene.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); } });
    for (const material of materials) for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    for (const geometry of geometries) geometry.dispose(); for (const texture of textures) texture.dispose(); for (const material of materials) material.dispose(); this.renderer.dispose();
  }
}
