import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Choice, Collider, AmountCasePlan } from './types';

const C = {
  cream: 0xf1eadb, paper: 0xfff9eb, floor: 0xd5b18a, edge: 0x394a48,
  wood: 0xad7854, sage: 0x78958a, teal: 0x326c65, dark: 0x233d3c,
  orange: 0xef8e4b, gold: 0xe2b65e, skin: 0xf5c4a1, metal: 0x526b67,
  blue: 0xa6c6c8, blush: 0xe7c8ae, green: 0x70916b,
};
const smooth = (t: number): number => { const v = THREE.MathUtils.clamp(t, 0, 1); return v * v * (3 - 2 * v); };
const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** CASE 04 renders the chosen amount; the wording and intended amount live in case facts. */
export class AmountWorld {
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
  private clerkArm = new THREE.Group();
  private clerkForearm = new THREE.Group();
  private clerkHand = new THREE.Group();
  private wallet = new THREE.Group();
  private tableEnvelopes = { A: new THREE.Group(), B: new THREE.Group() };
  private handEnvelopes = { A: new THREE.Group(), B: new THREE.Group() };
  private submittedEnvelopes = { A: new THREE.Group(), B: new THREE.Group() };
  private tableCash = new THREE.Group();
  private flyingBill = new THREE.Group();
  private returnedCoin = new THREE.Group();
  private receivedBox = new THREE.Group();
  private counterBox = new THREE.Group();
  private stamp = new THREE.Group();
  private stampMark = new THREE.Group();
  private differenceLabel = new THREE.Group();
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
  private outcome: 'exact' | 'short' | 'extra' | 'unassigned' = 'unassigned';
  private submitted = false;
  private received = false;
  private changeReturned = false;
  private countedBills = 0;
  private walkingSpeed = 0;
  private maximumWalkingSpeed = 0;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(canvas: HTMLCanvasElement, private readonly plan?: AmountCasePlan) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.07; this.renderer.shadowMap.enabled = false;
    this.renderer.setClearColor(0xe5e9df); this.scene.background = new THREE.Color(0xe5e9df);
    this.scene.fog = new THREE.Fog(0xe5e9df, 42, 85);
    this.scene.add(new THREE.HemisphereLight(0xfff2d9, 0x84988d, 2.15));
    const sun = new THREE.DirectionalLight(0xffe1b8, 2.65); sun.position.set(-8, 13, 8); this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xd4edeb, 0.8); fill.position.set(7, 8, -4); this.scene.add(fill);
    this.room.name = 'Yoshinani event preparation room';
    this.scene.add(this.room, this.hero, this.clerk, this.tableCash, this.flyingBill, this.returnedCoin, this.counterBox, this.stamp, this.stampMark, this.differenceLabel);
    for (const choice of ['A', 'B'] as const) this.scene.add(this.tableEnvelopes[choice], this.submittedEnvelopes[choice]);
    this.buildRoom(); this.buildCounter(); this.buildEvidenceProps(); this.buildCharacter(); this.buildClerk(); this.buildActionProps();
    this.batch(this.room);
    this.batch(this.body, new Set([this.head, this.leftLeg, this.rightLeg, this.leftArm, this.rightArm, this.wallet, this.receivedBox]));
    this.batch(this.head);
    this.batch(this.leftLeg, new Set([this.leftShin])); this.batch(this.rightLeg, new Set([this.rightShin]));
    this.batch(this.leftArm, new Set([this.leftForearm])); this.batch(this.rightArm, new Set([this.rightForearm]));
    this.batch(this.leftForearm, new Set([this.leftHand])); this.batch(this.rightForearm, new Set([this.rightHand]));
    this.batch(this.leftHand, new Set(Object.values(this.handEnvelopes))); this.batch(this.rightHand);
    this.batch(this.clerkBody, new Set([this.clerkHead, this.clerkArm])); this.batch(this.clerkHead);
    this.batch(this.clerkArm, new Set([this.clerkForearm])); this.batch(this.clerkForearm, new Set([this.clerkHand])); this.batch(this.clerkHand);
    for (const group of [this.leftShin, this.rightShin, this.wallet, this.receivedBox, this.counterBox, this.tableCash, this.flyingBill, this.returnedCoin, this.stamp, this.stampMark,
      ...Object.values(this.tableEnvelopes), ...Object.values(this.handEnvelopes), ...Object.values(this.submittedEnvelopes)]) this.batch(group);
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
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), this.material(color)); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
  }
  private cylinder(parent: THREE.Object3D, top: number, bottom: number, height: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, 12), this.material(color)); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  private batch(root: THREE.Object3D, excluded = new Set<THREE.Object3D>()): void {
    root.updateWorldMatrix(true, true); const inverse = root.matrixWorld.clone().invert();
    const geometries: THREE.BufferGeometry[] = []; const sources: THREE.Mesh[] = [];
    const visit = (object: THREE.Object3D) => {
      if (excluded.has(object)) return;
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial && !object.material.map && !(object instanceof THREE.InstancedMesh)) {
        let geometry = object.geometry.clone();
        if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
        geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
        const colors = new Float32Array(geometry.getAttribute('position').count * 3); const color = object.material.color;
        for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometries.push(geometry); sources.push(object);
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
  private collision(x: number, z: number, width: number, depth: number): void { this.colliders.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 }); }
  private shadow(parent: THREE.Object3D, x: number, z: number, width: number, depth: number): void {
    if (!this.contactMaterial) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32); gradient.addColorStop(0, 'rgba(65,57,42,.25)'); gradient.addColorStop(0.5, 'rgba(65,57,42,.14)'); gradient.addColorStop(1, 'rgba(65,57,42,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      this.contactMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), this.contactMaterial); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.046, z); mesh.renderOrder = 1; parent.add(mesh);
  }
  private sign(parent: THREE.Object3D, text: string[], w: number, h: number, x: number, y: number, z: number, flat = false, background = '#fff9eb', color = '#326c65'): THREE.Mesh {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = Math.max(128, Math.min(768, Math.round(512 * h / w))); const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const font = Math.min(62, canvas.height / (text.length + 0.8)); ctx.font = `700 ${font}px "Yu Gothic", sans-serif`;
    text.forEach((line, i) => ctx.fillText(line, 256, canvas.height * (i + 0.9) / (text.length + 0.8), 465));
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })); mesh.position.set(x, y, z); if (flat) mesh.rotation.x = -Math.PI / 2; parent.add(mesh); return mesh;
  }
  private lines(key: string, fallback: string[]): string[] { return this.plan?.signage[key]?.split('\n') ?? fallback; }
  private get lowerYen(): number { return this.plan?.lowerYen ?? 9800; }
  private get upperYen(): number { return this.plan?.upperYen ?? 10300; }
  private get requiredYen(): number { return this.plan?.requiredYen ?? 10300; }
  private get requestId(): string { return this.plan?.requestId ?? '備品代'; }
  private amount(choice: Choice): number { return choice === 'B' ? this.upperYen : this.lowerYen; }
  private yen(value: number): string { return `¥${value.toLocaleString('ja-JP')}`; }

  private parcel(parent: THREE.Object3D, x = 0, y = 0, z = 0, scale = 1, label = '催事備品'): void {
    const group = new THREE.Group(); group.position.set(x, y, z); group.scale.setScalar(scale); parent.add(group);
    this.box(group, 0.82, 0.48, 0.58, 0xd4aa78, 0, 0.24, 0, 0.02);
    this.box(group, 0.08, 0.008, 0.58, C.cream, 0, 0.484, 0); this.box(group, 0.08, 0.48, 0.008, C.cream, 0, 0.24, 0.294);
    this.sign(group, [label], 0.55, 0.17, 0, 0.27, 0.301, false, '#fff9eb');
  }
  private buildRoom(): void {
    this.box(this.room, 12.2, 0.36, 9.2, C.edge, 0, -0.22, 0, 0.07); this.box(this.room, 12, 0.12, 9, 0xd6c8ac, 0, -0.005, 0);
    this.box(this.room, 3.2, 0.36, 4.9, C.edge, 7.5, -0.22, 2, 0.07); this.box(this.room, 3.1, 0.12, 4.8, 0xe1d8bd, 7.5, -0.005, 2);
    for (let x = -5.7; x < 6; x += 0.8) this.box(this.room, 0.012, 0.006, 8.95, 0xc2b59a, x, 0.059, 0);
    for (let z = -4; z < 4.5; z += 0.8) this.box(this.room, 11.9, 0.006, 0.012, 0xc2b59a, 0, 0.059, z);
    this.box(this.room, 12.15, 3.45, 0.2, C.cream, 0, 1.73, -4.58, 0.045);
    this.box(this.room, 0.18, 2.7, 9.1, C.cream, -6.04, 1.35, -0.05, 0.045); this.box(this.room, 0.18, 2.7, 4.1, C.cream, 6.04, 1.35, -2.55, 0.045);
    this.box(this.room, 12, 0.13, 0.09, C.wood, 0, 0.14, -4.44); this.box(this.room, 0.09, 0.13, 9, C.wood, -5.92, 0.14, 0);
    this.sign(this.room, ['Y O S H I N A N I', '催 事 準 備 室'], 3.4, 0.62, -2.4, 2.86, -4.455, false, '#326c65', '#fff9eb');
    // A pegboard, tape and packing supplies give the room a workshop identity.
    this.box(this.room, 3.0, 1.35, 0.06, 0xc2a77e, -2.4, 1.85, -4.4, 0.02);
    for (let x = -3.65; x <= -1.15; x += 0.25) for (let y = 1.35; y <= 2.35; y += 0.25) this.cylinder(this.room, 0.018, 0.018, 0.022, C.wood, x, y, -4.35).rotation.x = Math.PI / 2;
    this.box(this.room, 0.1, 0.45, 0.08, C.dark, -3.1, 1.9, -4.28, 0.015); this.box(this.room, 0.36, 0.1, 0.09, C.orange, -3.1, 2.15, -4.26, 0.02);
    this.box(this.room, 0.1, 0.38, 0.04, C.metal, -2.0, 1.92, -4.28); this.round(this.room, 0.1, C.orange, -2, 1.65, -4.25, 1, 1.5, 0.4);
    for (let i = 0; i < 3; i++) this.parcel(this.room, -5 + i * 0.95, 0.07, 3.55, 0.85, ['包装材', '名札', '卓上備品'][i]);
    this.collision(-4.05, 3.55, 2.8, 0.6); this.shadow(this.room, -4.05, 3.55, 3.2, 1);
    // Storage beyond the open doorway remains a usable hallway.
    this.box(this.room, 2.6, 0.012, 1.1, C.sage, 7.3, 0.064, 2.1, 0.07);
    this.sign(this.room, ['搬入口', '催事備品受付 →'], 1.0, 0.5, 5.91, 1.85, -0.8);
    this.parcel(this.room, 8.2, 0.07, 3.5, 1.05, 'YOSHINANI'); this.collision(8.2, 3.5, 0.9, 0.65);
  }
  private buildCounter(): void {
    this.box(this.room, 7.8, 0.98, 0.72, C.sage, -0.15, 0.53, -3.5, 0.055); this.box(this.room, 8.0, 0.16, 0.94, C.wood, -0.15, 1.08, -3.5, 0.05);
    this.box(this.room, 7.68, 0.06, 0.03, C.cream, -0.15, 0.81, -3.125); this.collision(-0.15, -3.5, 7.8, 0.72); this.shadow(this.room, -0.15, -3.5, 8.4, 1.5);
    for (let x = -3.5; x < 3.5; x += 0.62) this.box(this.room, 0.018, 0.63, 0.015, 0x648377, x, 0.47, -3.125);
    this.sign(this.room, ['催事備品', '受 取 窓 口'], 1.65, 0.65, 2.3, 2.55, -4.44, false, '#e7c8ae');
    // Tape dispenser, rolled wrapping paper, labels and a parcel scale; no cafe props.
    this.box(this.room, 0.45, 0.12, 0.33, C.teal, -2.9, 1.22, -3.4, 0.035); this.cylinder(this.room, 0.15, 0.15, 0.1, C.cream, -2.96, 1.4, -3.4).rotation.z = Math.PI / 2;
    for (let i = 0; i < 3; i++) { const roll = this.cylinder(this.room, 0.07, 0.07, 0.95, i % 2 ? C.cream : C.blush, -1.9 + i * 0.2, 1.24, -3.55); roll.rotation.z = Math.PI / 2; }
    this.box(this.room, 0.58, 0.09, 0.48, C.metal, 0.65, 1.205, -3.4, 0.025); this.sign(this.room, ['受 付'], 0.42, 0.18, 0.65, 1.27, -3.4, true, '#a6c6c8');
    this.box(this.room, 0.76, 0.045, 0.46, C.teal, 2.17, 1.19, -3.34, 0.04); this.box(this.room, 0.58, 0.006, 0.31, C.cream, 2.17, 1.216, -3.34, 0.025);
    this.counterBox.position.set(3.14, 1.165, -3.5); this.parcel(this.counterBox, 0, 0, 0, 0.74, '催事備品');
  }
  private shelf(x: number, z: number, w = 1.3, d = 0.8): void {
    this.box(this.room, w, 0.1, d, C.wood, x, 0.91, z, 0.035); for (const px of [x - w * 0.38, x + w * 0.38]) this.box(this.room, 0.08, 0.85, 0.08, C.teal, px, 0.47, z);
    this.collision(x, z, w, d); this.shadow(this.room, x, z, w + 0.35, d + 0.3);
  }
  private buildEvidenceProps(): void {
    this.box(this.room, 3.15, 0.12, 1.5, C.wood, 0, 0.72, -0.1, 0.07); this.box(this.room, 2.98, 0.025, 1.34, 0xd8b28b, 0, 0.793, -0.1, 0.025);
    for (const x of [-1.24, 1.24]) for (const z of [-0.64, 0.44]) this.box(this.room, 0.1, 0.66, 0.1, C.dark, x, 0.35, z, 0.02);
    this.collision(0, -0.1, 3.15, 1.5); this.shadow(this.room, 0, -0.1, 3.8, 2.1);
    this.box(this.room, 0.7, 0.02, 0.82, C.paper, -1.0, 0.823, 0.1); this.sign(this.room, this.lines('request', ['依頼票', this.requestId]), 0.65, 0.73, -1, 0.837, 0.1, true);
    this.sign(this.room, this.lines('envelopes', ['用意する封筒', '立替金']), 0.78, 0.34, 0.95, 0.824, 0.37, true, '#eddbb8');
    for (const [index, choice] of (['A', 'B'] as const).entries()) {
      const envelope = this.tableEnvelopes[choice]; envelope.position.set(0.62 + index * 0.67, 0.828, -0.4); this.envelope(envelope, 0.58, 0.43, this.amount(choice), false);
    }
    // C02 current shift sheet, C03 archival records on separate shelves.
    this.shelf(-4.8, -2, 1.3, 0.9); this.box(this.room, 1.0, 0.035, 0.7, C.teal, -4.8, 0.99, -2); this.sign(this.room, this.lines('assignments', ['以前のチャット', '部長とのやりとり']), 0.92, 0.62, -4.8, 1.011, -2, true);
    this.shelf(-4.9, 1.6, 1.3, 0.9);
    this.box(this.room, 1.02, 0.07, 0.72, C.blush, -4.9, 1.0, 1.6); this.sign(this.room, this.lines('history', ['過去の立替記録', '受付保管']), 0.95, 0.65, -4.9, 1.04, 1.6, true);
    this.box(this.room, 0.045, 0.01, 0.64, C.wood, -4.9, 1.047, 1.6);
    // C05 a counter-side clipboard, C06 previous-day memo.
    this.shelf(4.5, -1.9, 1.06, 0.9); this.box(this.room, 0.75, 0.03, 0.66, C.sage, 4.5, 1.0, -1.9); this.sign(this.room, this.lines('counter', ['備品受取案内', '受付時間']), 0.67, 0.57, 4.5, 1.019, -1.9, true);
    this.shelf(3.4, 1.6, 1.35, 0.8); this.box(this.room, 0.7, 0.02, 0.58, C.paper, 3.4, 0.99, 1.6); this.sign(this.room, this.lines('oldMemo', ['経理から', '封筒のご案内']), 0.62, 0.5, 3.4, 1.003, 1.6, true);
    // C07 is an ordinary taped proofreading memo, without a floating hint.
    this.box(this.room, 0.9, 0.57, 0.025, C.gold, 0.1, 0.75, -3.11); this.sign(this.room, this.lines('dictionary', ['校正メモ', '表記の確認']), 0.81, 0.47, 0.1, 0.75, -3.09, false, '#f1d98d');
  }
  private envelope(parent: THREE.Object3D, width: number, depth: number, amount: number, assigned = true): void {
    this.box(parent, width, 0.033, depth, 0xe1c69b, 0, 0, 0, 0.008);
    this.sign(parent, [assigned ? this.requestId : '立替金', this.yen(amount)], width * 0.84, depth * 0.7, 0, 0.021, 0, true, '#eddbb8');
    const seam = this.box(parent, width * 0.4, 0.006, 0.009, C.wood, -width * 0.12, 0.021, -depth * 0.39); seam.rotation.y = 0.4;
  }


  private buildCharacter(): void {
    this.hero.name = 'Salaryman preparing an event payment'; this.hero.add(this.body); this.shadow(this.hero, 0, 0.01, 0.92, 0.8);
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
    this.clerk.name = 'Event reception staff'; this.clerk.position.set(2.2, 0, -3.96); this.clerk.rotation.y = Math.PI;
    this.clerk.add(this.clerkBody); this.clerkBody.position.set(0, 0.83, 0);
    this.round(this.clerkBody, 0.3, C.teal, 0, 0, 0, 1.05, 1.2, 0.8); this.box(this.clerkBody, 0.15, 0.08, 0.015, C.paper, -0.12, 0.13, -0.247);
    this.box(this.clerkBody, 0.035, 0.25, 0.025, C.orange, 0, 0.07, -0.245);
    this.clerkHead.position.set(0, 0.46, 0); this.clerkBody.add(this.clerkHead);
    this.round(this.clerkHead, 0.265, C.skin, 0, 0.03, 0, 0.96, 1.04, 0.9); this.round(this.clerkHead, 0.274, C.dark, 0, 0.16, 0.035, 1.01, 0.65, 0.95);
    for (const x of [-0.085, 0.085]) this.round(this.clerkHead, 0.023, C.dark, x, 0.048, -0.24, 0.8, 1, 0.4);
    this.clerkBody.add(this.clerkArm); this.clerkArm.position.set(-0.3, 0.08, 0);
    this.cylinder(this.clerkArm, 0.073, 0.061, 0.2, C.teal, 0, -0.08, 0); this.clerkForearm.position.set(0, -0.18, 0); this.clerkArm.add(this.clerkForearm);
    this.round(this.clerkForearm, 0.061, C.skin, 0, 0, 0); this.cylinder(this.clerkForearm, 0.055, 0.05, 0.18, C.skin, 0, -0.08, 0);
    this.clerkHand.position.set(0, -0.18, 0); this.clerkForearm.add(this.clerkHand); this.round(this.clerkHand, 0.066, C.skin, 0, 0, 0, 1.0, 0.6, 1.12);
    this.cylinder(this.clerkBody, 0.073, 0.06, 0.32, C.teal, 0.3, -0.08, 0); this.round(this.clerkBody, 0.067, C.skin, 0.3, -0.26, -0.01);
  }
  private buildActionProps(): void {
    for (const choice of ['A', 'B'] as const) {
      this.leftHand.add(this.handEnvelopes[choice]); this.handEnvelopes[choice].position.set(0, 0.015, -0.1); this.handEnvelopes[choice].rotation.x = 0.17;
      this.envelope(this.handEnvelopes[choice], 0.6, 0.37, this.amount(choice)); this.envelope(this.submittedEnvelopes[choice], 0.6, 0.37, this.amount(choice));
    }
    this.body.add(this.wallet); this.wallet.position.set(0.2, 0.68, -0.29); this.box(this.wallet, 0.24, 0.17, 0.055, C.wood, 0, 0, 0, 0.02);
    this.box(this.wallet, 0.2, 0.018, 0.012, C.gold, 0, 0.045, -0.03);
    this.body.add(this.receivedBox); this.receivedBox.position.set(0, 1.06, -0.48); this.parcel(this.receivedBox, 0, -0.15, 0, 0.74, '催事備品');
    this.tableCash.position.set(-0.05, 0.84, 0.25);
    for (let i = 0; i < 3; i++) { this.box(this.tableCash, 0.36, 0.007, 0.17, 0xa4b595, -0.16 + i * 0.15, i * 0.008, i * 0.03, 0.005); this.box(this.tableCash, 0.08, 0.008, 0.11, 0xd4dec8, -0.17 + i * 0.15, 0.004 + i * 0.008, i * 0.03); }
    this.box(this.flyingBill, 0.36, 0.012, 0.17, 0xa4b595, 0, 0, 0, 0.006); this.box(this.flyingBill, 0.08, 0.013, 0.11, 0xd4dec8);
    this.cylinder(this.returnedCoin, 0.085, 0.085, 0.023, C.gold); this.cylinder(this.returnedCoin, 0.055, 0.055, 0.025, C.gold, 0.08, 0.02, 0.04);
    this.stamp.position.set(2.65, 1.25, -3.6); this.cylinder(this.stamp, 0.065, 0.09, 0.14, C.wood, 0, 0.06, 0); this.box(this.stamp, 0.19, 0.05, 0.12, C.orange, 0, -0.03, 0, 0.015);
    this.stampMark.position.set(2.17, 1.247, -3.32); this.sign(this.stampMark, ['受領'], 0.2, 0.15, 0, 0, 0, true, '#eddbb8', '#d86642');
    const difference = Math.abs(this.upperYen - this.lowerYen);
    this.sign(this.differenceLabel, ['差額', this.yen(difference)], 0.6, 0.33, 2.17, 1.27, -3.0, true, '#fff9eb');
  }

  resize(width: number, height: number, dpr: number): void {
    this.camera.aspect = Math.max(width, 1) / Math.max(height, 1); this.camera.updateProjectionMatrix(); this.renderer.setPixelRatio(Math.min(dpr, 1.5)); this.renderer.setSize(width, height, false);
  }
  setClues(_found: Set<string>, _nearest: string | null): void { /* Only physical papers, never advance markers. */ }
  updatePlayer(x: number, z: number, facing: number, moving: boolean, dt: number): void {
    this.hero.position.set(x, 0, z); const turn = THREE.MathUtils.euclideanModulo(facing - this.heroFacing + Math.PI, Math.PI * 2) - Math.PI;
    this.heroFacing += turn * (this.reducedMotion ? 1 : 1 - Math.exp(-18 * Math.min(dt, 0.1))); this.hero.rotation.y = this.heroFacing;
    this.motion = THREE.MathUtils.damp(this.motion, moving ? 1 : 0, moving ? 10 : 15, Math.min(dt, 0.1)); this.playerUpdated = true;
  }
  updateExplorationCamera(x: number, z: number, yaw: number, pitch: number, dt: number, instant = false): void {
    this.camera.clearViewOffset(); const mobile = this.camera.aspect < 0.8; const distance = mobile ? 9.2 : 8.4;
    const angle = THREE.MathUtils.clamp(pitch, 0.4, 1.05); const horizontal = Math.cos(angle) * distance;
    this.desiredCamera.set(Math.max(-5.55, x + Math.sin(yaw) * horizontal), 0.8 + Math.sin(angle) * distance, Math.max(-4.1, z + Math.cos(yaw) * horizontal));
    const target = point(THREE.MathUtils.clamp(x - Math.sin(yaw), -5.3, 8.2), 0.75, THREE.MathUtils.clamp(z - Math.cos(yaw), -3.8, 3.9));
    const factor = instant || this.reducedMotion ? 1 : 1 - Math.exp(-7 * Math.min(dt, 0.1)); this.camera.position.lerp(this.desiredCamera, factor); this.cameraTarget.lerp(target, factor); this.camera.lookAt(this.cameraTarget);
    this.camera.fov = mobile ? 56 : 53; this.camera.updateProjectionMatrix();
  }
  showTitle(time: number): void {
    const portrait = this.camera.aspect < 0.8; const framing = portrait ? 1.72 : this.camera.aspect < 1.2 ? 1.25 : 1; const drift = this.reducedMotion ? 0 : Math.sin(time * 0.09) * 0.22;
    this.camera.position.set((12.4 + drift) * framing, 12.1 * framing, 16.1 * framing); this.cameraTarget.set(0.2, 0.8, -0.3); this.camera.lookAt(this.cameraTarget); this.camera.fov = 40;
    if (this.camera.aspect > 1.2) { const w = this.renderer.domElement.width; const h = this.renderer.domElement.height; this.camera.setViewOffset(w, h, -w * 0.18, 0, w, h); } else this.camera.clearViewOffset(); this.camera.updateProjectionMatrix();
  }
  private pose(time: number, walking: number): void {
    const amount = this.reducedMotion ? 0 : walking; const gait = time * 10.6;
    this.leftLeg.rotation.x = Math.sin(gait) * 0.35 * amount; this.rightLeg.rotation.x = -Math.sin(gait) * 0.35 * amount;
    this.leftShin.rotation.x = -Math.max(0, Math.cos(gait)) * 0.55 * amount; this.rightShin.rotation.x = -Math.max(0, -Math.cos(gait)) * 0.55 * amount;
    this.leftArm.rotation.set(-Math.sin(gait - 0.2) * 0.32 * amount, 0, -0.04); this.rightArm.rotation.set(Math.sin(gait - 0.2) * 0.32 * amount, 0, 0.04);
    this.leftForearm.rotation.set(0.1, 0, 0); this.rightForearm.rotation.set(0.1, 0, 0); this.leftHand.rotation.set(0, 0, 0); this.rightHand.rotation.set(0, 0, 0);
    this.body.rotation.set(-0.025 * amount, 0, Math.sin(gait) * 0.012 * amount); this.body.position.y = this.reducedMotion ? 0 : Math.sin(gait * 2) * 0.014 * amount + Math.sin(time * 2.15) * 0.005 * (1 - amount);
    this.head.rotation.set(0, this.reducedMotion ? 0 : Math.sin(time * 0.5) * 0.045 * (1 - amount), 0);
  }
  private holdEnvelope(): void { this.leftArm.rotation.set(0.36, 0, 0.08); this.leftForearm.rotation.x = 1.05; this.leftHand.rotation.set(-0.06, 0, -0.08); }
  update(dt: number, elapsed: number): void {
    if (this.cinematic) return; if (!this.playerUpdated) this.motion = THREE.MathUtils.damp(this.motion, 0, 12, Math.min(dt, 0.1)); this.playerUpdated = false;
    this.gaitPhase += Math.min(dt, 0.1) * this.motion; this.pose(this.gaitPhase, this.motion);
    if (!this.reducedMotion && this.motion < 0.05) { this.body.position.y = Math.sin(elapsed * 2.15) * 0.005; this.head.rotation.y = Math.sin(elapsed * 0.45) * 0.045; }
    this.clerkBody.rotation.x = 0; this.clerkHead.rotation.y = this.reducedMotion ? 0 : Math.sin(elapsed * 0.45) * 0.06;
  }
  startEnding(choice: Choice): void { this.reset(); this.cinematic = choice; this.camera.clearViewOffset(); this.updateEnding(0, choice); }
  private route(time: number): number {
    const points = [point(0, 0, 1.35), point(2.2, 0, 1.1), point(2.2, 0, -2.76)]; const duration = 3.8; const start = 2.75;
    const t = THREE.MathUtils.clamp((time - start) / duration, 0, 1); const lengths = points.slice(1).map((p, i) => p.distanceTo(points[i])); const length = lengths.reduce((a, b) => a + b, 0); let distance = smooth(t) * length;
    this.walkingSpeed = time > start && t < 1 ? 6 * t * (1 - t) * length / duration : 0; this.maximumWalkingSpeed = 1.5 * length / duration;
    if (time <= start) { this.hero.position.copy(points[0]); this.hero.rotation.y = 0; return 0; }
    const firstFacing = Math.atan2(points[0].x - points[1].x, points[0].z - points[1].z);
    const turnTowardCounter = smooth((distance - lengths[0] + 0.4) / 0.8);
    const startTurn = smooth((time - start) / 0.35); this.hero.rotation.y = firstFacing * startTurn * (1 - turnTowardCounter);
    for (let i = 0; i < lengths.length; i++) {
      if (distance <= lengths[i] || i === lengths.length - 1) { this.hero.position.lerpVectors(points[i], points[i + 1], Math.min(distance / lengths[i], 1)); break; } distance -= lengths[i];
    }
    return time > start && t < 1 ? 1 : 0;
  }
  updateEnding(t: number, choice: Choice): void {
    const time = THREE.MathUtils.clamp(t, 0, 10); const selected = choice === 'B' ? 'B' : 'A'; const difference = this.amount(selected) - this.requiredYen;
    this.endingTime = time; this.cinematic = choice; this.outcome = difference === 0 ? 'exact' : difference < 0 ? 'short' : 'extra';
    this.submitted = time >= 7.55; this.received = this.outcome !== 'short' && time >= 9.25; this.changeReturned = this.outcome === 'extra' && time >= 9.05;
    this.countedBills = Math.min(3, Math.floor(THREE.MathUtils.clamp((time - 0.2) / 2.1, 0, 1) * 3));
    this.hero.position.set(0, 0, 1.35); this.hero.rotation.set(0, 0, 0); const walking = this.route(time); this.pose(time, walking);
    this.receivedBox.position.set(0, 1.35, -0.48);
    this.tableCash.visible = time < 2.35; this.flyingBill.visible = false; this.returnedCoin.visible = false; this.differenceLabel.visible = false;
    this.wallet.visible = false; this.receivedBox.visible = this.received; this.counterBox.visible = !this.received; this.stampMark.visible = false;
    this.counterBox.position.set(3.14, 1.165, -3.5); this.stamp.position.set(2.65, 1.25, -3.6); this.clerkBody.rotation.set(0, 0, 0); this.clerkHead.rotation.set(0, 0, 0);
    this.clerkArm.rotation.set(0, 0, -0.08); this.clerkForearm.rotation.set(0.15, 0, 0); this.clerkHand.rotation.set(0, 0, 0);
    for (const key of ['A', 'B'] as const) {
      this.tableEnvelopes[key].visible = key !== selected || time < 2.5; this.handEnvelopes[key].visible = key === selected && time >= 2.5 && time < 6.95;
      this.submittedEnvelopes[key].visible = key === selected && time >= 6.95;
      this.submittedEnvelopes[key].position.set(2.17, 1.24, -3.34); this.submittedEnvelopes[key].rotation.set(0, 0, 0);
    }
    if (time < 2.5) {
      this.holdEnvelope(); this.rightArm.rotation.set(0.72, 0, -0.08); this.rightForearm.rotation.x = 1.25;
      this.head.rotation.x = -0.13; this.body.rotation.x = -0.07;
      if (time >= 0.2 && time < 2.3) {
        this.scene.updateWorldMatrix(true, true); const hand = this.rightHand.getWorldPosition(new THREE.Vector3());
        const fraction = smooth(((time - 0.2) / 2.1 * 3) % 1); this.flyingBill.position.lerpVectors(point(-0.05, 0.87, 0.25), hand, fraction);
        this.flyingBill.position.y += Math.sin(fraction * Math.PI) * 0.1; this.flyingBill.rotation.set(0.1, 0.2 * fraction, -0.06); this.flyingBill.visible = true;
      }
    } else this.holdEnvelope();
    if (time >= 6.55) {
      this.hero.rotation.y = 0; const reach = smooth((time - 6.55) / 0.75); this.leftArm.rotation.x = THREE.MathUtils.lerp(0.36, 2.15, reach); this.leftForearm.rotation.x = THREE.MathUtils.lerp(1.05, 0.32, reach);
      this.leftHand.rotation.x = -0.12; this.clerkArm.rotation.x = 1.95 * reach; this.clerkForearm.rotation.x = 0.5 * reach;
      if (time >= 6.95 && time < 7.55) {
        this.scene.updateWorldMatrix(true, true); const hand = this.handEnvelopes[selected].getWorldPosition(new THREE.Vector3()); const transfer = smooth((time - 6.95) / 0.6);
        this.submittedEnvelopes[selected].position.lerpVectors(hand, point(2.17, 1.24, -3.34), transfer); this.submittedEnvelopes[selected].rotation.set(0, 0, 0);
      }
      if (time >= 7.55) {
        const release = smooth((time - 7.55) / 0.65); this.leftArm.rotation.x = THREE.MathUtils.lerp(2.15, 0.1, release); this.leftForearm.rotation.x = THREE.MathUtils.lerp(0.32, 0.15, release);
        this.clerkArm.rotation.x = THREE.MathUtils.lerp(1.95, 0.35, release); this.clerkForearm.rotation.x = 0.5;
      }
    }
    if (time >= 7.55 && this.outcome === 'short') {
      const search = smooth((time - 7.75) / 0.5) * (1 - smooth((time - 9.15) / 0.6)); this.wallet.visible = time >= 7.9 && time < 9.6;
      this.rightArm.rotation.x = 0.45 * search; this.rightForearm.rotation.x = 1.2 * search; this.rightHand.rotation.z = (this.reducedMotion ? 0 : Math.sin(time * 4)) * 0.08 * search;
      this.head.rotation.x = -0.17 * search; const drop = smooth((time - 9.1) / 0.8); this.body.position.y = -0.035 * drop; this.head.rotation.x = -0.14 * drop;
      this.leftArm.rotation.z = 0.09 * drop; this.rightArm.rotation.z = -0.09 * drop; this.clerkHead.rotation.z = 0.045 * smooth((time - 7.8) / 0.7);
    } else if (time >= 7.55) {
      const stamping = smooth((time - 7.65) / 0.9); const press = Math.sin(stamping * Math.PI);
      this.stamp.position.lerpVectors(point(2.65, 1.25, -3.6), point(2.17, 1.32, -3.34), Math.sin(stamping * Math.PI)); this.stamp.position.y -= press * 0.08;
      this.stampMark.visible = time >= 8.1;
      if (this.outcome === 'extra' && time >= 8.1) {
        const returned = smooth((time - 8.1) / 0.95); this.returnedCoin.visible = true; this.returnedCoin.position.lerpVectors(point(2.4, 1.26, -3.56), point(2.17, 1.255, -3.02), returned);
        this.clerkArm.rotation.x = 1.75; this.clerkForearm.rotation.x = 0.5; this.differenceLabel.visible = time >= 8.9;
      }
      if (time >= 8.45 && !this.received) {
        const give = smooth((time - 8.45) / 0.8); this.counterBox.position.lerpVectors(point(3.14, 1.165, -3.5), point(2.2, 1.2, -3.24), give);
        this.clerkBody.rotation.x = -0.05 * Math.sin(give * Math.PI);
      }
      if (time >= 9.05) {
        const take = smooth((time - 9.05) / 0.2); const withdraw = smooth((time - 9.25) / 0.75);
        this.hero.position.set(2.2 - withdraw * 0.3, 0, -2.76 + withdraw * 0.6); this.hero.rotation.y = -Math.PI / 2 * withdraw;
        this.receivedBox.position.y = 1.35 - withdraw * 0.29;
        this.leftArm.rotation.set(0.5 + take * 1.5 - withdraw * 0.75, 0, -0.23); this.rightArm.rotation.set(0.5 + take * 1.5 - withdraw * 0.75, 0, 0.23);
        this.leftForearm.rotation.x = 0.75 + withdraw * 0.4; this.rightForearm.rotation.x = 0.75 + withdraw * 0.4;
        this.head.rotation.x = this.reducedMotion ? 0 : Math.sin(Math.PI * smooth((time - 9.3) / 0.65)) * 0.06;
      }
    }
    this.setEndingCamera();
  }
  private setEndingCamera(): void {
    // Both actors, the table, the walking route and the near counter face remain in one composition.
    this.camera.clearViewOffset(); const portrait = this.camera.aspect < 0.8;
    this.cameraTarget.set(1.1, 0.7, -1.1); this.camera.position.copy(portrait ? point(-7.4, 9.8, 12.2) : point(-6.3, 7.0, 9.7));
    this.camera.fov = portrait ? 49 : 43; this.camera.updateProjectionMatrix(); this.camera.lookAt(this.cameraTarget);
  }
  reset(): void {
    this.cinematic = null; this.endingTime = 0; this.outcome = 'unassigned'; this.submitted = false; this.received = false; this.changeReturned = false; this.countedBills = 0;
    this.walkingSpeed = 0; this.maximumWalkingSpeed = 0; this.hero.position.set(0, 0, 3); this.hero.rotation.set(0, 0, 0); this.heroFacing = 0; this.motion = 0; this.gaitPhase = 0; this.playerUpdated = false;
    this.pose(0, 0); this.body.position.set(0, 0, 0); this.body.rotation.set(0, 0, 0); this.head.rotation.set(0, 0, 0);
    for (const choice of ['A', 'B'] as const) { this.tableEnvelopes[choice].visible = true; this.handEnvelopes[choice].visible = false; this.submittedEnvelopes[choice].visible = false; }
    this.tableCash.visible = false; this.flyingBill.visible = false; this.returnedCoin.visible = false; this.differenceLabel.visible = false; this.wallet.visible = false; this.receivedBox.visible = false;
    this.counterBox.visible = true; this.counterBox.position.set(3.14, 1.165, -3.5); this.stamp.position.set(2.65, 1.25, -3.6); this.stampMark.visible = false;
    this.clerkBody.rotation.set(0, 0, 0); this.clerkHead.rotation.set(0, 0, 0); this.clerkArm.rotation.set(0, 0, -0.08); this.clerkForearm.rotation.set(0.15, 0, 0); this.clerkHand.rotation.set(0, 0, 0);
  }
  diagnostics() {
    this.scene.updateWorldMatrix(true, true); const coordinates = (v: THREE.Vector3) => ({ x: v.x, y: v.y, z: v.z }); const preparedYen = this.cinematic ? this.amount(this.cinematic) : 0;
    return {
      clueMarkers: 0, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      hero: { x: this.hero.position.x, z: this.hero.position.z, bodyY: this.body.position.y, leftKnee: this.leftShin.rotation.x, rightKnee: this.rightShin.rotation.x },
      camera: { position: coordinates(this.camera.position), target: coordinates(this.cameraTarget), fixed: !!this.cinematic }, ending: this.cinematic, endingTime: this.endingTime,
      amount: {
        choice: this.cinematic, baseYen: this.plan?.baseYen ?? 10000, lowerYen: this.lowerYen, upperYen: this.upperYen, requestId: this.requestId,
        preparedYen, requiredYen: this.requiredYen, differenceYen: this.cinematic ? preparedYen - this.requiredYen : 0,
        outcome: this.outcome, submitted: this.submitted, received: this.received, changeReturned: this.changeReturned,
        shortfallYen: this.cinematic ? Math.max(0, this.requiredYen - preparedYen) : 0,
        countedBills: this.countedBills, envelopeInHand: Object.values(this.handEnvelopes).some(envelope => envelope.visible),
        envelopeSubmitted: Object.values(this.submittedEnvelopes).some(envelope => envelope.visible), parcelInHand: this.receivedBox.visible,
        leftElbow: this.leftForearm.rotation.x, rightElbow: this.rightForearm.rotation.x, clerkElbow: this.clerkForearm.rotation.x,
        leftHand: coordinates(this.leftHand.getWorldPosition(new THREE.Vector3())), rightHand: coordinates(this.rightHand.getWorldPosition(new THREE.Vector3())),
        clerkHand: coordinates(this.clerkHand.getWorldPosition(new THREE.Vector3())), walkingSpeed: this.walkingSpeed, maximumWalkingSpeed: this.maximumWalkingSpeed,
        signage: this.plan?.signage ?? {},
      },
    };
  }
  render(): void { this.renderer.render(this.scene, this.camera); }
  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>(this.materials.values()); const textures = new Set<THREE.Texture>(); materials.add(this.batchMaterial); if (this.contactMaterial) materials.add(this.contactMaterial);
    this.scene.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); } });
    for (const material of materials) for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    for (const geometry of geometries) geometry.dispose(); for (const texture of textures) texture.dispose(); for (const material of materials) material.dispose(); this.renderer.dispose();
  }
}


