import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Choice, Collider, MoneyCasePlan } from './types';

const C = {
  cream: 0xf1eadb, paper: 0xfff9eb, floor: 0xd5b18a, edge: 0x394a48,
  wood: 0xad7854, sage: 0x78958a, teal: 0x326c65, dark: 0x233d3c,
  orange: 0xef8e4b, gold: 0xe2b65e, skin: 0xf5c4a1, metal: 0x526b67,
  blue: 0xa6c6c8, blush: 0xe7c8ae, green: 0x70916b,
};
const smooth = (t: number): number => { const v = THREE.MathUtils.clamp(t, 0, 1); return v * v * (3 - 2 * v); };
const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Render adapter for CASE 03. The ownership of the change stays in the case facts. */
export class MoneyWorld {
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
  private leftArm = new THREE.Group();
  private rightArm = new THREE.Group();
  private leftForearm = new THREE.Group();
  private rightForearm = new THREE.Group();
  private leftHand = new THREE.Group();
  private rightHand = new THREE.Group();
  private clerk = new THREE.Group();
  private clerkBody = new THREE.Group();
  private clerkHead = new THREE.Group();
  private tableEnvelope = new THREE.Group();
  private handEnvelope = new THREE.Group();
  private receipt = new THREE.Group();
  private wallet = new THREE.Group();
  private coffee = new THREE.Group();
  private counterCoffee = new THREE.Group();
  private flyingCoin = new THREE.Group();
  private tableCoins: THREE.Mesh[] = [];
  private donationCoins!: THREE.InstancedMesh;
  private postEnvelope = new THREE.Group();
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
  private disposition: 'unassigned' | 'company' | 'personal' | 'donation' = 'unassigned';
  private carrying: 'change' | 'envelope' | 'coffee' | null = null;
  private countedCoins = 0;
  private donatedCoins = 0;
  private walkingSpeed = 0;
  private maximumWalkingSpeed = 0;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(canvas: HTMLCanvasElement, private readonly plan?: MoneyCasePlan) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.07;
    this.renderer.shadowMap.enabled = false;
    this.renderer.setClearColor(0xe7eadf);
    this.scene.background = new THREE.Color(0xe7eadf);
    this.scene.fog = new THREE.Fog(0xe7eadf, 42, 85);
    this.scene.add(new THREE.HemisphereLight(0xfff2d9, 0x84988d, 2.15));
    const sun = new THREE.DirectionalLight(0xffe1b8, 2.65); sun.position.set(-8, 13, 8); this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xd4edeb, 0.8); fill.position.set(7, 8, -4); this.scene.add(fill);
    this.room.name = 'Yoshinani company break room after shopping';
    this.scene.add(this.room, this.hero, this.clerk, this.tableEnvelope, this.receipt, this.flyingCoin, this.postEnvelope);
    this.buildRoom();
    this.buildCounter();
    this.buildEvidenceProps();
    this.buildCharacter();
    this.buildClerk();
    this.buildActionProps();
    this.batch(this.room);
    this.batch(this.body, new Set([this.head, this.leftLeg, this.rightLeg, this.leftArm, this.rightArm, this.wallet]));
    this.batch(this.head);
    this.batch(this.leftLeg, new Set([this.leftShin])); this.batch(this.rightLeg, new Set([this.rightShin]));
    this.batch(this.leftArm, new Set([this.leftForearm])); this.batch(this.rightArm, new Set([this.rightForearm]));
    this.batch(this.leftForearm, new Set([this.leftHand])); this.batch(this.rightForearm, new Set([this.rightHand]));
    this.batch(this.leftHand, new Set([this.handEnvelope])); this.batch(this.rightHand, new Set([this.coffee]));
    for (const part of [this.leftShin, this.rightShin, this.handEnvelope, this.wallet, this.coffee, this.counterCoffee, this.tableEnvelope, this.receipt, this.postEnvelope, this.flyingCoin]) this.batch(part);
    this.batch(this.clerkBody, new Set([this.clerkHead])); this.batch(this.clerkHead);
    this.reset(); this.showTitle(0);
  }

  private material(color: number): THREE.MeshStandardMaterial {
    let material = this.materials.get(color);
    if (!material) { material = new THREE.MeshStandardMaterial({ color, roughness: color === C.gold ? 0.42 : 0.84, metalness: color === C.gold ? 0.42 : 0 }); this.materials.set(color, material); }
    return material;
  }

  private box(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, radius = 0): THREE.Mesh {
    const geometry = radius ? new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 3, h / 3, d / 3)) : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geometry, this.material(color)); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }

  private round(parent: THREE.Object3D, radius: number, color: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), this.material(color));
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
  }

  private cylinder(parent: THREE.Object3D, top: number, bottom: number, height: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, 12), this.material(color));
    mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }

  /** Solid primitives share a single vertex-color draw per independently moving part. */
  private batch(root: THREE.Object3D, excluded = new Set<THREE.Object3D>()): void {
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert();
    const geometries: THREE.BufferGeometry[] = []; const sources: THREE.Mesh[] = [];
    const visit = (object: THREE.Object3D) => {
      if (excluded.has(object)) return;
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial && !object.material.map && !(object instanceof THREE.InstancedMesh)) {
        let geometry = object.geometry.clone();
        if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
        geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
        const colors = new Float32Array(geometry.getAttribute('position').count * 3);
        const color = object.material.color;
        for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometries.push(geometry); sources.push(object);
      }
      for (const child of object.children) visit(child);
    };
    for (const child of root.children) visit(child);
    if (geometries.length) {
      const merged = mergeGeometries(geometries, false);
      if (merged) { for (const source of sources) { source.removeFromParent(); source.geometry.dispose(); } root.add(new THREE.Mesh(merged, this.batchMaterial)); }
      for (const geometry of geometries) geometry.dispose();
    }
  }

  private collision(x: number, z: number, width: number, depth: number): void {
    this.colliders.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 });
  }

  private shadow(parent: THREE.Object3D, x: number, z: number, width: number, depth: number): void {
    if (!this.contactMaterial) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d')!; const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(65,57,42,.25)'); gradient.addColorStop(0.5, 'rgba(65,57,42,.14)'); gradient.addColorStop(1, 'rgba(65,57,42,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      this.contactMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), this.contactMaterial);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.046, z); mesh.renderOrder = 1; parent.add(mesh);
  }

  private sign(parent: THREE.Object3D, text: string[], w: number, h: number, x: number, y: number, z: number, flat = false, background = '#fff9eb', color = '#326c65'): THREE.Mesh {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = Math.max(128, Math.min(768, Math.round(512 * h / w)));
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const font = Math.min(62, canvas.height / (text.length + 0.8)); ctx.font = `700 ${font}px "Yu Gothic", sans-serif`;
    text.forEach((line, i) => ctx.fillText(line, 256, canvas.height * (i + 0.9) / (text.length + 0.8), 465));
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    mesh.position.set(x, y, z); if (flat) mesh.rotation.x = -Math.PI / 2; parent.add(mesh); return mesh;
  }

  private lines(key: string, fallback: string[]): string[] { return this.plan?.signage[key]?.split('\n') ?? fallback; }
  private get changeYen(): number { return this.plan?.changeYen ?? 1800; }

  private plant(x: number, z: number, scale = 1): void {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale); this.room.add(group);
    this.cylinder(group, 0.27, 0.19, 0.44, C.cream, 0, 0.25, 0);
    this.cylinder(group, 0.02, 0.025, 0.65, C.wood, 0, 0.72, 0);
    for (let i = 0; i < 7; i++) { const angle = i * 2.4; this.round(group, 0.27, i % 2 ? C.sage : C.green, Math.cos(angle) * 0.21, 0.85 + i * 0.055, Math.sin(angle) * 0.18, 0.8, 0.43, 1.45).rotation.z = Math.sin(angle) * 0.5; }
    this.shadow(this.room, x, z, 1.1 * scale, 1.0 * scale);
  }

  private buildRoom(): void {
    this.box(this.room, 12.2, 0.36, 9.2, C.edge, 0, -0.22, 0, 0.07);
    this.box(this.room, 12.0, 0.12, 9.0, C.floor, 0, -0.005, 0);
    this.box(this.room, 3.2, 0.36, 4.9, C.edge, 7.5, -0.22, 2.0, 0.07);
    this.box(this.room, 3.1, 0.12, 4.8, 0xdcc7a7, 7.5, -0.005, 2.0);
    for (let z = -4.3; z < 4.5; z += 0.55) {
      this.box(this.room, 11.9, 0.006, 0.012, 0xc79b73, 0, 0.059, z);
      for (let x = -5.8 + (Math.round(z * 2) % 2) * 1.1; x < 6; x += 2.3) this.box(this.room, 0.012, 0.007, 0.54, 0xc79b73, x, 0.06, z + 0.27);
    }
    // Front and right-hand doorway stay open, like a small dollhouse.
    this.box(this.room, 12.15, 3.45, 0.2, C.cream, 0, 1.73, -4.58, 0.045);
    this.box(this.room, 0.18, 2.7, 9.1, C.cream, -6.04, 1.35, -0.05, 0.045);
    this.box(this.room, 0.18, 2.7, 4.1, C.cream, 6.04, 1.35, -2.55, 0.045);
    this.box(this.room, 12.0, 0.13, 0.09, C.wood, 0, 0.14, -4.44);
    this.box(this.room, 0.09, 0.13, 9.0, C.wood, -5.92, 0.14, 0);
    this.box(this.room, 0.12, 2.55, 0.17, C.wood, 6.0, 1.27, -0.4);
    this.sign(this.room, ['よしなに', '社 内 休 憩 室'], 3.4, 0.62, -1.75, 2.85, -4.455, false, '#326c65', '#fff9eb');
    // A sunlit window and small glazed tiles make this distinct from the office.
    this.box(this.room, 2.85, 1.72, 0.11, C.wood, 3.65, 2.14, -4.43, 0.035);
    this.box(this.room, 2.64, 1.51, 0.035, C.blue, 3.65, 2.14, -4.35);
    this.box(this.room, 0.075, 1.55, 0.04, C.cream, 3.65, 2.14, -4.315);
    this.box(this.room, 2.65, 0.075, 0.04, C.cream, 3.65, 2.14, -4.315);
    for (let x = 2.65; x <= 4.7; x += 0.42) { const curtain = this.box(this.room, 0.43, 0.38, 0.11, x < 3.8 ? C.sage : C.cream, x, 3.0, -4.25, 0.035); curtain.rotation.z = 0.02; }
    this.plant(5.3, 3.15, 1.2); this.plant(-5.35, -3.6, 0.85);
    this.box(this.room, 2.6, 0.012, 1.1, C.sage, 7.3, 0.064, 2.1, 0.07);
    for (let i = 0; i < 5; i++) this.box(this.room, 2.1, 0.005, 0.025, 0x96aa91, 7.3, 0.075, 1.7 + i * 0.2);
    this.sign(this.room, ['よしなに商事', '会計窓口 →'], 1.0, 0.5, 5.91, 1.85, -0.8);
  }

  private buildCounter(): void {
    this.box(this.room, 7.8, 0.98, 0.9, C.sage, -0.15, 0.53, -3.45, 0.055);
    this.box(this.room, 8.0, 0.16, 1.12, C.wood, -0.15, 1.08, -3.44, 0.05);
    this.box(this.room, 7.68, 0.06, 0.03, C.cream, -0.15, 0.81, -2.985);
    for (let x = -3.5; x < 3.5; x += 0.62) this.box(this.room, 0.018, 0.63, 0.015, 0x648377, x, 0.47, -2.984);
    this.collision(-0.15, -3.45, 7.8, 0.9);
    this.shadow(this.room, -0.15, -3.45, 8.4, 1.7);
    // The office coffee shelf has shared cups and supplies, with no shop register.
    this.box(this.room, 1.05, 0.72, 0.57, C.metal, -2.8, 1.51, -3.44, 0.05);
    this.box(this.room, 0.94, 0.19, 0.62, C.cream, -2.8, 1.8, -3.44, 0.03);
    this.box(this.room, 0.86, 0.1, 0.51, C.dark, -2.8, 1.16, -3.2);
    for (const x of [-3.03, -2.58]) { this.cylinder(this.room, 0.08, 0.08, 0.09, C.metal, x, 1.52, -3.11); this.cup(this.room, x, 1.23, -3.08, 0.55); }
    this.cylinder(this.room, 0.16, 0.16, 0.34, C.blush, -1.92, 1.32, -3.47);
    this.cylinder(this.room, 0.18, 0.18, 0.055, C.wood, -1.92, 1.51, -3.47);
    this.box(this.room, 0.95, 0.055, 0.6, C.wood, 2.9, 1.2, -3.35, 0.025);
    for (const [x, color] of [[2.64, C.blush], [2.99, C.cream]] as const) {
      this.cylinder(this.room, 0.14, 0.14, 0.27, color, x, 1.36, -3.4);
      this.cylinder(this.room, 0.15, 0.15, 0.035, C.wood, x, 1.51, -3.4);
    }
    this.box(this.room, 0.26, 0.16, 0.32, C.paper, 3.32, 1.3, -3.37, 0.025);
    this.box(this.room, 0.14, 0.065, 0.035, C.cream, 3.32, 1.41, -3.37, 0.008);
    for (let x = -0.85; x <= 0.35; x += 0.38) this.cup(this.room, x, 1.18, -3.65, 0.6);
    this.sign(this.room, ['社内ドリンク', 'ほっと、ひと息。'], 1.4, 0.66, 0.9, 2.2, -4.44, false, '#e7c8ae');
    this.counterCoffee.position.set(1.65, 1.17, -3.2); this.scene.add(this.counterCoffee); this.cup(this.counterCoffee, 0, 0, 0, 0.85);
  }

  private buildEvidenceProps(): void {
    // C01/C02 share one low work table; its four sides remain walkable.
    this.box(this.room, 3.15, 0.12, 1.5, C.wood, 0, 0.72, -0.1, 0.07);
    this.box(this.room, 2.98, 0.025, 1.34, 0xd8b28b, 0, 0.793, -0.1, 0.025);
    for (const x of [-1.24, 1.24]) for (const z of [-0.64, 0.44]) this.box(this.room, 0.1, 0.66, 0.1, C.dark, x, 0.35, z, 0.02);
    this.collision(0, -0.1, 3.15, 1.5); this.shadow(this.room, 0, -0.1, 3.8, 2.1);
    this.tableEnvelope.position.set(-1.0, 0.823, 0.1); this.envelope(this.tableEnvelope, 0.82, 0.5);
    this.sign(this.tableEnvelope, this.lines('envelope', [this.plan?.envelopeId ?? '買い出し代', `お預かり ¥${(this.plan?.paidYen ?? 5000).toLocaleString('ja-JP')}`]), 0.7, 0.35, 0, 0.023, 0, true, '#eddbb8');
    this.receipt.position.set(0.95, 0.824, -0.35);
    this.box(this.receipt, 0.52, 0.018, 0.88, C.paper);
    this.sign(this.receipt, this.lines('receipt', ['領収書', `合計 ¥${(this.plan?.purchaseYen ?? 3200).toLocaleString('ja-JP')}`, `釣銭 ¥${this.changeYen.toLocaleString('ja-JP')}`]), 0.46, 0.77, 0, 0.012, 0, true);
    this.cylinder(this.room, 0.31, 0.28, 0.028, C.teal, -0.07, 0.827, 0.1);
    for (let i = 0; i < 6; i++) {
      const coin = this.cylinder(this.scene, 0.09, 0.09, 0.023, C.gold, -0.23 + i % 3 * 0.17, 0.856 + Math.floor(i / 3) * 0.026, 0.08 + Math.floor(i / 3) * 0.14);
      this.tableCoins.push(coin);
    }
    // C03: the shared laptop keeps the two errands in the original work chat.
    this.box(this.room, 1.3, 0.1, 0.95, C.wood, -4.82, 0.91, -2.05, 0.035);
    for (const x of [-5.31, -4.33]) this.box(this.room, 0.08, 0.85, 0.08, C.teal, x, 0.47, -2.05);
    this.collision(-4.82, -2.05, 1.3, 0.95); this.shadow(this.room, -4.82, -2.05, 1.65, 1.3);
    this.box(this.room, 1.03, 0.045, 0.65, C.metal, -4.82, 1.0, -2.05, 0.018);
    this.box(this.room, 0.86, 0.008, 0.27, C.dark, -4.82, 1.026, -2.16, 0.012);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 8; col++) this.box(this.room, 0.08, 0.006, 0.055, C.cream, -5.17 + col * 0.1, 1.033, -2.245 + row * 0.08, 0.004);
    this.box(this.room, 0.27, 0.006, 0.13, C.blue, -4.82, 1.028, -1.91, 0.01);
    const laptopScreen = this.box(this.room, 1.03, 0.65, 0.045, C.dark, -4.82, 1.35, -2.34, 0.022); laptopScreen.rotation.x = -0.14;
    const chat = this.sign(this.room, this.lines('ledger', ['共有PC', '業務チャット']), 0.91, 0.51, -4.82, 1.35, -2.31, false, '#e7eadf'); chat.rotation.x = -0.14;
    // C04: a personal phone sits on a charging stand, not a public notice board.
    this.box(this.room, 0.38, 0.63, 0.74, C.cream, -5.55, 0.35, 1.6, 0.035);
    this.box(this.room, 0.4, 0.055, 0.8, C.wood, -5.6, 0.7, 1.6, 0.022);
    this.box(this.room, 0.2, 0.018, 0.07, C.dark, -5.77, 0.74, 1.6, 0.006);
    this.box(this.room, 0.045, 0.14, 0.1, C.cream, -5.91, 0.78, 1.6, 0.012);
    const phone = new THREE.Group(); phone.position.set(-5.55, 0.74, 1.6); phone.rotation.y = Math.PI / 2; this.room.add(phone);
    this.box(phone, 0.3, 0.04, 0.22, C.teal, 0, 0.02, 0, 0.02);
    this.box(phone, 0.07, 0.15, 0.07, C.teal, 0, 0.09, -0.045, 0.014);
    this.box(phone, 0.34, 0.62, 0.035, C.dark, 0, 0.34, 0, 0.028);
    this.sign(phone, this.lines('rules', ['自分のスマホ', 'メッセージ']), 0.29, 0.48, 0, 0.34, 0.021, false, '#e7eadf');
    this.box(phone, 0.08, 0.014, 0.004, C.metal, 0, 0.62, 0.02, 0.004);
    this.collision(-5.6, 1.6, 0.4, 0.8);
    // C05 donation box: a clear front lets the deposited coins remain visible.
    this.box(this.room, 1.06, 0.13, 0.95, C.wood, 4.5, 0.74, -1.9, 0.04);
    for (const x of [4.12, 4.88]) this.box(this.room, 0.08, 0.7, 0.7, C.sage, x, 0.36, -1.9);
    this.box(this.room, 0.74, 0.34, 0.55, C.blush, 4.5, 0.99, -2.02, 0.035);
    this.box(this.room, 0.65, 0.26, 0.014, 0xb6c9b6, 4.5, 0.98, -1.735);
    this.box(this.room, 0.76, 0.065, 0.58, C.wood, 4.5, 1.19, -2.02, 0.02);
    this.box(this.room, 0.33, 0.012, 0.056, C.dark, 4.5, 1.229, -1.97);
    this.sign(this.room, this.lines('donationBox', ['本棚づくり', '社内募金箱']), 0.82, 0.39, 4.5, 1.59, -2.02);
    this.collision(4.5, -1.9, 1.06, 0.95); this.shadow(this.room, 4.5, -1.9, 1.5, 1.3);
    this.donationCoins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.075, 0.025, 12), this.material(C.gold), 6);
    const transform = new THREE.Object3D();
    for (let i = 0; i < 6; i++) { transform.position.set(4.3 + i % 3 * 0.16, 0.89 + Math.floor(i / 3) * 0.055, -1.71); transform.updateMatrix(); this.donationCoins.setMatrixAt(i, transform.matrix); }
    this.donationCoins.count = 0; this.scene.add(this.donationCoins);
    // C06: a still-folded shopping bag and the unopened second envelope.
    this.box(this.room, 1.35, 0.09, 0.8, C.wood, 3.4, 0.93, 1.6, 0.045);
    for (const x of [2.9, 3.9]) this.box(this.room, 0.08, 0.9, 0.08, C.teal, x, 0.46, 1.6);
    this.box(this.room, 0.59, 0.016, 0.36, C.paper, 3.06, 0.99, 1.4, 0.008);
    this.sign(this.room, this.lines('order', ['次の買い物', '未使用の袋']), 0.54, 0.3, 3.06, 1.001, 1.4, true);
    this.box(this.room, 0.53, 0.025, 0.59, C.blush, 3.66, 1.0, 1.57, 0.012);
    this.box(this.room, 0.48, 0.006, 0.025, C.wood, 3.66, 1.016, 1.61);
    const bagHandle = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.012, 6, 12), this.material(C.wood)); bagHandle.position.set(3.66, 1.017, 1.32); bagHandle.rotation.x = Math.PI / 2; bagHandle.scale.x = 1.3; this.room.add(bagHandle);
    const nextEnvelope = new THREE.Group(); nextEnvelope.position.set(3.08, 1.0, 1.81); this.room.add(nextEnvelope); this.envelope(nextEnvelope, 0.55, 0.27);
    this.collision(3.4, 1.6, 1.35, 0.8); this.shadow(this.room, 3.4, 1.6, 1.7, 1.1);
    // C07: the boss's reply arrived on the shared messaging terminal.
    this.box(this.room, 0.67, 0.045, 0.4, C.metal, 0.1, 1.185, -3.3, 0.025);
    this.box(this.room, 0.1, 0.18, 0.1, C.metal, 0.1, 1.27, -3.35, 0.012);
    this.box(this.room, 0.86, 0.53, 0.055, C.dark, 0.1, 1.53, -3.3, 0.025);
    this.sign(this.room, this.lines('oldMemo', ['上司からの', '返信']), 0.75, 0.4, 0.1, 1.53, -3.268, false, '#e7eadf');
    // Company settlement post: the wide slot is reachable from the front.
    this.box(this.room, 0.91, 1.23, 0.72, C.teal, -4.55, 0.65, 3.05, 0.075);
    this.box(this.room, 0.98, 0.1, 0.8, C.cream, -4.55, 1.3, 3.05, 0.035);
    this.box(this.room, 0.61, 0.095, 0.02, C.dark, -4.55, 1.05, 2.678);
    this.sign(this.room, ['経理', '精算ポスト'], 0.67, 0.43, -4.55, 0.71, 2.675, false, '#326c65', '#fff9eb').rotation.y = Math.PI;
    this.collision(-4.55, 3.05, 0.91, 0.72); this.shadow(this.room, -4.55, 3.05, 1.4, 1.2);
  }

  private envelope(parent: THREE.Object3D, width: number, depth: number): void {
    this.box(parent, width, 0.033, depth, 0xe1c69b, 0, 0, 0, 0.008);
    const seam = this.box(parent, width * 0.55, 0.007, 0.012, C.wood, -width * 0.13, 0.02, -depth * 0.07); seam.rotation.y = 0.42;
    const other = this.box(parent, width * 0.55, 0.007, 0.012, C.wood, width * 0.13, 0.02, -depth * 0.07); other.rotation.y = -0.42;
  }

  private cup(parent: THREE.Object3D, x: number, y: number, z: number, scale = 1): void {
    const group = new THREE.Group(); group.position.set(x, y, z); group.scale.setScalar(scale); parent.add(group);
    this.cylinder(group, 0.125, 0.095, 0.23, C.paper, 0, 0.12, 0);
    this.cylinder(group, 0.108, 0.108, 0.007, C.wood, 0, 0.238, 0);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.023, 6, 12), this.material(C.paper)); handle.position.set(0.125, 0.13, 0); group.add(handle);
    this.cylinder(group, 0.17, 0.17, 0.018, C.paper, 0, 0.009, 0);
  }

  private buildCharacter(): void {
    this.hero.name = 'Salaryman carrying the change'; this.hero.add(this.body); this.shadow(this.hero, 0, 0.01, 0.92, 0.8);
    this.round(this.body, 0.29, C.cream, 0, 0.74, 0, 1.06, 1.18, 0.79);
    this.box(this.body, 0.06, 0.23, 0.025, C.orange, 0, 0.8, -0.238, 0.008);
    for (const x of [-0.055, 0.055]) this.box(this.body, 0.05, 0.055, 0.018, C.paper, x, 0.94, -0.211).rotation.z = x < 0 ? 0.3 : -0.3;
    this.head.position.set(0, 1.2, 0); this.body.add(this.head);
    this.round(this.head, 0.28, C.skin, 0, 0.05, -0.015, 0.94, 1.06, 0.9);
    this.round(this.head, 0.286, C.dark, 0, 0.17, 0.032, 0.98, 0.72, 0.91).rotation.x = -0.18;
    this.round(this.head, 0.1, C.dark, -0.17, 0.18, -0.14, 1.1, 0.85, 0.65);
    for (const x of [-0.087, 0.087]) this.round(this.head, 0.025, C.dark, x, 0.065, -0.252, 0.75, 1.1, 0.4);
    this.round(this.head, 0.04, C.skin, 0, 0.02, -0.269, 0.8, 0.8, 0.8);
    for (const x of [-0.258, 0.258]) this.round(this.head, 0.047, C.skin, x, 0.035, -0.007, 0.6, 1, 1);
    this.body.add(this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);
    this.leftArm.position.set(-0.29, 0.88, 0); this.rightArm.position.set(0.29, 0.88, 0);
    for (const [arm, forearm, hand] of [[this.leftArm, this.leftForearm, this.leftHand], [this.rightArm, this.rightForearm, this.rightHand]]) {
      this.round(arm, 0.103, C.cream, 0, -0.055, 0, 1, 1.3, 1);
      this.cylinder(arm, 0.059, 0.056, 0.105, C.skin, 0, -0.148, 0);
      forearm.position.y = -0.2; arm.add(forearm); this.round(forearm, 0.058, C.skin, 0, 0, 0);
      this.cylinder(forearm, 0.053, 0.047, 0.16, C.skin, 0, -0.08, 0);
      hand.position.y = -0.182; forearm.add(hand); this.round(hand, 0.064, C.skin, 0, 0, 0, 0.94, 0.65, 1.08);
    }
    this.leftLeg.position.set(-0.12, 0.49, 0); this.rightLeg.position.set(0.12, 0.49, 0);
    for (const [leg, shin] of [[this.leftLeg, this.leftShin], [this.rightLeg, this.rightShin]]) {
      this.cylinder(leg, 0.092, 0.086, 0.2, C.edge, 0, -0.09, 0); shin.position.y = -0.19; leg.add(shin);
      this.cylinder(shin, 0.086, 0.079, 0.17, C.edge, 0, -0.075, 0);
      this.round(shin, 0.104, C.dark, 0, -0.165, -0.042, 0.9, 0.6, 1.6);
      this.box(shin, 0.16, 0.018, 0.24, C.dark, 0, -0.208, -0.045, 0.005);
    }
  }

  private buildClerk(): void {
    this.clerk.name = 'Colleague using the office coffee shelf'; this.clerk.position.set(1.42, 0, -4.04); this.clerk.rotation.y = Math.PI;
    this.clerk.add(this.clerkBody); this.clerkBody.position.set(0, 0.83, 0);
    this.round(this.clerkBody, 0.3, C.sage, 0, 0, 0, 1.05, 1.2, 0.8);
    for (const x of [-0.055, 0.055]) this.box(this.clerkBody, 0.07, 0.08, 0.035, C.cream, x, 0.2, -0.23, 0.01).rotation.z = x < 0 ? 0.35 : -0.35;
    this.clerkHead.position.set(0, 0.46, 0); this.clerkBody.add(this.clerkHead);
    this.round(this.clerkHead, 0.265, C.skin, 0, 0.03, 0, 0.96, 1.04, 0.9);
    this.round(this.clerkHead, 0.274, C.dark, 0, 0.16, 0.035, 1.01, 0.65, 0.95);
    for (const x of [-0.085, 0.085]) this.round(this.clerkHead, 0.023, C.dark, x, 0.048, -0.24, 0.8, 1, 0.4);
    for (const x of [-0.3, 0.3]) { this.cylinder(this.clerkBody, 0.073, 0.06, 0.32, C.sage, x, -0.08, 0); this.round(this.clerkBody, 0.067, C.skin, x, -0.26, -0.01); }
    this.box(this.clerkBody, 0.15, 0.07, 0.012, C.paper, -0.12, 0.13, -0.247);
  }

  private buildActionProps(): void {
    this.leftHand.add(this.handEnvelope); this.envelope(this.handEnvelope, 0.6, 0.37); this.handEnvelope.position.set(0, 0.015, -0.1); this.handEnvelope.rotation.x = 0.17;
    this.sign(this.handEnvelope, [this.plan?.envelopeId ?? '買い出し代', '領収書・釣銭'], 0.5, 0.26, 0, 0.021, 0, true, '#eddbb8');
    this.body.add(this.wallet); this.wallet.position.set(0.2, 0.68, -0.29);
    this.box(this.wallet, 0.24, 0.17, 0.055, C.wood, 0, 0, 0, 0.02); this.box(this.wallet, 0.2, 0.018, 0.012, C.gold, 0, 0.045, -0.03);
    this.rightHand.add(this.coffee); this.coffee.position.set(-0.025, 0.015, -0.045); this.cup(this.coffee, 0, 0, 0, 0.85);
    this.cylinder(this.flyingCoin, 0.09, 0.09, 0.025, C.gold);
    this.envelope(this.postEnvelope, 0.6, 0.37); this.postEnvelope.position.set(-4.55, 1.1, 3.43); this.postEnvelope.rotation.x = Math.PI / 2;
  }

  resize(width: number, height: number, dpr: number): void {
    this.camera.aspect = Math.max(width, 1) / Math.max(height, 1); this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(dpr, 1.5)); this.renderer.setSize(width, height, false);
  }

  setClues(_found: Set<string>, _nearest: string | null): void { /* No advance clue markers or floating names. */ }

  updatePlayer(x: number, z: number, facing: number, moving: boolean, dt: number): void {
    this.hero.position.set(x, 0, z);
    const turn = THREE.MathUtils.euclideanModulo(facing - this.heroFacing + Math.PI, Math.PI * 2) - Math.PI;
    this.heroFacing += turn * (this.reducedMotion ? 1 : 1 - Math.exp(-18 * Math.min(dt, 0.1))); this.hero.rotation.y = this.heroFacing;
    this.motion = THREE.MathUtils.damp(this.motion, moving ? 1 : 0, moving ? 10 : 15, Math.min(dt, 0.1)); this.playerUpdated = true;
  }

  updateExplorationCamera(x: number, z: number, yaw: number, pitch: number, dt: number, instant = false): void {
    this.camera.clearViewOffset();
    const mobile = this.camera.aspect < 0.8; const distance = mobile ? 9.2 : 8.4;
    const angle = THREE.MathUtils.clamp(pitch, 0.4, 1.05); const horizontal = Math.cos(angle) * distance;
    this.desiredCamera.set(Math.max(-5.55, x + Math.sin(yaw) * horizontal), 0.8 + Math.sin(angle) * distance, Math.max(-4.1, z + Math.cos(yaw) * horizontal));
    const target = point(THREE.MathUtils.clamp(x - Math.sin(yaw), -5.3, 8.2), 0.75, THREE.MathUtils.clamp(z - Math.cos(yaw), -3.8, 3.9));
    const factor = instant || this.reducedMotion ? 1 : 1 - Math.exp(-7 * Math.min(dt, 0.1));
    this.camera.position.lerp(this.desiredCamera, factor); this.cameraTarget.lerp(target, factor); this.camera.lookAt(this.cameraTarget);
    this.camera.fov = mobile ? 56 : 53; this.camera.updateProjectionMatrix();
  }

  showTitle(time: number): void {
    const portrait = this.camera.aspect < 0.8; const framing = portrait ? 1.72 : this.camera.aspect < 1.2 ? 1.25 : 1;
    const drift = this.reducedMotion ? 0 : Math.sin(time * 0.09) * 0.22;
    this.camera.position.set((12.4 + drift) * framing, 12.1 * framing, 16.1 * framing);
    this.cameraTarget.set(0.2, 0.8, -0.3); this.camera.lookAt(this.cameraTarget); this.camera.fov = 40;
    if (this.camera.aspect > 1.2) { const w = this.renderer.domElement.width; const h = this.renderer.domElement.height; this.camera.setViewOffset(w, h, -w * 0.18, 0, w, h); } else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private pose(time: number, walking: number): void {
    const amount = this.reducedMotion ? 0 : walking; const gait = time * 10.6;
    this.leftLeg.rotation.x = Math.sin(gait) * 0.35 * amount; this.rightLeg.rotation.x = -Math.sin(gait) * 0.35 * amount;
    this.leftShin.rotation.x = -Math.max(0, Math.cos(gait)) * 0.55 * amount; this.rightShin.rotation.x = -Math.max(0, -Math.cos(gait)) * 0.55 * amount;
    this.leftArm.rotation.set(-Math.sin(gait - 0.2) * 0.32 * amount, 0, -0.04); this.rightArm.rotation.set(Math.sin(gait - 0.2) * 0.32 * amount, 0, 0.04);
    this.leftForearm.rotation.set(0.1, 0, 0); this.rightForearm.rotation.set(0.1, 0, 0);
    this.leftHand.rotation.set(0, 0, 0); this.rightHand.rotation.set(0, 0, 0);
    this.body.rotation.set(-0.025 * amount, 0, Math.sin(gait) * 0.012 * amount);
    this.body.position.y = this.reducedMotion ? 0 : Math.sin(gait * 2) * 0.014 * amount + Math.sin(time * 2.15) * 0.005 * (1 - amount);
    this.head.rotation.set(0, this.reducedMotion ? 0 : Math.sin(time * 0.5) * 0.045 * (1 - amount), 0);
  }

  private holdLeft(): void { this.leftArm.rotation.set(0.35, 0, 0.1); this.leftForearm.rotation.x = 0.97; this.leftHand.rotation.set(-0.08, 0, -0.12); }
  private holdRight(): void { this.rightArm.rotation.set(0.36, 0, -0.1); this.rightForearm.rotation.x = 0.98; this.rightHand.rotation.set(-0.08, 0, 0.12); }

  update(dt: number, elapsed: number): void {
    if (this.cinematic) return;
    if (!this.playerUpdated) this.motion = THREE.MathUtils.damp(this.motion, 0, 12, Math.min(dt, 0.1)); this.playerUpdated = false;
    this.gaitPhase += Math.min(dt, 0.1) * this.motion; this.pose(this.gaitPhase, this.motion);
    if (!this.reducedMotion && this.motion < 0.05) { this.body.position.y = Math.sin(elapsed * 2.15) * 0.005; this.head.rotation.y = Math.sin(elapsed * 0.45) * 0.045; }
    this.clerkBody.rotation.x = 0; this.clerkHead.rotation.y = this.reducedMotion ? 0 : Math.sin(elapsed * 0.45) * 0.06;
  }

  startEnding(choice: Choice): void { this.reset(); this.cinematic = choice; this.camera.clearViewOffset(); this.updateEnding(0, choice); }

  private route(time: number, start: number, duration: number, points: THREE.Vector3[]): number {
    const t = THREE.MathUtils.clamp((time - start) / duration, 0, 1); const lengths = points.slice(1).map((p, i) => p.distanceTo(points[i]));
    const length = lengths.reduce((a, b) => a + b, 0); let distance = smooth(t) * length;
    this.walkingSpeed = time > start && t < 1 ? 6 * t * (1 - t) * length / duration : 0;
    this.maximumWalkingSpeed = Math.max(this.maximumWalkingSpeed, 1.5 * length / duration);
    for (let i = 0; i < lengths.length; i++) {
      if (distance <= lengths[i] || i === lengths.length - 1) {
        const fraction = lengths[i] ? Math.min(distance / lengths[i], 1) : 0; this.hero.position.lerpVectors(points[i], points[i + 1], fraction);
        const dx = points[i + 1].x - points[i].x; const dz = points[i + 1].z - points[i].z; this.hero.rotation.y = Math.atan2(-dx, -dz); break;
      }
      distance -= lengths[i];
    }
    return time > start && t < 1 ? 1 : 0;
  }

  private countChange(time: number, start: number, duration: number): void {
    const progress = THREE.MathUtils.clamp((time - start) / duration, 0, 1); this.countedCoins = Math.min(6, Math.floor(progress * 6));
    for (let i = 0; i < 6; i++) this.tableCoins[i].visible = i >= this.countedCoins;
    if (progress > 0 && progress < 1) {
      const i = this.countedCoins; const fraction = smooth(progress * 6 - i);
      this.scene.updateWorldMatrix(true, true); const hand = this.rightHand.getWorldPosition(new THREE.Vector3());
      this.flyingCoin.position.lerpVectors(this.tableCoins[Math.min(i, 5)].position, hand, fraction);
      this.flyingCoin.position.y += Math.sin(fraction * Math.PI) * 0.13; this.flyingCoin.rotation.set(0.2, 0, fraction * 1.2); this.flyingCoin.visible = true;
    }
  }

  updateEnding(t: number, choice: Choice): void {
    const time = THREE.MathUtils.clamp(t, 0, 10); this.endingTime = time; this.cinematic = choice;
    this.disposition = 'unassigned'; this.carrying = null; this.countedCoins = 0; this.donatedCoins = 0;
    this.walkingSpeed = 0;
    this.hero.position.set(0, 0, 1.35); this.hero.rotation.set(0, 0, 0); this.pose(time, 0);
    this.tableEnvelope.visible = true; this.receipt.visible = true; this.handEnvelope.visible = false;
    this.wallet.visible = false; this.coffee.visible = false; this.counterCoffee.visible = true; this.flyingCoin.visible = false; this.postEnvelope.visible = false;
    for (const coin of this.tableCoins) coin.visible = true;
    this.donationCoins.count = 0; this.clerkBody.rotation.set(0, 0, 0); this.clerkHead.rotation.set(0, 0, 0);
    this.counterCoffee.position.set(1.65, 1.17, -3.2);
    if (choice === 'A') {
      const walking = this.route(time, 3.1, 3.5, [point(0, 0, 1.35), point(-2.0, 0, 1.7), point(-4.55, 0, 2.0), point(-4.55, 0, 2.12)]);
      this.pose(time, walking); this.holdLeft(); this.holdRight();
      this.countChange(time, 0.3, 1.8);
      this.tableEnvelope.visible = time < 2.45; this.receipt.visible = time < 2.45;
      this.handEnvelope.visible = time >= 2.45 && time < 8.5; this.carrying = this.handEnvelope.visible ? 'envelope' : time < 2.1 ? 'change' : null;
      if (time < 2.45) { this.body.rotation.x = -0.12 * Math.sin(Math.PI * smooth(time / 2.45)); this.head.rotation.x = -0.13; }
      if (time >= 6.6) {
        this.hero.rotation.y = Math.PI; const post = smooth((time - 7.15) / 1.35);
        this.leftArm.rotation.x = 0.55 + post * 1.35; this.leftForearm.rotation.x = 0.8 - post * 0.6;
        this.rightArm.rotation.x = 0.22; this.rightForearm.rotation.x = 0.65;
        if (time >= 7.2 && time < 8.5) {
          this.scene.updateWorldMatrix(true, true); const hand = this.leftHand.getWorldPosition(new THREE.Vector3());
          const target = point(-4.35, 1.05, 2.67); this.postEnvelope.position.lerpVectors(hand, target, post); this.postEnvelope.rotation.set(Math.PI / 2, 0, 0);
          this.handEnvelope.visible = false; this.postEnvelope.visible = true;
        }
        if (time >= 8.5) { this.disposition = 'company'; this.carrying = null; this.leftArm.rotation.x = 0.55 * (1 - smooth((time - 8.5) / 1.0)); this.leftForearm.rotation.x = 0.1; this.rightForearm.rotation.x = 0.1; }
      }
    } else if (choice === 'B') {
      this.holdLeft(); this.holdRight(); this.countChange(time, 0.3, 2.1);
      this.wallet.visible = time >= 1.6 && time < 3.5;
      if (time >= 2.45) { this.disposition = 'personal'; this.carrying = null; }
      if (time >= 3.05) {
        // A quiet step to the cup, then a small sip; no camera orbit or fast montage.
        const walking = this.route(time, 3.05, 3.05, [point(0, 0, 1.35), point(1.96, 0, 1.02), point(1.96, 0, -2.12)]);
        this.pose(time, walking); this.holdRight();
        if (time >= 6.1) {
          const pickup = smooth((time - 6.1) / 0.8);
          this.rightArm.rotation.x = 1.25; this.rightForearm.rotation.x = 1.18;
          this.scene.updateWorldMatrix(true, true);
          const grip = this.coffee.getWorldPosition(new THREE.Vector3());
          this.counterCoffee.position.lerpVectors(point(1.65, 1.17, -3.2), grip, pickup);
          this.carrying = 'coffee';
        }
        if (time >= 6.9) {
          this.hero.rotation.y = Math.PI * 0.86 * smooth((time - 6.9) / 0.65); this.coffee.visible = true; this.counterCoffee.visible = false; this.carrying = 'coffee';
          const sip = Math.sin(Math.PI * smooth((time - 7.1) / 2.0));
          this.rightArm.rotation.x = 1.25 + sip * 0.25; this.rightForearm.rotation.x = 1.18 + sip * 0.35; this.rightHand.rotation.x = -0.12 - sip * 0.12;
          this.head.rotation.x = -sip * 0.08; this.body.position.y = this.reducedMotion ? 0 : Math.sin(time * 1.5) * 0.005;
        }
      }
    } else {
      const walking = this.route(time, 1.7, 3.7, [point(0, 0, 1.35), point(1.99, 0, 1.0), point(2.3, 0, -1.0), point(3.6, 0, -1.0)]);
      this.pose(time, walking); this.holdLeft(); this.holdRight(); this.countChange(time, 0.1, 1.35);
      this.carrying = time >= 0.1 && time < 9.05 ? 'change' : null;
      if (time >= 5.4) {
        this.hero.rotation.y = Math.atan2(-0.9, 0.97); this.rightArm.rotation.set(0.93, 0, -0.14); this.rightForearm.rotation.x = 0.5;
        const progress = THREE.MathUtils.clamp((time - 5.65) / 3.3, 0, 1); this.donatedCoins = Math.min(6, Math.floor(progress * 6)); this.donationCoins.count = this.donatedCoins;
        if (progress > 0 && progress < 1) {
          this.scene.updateWorldMatrix(true, true); const hand = this.rightHand.getWorldPosition(new THREE.Vector3());
          const fraction = smooth(progress * 6 - Math.floor(progress * 6));
          this.flyingCoin.position.lerpVectors(hand, point(4.5, 1.22, -1.97), Math.min(fraction * 1.7, 1));
          this.flyingCoin.position.y += Math.sin(fraction * Math.PI) * 0.18;
          if (fraction > 0.6) this.flyingCoin.position.y -= (fraction - 0.6) / 0.4 * 0.5;
          this.flyingCoin.rotation.set(0, 0, Math.PI / 2); this.flyingCoin.visible = true;
          this.rightForearm.rotation.x += Math.sin(progress * Math.PI * 12) * 0.07;
        }
        if (time >= 8.95) { this.disposition = 'donation'; this.carrying = null; this.flyingCoin.visible = false; this.rightArm.rotation.x = THREE.MathUtils.lerp(0.93, 0.1, smooth((time - 8.95) / 0.8)); this.rightForearm.rotation.x = 0.1; }
        const nod = Math.sin(Math.PI * smooth((time - 8.8) / 1.1)); this.clerkBody.rotation.x = -nod * 0.15; this.clerkHead.rotation.x = -nod * 0.18;
      }
    }
    this.setEndingCamera(choice);
  }

  /** One fixed composition per action protects the viewer from a fast tracking camera. */
  private setEndingCamera(choice: Choice): void {
    this.camera.clearViewOffset(); const mobile = this.camera.aspect < 0.8;
    const targets = { A: point(-2.85, 0.8, 1.9), B: point(0.8, 0.8, -0.3), C: point(2.35, 0.85, -0.1) };
    const portraitPositions = { A: point(-10.2, 12.0, -8.3), B: point(3.7, 8.4, 11.0), C: point(8.0, 10.0, 12.0) };
    const landscapePositions = { A: point(-9.2, 10.0, -7.5), B: point(4.8, 7.1, 9.2), C: point(8.0, 8.3, 10.4) };
    this.cameraTarget.copy(targets[choice]); this.camera.position.copy((mobile ? portraitPositions : landscapePositions)[choice]);
    this.camera.fov = mobile ? choice === 'C' ? 52 : choice === 'A' ? 48 : 45 : 43; this.camera.updateProjectionMatrix(); this.camera.lookAt(this.cameraTarget);
  }

  reset(): void {
    this.cinematic = null; this.endingTime = 0; this.disposition = 'unassigned'; this.carrying = null; this.countedCoins = 0; this.donatedCoins = 0;
    this.walkingSpeed = 0; this.maximumWalkingSpeed = 0;
    this.hero.position.set(0, 0, 3); this.hero.rotation.set(0, 0, 0); this.heroFacing = 0; this.motion = 0; this.gaitPhase = 0; this.playerUpdated = false;
    this.pose(0, 0); this.body.position.set(0, 0, 0); this.body.rotation.set(0, 0, 0); this.head.rotation.set(0, 0, 0);
    this.tableEnvelope.visible = true; this.receipt.visible = true; this.handEnvelope.visible = false; this.wallet.visible = false; this.coffee.visible = false;
    this.counterCoffee.visible = true; this.counterCoffee.position.set(1.65, 1.17, -3.2); this.flyingCoin.visible = false; this.postEnvelope.visible = false;
    for (const coin of this.tableCoins) coin.visible = true;
    this.donationCoins.count = 0; this.clerkBody.rotation.set(0, 0, 0); this.clerkHead.rotation.set(0, 0, 0);
  }

  diagnostics() {
    this.scene.updateWorldMatrix(true, true);
    const coordinates = (v: THREE.Vector3) => ({ x: v.x, y: v.y, z: v.z });
    return {
      clueMarkers: 0, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      hero: { x: this.hero.position.x, z: this.hero.position.z, bodyY: this.body.position.y, leftKnee: this.leftShin.rotation.x, rightKnee: this.rightShin.rotation.x },
      camera: { position: coordinates(this.camera.position), target: coordinates(this.cameraTarget), fixed: !!this.cinematic },
      ending: this.cinematic, endingTime: this.endingTime,
      money: {
        choice: this.cinematic, changeYen: this.changeYen, paidYen: this.plan?.paidYen ?? 5000, purchaseYen: this.plan?.purchaseYen ?? 3200,
        envelopeId: this.plan?.envelopeId ?? '買い出し代', disposition: this.disposition, carrying: this.carrying,
        coinCount: this.donatedCoins, countedCoins: this.countedCoins, tableCoins: this.tableCoins.filter(coin => coin.visible).length,
        envelopeOnTable: this.tableEnvelope.visible, receiptOnTable: this.receipt.visible,
        envelopeInHand: this.handEnvelope.visible, posting: this.postEnvelope.visible, coffeeInHand: this.coffee.visible,
        leftElbow: this.leftForearm.rotation.x, rightElbow: this.rightForearm.rotation.x,
        leftHand: coordinates(this.leftHand.getWorldPosition(new THREE.Vector3())), rightHand: coordinates(this.rightHand.getWorldPosition(new THREE.Vector3())),
        clerkBowing: Math.abs(this.clerkBody.rotation.x) > 0.01,
        walkingSpeed: this.walkingSpeed, maximumWalkingSpeed: this.maximumWalkingSpeed,
        signage: this.plan?.signage ?? {},
      },
    };
  }

  render(): void { this.renderer.render(this.scene, this.camera); }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>(this.materials.values()); const textures = new Set<THREE.Texture>();
    materials.add(this.batchMaterial); if (this.contactMaterial) materials.add(this.contactMaterial);
    this.scene.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); } });
    for (const material of materials) for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    for (const geometry of geometries) geometry.dispose(); for (const texture of textures) texture.dispose(); for (const material of materials) material.dispose(); this.renderer.dispose();
  }
}
