import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Choice, Collider, StationCasePlan } from './types';

const COLORS = {
  cream: 0xf1eadb, paper: 0xfff9eb, stone: 0xd8cbb2, sage: 0x78958a,
  teal: 0x326c65, dark: 0x233d3c, wood: 0xb9875b, orange: 0xef8e4b,
  yellow: 0xf4c54d, skin: 0xf5c4a1, metal: 0x526b67, blue: 0xa6c6c8,
  green: 0x57845a, road: 0x9da99f, edge: 0x394a48,
};
const smooth = (t: number): number => { const v = THREE.MathUtils.clamp(t, 0, 1); return v * v * (3 - 2 * v); };

/** Stage 02's miniature station. Interpretation and timers belong to GameState. */
export class StationWorld {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 160);
  readonly colliders: Collider[] = [];

  private station = new THREE.Group();
  private scenery = new THREE.Group();
  private clock = new THREE.Group();
  private hourHand = new THREE.Group();
  private minuteHand = new THREE.Group();
  private secondHand = new THREE.Group();
  private bus = new THREE.Group();
  private busDoor = new THREE.Group();
  private passenger = new THREE.Group();
  private bossPassenger = new THREE.Group();
  private boss = new THREE.Group();
  private bossBody = new THREE.Group();
  private bossHead = new THREE.Group();
  private bossLeftLeg = new THREE.Group();
  private bossRightLeg = new THREE.Group();
  private bossLeftArm = new THREE.Group();
  private bossRightArm = new THREE.Group();
  private delivery = new THREE.Group();
  private carriedBox = new THREE.Group();
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
  private materials = new Map<number, THREE.MeshStandardMaterial>();
  private contactMaterial: THREE.MeshBasicMaterial | null = null;
  private digitalCanvas!: HTMLCanvasElement;
  private digitalTexture!: THREE.CanvasTexture;
  private digitalMinutes = -1;
  private clockMinutes = 9 * 60 + 47;
  private cameraTarget = new THREE.Vector3();
  private desiredCamera = new THREE.Vector3();
  private heroFacing = 0;
  private gaitPhase = 0;
  private motion = 0;
  private turnLean = 0;
  private playerUpdated = false;
  private cinematic: Choice | null = null;
  private endingTime = 0;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(canvas: HTMLCanvasElement, private readonly plan?: StationCasePlan) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(0xe7eadf);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = false;
    this.scene.background = new THREE.Color(0xe7eadf);
    this.scene.fog = new THREE.Fog(0xe7eadf, 45, 105);
    this.scene.add(new THREE.HemisphereLight(0xfff6df, 0x899c91, 2.1));
    const sun = new THREE.DirectionalLight(0xffe3c0, 2.8);
    sun.position.set(-7, 16, -9);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xd6eeee, 0.9);
    fill.position.set(8, 7, -9);
    this.scene.add(fill);
    this.station.name = 'Yoshina station forecourt';
    this.scene.add(this.station, this.scenery, this.hero, this.bus, this.boss);
    this.buildForecourt();
    this.buildStation();
    this.buildProps();
    this.buildClock();
    this.buildBus();
    this.buildCharacter();
    this.buildBoss();
    this.buildSurroundings();
    // Every moving part is excluded from the static material batches.
    this.compact(this.station, new Set([this.clock, this.delivery]));
    this.compact(this.clock, new Set([this.hourHand, this.minuteHand, this.secondHand]));
    this.compact(this.scenery);
    this.compact(this.bus, new Set([this.busDoor, this.passenger, this.bossPassenger]));
    this.compact(this.busDoor);
    this.compact(this.passenger);
    this.compact(this.bossPassenger);
    this.compact(this.delivery);
    this.compact(this.body, new Set([this.head, this.leftLeg, this.rightLeg, this.leftArm, this.rightArm, this.carriedBox]));
    this.compact(this.head);
    this.compact(this.leftLeg, new Set([this.leftShin]));
    this.compact(this.rightLeg, new Set([this.rightShin]));
    this.compact(this.leftArm, new Set([this.leftForearm]));
    this.compact(this.rightArm, new Set([this.rightForearm]));
    this.compact(this.leftForearm, new Set([this.leftHand]));
    this.compact(this.rightForearm, new Set([this.rightHand]));
    for (const limb of [this.leftShin, this.rightShin, this.leftHand, this.rightHand, this.carriedBox]) this.compact(limb);
    this.compact(this.bossBody, new Set([this.bossHead, this.bossLeftLeg, this.bossRightLeg, this.bossLeftArm, this.bossRightArm]));
    for (const part of [this.bossHead, this.bossLeftLeg, this.bossRightLeg, this.bossLeftArm, this.bossRightArm]) this.compact(part);
    this.reset();
    this.showTitle(0);
  }

  private material(color: number): THREE.MeshStandardMaterial {
    let material = this.materials.get(color);
    if (!material) {
      const metal = color === COLORS.metal || color === COLORS.edge;
      material = new THREE.MeshStandardMaterial({ color, roughness: metal ? 0.55 : 0.86, metalness: metal ? 0.15 : 0 });
      this.materials.set(color, material);
    }
    return material;
  }

  private cuboid(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.material(color));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  private softBox(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, radius = 0.04): THREE.Mesh {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 3, h / 3, d / 3)), this.material(color));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  private round(parent: THREE.Object3D, radius: number, color: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), this.material(color));
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    return mesh;
  }

  private cylinder(parent: THREE.Object3D, top: number, bottom: number, height: number, color: number, x: number, y: number, z: number, sides = 12): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, sides), this.material(color));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  private collision(x: number, z: number, width: number, depth: number): void {
    this.colliders.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 });
  }

  private signage(key: string, fallback: string[]): string[] {
    const value = this.plan?.signage?.[key];
    return value ? value.split('\n') : fallback;
  }

  private startingClockMinutes(): number {
    return this.plan ? this.plan.startMinutes + this.plan.plazaOffset : 9 * 60 + 47;
  }

  private formatMinutes(minutes: number): string {
    const value = THREE.MathUtils.euclideanModulo(Math.round(minutes), 24 * 60);
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  }

  private outcomeFor(choice: Choice): 'meet' | 'early' | 'late-board' | 'late' {
    return this.plan?.outcomes[choice] ?? (choice === 'A' ? 'meet' : 'late');
  }

  private contactShadow(parent: THREE.Object3D, x: number, z: number, width: number, depth: number, y = 0.052): void {
    if (!this.contactMaterial) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(69,60,45,.34)');
      gradient.addColorStop(0.4, 'rgba(69,60,45,.24)');
      gradient.addColorStop(1, 'rgba(69,60,45,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.contactMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    }
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), this.contactMaterial);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, y, z);
    patch.renderOrder = 1;
    parent.add(patch);
  }

  private compact(root: THREE.Object3D, exclude = new Set<THREE.Object3D>()): void {
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert();
    const batches = new Map<THREE.Material, { geometries: THREE.BufferGeometry[]; sources: THREE.Mesh[] }>();
    const collect = (object: THREE.Object3D) => {
      if (exclude.has(object)) return;
      if (object instanceof THREE.Mesh && !Array.isArray(object.material)) {
        let batch = batches.get(object.material);
        if (!batch) { batch = { geometries: [], sources: [] }; batches.set(object.material, batch); }
        let geometry = object.geometry.clone();
        if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
        geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
        batch.geometries.push(geometry);
        batch.sources.push(object);
      }
      for (const child of object.children) collect(child);
    };
    for (const child of root.children) collect(child);
    for (const [material, batch] of batches) {
      const merged = mergeGeometries(batch.geometries, false);
      if (merged) {
        for (const source of batch.sources) { source.removeFromParent(); source.geometry.dispose(); }
        const mesh = new THREE.Mesh(merged, material);
        mesh.renderOrder = batch.sources[0].renderOrder;
        root.add(mesh);
      }
      for (const geometry of batch.geometries) geometry.dispose();
    }
  }

  /** Lettering is printed on a physical surface, never a floating clue indicator. */
  private label(parent: THREE.Object3D, lines: string[], width: number, height: number, x: number, y: number, z: number, options: { color?: string; background?: string; rotation?: number } = {}): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = Math.max(128, Math.round(512 * height / width));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = options.background ?? '#fff9eb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = options.color ?? '#326c65';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontSize = Math.min(64, canvas.height / (lines.length + 0.6));
    ctx.font = `700 ${fontSize}px "Noto Sans JP", "Yu Gothic", sans-serif`;
    lines.forEach((line, index) => ctx.fillText(line, 256, canvas.height * (index + 0.8) / (lines.length + 0.6), 462));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = options.rotation ?? 0;
    parent.add(mesh);
    return mesh;
  }

  private buildForecourt(): void {
    this.cuboid(this.station, 12.25, 0.4, 9.25, COLORS.edge, 0, -0.27, 0);
    this.cuboid(this.station, 12, 0.12, 9, COLORS.stone, 0, -0.025, 0);
    this.cuboid(this.station, 3.2, 0.4, 5.2, COLORS.edge, 7.55, -0.27, 2);
    this.cuboid(this.station, 3.1, 0.12, 5, 0xd9c7a8, 7.55, -0.025, 2);
    for (let x = -5.5; x < 6; x += 1) for (let z = -4; z < 4.5; z += 1) {
      this.cuboid(this.station, 0.975, 0.008, 0.975, (Math.round(x + z + 0.5) % 4) === 0 ? 0xe2d7c3 : 0xdccfb8, x, 0.042, z);
    }
    for (let z = -0.45; z <= 4.5; z += 1) this.cuboid(this.station, 3, 0.006, 0.018, 0xbaad96, 7.5, 0.049, z);
    // The tactile paving describes an ordinary route through the forecourt.
    this.cuboid(this.station, 0.46, 0.014, 7.7, 0xe4bc66, 2.75, 0.056, 0.4);
    this.cuboid(this.station, 5.45, 0.014, 0.46, 0xe4bc66, 5.25, 0.057, 3.6);
    for (let z = -3.3; z < 4.2; z += 0.27) for (const x of [2.63, 2.75, 2.87]) this.cuboid(this.station, 0.027, 0.012, 0.19, 0xf0cd7d, x, 0.067, z);
    for (let x = 3.05; x < 8; x += 0.27) for (const z of [3.48, 3.6, 3.72]) this.cuboid(this.station, 0.19, 0.012, 0.027, 0xf0cd7d, x, 0.068, z);
    this.cuboid(this.station, 12.1, 0.15, 0.12, COLORS.cream, 0, 0.04, 4.5);
    this.cuboid(this.station, 0.12, 0.15, 8.98, COLORS.cream, -6, 0.04, 0);
    this.cuboid(this.station, 3, 0.15, 0.12, COLORS.cream, 7.5, 0.04, 4.5);
    for (const x of [-5.1, 5.1]) for (const z of [-3.7, 3.7]) this.cuboid(this.station, 0.58, 0.27, 0.6, COLORS.metal, x, -0.6, z);
  }

  private buildStation(): void {
    this.cuboid(this.station, 12.25, 3.1, 0.2, COLORS.cream, 0, 1.52, -4.5);
    this.cuboid(this.station, 12.3, 0.27, 0.78, COLORS.sage, 0, 3.2, -4.42);
    this.cuboid(this.station, 12.3, 0.065, 0.79, COLORS.teal, 0, 3.065, -4.41);
    // The narrow entrance canopy preserves sightlines over the waiting area.
    this.softBox(this.station, 5.25, 0.16, 1.12, COLORS.sage, 0.5, 2.62, -3.98);
    this.cuboid(this.station, 5.15, 0.055, 1.12, 0xa1b5a5, 0.5, 2.52, -3.98);
    for (const x of [-1.95, 2.95]) this.cuboid(this.station, 0.105, 2.5, 0.105, COLORS.metal, x, 1.26, -3.54);
    for (const x of [-0.32, 1.32]) {
      this.cuboid(this.station, 1.5, 2.15, 0.075, COLORS.blue, x, 1.12, -4.35);
      this.cuboid(this.station, 1.4, 0.48, 0.012, 0xc9dfd9, x, 0.65, -4.303);
      this.cuboid(this.station, 0.055, 2.1, 0.07, COLORS.paper, x, 1.12, -4.29);
      this.cuboid(this.station, 1.6, 0.075, 0.09, COLORS.paper, x, 2.23, -4.27);
      for (const lx of [-0.76, 0.76]) this.cuboid(this.station, 0.06, 2.15, 0.09, COLORS.paper, x + lx, 1.12, -4.27);
      this.cuboid(this.station, 0.035, 0.3, 0.05, COLORS.teal, x + 0.42, 1.04, -4.23);
    }
    this.label(this.station, ['よ し な 駅'], 2.3, 0.43, -3.95, 2.55, -4.365, { background: '#326c65', color: '#fff9eb' });
    this.label(this.station, ['YOSHINA STATION'], 2.05, 0.23, -3.95, 2.17, -4.36);
    for (const x of [-4.8, 4.4]) {
      this.softBox(this.station, 1.55, 0.12, 0.56, COLORS.stone, x, 0.15, -3.8);
      this.cuboid(this.station, 1.38, 1.3, 0.035, 0xc6d3c5, x, 1.18, -4.36);
      for (let i = 0; i < 5; i++) this.cuboid(this.station, 1.18, 0.02, 0.025, 0xe2e9d8, x, 0.72 + i * 0.22, -4.327);
    }
  }

  private planter(x: number, z: number, size = 1): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(size);
    this.station.add(group);
    this.contactShadow(group, 0, 0, 0.96, 0.82, 0.052 / size);
    this.cylinder(group, 0.29, 0.23, 0.48, 0xc88664, 0, 0.26, 0);
    this.cylinder(group, 0.305, 0.29, 0.055, 0xd99a76, 0, 0.502, 0);
    this.cylinder(group, 0.27, 0.27, 0.025, 0x705846, 0, 0.524, 0);
    this.cylinder(group, 0.025, 0.035, 0.7, COLORS.wood, 0, 0.86, 0, 6);
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.38;
      const leaf = this.round(group, 0.34, i % 2 ? 0x6f935e : COLORS.green, Math.sin(angle) * 0.28, 0.8 + i * 0.085, Math.cos(angle) * 0.28, 0.7, 0.32, 1.5);
      leaf.rotation.set(0.25, angle, Math.sin(angle) * 0.4);
    }
    this.collision(x, z, size * 0.58, size * 0.58);
  }

  private buildProps(): void {
    // C01: a street-side event poster with a solid wooden frame.
    const poster = new THREE.Group();
    poster.position.set(-3.6, 0, -1.9);
    this.station.add(poster);
    this.contactShadow(poster, 0, 0.08, 1.66, 1.0);
    for (const x of [-0.55, 0.55]) this.cuboid(poster, 0.1, 1.9, 0.1, COLORS.wood, x, 0.97, 0);
    this.softBox(poster, 1.4, 1.43, 0.13, COLORS.wood, 0, 1.29, 0);
    this.cuboid(poster, 1.23, 1.26, 0.015, COLORS.paper, 0, 1.29, 0.08);
    this.label(poster, this.signage('eventPoster', this.plan ? ['イベント案内'] : ['秋の', 'ものづくり展']), 1.07, 0.58, 0, 1.52, 0.092);
    this.round(poster, 0.24, COLORS.orange, -0.26, 1.06, 0.1, 1, 1, 0.09);
    this.cuboid(poster, 0.42, 0.2, 0.025, COLORS.sage, 0.25, 1.03, 0.105);
    for (let i = 0; i < 3; i++) this.cuboid(poster, 0.92 - i * 0.17, 0.02, 0.009, 0xaebcac, 0, 0.83 - i * 0.07, 0.105);
    this.collision(-3.6, -1.9, 1.35, 0.38);

    // C02: a waiting bench, with a coworker's small paper memo on the seat.
    const bench = new THREE.Group();
    bench.position.set(0.5, 0, -2.7);
    this.station.add(bench);
    this.contactShadow(bench, 0, 0.02, 3.05, 1.32);
    for (const x of [-1.02, 1.02]) {
      this.cuboid(bench, 0.13, 0.66, 0.13, COLORS.teal, x, 0.37, 0.22);
      this.cuboid(bench, 0.13, 0.52, 0.13, COLORS.teal, x, 0.3, -0.26);
      this.cuboid(bench, 0.15, 0.06, 0.78, COLORS.teal, x, 0.76, 0);
      this.cuboid(bench, 0.075, 0.76, 0.075, COLORS.metal, x, 0.9, -0.37);
    }
    for (const z of [-0.2, 0.04, 0.28]) this.softBox(bench, 2.7, 0.1, 0.2, COLORS.wood, 0, 0.56, z, 0.018);
    for (const y of [0.89, 1.13]) this.softBox(bench, 2.7, 0.19, 0.075, 0xc79a6e, 0, y, -0.36, 0.012);
    this.cuboid(bench, 0.41, 0.017, 0.31, COLORS.paper, -0.58, 0.627, 0.03).rotation.y = -0.17;
    for (let i = 0; i < 3; i++) this.cuboid(bench, 0.25 - i * 0.035, 0.008, 0.013, COLORS.sage, -0.58, 0.64, -0.055 + i * 0.06);
    this.softBox(bench, 0.4, 0.4, 0.18, COLORS.orange, 0.77, 0.79, -0.04);
    this.collision(0.5, -2.7, 2.65, 0.83);

    // C03: the shuttle route and timetable kiosk.
    const kiosk = new THREE.Group();
    kiosk.position.set(4.7, 0, -2.4);
    this.station.add(kiosk);
    this.contactShadow(kiosk, 0, 0, 1.5, 0.91);
    this.softBox(kiosk, 1.24, 2.16, 0.34, COLORS.teal, 0, 1.12, 0);
    this.cuboid(kiosk, 1.04, 1.44, 0.02, COLORS.paper, 0, 1.29, 0.184);
    this.label(kiosk, ['SHUTTLE', '時刻表'], 0.93, 0.46, 0, 1.91, 0.198);
    for (let i = 0; i < 4; i++) {
      this.cuboid(kiosk, 0.75, 0.018, 0.008, 0xb4c0ac, 0, 1.51 - i * 0.22, 0.202);
      this.cuboid(kiosk, 0.2, 0.06, 0.008, i % 2 ? COLORS.orange : COLORS.sage, -0.21, 1.4 - i * 0.22, 0.204);
      this.cuboid(kiosk, 0.28, 0.035, 0.008, COLORS.blue, 0.19, 1.4 - i * 0.22, 0.204);
    }
    if (this.plan) this.label(kiosk, this.signage('timetable', ['標準時刻', `${this.formatMinutes(this.plan.departureMinutes)} 発`, `${this.formatMinutes(this.plan.departureMinutes + this.plan.travelMinutes)} 着`]), 0.94, 0.85, 0, 1.28, 0.215);
    this.cuboid(kiosk, 1.36, 0.09, 0.57, COLORS.sage, 0, 2.24, 0);
    this.collision(4.7, -2.4, 1.24, 0.4);

    // C04: a fixed voice-record kiosk. It is an ordinary prop until inspected.
    const recorder = new THREE.Group();
    recorder.position.set(-5.1, 0, 1.4);
    this.station.add(recorder);
    this.contactShadow(recorder, 0, 0, 1.42, 1.0);
    this.softBox(recorder, 0.95, 0.8, 0.68, COLORS.sage, 0, 0.45, 0);
    this.softBox(recorder, 1.14, 0.1, 0.84, COLORS.wood, 0, 0.9, 0);
    this.softBox(recorder, 0.54, 0.42, 0.15, COLORS.teal, 0, 1.2, -0.13);
    this.cuboid(recorder, 0.41, 0.23, 0.017, COLORS.blue, 0, 1.25, -0.044);
    for (let i = 0; i < 5; i++) this.cuboid(recorder, 0.018, 0.04 + (i % 3) * 0.035, 0.01, COLORS.paper, -0.14 + i * 0.07, 1.25, -0.033);
    this.cylinder(recorder, 0.06, 0.06, 0.02, COLORS.orange, 0.19, 0.975, 0.17);
    this.cuboid(recorder, 0.35, 0.012, 0.27, COLORS.paper, -0.22, 0.962, 0.17);
    this.label(recorder, this.plan ? ['会議記録'] : ['音声メモ'], 0.72, 0.2, 0, 0.65, 0.351);
    if (this.plan) this.label(recorder, this.signage('referenceClock', ['会議室時計']), 0.44, 0.22, 0, 1.25, -0.02, { background: '#a6c6c8' });
    this.collision(-5.1, 1.4, 1.0, 0.72);

    // C05: a weather panel on a compact ticket-information stand.
    const weather = new THREE.Group();
    weather.position.set(3.7, 0, 1.8);
    this.station.add(weather);
    this.contactShadow(weather, 0, 0, 1.22, 0.94);
    this.softBox(weather, 0.82, 0.65, 0.6, COLORS.cream, 0, 0.36, 0);
    this.cuboid(weather, 0.09, 0.75, 0.09, COLORS.metal, 0, 1.05, 0);
    this.softBox(weather, 1.17, 0.87, 0.13, COLORS.sage, 0, 1.63, 0);
    this.label(weather, ['天気予報'], 0.96, 0.22, 0, 1.92, 0.08);
    this.cuboid(weather, 0.99, 0.43, 0.017, 0xd8e2d5, 0, 1.58, 0.08);
    this.round(weather, 0.145, COLORS.paper, -0.2, 1.61, 0.105, 1.12, 0.64, 0.08);
    this.round(weather, 0.13, COLORS.paper, -0.1, 1.66, 0.105, 1, 0.8, 0.08);
    for (const x of [-0.2, -0.06, 0.08]) this.cuboid(weather, 0.025, 0.09, 0.015, COLORS.blue, x, 1.46, 0.106).rotation.z = -0.3;
    for (let i = 0; i < 2; i++) this.cuboid(weather, 0.27, 0.025, 0.01, COLORS.teal, 0.29, 1.64 - i * 0.1, 0.11);
    if (this.plan) this.label(weather, this.signage('weather', ['天気予報']), 0.99, 0.66, 0, 1.71, 0.123);
    this.collision(3.7, 1.8, 0.86, 0.63);

    // C06: the event parcel; a separate group so boarding can include carrying it.
    this.delivery.position.set(-0.8, 0, 0.6);
    this.station.add(this.delivery);
    this.contactShadow(this.delivery, 0, 0, 1.23, 0.98);
    this.softBox(this.delivery, 0.79, 0.62, 0.63, 0xc99662, 0, 0.36, 0, 0.02);
    this.cuboid(this.delivery, 0.14, 0.014, 0.66, 0xe2c295, 0, 0.681, 0);
    this.cuboid(this.delivery, 0.14, 0.62, 0.017, 0xe2c295, 0, 0.37, 0.327);
    this.label(this.delivery, this.signage('deliveryLabel', this.plan ? ['標準時刻', `${this.formatMinutes(this.plan.deliveryOpen)}～${this.formatMinutes(this.plan.deliveryClose)}`] : ['展示用']), this.plan ? 0.55 : 0.4, this.plan ? 0.29 : 0.19, this.plan ? -0.06 : -0.14, 0.41, 0.341);
    this.collision(-0.8, 0.6, 0.8, 0.64);

    // C07: bus-stop access on the right-hand walkway.
    const stop = new THREE.Group();
    stop.position.set(6.8, 0, 2.4);
    this.station.add(stop);
    this.contactShadow(stop, 0, 0, 0.72, 0.72);
    this.cylinder(stop, 0.23, 0.3, 0.1, COLORS.metal, 0, 0.1, 0);
    this.cylinder(stop, 0.045, 0.055, 1.7, COLORS.teal, 0, 0.91, 0);
    this.softBox(stop, 1.04, 0.72, 0.1, COLORS.teal, 0, 1.9, 0, 0.06);
    this.label(stop, this.signage('walkway', ['SHUTTLE', `徒歩 ${this.plan?.walkMinutes ?? 2} 分`]), 0.91, 0.54, 0, 1.91, 0.068, { background: '#326c65', color: '#fff9eb' });
    this.collision(6.8, 2.4, 0.2, 0.2);
    this.cuboid(this.station, 0.14, 1.0, 2.7, COLORS.cream, 9, 0.48, 0.85);
    // An opening at the south end leads to the shuttle boarding point.
    this.cuboid(this.station, 0.14, 0.15, 0.68, COLORS.cream, 9, 0.05, 4.12);
    this.planter(-5.25, -3.35, 0.88);
    this.planter(-4.35, 3.5, 0.95);
    this.planter(4.95, 3.7, 0.95);
    this.planter(3.65, -3.55, 0.68);
  }

  private buildClock(): void {
    this.clock.position.set(0.52, 3.31, -4.07);
    this.station.add(this.clock);
    const rim = this.cylinder(this.clock, 0.82, 0.82, 0.12, COLORS.teal, 0, 0, 0, 40);
    rim.rotation.x = Math.PI / 2;
    const face = this.cylinder(this.clock, 0.735, 0.735, 0.018, COLORS.paper, 0, 0, 0.073, 40);
    face.rotation.x = Math.PI / 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 512);
    ctx.fillStyle = '#233d3c';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 58px sans-serif';
    for (let n = 1; n <= 12; n++) {
      const angle = n * Math.PI / 6;
      const radius = [12, 3, 6, 9].includes(n) ? 190 : 197;
      if ([12, 3, 6, 9].includes(n)) ctx.fillText(String(n), 256 + Math.sin(angle) * radius, 256 - Math.cos(angle) * radius);
      else { ctx.beginPath(); ctx.arc(256 + Math.sin(angle) * radius, 256 - Math.cos(angle) * radius, 6, 0, Math.PI * 2); ctx.fill(); }
    }
    for (let n = 0; n < 60; n++) {
      const angle = n * Math.PI / 30;
      ctx.strokeStyle = '#78958a'; ctx.lineWidth = n % 5 ? 2 : 4;
      ctx.beginPath();
      ctx.moveTo(256 + Math.sin(angle) * 231, 256 - Math.cos(angle) * 231);
      ctx.lineTo(256 + Math.sin(angle) * (n % 5 ? 222 : 215), 256 - Math.cos(angle) * (n % 5 ? 222 : 215)); ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const numerals = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 1.44), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    numerals.position.z = 0.087;
    this.clock.add(numerals);
    if (this.plan) {
      this.softBox(this.clock, 1.78, 0.26, 0.045, COLORS.cream, 1.75, 0.04, 0.028, 0.009);
      this.label(this.clock, this.signage('plazaClock', ['広場時計']), 1.69, 0.21, 1.75, 0.04, 0.054);
    }
    this.clock.add(this.hourHand, this.minuteHand, this.secondHand);
    this.cuboid(this.hourHand, 0.055, 0.42, 0.025, COLORS.dark, 0, 0.16, 0.104);
    this.cuboid(this.minuteHand, 0.034, 0.63, 0.025, COLORS.dark, 0, 0.265, 0.134);
    this.cuboid(this.secondHand, 0.014, 0.68, 0.019, COLORS.orange, 0, 0.265, 0.158);
    const pin = this.cylinder(this.clock, 0.052, 0.052, 0.035, COLORS.orange, 0, 0, 0.173);
    pin.rotation.x = Math.PI / 2;
    this.digitalCanvas = document.createElement('canvas');
    this.digitalCanvas.width = 256; this.digitalCanvas.height = 80;
    this.digitalTexture = new THREE.CanvasTexture(this.digitalCanvas);
    this.digitalTexture.colorSpace = THREE.SRGBColorSpace;
    const digital = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.325), new THREE.MeshBasicMaterial({ map: this.digitalTexture }));
    digital.position.set(2.33, 2.49, -4.26);
    this.station.add(digital);
    this.setClock(this.startingClockMinutes());
  }

  private setClock(minutes: number, seconds = 0): void {
    this.clockMinutes = minutes;
    this.hourHand.rotation.z = -((minutes / 60) % 12) * Math.PI / 6;
    this.minuteHand.rotation.z = -(minutes % 60) * Math.PI / 30;
    this.secondHand.rotation.z = -seconds * Math.PI / 30;
    const rounded = Math.round(minutes);
    if (rounded !== this.digitalMinutes) {
      this.digitalMinutes = rounded;
      const ctx = this.digitalCanvas.getContext('2d')!;
      ctx.fillStyle = '#326c65'; ctx.fillRect(0, 0, 256, 80);
      ctx.fillStyle = '#fff9eb'; ctx.font = '700 59px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const hours = String(Math.floor(rounded / 60)).padStart(2, '0');
      const mins = String(rounded % 60).padStart(2, '0');
      ctx.fillText(`${hours}:${mins}`, 128, 44);
      this.digitalTexture.needsUpdate = true;
    }
  }

  private buildBus(): void {
    this.bus.name = 'Cream shuttle bus';
    this.contactShadow(this.bus, 0, 0.08, 2.85, 5.3, 0.032);
    this.softBox(this.bus, 2.05, 1.52, 4.45, COLORS.cream, 0, 1.08, 0, 0.16);
    this.softBox(this.bus, 2.09, 0.35, 4.45, COLORS.yellow, 0, 0.69, 0, 0.08);
    this.softBox(this.bus, 2.02, 0.16, 4.3, COLORS.sage, 0, 1.87, 0, 0.06);
    this.cuboid(this.bus, 1.8, 0.72, 0.025, COLORS.blue, 0, 1.38, -2.242);
    this.cuboid(this.bus, 1.6, 0.55, 0.025, COLORS.blue, 0, 1.44, 2.24);
    this.cuboid(this.bus, 0.06, 0.72, 0.02, COLORS.cream, 0, 1.4, -2.268);
    for (const x of [-1.035, 1.035]) {
      for (const z of [-1.32, -0.38, 0.56, 1.5]) this.cuboid(this.bus, 0.02, 0.59, 0.75, COLORS.blue, x, 1.4, z);
      this.cuboid(this.bus, 0.022, 0.035, 3.88, COLORS.paper, x, 1.74, 0.05);
      for (const z of [-1.37, 1.36]) {
        const wheel = this.cylinder(this.bus, 0.36, 0.36, 0.18, COLORS.dark, x, 0.4, z, 16);
        wheel.rotation.z = Math.PI / 2;
        const hub = this.cylinder(this.bus, 0.175, 0.175, 0.19, COLORS.metal, x + Math.sign(x) * 0.025, 0.4, z, 12);
        hub.rotation.z = Math.PI / 2;
      }
    }
    this.cuboid(this.bus, 1.73, 0.13, 0.08, COLORS.metal, 0, 0.47, -2.28);
    for (const x of [-0.72, 0.72]) this.softBox(this.bus, 0.24, 0.17, 0.025, COLORS.paper, x, 0.75, -2.258);
    this.label(this.bus, ['SHUTTLE'], 1.24, 0.22, 0, 1.88, -2.245, { background: '#326c65', color: '#fff9eb', rotation: Math.PI });
    for (const x of [-0.75, 0.75]) this.softBox(this.bus, 0.17, 0.13, 0.026, COLORS.orange, x, 0.73, 2.26);
    this.busDoor.position.set(-1.06, 0.3, 0.38);
    this.bus.add(this.busDoor);
    this.cuboid(this.busDoor, 0.06, 1.35, 0.8, COLORS.teal, 0, 0.68, 0.4);
    this.cuboid(this.busDoor, 0.074, 0.8, 0.68, COLORS.blue, 0, 0.95, 0.4);
    this.cuboid(this.bus, 0.26, 0.12, 0.95, COLORS.metal, -1.09, 0.26, 0.77);
    this.passenger.position.set(-0.92, 0, -0.36);
    this.bus.add(this.passenger);
    this.round(this.passenger, 0.19, COLORS.yellow, 0, 1.17, 0, 0.8, 0.8, 0.8);
    this.round(this.passenger, 0.15, COLORS.skin, 0, 1.46, 0, 0.9, 1, 0.9);
    this.round(this.passenger, 0.154, COLORS.dark, 0, 1.53, 0.03, 0.92, 0.6, 0.92);
  }

  private buildCharacter(): void {
    this.hero.name = 'Salaryman';
    this.hero.add(this.body);
    this.contactShadow(this.hero, 0, 0.01, 0.94, 0.81, 0.054);
    this.round(this.body, 0.29, COLORS.yellow, 0, 0.72, 0, 1.08, 1.17, 0.79);
    this.head.position.set(0, 1.18, 0); this.body.add(this.head);
    this.round(this.head, 0.28, COLORS.skin, 0, 0.05, -0.015, 0.94, 1.06, 0.9);
    this.round(this.head, 0.285, COLORS.dark, 0, 0.16, 0.035, 0.98, 0.73, 0.91).rotation.x = -0.2;
    this.round(this.head, 0.11, COLORS.dark, -0.17, 0.18, -0.14, 1.1, 0.85, 0.65);
    for (const x of [-0.087, 0.087]) this.round(this.head, 0.025, COLORS.dark, x, 0.065, -0.252, 0.75, 1.2, 0.45);
    this.round(this.head, 0.043, COLORS.skin, 0, 0.02, -0.269, 0.78, 0.8, 0.78);
    for (const x of [-0.259, 0.259]) this.round(this.head, 0.047, COLORS.skin, x, 0.035, -0.007, 0.6, 1, 1);
    for (const x of [-0.06, 0.06]) this.cuboid(this.body, 0.027, 0.043, 0.015, COLORS.paper, x, 0.91, -0.218);
    this.cuboid(this.body, 0.058, 0.21, 0.02, COLORS.teal, 0, 0.81, -0.235).rotation.z = -0.07;
    this.body.add(this.leftArm, this.rightArm);
    this.leftArm.position.set(-0.29, 0.84, 0); this.rightArm.position.set(0.29, 0.84, 0);
    for (const [arm, forearm, hand] of [[this.leftArm, this.leftForearm, this.leftHand], [this.rightArm, this.rightForearm, this.rightHand]]) {
      this.round(arm, 0.105, COLORS.yellow, 0, -0.045, 0, 1, 1.3, 1);
      this.cylinder(arm, 0.061, 0.057, 0.105, COLORS.skin, 0, -0.145, 0, 8);
      forearm.position.y = -0.19;
      arm.add(forearm);
      this.round(forearm, 0.059, COLORS.skin, 0, 0, 0);
      this.cylinder(forearm, 0.055, 0.048, 0.155, COLORS.skin, 0, -0.078, 0, 8);
      hand.position.y = -0.18;
      forearm.add(hand);
      this.round(hand, 0.064, COLORS.skin, 0, 0, 0, 0.92, 0.66, 1.06);
    }
    this.body.add(this.leftLeg, this.rightLeg);
    this.leftLeg.position.set(-0.12, 0.48, 0); this.rightLeg.position.set(0.12, 0.48, 0);
    for (const [leg, shin] of [[this.leftLeg, this.leftShin], [this.rightLeg, this.rightShin]]) {
      this.cylinder(leg, 0.093, 0.087, 0.2, COLORS.teal, 0, -0.09, 0, 8);
      shin.position.y = -0.19; leg.add(shin);
      this.cylinder(shin, 0.087, 0.079, 0.17, COLORS.teal, 0, -0.075, 0, 8);
      this.round(shin, 0.105, COLORS.dark, 0, -0.165, -0.04, 0.9, 0.62, 1.6);
      this.softBox(shin, 0.16, 0.018, 0.24, COLORS.edge, 0, -0.208, -0.045, 0.005);
    }
    this.body.add(this.carriedBox);
    this.carriedBox.position.set(0, 0.67, -0.43);
    this.softBox(this.carriedBox, 0.57, 0.39, 0.43, 0xc99662, 0, 0, 0, 0.02);
    this.cuboid(this.carriedBox, 0.1, 0.012, 0.44, 0xe2c295, 0, 0.2, 0);
    this.cuboid(this.carriedBox, 0.1, 0.38, 0.013, 0xe2c295, 0, 0, -0.224);
  }

  private buildBoss(): void {
    this.boss.name = 'Boss waiting by the shuttle shelter';
    this.boss.add(this.bossBody);
    this.contactShadow(this.boss, 0, 0.01, 1.02, 0.87, 0.054);
    // The same sage jacket, cream shirt, orange tie and round teal glasses as the portrait.
    this.round(this.bossBody, 0.32, COLORS.sage, 0, 0.78, 0, 1.05, 1.21, 0.8);
    this.softBox(this.bossBody, 0.24, 0.39, 0.025, COLORS.cream, 0, 0.83, -0.25, 0.009);
    for (const x of [-0.145, 0.145]) {
      const lapel = this.cuboid(this.bossBody, 0.1, 0.3, 0.028, COLORS.teal, x, 0.88, -0.265);
      lapel.rotation.z = x < 0 ? -0.25 : 0.25;
    }
    this.cuboid(this.bossBody, 0.057, 0.27, 0.028, COLORS.orange, 0, 0.81, -0.279);
    this.bossHead.position.set(0, 1.27, 0);
    this.bossBody.add(this.bossHead);
    this.round(this.bossHead, 0.29, COLORS.skin, 0, 0.04, -0.01, 0.97, 1.02, 0.9);
    this.round(this.bossHead, 0.292, COLORS.dark, 0, 0.16, 0.035, 0.99, 0.64, 0.9);
    for (const x of [-0.25, 0.25]) {
      this.round(this.bossHead, 0.08, 0xaab6a7, x, 0.11, 0.005, 0.39, 0.8, 0.8);
      this.round(this.bossHead, 0.049, COLORS.skin, x * 1.08, 0.03, 0.005, 0.6, 1, 1);
    }
    for (const x of [-0.098, 0.098]) {
      this.round(this.bossHead, 0.024, COLORS.dark, x, 0.055, -0.263, 0.65, 0.9, 0.45);
      const glasses = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.013, 5, 16), this.material(COLORS.teal));
      glasses.position.set(x, 0.058, -0.283);
      this.bossHead.add(glasses);
    }
    this.cuboid(this.bossHead, 0.052, 0.012, 0.015, COLORS.teal, 0, 0.067, -0.294);
    this.round(this.bossHead, 0.041, COLORS.skin, 0, 0.013, -0.295, 0.75, 0.8, 0.8);
    this.cuboid(this.bossHead, 0.075, 0.012, 0.018, COLORS.wood, 0, -0.072, -0.27);
    this.bossBody.add(this.bossLeftLeg, this.bossRightLeg, this.bossLeftArm, this.bossRightArm);
    this.bossLeftLeg.position.set(-0.125, 0.5, 0); this.bossRightLeg.position.set(0.125, 0.5, 0);
    for (const leg of [this.bossLeftLeg, this.bossRightLeg]) {
      this.cylinder(leg, 0.098, 0.085, 0.37, COLORS.edge, 0, -0.17, 0, 8);
      this.round(leg, 0.108, COLORS.dark, 0, -0.36, -0.045, 0.93, 0.66, 1.6);
    }
    this.bossLeftArm.position.set(-0.32, 0.91, 0); this.bossRightArm.position.set(0.32, 0.91, 0);
    for (const arm of [this.bossLeftArm, this.bossRightArm]) {
      this.cylinder(arm, 0.085, 0.061, 0.31, COLORS.sage, 0, -0.13, 0, 8);
      this.round(arm, 0.071, COLORS.skin, 0, -0.32, 0, 0.88, 1, 0.88);
    }
    // A small seated figure on the platform-facing window records the shared departure.
    this.bossPassenger.position.set(-1.075, 0, -1.3);
    this.bus.add(this.bossPassenger);
    this.round(this.bossPassenger, 0.19, COLORS.sage, 0, 1.19, 0, 0.22, 0.78, 0.85);
    this.round(this.bossPassenger, 0.145, COLORS.skin, 0, 1.48, 0, 0.22, 1, 0.9);
    this.round(this.bossPassenger, 0.149, COLORS.dark, 0, 1.55, 0.02, 0.23, 0.58, 0.9);
    for (const z of [-0.052, 0.052]) {
      const glasses = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.009, 4, 12), this.material(COLORS.teal));
      glasses.rotation.y = Math.PI / 2;
      glasses.position.set(-0.039, 1.475, z);
      this.bossPassenger.add(glasses);
    }
    if (!this.plan) this.collision(7.85, 1.7, 0.49, 0.47);
  }

  private buildSurroundings(): void {
    this.cuboid(this.scenery, 95, 0.18, 80, 0xd7dfcf, 7, -0.89, -3);
    this.cuboid(this.scenery, 5.15, 0.1, 130, COLORS.road, 11.65, -0.1, -50);
    this.cuboid(this.scenery, 0.15, 0.18, 130, COLORS.cream, 9.1, -0.03, -50);
    for (let z = -109; z < 12; z += 4) this.cuboid(this.scenery, 0.075, 0.009, 1.85, 0xeff0d9, 13.36, -0.044, z);
    for (let z = 0.5; z < 4; z += 0.37) this.cuboid(this.scenery, 0.1, 0.01, 0.22, COLORS.paper, 9.62, -0.041, z);
    this.cuboid(this.scenery, 4, 0.38, 2.3, COLORS.stone, 11.6, -0.32, 5.45);
    this.cuboid(this.scenery, 3.1, 0.14, 0.8, COLORS.stone, 11.3, -0.18, 4.6);
    for (const [x, z, height] of [[-12, -15, 5], [-6, -19, 7], [2, -18, 4.7], [6.5, -20, 6]]) {
      this.softBox(this.scenery, 4.8, height, 4.1, 0xd2d9c9, x, height / 2 - 0.75, z, 0.12);
      this.cuboid(this.scenery, 4.9, 0.22, 4.2, 0xb8c8b7, x, height - 0.65, z);
      for (let y = 0.7; y < height - 0.7; y += 1.1) for (const wx of [-1.5, 0, 1.5]) this.cuboid(this.scenery, 0.66, 0.55, 0.022, 0xb3c9bd, x + wx, y, z + 2.06);
    }
    for (const [x, z, size] of [[-10, -6, 1.4], [-9, 4, 1.15], [17, -6, 1.4], [16, 7, 1.15]]) {
      this.cylinder(this.scenery, 0.14, 0.22, 2.4 * size, COLORS.wood, x, 0.4 * size, z);
      this.round(this.scenery, 1.65 * size, 0x8da68a, x, 2.5 * size, z, 1, 1.16, 1);
      this.round(this.scenery, 1.25 * size, 0xa4b59a, x - 0.65 * size, 2.8 * size, z - 0.5 * size);
    }
    // A covered boarding shelter joins the physical walkway to the lane.
    for (const z of [0.6, 3.35]) this.cuboid(this.scenery, 0.09, 2.2, 0.09, COLORS.metal, 8.65, 1.1, z);
    this.softBox(this.scenery, 1.42, 0.12, 3.2, COLORS.sage, 8.55, 2.24, 1.97);
  }

  resize(width: number, height: number, dpr: number): void {
    this.camera.aspect = Math.max(width, 1) / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(dpr, 1.5));
    this.renderer.setSize(width, height, false);
  }

  updatePlayer(x: number, z: number, facing: number, moving: boolean, dt: number): void {
    this.hero.position.set(x, 0, z);
    const turn = THREE.MathUtils.euclideanModulo(facing - this.heroFacing + Math.PI, Math.PI * 2) - Math.PI;
    this.heroFacing += turn * (this.reducedMotion ? 1 : 1 - Math.exp(-18 * Math.min(dt, 0.1)));
    this.hero.rotation.y = this.heroFacing;
    this.turnLean = THREE.MathUtils.damp(this.turnLean, moving ? THREE.MathUtils.clamp(turn * 0.04, -0.045, 0.045) : 0, 9, Math.min(dt, 0.1));
    this.motion = THREE.MathUtils.damp(this.motion, moving ? 1 : 0, moving ? 10 : 15, Math.min(dt, 0.1));
    this.playerUpdated = true;
  }

  updateExplorationCamera(x: number, z: number, yaw: number, pitch: number, dt: number, instant = false): void {
    this.camera.clearViewOffset();
    const angle = THREE.MathUtils.clamp(pitch, 0.35, 1.05);
    const mobile = this.camera.aspect < 0.8;
    const distance = mobile ? 11.2 : 8.8;
    const horizontal = Math.cos(angle) * distance;
    const cx = Math.max(x + Math.sin(yaw) * horizontal, -5.6);
    const cz = Math.max(z + Math.cos(yaw) * horizontal, -4.12);
    const actualHorizontal = Math.hypot(cx - x, cz - z);
    const height = Math.sqrt(Math.max(distance * distance - actualHorizontal * actualHorizontal, 0));
    this.desiredCamera.set(cx, 0.8 + Math.max(Math.sin(angle) * distance, height), cz);
    const target = new THREE.Vector3(THREE.MathUtils.clamp(x - Math.sin(yaw) * 1.25, -5.4, 8.5), 0.75, THREE.MathUtils.clamp(z - Math.cos(yaw) * 1.25, -3.9, 4));
    const factor = instant || this.reducedMotion ? 1 : 1 - Math.exp(-7 * Math.min(dt, 0.1));
    this.camera.position.lerp(this.desiredCamera, factor);
    this.cameraTarget.lerp(target, factor);
    this.camera.lookAt(this.cameraTarget);
    this.camera.fov = mobile ? 56 : 53;
    this.camera.updateProjectionMatrix();
  }

  showTitle(time: number): void {
    const framing = this.camera.aspect < 0.75 ? 1.8 : this.camera.aspect < 1.2 ? 1.3 : 1;
    const drift = this.reducedMotion ? 0 : Math.sin(time * 0.09) * 0.6;
    this.camera.position.set((17.2 + drift) * framing, 14.5 * framing, 20 * framing);
    this.cameraTarget.set(2.3, 0.7, -0.1);
    this.camera.lookAt(this.cameraTarget);
    this.camera.fov = 40;
    if (this.camera.aspect > 1.2) {
      const width = this.renderer.domElement.width; const height = this.renderer.domElement.height;
      this.camera.setViewOffset(width, height, -width * 0.18, 0, width, height);
    } else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  setClues(_found: Set<string>, _nearest: string | null): void {
    // Facts are revealed through inspection. Props never advertise unseen clues.
  }

  private pose(gait: number, amount: number, elapsed: number): void {
    const movement = this.reducedMotion ? 0 : amount;
    this.leftLeg.rotation.x = Math.sin(gait) * 0.36 * movement;
    this.rightLeg.rotation.x = -Math.sin(gait) * 0.36 * movement;
    this.leftShin.rotation.x = -Math.max(0, Math.cos(gait)) * 0.58 * movement;
    this.rightShin.rotation.x = -Math.max(0, -Math.cos(gait)) * 0.58 * movement;
    this.leftArm.rotation.x = -Math.sin(gait - 0.2) * 0.34 * movement;
    this.rightArm.rotation.x = Math.sin(gait - 0.2) * 0.34 * movement;
    this.leftForearm.rotation.x = this.rightForearm.rotation.x = 0.08 + 0.06 * movement;
    this.leftHand.rotation.set(0, 0, 0); this.rightHand.rotation.set(0, 0, 0);
    const breathe = this.reducedMotion ? 0 : Math.sin(elapsed * 2.15) * (1 - movement) * 0.006;
    this.body.position.y = breathe + Math.sin(gait * 2) * 0.016 * movement;
    this.body.rotation.x = -0.035 * movement;
    this.body.rotation.z = this.reducedMotion ? 0 : Math.sin(gait) * 0.016 * movement - this.turnLean;
    this.head.rotation.x = this.reducedMotion ? 0 : Math.sin(gait + 0.25) * 0.018 * movement;
    this.head.rotation.y = this.reducedMotion ? 0 : Math.sin(elapsed * 0.45) * 0.055 * (1 - movement);
    this.leftArm.rotation.z = this.reducedMotion ? 0 : -0.045 - breathe * 1.7;
    this.rightArm.rotation.z = this.reducedMotion ? 0 : 0.045 + breathe * 1.7;
  }

  update(dt: number, elapsed: number): void {
    if (this.cinematic) return;
    if (!this.playerUpdated) this.motion = THREE.MathUtils.damp(this.motion, 0, 12, Math.min(dt, 0.1));
    this.playerUpdated = false;
    this.gaitPhase += Math.min(dt, 0.1) * 10.6 * this.motion;
    this.pose(this.gaitPhase, this.motion, elapsed);
    this.poseBoss(elapsed, false);
    this.setClock(this.startingClockMinutes(), elapsed % 60);
  }

  private supportParcel(amount = 1): void {
    // Lowering the arms with a positive X rotation points the hands toward local -Z.
    // The upper arms stay near the torso; the bent elbows bring both palms to the box.
    this.leftArm.rotation.x = this.rightArm.rotation.x = 0.3 * amount;
    this.leftArm.rotation.z = 0.1 * amount; this.rightArm.rotation.z = -0.1 * amount;
    this.leftForearm.rotation.x = this.rightForearm.rotation.x = 0.9 * amount;
    this.leftHand.rotation.set(-0.08 * amount, 0, -0.14 * amount);
    this.rightHand.rotation.set(-0.08 * amount, 0, 0.14 * amount);
  }

  private poseBoss(time: number, walking: boolean): void {
    const movement = walking && !this.reducedMotion ? 1 : 0;
    const gait = time * 9.8;
    this.bossLeftLeg.rotation.x = Math.sin(gait) * 0.32 * movement;
    this.bossRightLeg.rotation.x = -Math.sin(gait) * 0.32 * movement;
    this.bossLeftArm.rotation.x = -Math.sin(gait) * 0.24 * movement;
    this.bossRightArm.rotation.x = Math.sin(gait) * 0.24 * movement;
    this.bossBody.position.y = this.reducedMotion ? 0 : Math.sin(time * 2) * (walking ? 0.013 : 0.006);
    this.bossBody.rotation.z = this.reducedMotion ? 0 : Math.sin(time * 0.7) * 0.008 * (1 - movement);
    this.bossHead.rotation.y = this.reducedMotion || walking ? 0 : Math.sin(time * 0.5) * 0.055;
  }

  startEnding(choice: Choice): void {
    this.reset();
    this.cinematic = choice;
    this.camera.clearViewOffset();
    this.updateEnding(0, choice);
  }

  updateEnding(t: number, choice: Choice): void {
    const time = THREE.MathUtils.clamp(t, 0, 8);
    this.endingTime = time;
    this.cinematic = choice;
    const outcome = this.outcomeFor(choice);
    const meeting = outcome === 'meet' || outcome === 'late-board';
    const early = outcome === 'early';
    const slowArrival = early || (!this.plan && choice === 'C');
    const finalMinutes = this.plan ? this.plan.arrivalMinutes[choice] + this.plan.plazaOffset : choice === 'A' ? 9 * 60 + 50 : choice === 'B' ? 10 * 60 + 5 : 10 * 60 + 10;
    this.setClock(THREE.MathUtils.lerp(this.startingClockMinutes(), finalMinutes, smooth(time / 1.3)));
    const departure = early ? 0 : Math.max(0, time - (meeting ? 5.25 : 0.7));
    const acceleration = 0.35;
    const speed = meeting ? 40 : 20;
    const travel = speed * (departure < acceleration ? departure * departure / (2 * acceleration) : departure - acceleration / 2);
    this.bus.position.set(10.45, 0, 2.3 - travel);
    this.bus.rotation.y = 0;
    this.bus.visible = true;
    this.passenger.visible = meeting && time >= 5.15;
    this.bossPassenger.visible = !early && (!meeting || time >= 4.75);
    this.boss.visible = meeting && !this.bossPassenger.visible;
    this.delivery.visible = time < 0.8;
    this.carriedBox.visible = time >= 0.8;
    this.carriedBox.position.y = THREE.MathUtils.lerp(0.4, 0.67, smooth((time - 0.8) / 0.45));
    this.hero.visible = !meeting || time < 5.15;
    this.busDoor.rotation.y = meeting ? -Math.PI * 0.55 * smooth((time - 3.7) / 0.6) * (1 - smooth((time - 4.8) / 0.45)) : 0;
    const start = meeting ? 1.25 : slowArrival ? 1.85 : 1.45;
    const duration = meeting ? 2.75 : slowArrival ? 4.0 : 3.1;
    const walk = THREE.MathUtils.clamp((time - start) / duration, 0, 1);
    const firstLeg = THREE.MathUtils.clamp(walk / 0.3, 0, 1);
    const secondLeg = THREE.MathUtils.clamp((walk - 0.3) / 0.7, 0, 1);
    const x = walk < 0.3 ? THREE.MathUtils.lerp(-0.8, 1.45, firstLeg) : THREE.MathUtils.lerp(1.45, 8.25, secondLeg);
    const z = THREE.MathUtils.lerp(1.35, 3.65, firstLeg);
    this.hero.position.set(x, 0, z);
    this.hero.rotation.y = walk < 0.3 ? Math.atan2(-2.25, -2.3) : -Math.PI / 2;
    const walking = walk > 0 && walk < 1 ? 1 : 0;
    const gaitSpeed = !meeting && !slowArrival ? 16.2 : 10.6;
    this.pose(time * gaitSpeed, walking, time);
    if (time >= 1.25) {
      this.supportParcel();
    } else {
      this.hero.rotation.y = 0;
      const bend = Math.sin(Math.PI * THREE.MathUtils.clamp(time / 1.25, 0, 1));
      this.body.rotation.x = -0.24 * bend;
      this.body.position.y = -0.065 * bend;
      this.head.rotation.x = -0.1 * bend;
      this.supportParcel(smooth(time / 0.55));
    }
    if (meeting && time >= 4) {
      const board = smooth((time - 4) / 1.15);
      this.hero.position.set(THREE.MathUtils.lerp(8.25, 9.58, board), Math.sin(board * Math.PI) * 0.14, THREE.MathUtils.lerp(3.65, 3.07, board));
      this.hero.rotation.y = -Math.PI / 2;
      this.pose(time * 10.6, time < 5.15 ? 1 : 0, time);
      this.supportParcel();
    }
    if (!meeting && !slowArrival && walk >= 1) {
      this.hero.rotation.y = -Math.PI / 2 + 0.25;
      this.head.rotation.y = 0.55;
      this.body.rotation.x = time < 6.2 ? -0.14 : 0.1 * smooth((time - 6.2) / 1.4);
      this.head.rotation.x = 0.17 * smooth((time - 6.2) / 1.2);
    }
    if (slowArrival && walk >= 1) {
      this.hero.rotation.y = -Math.PI / 2 + 0.25;
      this.head.rotation.y = this.reducedMotion ? 0 : Math.sin((time - 5.85) * 2.6) * 0.43;
      this.body.position.y = this.reducedMotion ? 0 : Math.sin(time * 1.8) * 0.005;
    }
    // A successful arrival meets the boss and boards together, independent of choice letter.
    if (meeting) {
      const approach = smooth((time - 2.9) / 1.1);
      const board = smooth((time - 4) / 0.75);
      this.boss.position.set(THREE.MathUtils.lerp(7.85, 8.5, approach) + board * 1.08, Math.sin(board * Math.PI) * 0.12, THREE.MathUtils.lerp(1.7, 3.05, approach));
      this.boss.rotation.y = time < 2.9 ? Math.atan2(-(this.hero.position.x - this.boss.position.x), -(this.hero.position.z - this.boss.position.z)) : time < 4 ? Math.atan2(-0.65, -1.35) : -Math.PI / 2;
      this.poseBoss(time, time > 2.9 && time < 4.75);
    }
    // Start with the station clock in view, then hold the missed/boarded shuttle.
    const mobile = this.camera.aspect < 0.8;
    const framing = mobile ? 1.46 : 1;
    const focus = smooth((time - 1.1) / 3.4);
    this.camera.position.set(THREE.MathUtils.lerp(-1.7, 1.0, focus) * framing, (mobile ? 14.7 : 11.3), (mobile ? 21.2 : 17.5));
    this.cameraTarget.set(THREE.MathUtils.lerp(2, 6.2, focus), 1.0, THREE.MathUtils.lerp(-0.3, 1.6, focus));
    this.camera.fov = mobile ? 48 : 43;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateWorldMatrix(true, false);
    // Keep driving at full speed. Hide only when the entire moving bus leaves the view.
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    const bounds = new THREE.Sphere(this.bus.position.clone().add(new THREE.Vector3(0, 1.0, 0)), 3.1);
    if (travel > 18 && !frustum.intersectsSphere(bounds)) this.bus.visible = false;
  }

  reset(): void {
    this.cinematic = null; this.endingTime = 0;
    this.hero.visible = true; this.hero.position.set(0, 0, 3); this.hero.rotation.set(0, 0, 0);
    this.heroFacing = 0; this.motion = 0; this.gaitPhase = 0; this.turnLean = 0; this.playerUpdated = false;
    this.body.position.set(0, 0, 0); this.body.rotation.set(0, 0, 0); this.head.rotation.set(0, 0, 0);
    for (const limb of [this.leftLeg, this.rightLeg, this.leftShin, this.rightShin, this.leftArm, this.rightArm, this.leftForearm, this.rightForearm, this.leftHand, this.rightHand]) limb.rotation.set(0, 0, 0);
    this.delivery.visible = true; this.carriedBox.visible = false; this.carriedBox.position.y = 0.67;
    this.bus.position.set(10.45, 0, 2.3); this.bus.rotation.set(0, 0, 0); this.bus.visible = true;
    this.busDoor.rotation.set(0, 0, 0); this.passenger.visible = false; this.bossPassenger.visible = false;
    this.boss.visible = !this.plan; this.boss.position.set(7.85, 0, 1.7); this.boss.rotation.set(0, Math.PI * 0.82, 0);
    this.bossBody.position.set(0, 0, 0); this.bossBody.rotation.set(0, 0, 0); this.bossHead.rotation.set(0, 0, 0);
    for (const limb of [this.bossLeftLeg, this.bossRightLeg, this.bossLeftArm, this.bossRightArm]) limb.rotation.set(0, 0, 0);
    this.setClock(this.startingClockMinutes());
  }

  diagnostics() {
    this.scene.updateWorldMatrix(true, true);
    const mins = Math.round(this.clockMinutes);
    const leftHand = this.leftHand.getWorldPosition(new THREE.Vector3());
    const rightHand = this.rightHand.getWorldPosition(new THREE.Vector3());
    const box = this.carriedBox.getWorldPosition(new THREE.Vector3());
    const leftHandToBox = this.carriedBox.worldToLocal(leftHand.clone());
    const rightHandToBox = this.carriedBox.worldToLocal(rightHand.clone());
    const coordinates = (v: THREE.Vector3) => ({ x: v.x, y: v.y, z: v.z });
    const gripsSide = (v: THREE.Vector3) => Math.abs(v.x) > 0.2 && Math.abs(v.x) < 0.36 && v.y > -0.17 && v.y < 0.025 && v.z > 0.08 && v.z < 0.29;
    const carrying = this.carriedBox.visible && this.hero.visible;
    const boss = (this.bossPassenger.visible ? this.bossPassenger : this.boss).getWorldPosition(new THREE.Vector3());
    return {
      clueMarkers: 0, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      hero: { x: this.hero.position.x, z: this.hero.position.z, bodyY: this.body.position.y, leftKnee: this.leftShin.rotation.x, rightKnee: this.rightShin.rotation.x },
      stationClock: this.formatMinutes(mins),
      clockMinutes: this.clockMinutes, ending: this.cinematic, endingTime: this.endingTime,
      outcome: this.cinematic ? this.outcomeFor(this.cinematic) : null,
      standardArrivalMinutes: this.cinematic ? this.plan?.arrivalMinutes[this.cinematic] ?? (this.cinematic === 'A' ? 590 : this.cinematic === 'B' ? 605 : 610) : null,
      standardMeetingMinutes: this.plan?.meetingMinutes ?? 590,
      standardDepartureMinutes: this.plan?.departureMinutes ?? 595,
      displayedClockMinutes: mins,
      plazaOffset: this.plan?.plazaOffset ?? 0, referenceOffset: this.plan?.referenceOffset ?? 0,
      signage: this.plan?.signage ?? {},
      bus: { x: this.bus.position.x, z: this.bus.position.z, boarded: this.passenger.visible, visible: this.bus.visible }, carrying,
      boss: { visible: this.boss.visible, boarded: this.bossPassenger.visible, x: boss.x, z: boss.z },
      parcelPose: {
        supporting: carrying && gripsSide(leftHandToBox) && gripsSide(rightHandToBox),
        leftHand: coordinates(leftHand), rightHand: coordinates(rightHand), box: coordinates(box),
        leftHandToBox: coordinates(leftHandToBox), rightHandToBox: coordinates(rightHandToBox),
        leftElbow: this.leftForearm.rotation.x, rightElbow: this.rightForearm.rotation.x,
        leftElbowPosition: coordinates(this.leftForearm.getWorldPosition(new THREE.Vector3())),
        rightElbowPosition: coordinates(this.rightForearm.getWorldPosition(new THREE.Vector3())),
      },
    };
  }

  render(): void { this.renderer.render(this.scene, this.camera); }
}
