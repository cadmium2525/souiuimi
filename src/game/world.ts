import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Choice, Collider } from './types';

const PALETTE = {
  cream: 0xf1eadb, paper: 0xfff9eb, floor: 0xd9ad7e, edge: 0x394a48,
  wood: 0xb9875b, sage: 0x78958a, teal: 0x326c65, dark: 0x233d3c,
  orange: 0xef8e4b, yellow: 0xf4c54d, skin: 0xf5c4a1, metal: 0x526b67,
  blue: 0xa6c6c8, ink: 0x43605c, green: 0x57845a,
};

const ease = (t: number) => {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

type MovingProp = {
  object: THREE.Group;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  kind: 'chair' | 'desk' | 'plant' | 'bin' | 'cart' | 'cabinet' | 'storage';
};

type Dirt = { object: THREE.Object3D; position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3; clearAt: number; paper?: boolean };

/** Render adapter for the room; all gameplay state stays in Game/state. */
export class OfficeWorld {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 160);
  readonly colliders: Collider[] = [];

  private office = new THREE.Group();
  private furniture = new THREE.Group();
  private clutter = new THREE.Group();
  private hero = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private leftLeg = new THREE.Group();
  private rightLeg = new THREE.Group();
  private leftShin = new THREE.Group();
  private rightShin = new THREE.Group();
  private leftArm = new THREE.Group();
  private rightArm = new THREE.Group();
  private materials = new Map<number, THREE.MeshStandardMaterial>();
  private contactMaterial: THREE.MeshBasicMaterial | null = null;
  private sunMaterial: THREE.MeshBasicMaterial | null = null;
  private box = new THREE.Group();
  private flaps: THREE.Group[] = [];
  private crane = new THREE.Group();
  private craneBoom = new THREE.Group();
  private craneOuter!: THREE.Mesh;
  private craneInner!: THREE.Mesh;
  private idleHook = new THREE.Group();
  private craneCable: THREE.Mesh;
  private straps = new THREE.Group();
  private cleanStars = new THREE.Group();
  private mop = new THREE.Group();
  private cloth = new THREE.Group();
  private trolley = new THREE.Group();
  private loadingDock = new THREE.Group();
  private corridorWalls = new THREE.Group();
  private movingProps: MovingProp[] = [];
  private dirt: Dirt[] = [];
  private animatedProps = new Set<THREE.Object3D>();
  private movableMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8 });
  private cleaningProgress = 0;
  private delivered = 0;
  private carrying: string | null = null;
  private remainingAtStart = 0;
  private visibleLoads = 0;
  private transportSpeed = 0;
  private transportMaxSpeed = 0;
  private transportRoutes: { chair: THREE.CatmullRomCurve3; return: THREE.CatmullRomCurve3; cart: THREE.CatmullRomCurve3; peakSpeed: number } | null = null;
  private cameraTarget = new THREE.Vector3(0, 0.7, 0);
  private desiredCamera = new THREE.Vector3();
  private heroFacing = 0;
  private motion = 0;
  private gaitPhase = 0;
  private turnLean = 0;
  private playerUpdated = false;
  private cinematic: Choice | null = null;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(canvas: HTMLCanvasElement, private officeUnit?: string) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(0xe7eadf);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = false;
    this.scene.background = new THREE.Color(0xe7eadf);
    this.scene.fog = new THREE.Fog(0xe7eadf, 48, 110);
    this.scene.add(new THREE.HemisphereLight(0xfff6df, 0x899c91, 2.1));
    const sunlight = new THREE.DirectionalLight(0xffe3c0, 2.8);
    sunlight.position.set(-7, 16, -9);
    this.scene.add(sunlight);
    const fill = new THREE.DirectionalLight(0xd6eeee, 0.95);
    fill.position.set(8, 7, -9);
    this.scene.add(fill);
    this.office.name = 'The entire movable office';
    this.scene.add(this.office);
    this.office.add(this.furniture, this.clutter);
    this.buildRoom();
    this.buildFurniture();
    this.buildCharacter();
    this.buildActionProps();
    this.buildExterior();
    this.buildContainer();
    this.buildCrane();
    this.craneCable = this.cuboid(this.crane, 0.045, 8, 0.045, PALETTE.dark, 6, 7, 0);
    this.craneCable.visible = false;
    this.buildLiftStraps();
    this.buildCleanStars();
    // Bake stationary primitives into material batches for inexpensive mobile rendering.
    this.compact(this.office, new Set([this.furniture, this.clutter, this.hero, this.straps, this.cleanStars, this.trolley, this.corridorWalls]));
    this.compact(this.corridorWalls);
    this.compact(this.furniture, new Set(this.movingProps.map((prop) => prop.object)));
    for (const prop of this.movingProps) this.compactMovable(prop.object);
    this.compact(this.clutter, this.animatedProps);
    this.compact(this.scene, new Set([this.office, this.crane, this.box, this.loadingDock]));
    this.compact(this.box, new Set(this.flaps));
    this.compact(this.crane, new Set([this.craneCable, this.craneBoom, this.idleHook]));
    this.compact(this.idleHook);
    this.compactMovable(this.body, new Set([this.head, this.leftLeg, this.rightLeg, this.leftArm, this.rightArm]));
    this.compact(this.head);
    this.compact(this.leftLeg, new Set([this.leftShin]));
    this.compact(this.rightLeg, new Set([this.rightShin]));
    for (const limb of [this.leftShin, this.rightShin, this.leftArm, this.rightArm]) this.compact(limb, new Set([this.cloth]));
    this.compact(this.mop);
    this.compact(this.cloth);
    this.compact(this.trolley);
    this.compact(this.loadingDock);
    this.compact(this.straps);
    this.hero.position.set(0, 0, 3);
    this.showTitle(0);
  }

  private material(color: number): THREE.MeshStandardMaterial {
    let material = this.materials.get(color);
    if (!material) {
      const metal = color === PALETTE.metal || color === PALETTE.edge;
      const ceramic = color === PALETTE.paper || color === PALETTE.orange;
      material = new THREE.MeshStandardMaterial({ color, roughness: metal ? 0.52 : ceramic ? 0.72 : 0.9, metalness: metal ? 0.2 : 0 });
      this.materials.set(color, material);
    }
    return material;
  }

  private compact(root: THREE.Object3D, exclude = new Set<THREE.Object3D>()): void {
    root.updateWorldMatrix(true, true);
    const inverseRoot = root.matrixWorld.clone().invert();
    const batches = new Map<THREE.Material, { geometries: THREE.BufferGeometry[]; sources: THREE.Mesh[] }>();
    const collect = (object: THREE.Object3D) => {
      if (exclude.has(object)) return;
      if (object instanceof THREE.Mesh && (object.material instanceof THREE.MeshStandardMaterial || object.material instanceof THREE.MeshBasicMaterial)) {
        const material = object.material;
        let batch = batches.get(material);
        if (!batch) { batch = { geometries: [], sources: [] }; batches.set(material, batch); }
        let geometry = object.geometry.clone();
        // Rounded edges and basic primitives must share the same index layout.
        if (geometry.index) {
          const flat = geometry.toNonIndexed();
          geometry.dispose();
          geometry = flat;
        }
        geometry.applyMatrix4(inverseRoot.clone().multiply(object.matrixWorld));
        batch.geometries.push(geometry);
        batch.sources.push(object);
      }
      for (const child of object.children) collect(child);
    };
    for (const child of root.children) collect(child);
    for (const [material, batch] of batches) {
      const merged = mergeGeometries(batch.geometries, false);
      if (!merged) continue;
      // Sprites are kept separate; static mesh parents occasionally contain them.
      for (const source of batch.sources) {
        for (const child of [...source.children]) {
          if (child instanceof THREE.Sprite) root.attach(child);
        }
        source.removeFromParent();
        source.geometry.dispose();
      }
      for (const geometry of batch.geometries) geometry.dispose();
      const mesh = new THREE.Mesh(merged, material);
      mesh.renderOrder = batch.sources[0].renderOrder;
      root.add(mesh);
    }
  }

  /** Each load stays independently movable, with its colors baked into one draw. */
  private compactMovable(root: THREE.Group, exclude = new Set<THREE.Object3D>()): void {
    root.updateWorldMatrix(true, true);
    const inverseRoot = root.matrixWorld.clone().invert();
    const geometries: THREE.BufferGeometry[] = [];
    const sources: THREE.Mesh[] = [];
    const visit = (object: THREE.Object3D) => {
      if (this.animatedProps.has(object) || exclude.has(object)) return;
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
        let geometry = object.geometry.clone();
        if (geometry.index) {
          const flat = geometry.toNonIndexed();
          geometry.dispose();
          geometry = flat;
        }
        geometry.applyMatrix4(inverseRoot.clone().multiply(object.matrixWorld));
        const color = object.material.color;
        const values = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let i = 0; i < values.length; i += 3) {
          values[i] = color.r; values[i + 1] = color.g; values[i + 2] = color.b;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
        geometries.push(geometry);
        sources.push(object);
      }
      for (const child of object.children) visit(child);
    };
    for (const child of root.children) visit(child);
    const merged = geometries.length ? mergeGeometries(geometries, false) : null;
    if (merged) {
      for (const source of sources) {
        for (const child of [...source.children]) if (child instanceof THREE.Sprite) root.attach(child);
        source.removeFromParent();
        source.geometry.dispose();
      }
      root.add(new THREE.Mesh(merged, this.movableMaterial));
    }
    for (const geometry of geometries) geometry.dispose();
    // Contact shadows use a texture and remain a separate, cheap material batch.
    this.compact(root, new Set([...this.animatedProps, ...exclude, ...root.children.filter((child) => child instanceof THREE.Mesh && child.material === this.movableMaterial)]));
  }

  private rememberProp(object: THREE.Group, kind: MovingProp['kind']): void {
    object.name = `${kind} ${this.movingProps.filter((prop) => prop.kind === kind).length + 1}`;
    this.movingProps.push({ object, kind, position: object.position.clone(), rotation: object.rotation.clone(), scale: object.scale.clone() });
  }

  private rememberDirt(object: THREE.Object3D, clearAt: number, paper = false): void {
    this.animatedProps.add(object);
    this.dirt.push({ object, position: object.position.clone(), rotation: object.rotation.clone(), scale: object.scale.clone(), clearAt, paper });
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

  /** Shared, batched contact patches give props weight without a shadow-map pass. */
  private contactShadow(parent: THREE.Object3D, x: number, z: number, width: number, depth: number, y = 0.049): void {
    if (!this.contactMaterial) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(69, 60, 45, 0.34)');
      gradient.addColorStop(0.4, 'rgba(69, 60, 45, 0.25)');
      gradient.addColorStop(1, 'rgba(69, 60, 45, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.contactMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    }
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), this.contactMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, y, z);
    shadow.renderOrder = 1;
    parent.add(shadow);
  }

  private sunPatch(x: number, z: number): void {
    if (!this.sunMaterial) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0, 0, 0, 128);
      gradient.addColorStop(0, 'rgba(255, 241, 183, 0)');
      gradient.addColorStop(0.12, 'rgba(255, 241, 183, 0.23)');
      gradient.addColorStop(0.7, 'rgba(255, 245, 211, 0.3)');
      gradient.addColorStop(1, 'rgba(255, 245, 211, 0)');
      ctx.fillStyle = gradient;
      // The four panes project a quiet rhythm, rather than a glow over clues.
      for (const px of [2, 33]) for (const py of [0, 66]) ctx.fillRect(px, py, 27, 62);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.sunMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    }
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(1.47, 3.7), this.sunMaterial);
    patch.rotation.set(-Math.PI / 2, 0, -0.18);
    patch.position.set(x + 0.52, 0.047, z);
    this.office.add(patch);
  }

  private round(parent: THREE.Object3D, r: number, color: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), this.material(color));
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

  private textSprite(text: string, color = '#fff8e9', background = '', scale = 1, fontSize = 56): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.font = `700 ${fontSize}px "Noto Sans JP", "Yu Gothic", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, 256, 66);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.scale.set(4 * scale, scale, 1);
    return sprite;
  }

  private sign(parent: THREE.Object3D, label: string, width: number, height: number, color: number, x: number, y: number, z: number, rotation = 0): THREE.Group {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    this.cuboid(group, width, height, 0.06, color);
    const labelSprite = this.textSprite(label, '#f6f0df', '', width / 4, 44);
    labelSprite.position.z = 0.055;
    group.add(labelSprite);
    parent.add(group);
    return group;
  }

  private collision(x: number, z: number, w: number, d: number): void {
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  private buildRoom(): void {
    this.cuboid(this.office, 12.25, 0.4, 9.2, PALETTE.edge, 0, -0.27, 0);
    this.cuboid(this.office, 12, 0.12, 9, PALETTE.floor, 0, -0.025, 0);
    this.cuboid(this.office, 3.1, 0.4, 5.05, PALETTE.edge, 7.55, -0.27, 2);
    this.cuboid(this.office, 3, 0.12, 5, 0xd9c7a8, 7.5, -0.025, 2);
    // Quiet floorboard rhythm, using slender cuboids instead of textures.
    for (let z = -4.45; z < 4.5; z += 0.75) {
      const row = Math.round((z + 4.45) / 0.75);
      for (let plank = 0; plank < 3; plank++) {
        this.cuboid(this.office, 3.98, 0.006, 0.72, (row + plank) % 3 === 0 ? 0xd5a776 : 0xddb486,
          -4 + plank * 4, 0.038, z + 0.36);
      }
      this.cuboid(this.office, 12, 0.008, 0.018, 0xc6996c, 0, 0.04, z);
      for (let x = -6 + ((Math.round(z * 4) % 2) ? 2 : 0); x < 6; x += 4) {
        this.cuboid(this.office, 0.018, 0.01, 0.75, 0xc6996c, x, 0.04, z + 0.36);
      }
    }
    for (let z = -0.5; z <= 4.5; z += 1) {
      this.cuboid(this.office, 3, 0.008, 0.018, 0xbcae98, 7.5, 0.04, z);
    }
    // The front and right are cut away; north and west retain their architecture.
    this.cuboid(this.office, 12.25, 3.4, 0.17, PALETTE.cream, 0, 1.67, -4.5);
    this.cuboid(this.office, 0.18, 3.4, 9.12, PALETTE.cream, -6, 1.67, 0);
    this.cuboid(this.office, 12.05, 0.11, 0.12, PALETTE.wood, 0, 0.13, -4.36);
    this.cuboid(this.office, 0.12, 0.11, 9, PALETTE.wood, -5.87, 0.13, 0);
    this.cuboid(this.office, 0.18, 0.34, 4, PALETTE.cream, 6, 0.13, -2.5);
    this.cuboid(this.office, 12, 0.12, 0.17, PALETTE.cream, 0, 0.06, 4.5);
    // Corridor runs from the office to a storage bay.
    this.office.add(this.corridorWalls);
    this.cuboid(this.corridorWalls, 3.08, 1.65, 0.16, PALETTE.cream, 7.5, 0.8, -0.5);
    this.cuboid(this.corridorWalls, 0.16, 1.65, 5.1, PALETTE.cream, 9, 0.8, 2);
    this.cuboid(this.corridorWalls, 3.08, 0.2, 0.16, PALETTE.cream, 7.5, 0.08, 4.5);
    // A tall bank of blue windows makes the tiny room feel sunlit.
    for (let x = -4.9; x < 1; x += 1.72) {
      this.cuboid(this.office, 1.45, 1.92, 0.04, PALETTE.blue, x, 2.04, -4.395);
      this.cuboid(this.office, 1.42, 0.48, 0.014, 0xc9dfd9, x, 1.34, -4.366);
      this.cuboid(this.office, 1.42, 0.09, 0.014, 0xd6e7dd, x, 1.625, -4.366);
      this.cuboid(this.office, 1.61, 0.08, 0.12, PALETTE.paper, x, 3.06, -4.32);
      this.cuboid(this.office, 1.61, 0.08, 0.17, PALETTE.paper, x, 1.035, -4.28);
      this.cuboid(this.office, 0.075, 2.02, 0.09, PALETTE.paper, x - 0.77, 2.04, -4.32);
      this.cuboid(this.office, 0.075, 2.02, 0.09, PALETTE.paper, x + 0.77, 2.04, -4.32);
      this.cuboid(this.office, 0.055, 1.95, 0.07, PALETTE.paper, x, 2.04, -4.3);
      this.cuboid(this.office, 1.52, 0.035, 0.07, PALETTE.paper, x, 2.07, -4.3);
      this.sunPatch(x, -2.52);
    }
    // Right-hand window, open cutaway pane; the frame alone never obscures play.
    for (const z of [-4.1, -1.15]) this.cuboid(this.office, 0.15, 3.12, 0.14, PALETTE.paper, 6, 1.56, z);
    this.cuboid(this.office, 0.17, 0.13, 3.08, PALETTE.paper, 6, 3.1, -2.64);
    this.cuboid(this.office, 0.15, 0.13, 3.08, PALETTE.paper, 6, 0.86, -2.64);
    this.cuboid(this.office, 0.1, 2.2, 0.08, PALETTE.paper, 6, 1.95, -2.64);
    const windowTint = new THREE.MeshBasicMaterial({ color: 0xbdd7d2, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.2), windowTint);
    pane.rotation.y = Math.PI / 2;
    pane.position.set(6, 1.96, -2.64);
    this.office.add(pane);
    // Decorative beams retain the dollhouse silhouette without a ceiling.
    this.cuboid(this.office, 12.26, 0.15, 0.27, PALETTE.wood, 0, 3.42, -4.5);
    this.cuboid(this.office, 0.27, 0.15, 9.26, PALETTE.wood, -6, 3.42, 0);
    this.sign(this.office, `S O U I U  /  ${this.officeUnit ?? 'OFFICE'}`, 2.8, 0.42, PALETTE.teal, -1.65, 2.78, -4.28);
    this.sign(this.corridorWalls, 'STORAGE  →', 1.6, 0.35, PALETTE.teal, 7.55, 1.14, -0.37);
    // Structural feet support the miniature platform.
    for (const x of [-5.1, 5.1]) for (const z of [-3.7, 3.7]) {
      this.cuboid(this.office, 0.58, 0.27, 0.6, PALETTE.metal, x, -0.6, z);
    }
    this.cuboid(this.office, 2.15, 0.007, 1.28, PALETTE.sage, 0, 0.045, 3.44);
    for (let x = -0.8; x <= 0.8; x += 0.2) this.cuboid(this.office, 0.04, 0.009, 1.22, 0x8fa99c, x, 0.052, 3.44);
  }

  private desk(x: number, z: number, w = 2.35, d = 1.35): THREE.Group {
    const desk = new THREE.Group();
    desk.position.set(x, 0, z);
    this.furniture.add(desk);
    this.contactShadow(desk, 0.07, 0.08, w + 0.45, d + 0.4);
    this.softBox(desk, w, 0.15, d, PALETTE.wood, 0, 0.92, 0);
    this.softBox(desk, w - 0.04, 0.05, d - 0.04, 0xdec4a1, 0, 1.01, 0, 0.014);
    // Subtle end grain and a shaded apron give the desktop a solid edge.
    this.cuboid(desk, w - 0.13, 0.018, 0.014, 0xcda576, 0, 0.956, d / 2 + 0.001);
    this.cuboid(desk, w - 0.16, 0.11, 0.055, PALETTE.wood, 0, 0.8, -d / 2 + 0.1);
    for (const lx of [-w / 2 + 0.15, w / 2 - 0.15]) for (const lz of [-d / 2 + 0.15, d / 2 - 0.15]) {
      this.cuboid(desk, 0.095, 0.84, 0.095, PALETTE.teal, lx, 0.44, lz);
    }
    this.softBox(desk, 0.68, 0.57, d - 0.12, PALETTE.sage, w / 2 - 0.46, 0.57, 0, 0.018);
    for (const y of [0.39, 0.64]) {
      this.cuboid(desk, 0.6, 0.02, 0.03, PALETTE.teal, w / 2 - 0.46, y, d / 2 - 0.035);
      this.cuboid(desk, 0.18, 0.045, 0.045, PALETTE.paper, w / 2 - 0.46, y + 0.075, d / 2 - 0.005);
    }
    this.collision(x, z, w, d);
    this.rememberProp(desk, 'desk');
    return desk;
  }

  private chair(x: number, z: number, rotation = 0): void {
    const chair = new THREE.Group();
    chair.position.set(x, 0, z);
    chair.rotation.y = rotation;
    this.furniture.add(chair);
    this.contactShadow(chair, 0, 0.03, 1.18, 1.1);
    this.softBox(chair, 0.73, 0.12, 0.7, PALETTE.teal, 0, 0.51, 0, 0.035);
    const back = this.softBox(chair, 0.75, 0.63, 0.14, PALETTE.sage, 0, 0.85, 0.27, 0.045);
    back.rotation.x = -0.1;
    this.softBox(chair, 0.61, 0.4, 0.027, 0x8ba699, 0, 0.9, 0.182, 0.008);
    this.cylinder(chair, 0.055, 0.055, 0.42, PALETTE.metal, 0, 0.25, 0);
    this.cuboid(chair, 0.69, 0.07, 0.09, PALETTE.metal, 0, 0.105, 0);
    this.cuboid(chair, 0.09, 0.07, 0.69, PALETTE.metal, 0, 0.105, 0);
    for (const wx of [-0.29, 0.29]) this.round(chair, 0.08, PALETTE.dark, wx, 0.08, 0, 1, 1, 0.6);
    for (const wz of [-0.29, 0.29]) this.round(chair, 0.08, PALETTE.dark, 0, 0.08, wz, 0.6, 1, 1);
    this.collision(x, z, 0.73, 0.7);
    this.rememberProp(chair, 'chair');
  }

  private monitor(parent: THREE.Object3D, x: number, z: number, special = false): void {
    this.cuboid(parent, 0.46, 0.06, 0.28, PALETTE.dark, x, 1.075, z);
    this.cuboid(parent, 0.065, 0.27, 0.065, PALETTE.metal, x, 1.2, z);
    this.cuboid(parent, 0.86, 0.53, 0.08, PALETTE.dark, x, 1.48, z);
    this.cuboid(parent, 0.75, 0.42, 0.018, special ? 0x99c4b2 : 0xbcd4ce, x, 1.48, z + 0.055);
    this.cuboid(parent, 0.32, 0.045, 0.015, PALETTE.teal, x - 0.14, 1.61, z + 0.07);
    for (let i = 0; i < 3; i++) this.cuboid(parent, 0.47 - i * 0.085, 0.025, 0.015, 0xe0efdf, x, 1.51 - i * 0.085, z + 0.07);
    this.cuboid(parent, 0.67, 0.035, 0.25, PALETTE.paper, x, 1.075, z + 0.38);
    for (let i = 0; i < 3; i++) this.cuboid(parent, 0.55, 0.006, 0.008, PALETTE.sage, x, 1.095, z + 0.31 + i * 0.06);
    if (special) {
      const logo = this.textSprite('UNIT / MOVE', '#326c65', '', 0.18, 40);
      logo.position.set(x, 1.47, z + 0.075);
      parent.add(logo);
    }
  }

  private mug(parent: THREE.Object3D, x: number, y: number, z: number, color = PALETTE.orange): void {
    this.cylinder(parent, 0.105, 0.09, 0.2, color, x, y + 0.1, z, 10);
    this.cylinder(parent, 0.075, 0.075, 0.013, 0x684331, x, y + 0.206, z, 10);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.028, 5, 10), this.material(color));
    handle.position.set(x + 0.118, y + 0.105, z);
    parent.add(handle);
  }

  private papers(parent: THREE.Object3D, x: number, z: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const sheet = this.cuboid(parent, 0.45, 0.008, 0.33, i % 3 === 0 ? 0xe8dbb7 : PALETTE.paper,
        x + Math.sin(i * 3.7) * 0.62, 1.056 + i * 0.009, z + Math.cos(i * 2.1) * 0.35);
      sheet.rotation.y = Math.sin(i * 2.8) * 0.9;
      for (let line = 0; line < 3; line++) {
        const stroke = this.cuboid(sheet, 0.22 - line * 0.025, 0.003, 0.009, 0xadbaac, 0, 0.007, -0.08 + line * 0.045);
        stroke.rotation.y = 0;
      }
      this.compact(sheet);
      this.rememberDirt(sheet, 7.4 + i * 0.22, true);
    }
  }

  private plant(x: number, z: number, size = 1, y = 0, parent: THREE.Object3D = this.furniture): void {
    const plant = new THREE.Group();
    plant.position.set(x, y, z);
    plant.scale.setScalar(size);
    parent.add(plant);
    this.contactShadow(plant, 0.035, 0.035, 0.87, 0.76, y === 0 ? 0.049 / size : 0.015);
    this.cylinder(plant, 0.25, 0.19, 0.42, 0xc88664, 0, 0.23, 0);
    this.cylinder(plant, 0.264, 0.255, 0.055, 0xd99a76, 0, 0.427, 0);
    this.cylinder(plant, 0.23, 0.23, 0.028, 0x705846, 0, 0.45, 0);
    this.cylinder(plant, 0.028, 0.035, 0.9, PALETTE.wood, 0, 0.88, 0, 6);
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.38;
      const leaf = this.round(plant, 0.34, i % 2 ? 0x6f935e : PALETTE.green,
        Math.sin(angle) * 0.27, 0.81 + i * 0.095, Math.cos(angle) * 0.27, 0.7, 0.34, 1.6);
      leaf.rotation.set(0.25, angle, Math.sin(angle) * 0.4);
    }
    if (parent === this.furniture) this.rememberProp(plant, 'plant');
  }

  private buildFurniture(): void {
    const work = this.desk(-3.5, -1.8, 2.5, 1.4);
    this.monitor(work, 0.35, -0.35);
    this.mug(work, -0.8, 1.05, 0.26);
    this.papers(work, -0.2, 0.12, 6);
    this.chair(-3.6, -0.63, 0.12);
    // A coffee stain and crumpled floor paper support the obvious interpretation.
    const stain = this.cylinder(work, 0.23, 0.23, 0.007, 0x946b48, -0.58, 1.052, 0.62, 18);
    stain.scale.z = 0.6;
    this.rememberDirt(stain, 8.3);
    for (let i = 0; i < 4; i++) {
      const paper = this.round(this.clutter, 0.085, PALETTE.paper, -3.6 + i * 0.24, 0.095, -0.25 + Math.sin(i * 6) * 0.18, 1, 0.8, 1);
      this.rememberDirt(paper, 2.25 + i * 0.65);
    }
    const reception = this.desk(0.6, -2, 2.65, 1.4);
    this.cuboid(reception, 2.4, 0.65, 0.085, PALETTE.sage, 0, 0.66, 0.61);
    this.sign(reception, 'RECEPTION', 1.4, 0.25, PALETTE.teal, 0, 0.69, 0.66);
    this.cuboid(reception, 0.53, 0.027, 0.71, PALETTE.teal, -0.45, 1.06, 0.1);
    this.cuboid(reception, 0.47, 0.018, 0.61, PALETTE.paper, -0.45, 1.082, 0.1);
    this.cuboid(reception, 0.27, 0.015, 0.04, PALETTE.orange, -0.45, 1.098, -0.04);
    this.cuboid(reception, 0.35, 0.012, 0.03, PALETTE.sage, -0.45, 1.098, 0.09);
    this.plant(0.75, -0.25, 0.3, 1.05, reception);
    this.cuboid(reception, 0.32, 0.06, 0.45, PALETTE.orange, 0.4, 1.08, 0.05);
    this.chair(0.7, -3.17, Math.PI);
    const pc = this.desk(0.8, 1.5, 2.55, 1.35);
    this.monitor(pc, 0.1, -0.35, true);
    this.mug(pc, -0.78, 1.05, 0.15, PALETTE.paper);
    this.cuboid(pc, 0.28, 0.018, 0.3, PALETTE.orange, -0.65, 1.065, -0.28);
    this.chair(0.65, 2.66, -0.15);
    const boss = this.desk(-3.4, 1.8, 2.55, 1.35);
    this.monitor(boss, 0.25, -0.37);
    this.cuboid(boss, 0.34, 0.025, 0.3, PALETTE.yellow, -0.52, 1.07, 0.12);
    this.cuboid(boss, 0.2, 0.008, 0.027, PALETTE.ink, -0.52, 1.086, 0.1);
    this.cuboid(boss, 0.23, 0.008, 0.027, PALETTE.ink, -0.52, 1.086, 0.16);
    this.mug(boss, 0.86, 1.05, 0.22);
    this.chair(-3.5, 2.97, 0.06);
    this.plant(-5.1, -3.35, 1.05);
    this.plant(-5.18, 3.56, 0.95);
    this.plant(5.17, 3.35, 1.2);
    this.plant(2.85, -3.3, 0.85);
    this.collision(-5.1, -3.35, 0.51, 0.51);
    this.collision(-5.18, 3.56, 0.47, 0.47);
    this.collision(5.17, 3.35, 0.59, 0.59);
    this.collision(2.85, -3.3, 0.43, 0.43);
    // Low cabinet and wall pinboard in the far right corner.
    const cabinet = new THREE.Group();
    cabinet.position.set(4.35, 0, -3.74);
    this.furniture.add(cabinet);
    this.contactShadow(cabinet, 0, 0.08, 2.65, 1.26);
    this.softBox(cabinet, 2.05, 0.85, 0.8, PALETTE.sage, 0, 0.48, 0, 0.025);
    this.softBox(cabinet, 2.1, 0.07, 0.85, PALETTE.wood, 0, 0.935, 0, 0.02);
    this.cuboid(cabinet, 0.025, 0.7, 0.03, PALETTE.teal, 0, 0.51, 0.416);
    for (const x of [-0.1, 0.1]) this.cuboid(cabinet, 0.045, 0.18, 0.055, PALETTE.paper, x, 0.54, 0.455);
    this.collision(4.35, -3.74, 2.1, 0.8);
    for (let i = 0; i < 5; i++) {
      this.cuboid(cabinet, 0.16, 0.35 + (i % 2) * 0.06, 0.28, [PALETTE.orange, PALETTE.teal, PALETTE.paper][i % 3], -0.69 + i * 0.19, 1.16, -0.08);
    }
    this.rememberProp(cabinet, 'cabinet');
    this.cuboid(this.office, 2.1, 1.15, 0.095, PALETTE.wood, 3.12, 2.03, -4.34);
    this.cuboid(this.office, 1.95, 1, 0.045, 0xd2b386, 3.12, 2.03, -4.265);
    const notice = this.cuboid(this.office, 0.65, 0.8, 0.026, PALETTE.paper, 3.1, 2.05, -4.225);
    notice.rotation.z = -0.07;
    for (let i = 0; i < 4; i++) this.cuboid(this.office, 0.46 - (i % 2) * 0.13, 0.025, 0.015, i === 0 ? PALETTE.orange : PALETTE.ink, 3.1, 2.25 - i * 0.135, -4.202);
    this.cuboid(this.office, 0.24, 0.21, 0.02, PALETTE.yellow, 3.76, 2.24, -4.202);
    this.cuboid(this.office, 0.3, 0.28, 0.02, PALETTE.sage, 2.39, 1.77, -4.202);
    // A clock with uncomplicated bold hands.
    const clock = this.cylinder(this.office, 0.39, 0.39, 0.08, PALETTE.teal, 4.8, 2.72, -4.29, 24);
    clock.rotation.x = Math.PI / 2;
    const face = this.cylinder(this.office, 0.34, 0.34, 0.015, PALETTE.paper, 4.8, 2.72, -4.235, 24);
    face.rotation.x = Math.PI / 2;
    this.cuboid(this.office, 0.027, 0.23, 0.015, PALETTE.dark, 4.8, 2.8, -4.215);
    const hand = this.cuboid(this.office, 0.21, 0.027, 0.015, PALETTE.dark, 4.88, 2.7, -4.215);
    hand.rotation.z = -0.3;
    // A small yellow bin and a slim filing cart make the space lived in.
    const bin = new THREE.Group();
    bin.position.set(-5.1, 0, -0.72);
    this.furniture.add(bin);
    this.contactShadow(bin, 0, 0, 0.88, 0.8);
    this.cylinder(bin, 0.25, 0.2, 0.49, PALETTE.orange, 0, 0.26, 0);
    this.rememberProp(bin, 'bin');
    this.collision(-5.1, -0.72, 0.5, 0.5);
    const cart = new THREE.Group();
    cart.position.set(4.75, 0, 0.8);
    this.furniture.add(cart);
    this.contactShadow(cart, 0, 0.02, 1.36, 0.97);
    for (const y of [0.25, 0.72]) this.cuboid(cart, 0.96, 0.05, 0.55, PALETTE.teal, 0, y, 0);
    for (const x of [-0.41, 0.41]) for (const z of [-0.22, 0.22]) this.cuboid(cart, 0.05, 0.83, 0.05, PALETTE.metal, x, 0.43, z);
    for (const x of [-0.41, 0.41]) for (const z of [-0.22, 0.22]) this.round(cart, 0.065, PALETTE.dark, x, 0.067, z, 0.7, 1, 1);
    for (let i = 0; i < 3; i++) this.cuboid(cart, 0.61, 0.08, 0.4, i % 2 ? PALETTE.paper : PALETTE.orange, 0, 0.8 + i * 0.085, 0);
    this.collision(4.75, 0.8, 0.96, 0.55);
    this.rememberProp(cart, 'cart');
    // The corridor opens onto a substantial modular-office storage container.
    const storage = new THREE.Group();
    storage.position.set(8, 0, 2.8);
    this.furniture.add(storage);
    this.contactShadow(storage, 0, 0.04, 2.5, 2.23);
    this.softBox(storage, 1.9, 2.05, 1.75, 0xc78e58, 0, 1.075, 0, 0.027);
    for (const x of [-0.72, 0.72]) {
      this.cuboid(storage, 0.055, 1.8, 0.025, 0xb17a47, x, 1.075, 0.884);
      for (const y of [0.33, 1.88]) this.round(storage, 0.035, PALETTE.metal, x, y, 0.908, 1, 1, 0.4);
    }
    this.cuboid(storage, 1.98, 0.08, 1.83, PALETTE.wood, 0, 2.13, 0);
    this.cuboid(storage, 0.18, 2.08, 1.78, 0xe0b884, 0, 1.1, 0);
    this.cuboid(storage, 1.95, 0.2, 1.78, 0xe0b884, 0, 0.67, 0);
    this.sign(storage, 'OFFICE / UNIT', 1.55, 0.39, PALETTE.teal, 0, 1.51, 0.91);
    const arrows = this.textSprite('↑ ↑', '#43605c', '', 0.19, 62);
    arrows.position.set(0, 0.4, 0.91);
    storage.add(arrows);
    this.rememberProp(storage, 'storage');
    this.collision(8, 2.8, 1.9, 1.75);
    for (const z of [1.8, 3.7]) this.cuboid(this.office, 2.4, 0.008, 0.06, PALETTE.orange, 7.65, 0.048, z);
  }

  private buildCharacter(): void {
    this.office.add(this.hero);
    this.hero.add(this.body);
    // A toy-like overworked salaryman, with a rounded yellow shirt and tiny tie.
    this.contactShadow(this.hero, 0, 0.01, 0.94, 0.81, 0.054);
    this.round(this.body, 0.29, PALETTE.yellow, 0, 0.72, 0, 1.08, 1.17, 0.79);
    this.head.position.set(0, 1.18, 0);
    this.body.add(this.head);
    this.round(this.head, 0.28, PALETTE.skin, 0, 0.05, -0.015, 0.94, 1.06, 0.9);
    const hair = this.round(this.head, 0.285, PALETTE.dark, 0, 0.16, 0.035, 0.98, 0.73, 0.91);
    hair.rotation.x = -0.2;
    this.round(this.head, 0.11, PALETTE.dark, -0.17, 0.18, -0.14, 1.1, 0.85, 0.65);
    for (const x of [-0.087, 0.087]) this.round(this.head, 0.025, PALETTE.dark, x, 0.065, -0.252, 0.75, 1.2, 0.45);
    this.round(this.head, 0.043, PALETTE.skin, 0, 0.02, -0.269, 0.78, 0.8, 0.78);
    for (const x of [-0.259, 0.259]) this.round(this.head, 0.047, PALETTE.skin, x, 0.035, -0.007, 0.6, 1, 1);
    this.cuboid(this.body, 0.027, 0.043, 0.015, PALETTE.paper, -0.06, 0.91, -0.218);
    this.cuboid(this.body, 0.027, 0.043, 0.015, PALETTE.paper, 0.06, 0.91, -0.218);
    const tie = this.cuboid(this.body, 0.058, 0.21, 0.02, PALETTE.teal, 0, 0.81, -0.235);
    tie.rotation.z = -0.07;
    this.cuboid(this.body, 0.11, 0.07, 0.023, 0xe5b947, -0.16, 0.79, -0.2);
    this.cuboid(this.body, 0.016, 0.069, 0.028, PALETTE.paper, -0.17, 0.812, -0.211);
    this.body.add(this.leftArm, this.rightArm);
    this.leftArm.position.set(-0.29, 0.84, 0);
    this.rightArm.position.set(0.29, 0.84, 0);
    for (const arm of [this.leftArm, this.rightArm]) {
      this.round(arm, 0.105, PALETTE.yellow, 0, -0.045, 0, 1, 1.3, 1);
      this.cylinder(arm, 0.058, 0.067, 0.23, PALETTE.skin, 0, -0.21, 0, 8);
      this.round(arm, 0.073, PALETTE.skin, 0, -0.34, 0, 0.86, 1, 0.86);
    }
    this.body.add(this.leftLeg, this.rightLeg);
    this.leftLeg.position.set(-0.12, 0.48, 0);
    this.rightLeg.position.set(0.12, 0.48, 0);
    for (const [leg, shin] of [[this.leftLeg, this.leftShin], [this.rightLeg, this.rightShin]]) {
      this.cylinder(leg, 0.093, 0.087, 0.2, PALETTE.teal, 0, -0.09, 0, 8);
      shin.position.y = -0.19;
      leg.add(shin);
      this.cylinder(shin, 0.087, 0.079, 0.17, PALETTE.teal, 0, -0.075, 0, 8);
      this.round(shin, 0.105, PALETTE.dark, 0, -0.165, -0.04, 0.9, 0.62, 1.6);
      this.softBox(shin, 0.16, 0.018, 0.24, PALETTE.edge, 0, -0.208, -0.045, 0.005);
    }
  }

  private buildActionProps(): void {
    this.hero.add(this.mop);
    this.mop.visible = false;
    this.mop.position.x = 0.12;
    const handle = this.cylinder(this.mop, 0.025, 0.025, 1.05, PALETTE.wood, 0, 0.56, -0.42, 8);
    handle.rotation.x = 0.5;
    this.softBox(this.mop, 0.6, 0.07, 0.26, PALETTE.paper, 0, 0.085, -0.67, 0.018);
    this.cuboid(this.mop, 0.42, 0.06, 0.19, PALETTE.teal, 0, 0.12, -0.67);
    for (let i = -3; i <= 3; i++) this.cuboid(this.mop, 0.022, 0.023, 0.32, 0xc5d9cf, i * 0.07, 0.055, -0.67);
    this.rightArm.add(this.cloth);
    this.cloth.position.set(0, -0.36, -0.015);
    this.softBox(this.cloth, 0.29, 0.036, 0.23, 0xbcd4ce, 0, 0, 0, 0.008);
    this.cuboid(this.cloth, 0.24, 0.009, 0.02, PALETTE.paper, 0, -0.025, 0.06);
    this.cloth.visible = false;
    this.office.add(this.trolley);
    this.trolley.visible = false;
    this.softBox(this.trolley, 1.6, 0.11, 1.12, PALETTE.orange, 0, 0.16, 0, 0.025);
    this.cuboid(this.trolley, 1.36, 0.025, 0.93, PALETTE.teal, 0, 0.229, 0);
    for (const x of [-0.61, 0.61]) for (const z of [-0.39, 0.39]) {
      const wheel = this.cylinder(this.trolley, 0.13, 0.13, 0.09, PALETTE.dark, x, 0.09, z, 8);
      wheel.rotation.z = Math.PI / 2;
    }
    for (const x of [-0.61, 0.61]) this.cuboid(this.trolley, 0.06, 0.85, 0.06, PALETTE.metal, x, 0.59, 0.57);
    this.cuboid(this.trolley, 1.26, 0.06, 0.06, PALETTE.metal, 0, 1.01, 0.57);
    this.scene.add(this.loadingDock);
    this.loadingDock.visible = false;
    this.cuboid(this.loadingDock, 3.1, 0.4, 4.0, PALETTE.edge, 7.5, -0.27, 6.5);
    this.cuboid(this.loadingDock, 3, 0.12, 4.0, 0xd9c7a8, 7.5, -0.025, 6.5);
    for (const x of [6.15, 8.85]) this.cuboid(this.loadingDock, 0.08, 0.007, 3.55, PALETTE.orange, x, 0.041, 6.5);
  }

  private buildExterior(): void {
    this.cuboid(this.scene, 95, 0.18, 80, 0xd7dfcf, 7, -0.89, -3);
    this.cuboid(this.scene, 22, 0.025, 7, 0xbec7ba, 8, -0.78, -8.4);
    this.cuboid(this.scene, 22, 0.026, 0.09, 0xe9eddb, 8, -0.76, -9.65);
    this.cuboid(this.scene, 22, 0.026, 0.09, 0xe9eddb, 8, -0.76, -7.18);
    for (let x = -10; x < 20; x += 4) this.cuboid(this.scene, 1.8, 0.025, 0.07, 0xe9eddb, x, -0.74, -8.4);
    // Soft silhouettes around the site retain depth without heavy scenery assets.
    for (const [x, z, scale] of [[-11, -7, 1.8], [-9, 8, 1.5], [13, -13, 2], [-13, -15, 2.2], [3, -14, 1.8]]) {
      const tree = new THREE.Group();
      tree.position.set(x, -0.77, z);
      this.scene.add(tree);
      this.contactShadow(tree, scale * 0.12, scale * 0.12, scale * 2.1, scale * 1.7, 0.005);
      this.cylinder(tree, 0.12, 0.18, 2 * scale, 0x8e9b75, 0, scale, 0, 7);
      this.round(tree, scale, 0xa5b692, 0, scale * 2.1, 0, 0.75, 1.25, 0.75);
      this.round(tree, scale * 0.7, 0xb2c09d, -scale * 0.42, scale * 1.8, 0.15, 0.85, 1.1, 0.85);
    }
    for (const [x, z, w, h] of [[-12, -25, 7, 8], [-3, -28, 6, 6], [7, -27, 8, 9], [19, -25, 7, 5]]) {
      this.cuboid(this.scene, w, h, 4, 0xc6d0c2, x, h / 2 - 0.78, z);
      for (let y = 1.5; y < h; y += 1.4) this.cuboid(this.scene, w - 0.8, 0.6, 0.05, 0xd4dfd0, x, y, z + 2.03);
    }
  }

  private buildCrane(): void {
    this.crane.position.set(9, -0.75, -11.0);
    this.scene.add(this.crane);
    this.cuboid(this.crane, 3.9, 0.62, 1.58, PALETTE.orange, 0, 0.63, 0);
    this.cuboid(this.crane, 1.2, 1.15, 1.44, PALETTE.yellow, -1.28, 1.45, 0);
    this.cuboid(this.crane, 0.81, 0.46, 0.025, PALETTE.blue, -1.25, 1.69, 0.735);
    this.cuboid(this.crane, 0.035, 0.45, 1.09, PALETTE.blue, -1.897, 1.7, 0);
    for (const x of [-1.22, 1.17]) for (const z of [-0.84, 0.84]) {
      const wheel = this.cylinder(this.crane, 0.37, 0.37, 0.18, PALETTE.dark, x, 0.38, z, 12);
      wheel.rotation.x = Math.PI / 2;
      const hub = this.cylinder(this.crane, 0.19, 0.19, 0.19, PALETTE.paper, x, 0.38, z, 10);
      hub.rotation.x = Math.PI / 2;
    }
    this.sign(this.crane, 'UNIT / MOVERS', 2.6, 0.37, PALETTE.teal, 0.38, 0.87, 0.81);
    this.cylinder(this.crane, 0.47, 0.61, 0.32, PALETTE.teal, 0.58, 1.1, 0, 12);
    this.softBox(this.crane, 1.02, 0.7, 1.23, PALETTE.teal, 1.05, 1.58, 0, 0.08);
    this.craneBoom.position.set(0.58, 1.35, 0);
    this.crane.add(this.craneBoom);
    this.craneOuter = this.cuboid(this.craneBoom, 0.54, 1, 0.54, PALETTE.yellow);
    this.craneInner = this.cuboid(this.craneBoom, 0.35, 1, 0.35, PALETTE.orange);
    this.positionCraneBoom(new THREE.Vector3(6.7, 6.8, 0));
    this.crane.add(this.idleHook);
    this.cuboid(this.idleHook, 0.025, 3.4, 0.025, PALETTE.dark, 6.7, 5.05, 0);
    this.cuboid(this.idleHook, 0.19, 0.37, 0.18, PALETTE.dark, 6.7, 3.24, 0);
    this.contactShadow(this.crane, 0.1, 0, 5.3, 3.1, 0.009);
    for (const x of [-0.8, 1.45]) {
      this.cuboid(this.crane, 0.13, 0.11, 2.8, PALETTE.teal, x, 0.47, 0);
      for (const z of [-1.3, 1.3]) {
        this.cylinder(this.crane, 0.06, 0.08, 0.35, PALETTE.metal, x, 0.25, z, 8);
        this.cuboid(this.crane, 0.42, 0.055, 0.42, PALETTE.dark, x, 0.047, z);
      }
    }
  }

  /** Keep the lifting line hanging below a rigid, slewing telescopic boom. */
  private positionCraneBoom(tip: THREE.Vector3): void {
    const direction = tip.clone().sub(this.craneBoom.position);
    const length = direction.length();
    this.craneBoom.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    this.craneOuter.scale.y = length * 0.62;
    this.craneOuter.position.y = length * 0.31;
    this.craneInner.scale.y = length * 0.53;
    this.craneInner.position.y = length * 0.735;
  }

  private buildContainer(): void {
    this.box.position.set(20, -0.75, 0.5);
    this.box.visible = false;
    this.scene.add(this.box);
    this.cuboid(this.box, 18.2, 0.32, 12.5, PALETTE.wood, 0, 0.1, 0);
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xc9945d, roughness: 1, side: THREE.DoubleSide });
    const back = new THREE.Mesh(new THREE.BoxGeometry(18.2, 5.8, 0.18), wallMaterial);
    back.position.set(0, 3, -6.2);
    this.box.add(back);
    this.cuboid(this.box, 0.18, 5.8, 12.5, 0xd0a06a, -9, 3, 0);
    this.cuboid(this.box, 0.18, 5.8, 12.5, 0xd0a06a, 9, 3, 0);
    // Short cutaway front permits the absurd payload to remain visible until sealed.
    this.cuboid(this.box, 18.2, 1.9, 0.18, 0xd4a471, 0, 1.05, 6.2);
    this.sign(this.box, 'MOVABLE OFFICE  /  HANDLE WITH CARE', 10.5, 0.9, PALETTE.teal, 0, 1.18, 6.31);
    this.sign(this.box, 'THIS SIDE UP  ↑', 6.7, 0.7, PALETTE.teal, 0, 4.3, -6.06);
    for (const z of [-6.2, 6.2]) {
      const hinge = new THREE.Group();
      hinge.position.set(0, 5.95, z);
      const flap = this.cuboid(hinge, 18.05, 0.12, 6.24, 0xddb784, 0, 0, z > 0 ? 3.12 : -3.12);
      flap.name = 'cardboard flap';
      this.box.add(hinge);
      this.flaps.push(hinge);
    }
    for (const x of [-9, 9]) {
      const hinge = new THREE.Group();
      hinge.position.set(x, 5.85, 0);
      this.cuboid(hinge, 3.4, 0.13, 12.25, 0xd0a168, x > 0 ? 1.7 : -1.7, 0, 0);
      this.box.add(hinge);
      this.flaps.push(hinge);
    }
  }

  private buildLiftStraps(): void {
    this.office.add(this.straps);
    this.straps.visible = false;
    for (const x of [-4.6, 4.6]) {
      this.cuboid(this.straps, 0.16, 0.08, 8.7, PALETTE.orange, x, -0.4, 0);
      for (const z of [-4.28, 4.28]) {
        const cable = this.cuboid(this.straps, 0.055, 5.3, 0.055, PALETTE.dark, x / 2, 4.25, z / 2);
        // Straps converge from the platform corners to a central lifting eye.
        const start = new THREE.Vector3(x, -0.35, z);
        const end = new THREE.Vector3(0, 7.5, 0);
        const direction = end.clone().sub(start);
        cable.scale.y = direction.length() / 5.3;
        cable.position.copy(start.clone().add(end).multiplyScalar(0.5));
        cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      }
    }
    this.round(this.straps, 0.14, PALETTE.dark, 0, 7.55, 0, 1, 1.5, 1);
  }

  private buildCleanStars(): void {
    this.office.add(this.cleanStars);
    this.cleanStars.visible = false;
    for (let i = 0; i < 16; i++) {
      const group = new THREE.Group();
      group.position.set(Math.sin(i * 8.1) * 5.2, 0.2 + (i % 5) * 0.42, Math.cos(i * 6.7) * 3.5);
      this.cuboid(group, 0.035, 0.28, 0.035, PALETTE.paper);
      this.cuboid(group, 0.23, 0.035, 0.035, PALETTE.paper);
      group.rotation.z = Math.PI / 8;
      this.cleanStars.add(group);
    }
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
    const distance = mobile ? 11.2 : 10;
    const horizontal = Math.cos(angle) * distance;
    // Front/east cutaways leave the camera free to retain a useful follow distance.
    // The full north/west walls bound it; increase height instead of moving close.
    let cx = x + Math.sin(yaw) * horizontal;
    let cz = z + Math.cos(yaw) * horizontal;
    cx = Math.max(cx, -5.6);
    cz = Math.max(cz, -4.12);
    const actualHorizontal = Math.hypot(cx - x, cz - z);
    const height = Math.sqrt(Math.max(distance * distance - actualHorizontal * actualHorizontal, 0));
    this.desiredCamera.set(cx, 0.8 + Math.max(Math.sin(angle) * distance, height), cz);
    const target = new THREE.Vector3(
      THREE.MathUtils.clamp(x - Math.sin(yaw) * 1.25, -5.4, 8.5),
      0.75,
      THREE.MathUtils.clamp(z - Math.cos(yaw) * 1.25, -3.9, 4),
    );
    const factor = instant || this.reducedMotion ? 1 : 1 - Math.exp(-7 * Math.min(dt, 0.1));
    this.camera.position.lerp(this.desiredCamera, factor);
    this.cameraTarget.lerp(target, factor);
    this.camera.lookAt(this.cameraTarget);
    this.camera.fov = mobile ? 56 : 53;
    this.camera.updateProjectionMatrix();
  }

  showTitle(time: number): void {
    const framing = this.camera.aspect < 0.75 ? 1.78 : this.camera.aspect < 1.2 ? 1.3 : 1;
    const drift = this.reducedMotion ? 0 : Math.sin(time * 0.09) * 0.65;
    this.camera.position.set((14 + drift) * framing, 13.8 * framing, 18 * framing);
    this.cameraTarget.set(0.7, 0.5, -0.3);
    this.camera.lookAt(this.cameraTarget);
    this.camera.fov = 40;
    if (this.camera.aspect > 1.2) {
      // Desktop's title copy occupies the left half: offset the room to the right.
      const width = this.renderer.domElement.width;
      const height = this.renderer.domElement.height;
      this.camera.setViewOffset(width, height, -width * 0.18, 0, width, height);
    } else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  setClues(_found: Set<string>, _nearest: string | null): void {
    // Clue state belongs to the notebook. The room has only ordinary objects.
  }

  update(dt: number, elapsed: number): void {
    // Action scenes own every limb pose, including when a QA replay seeks backward.
    if (this.cinematic === 'A' || this.cinematic === 'B') return;
    if (!this.playerUpdated) this.motion = THREE.MathUtils.damp(this.motion, 0, 12, Math.min(dt, 0.1));
    this.playerUpdated = false;
    this.gaitPhase += Math.min(dt, 0.1) * 10.6 * this.motion;
    const gait = this.gaitPhase;
    const amount = this.reducedMotion ? 0 : this.motion;
    this.leftLeg.rotation.x = Math.sin(gait) * 0.36 * amount;
    this.rightLeg.rotation.x = -Math.sin(gait) * 0.36 * amount;
    this.leftShin.rotation.x = -Math.max(0, Math.cos(gait)) * 0.58 * amount;
    this.rightShin.rotation.x = -Math.max(0, -Math.cos(gait)) * 0.58 * amount;
    this.leftArm.rotation.x = -Math.sin(gait - 0.2) * 0.34 * amount;
    this.rightArm.rotation.x = Math.sin(gait - 0.2) * 0.34 * amount;
    const breathe = this.reducedMotion ? 0 : Math.sin(elapsed * 2.15) * (1 - amount) * 0.006;
    this.body.position.y = breathe + Math.sin(gait * 2) * 0.016 * amount;
    this.body.rotation.x = -0.035 * amount;
    this.body.rotation.z = this.reducedMotion ? 0 : Math.sin(gait) * 0.016 * amount - this.turnLean + Math.sin(elapsed * 0.72) * 0.008 * (1 - amount);
    this.head.rotation.x = this.reducedMotion ? 0 : Math.sin(gait + 0.25) * 0.018 * amount;
    this.head.rotation.y = this.reducedMotion || this.cinematic ? 0 : Math.sin(elapsed * 0.45) * 0.055 * (1 - amount);
    if (!this.cinematic) {
      this.leftArm.rotation.z = this.reducedMotion ? 0 : -0.045 - breathe * 1.7;
      this.rightArm.rotation.z = this.reducedMotion ? 0 : 0.045 + breathe * 1.7;
    }
  }

  startEnding(choice: Choice): void {
    this.cinematic = choice;
    this.restoreProps();
    this.mop.visible = false;
    this.cloth.visible = false;
    this.trolley.visible = false;
    this.loadingDock.visible = false;
    this.corridorWalls.visible = choice !== 'B';
    this.cleanStars.visible = false;
    this.cleaningProgress = 0;
    this.delivered = 0;
    this.carrying = null;
    this.remainingAtStart = 0;
    this.visibleLoads = 0;
    this.transportSpeed = 0;
    this.transportMaxSpeed = 0;
    this.camera.clearViewOffset();
    this.motion = 0;
    this.hero.rotation.y = Math.PI;
    this.hero.position.set(0, 0, 3.1);
    this.heroFacing = Math.PI;
    if (choice === 'C') {
      this.box.visible = true;
      this.straps.visible = true;
      this.idleHook.visible = false;
    }
    this.updateEnding(0, choice);
  }

  private restoreProps(): void {
    for (const prop of this.movingProps) {
      prop.object.visible = true;
      prop.object.position.copy(prop.position);
      prop.object.rotation.copy(prop.rotation);
      prop.object.scale.copy(prop.scale);
    }
    for (const dirt of this.dirt) {
      dirt.object.visible = true;
      dirt.object.position.copy(dirt.position);
      dirt.object.rotation.copy(dirt.rotation);
      dirt.object.scale.copy(dirt.scale);
    }
  }

  private poseActor(position: THREE.Vector3, facing: number, time: number, walking: boolean, action: 'walk' | 'mop' | 'wipe' | 'carry' | 'push'): void {
    this.hero.position.copy(position);
    this.hero.rotation.set(0, facing, 0);
    const gait = time * 17;
    const walk = walking && !this.reducedMotion ? 1 : 0;
    this.body.position.y = Math.sin(gait * 2) * 0.018 * walk;
    this.body.rotation.set(walking ? -0.06 : 0, 0, Math.sin(gait) * 0.018 * walk);
    this.head.rotation.set(0, 0, 0);
    this.leftLeg.rotation.set(Math.sin(gait) * 0.38 * walk, 0, 0);
    this.rightLeg.rotation.set(-Math.sin(gait) * 0.38 * walk, 0, 0);
    this.leftShin.rotation.set(-Math.max(0, Math.cos(gait)) * 0.6 * walk, 0, 0);
    this.rightShin.rotation.set(-Math.max(0, -Math.cos(gait)) * 0.6 * walk, 0, 0);
    this.leftArm.rotation.set(-Math.sin(gait) * 0.32 * walk, 0, -0.045);
    this.rightArm.rotation.set(Math.sin(gait) * 0.32 * walk, 0, 0.045);
    if (action === 'mop') {
      const sweep = Math.sin(time * 7.6);
      this.body.rotation.x = -0.13;
      this.body.rotation.y = sweep * 0.12;
      this.head.rotation.x = -0.14;
      this.leftArm.rotation.set(1.1 + sweep * 0.15, 0, -0.2);
      this.rightArm.rotation.set(1.18 + sweep * 0.18, 0, 0.1);
      this.mop.rotation.y = sweep * 0.35;
      this.mop.position.z = sweep * 0.085;
    } else if (action === 'wipe') {
      const wipe = Math.sin(time * 9.5);
      this.body.rotation.x = -0.12;
      this.body.position.y = 0.065;
      this.head.rotation.x = -0.2;
      this.leftArm.rotation.set(1.55, 0, -0.15);
      this.rightArm.rotation.set(1.9 + wipe * 0.11, 0, wipe * 0.28);
      this.cloth.rotation.x = -this.rightArm.rotation.x - this.body.rotation.x;
    } else if (action === 'carry' || action === 'push') {
      this.body.rotation.x = action === 'push' ? -0.12 : 0.035;
      this.leftArm.rotation.set(action === 'push' ? 1.4 : 1.65, 0, -0.12);
      this.rightArm.rotation.set(action === 'push' ? 1.4 : 1.65, 0, 0.12);
    }
  }

  private pathPoint(points: THREE.Vector3[], progress: number): { position: THREE.Vector3; facing: number } {
    const lengths = points.slice(1).map((point, i) => point.distanceTo(points[i]));
    let remaining = THREE.MathUtils.clamp(progress, 0, 1) * lengths.reduce((sum, length) => sum + length, 0);
    for (let i = 0; i < lengths.length; i++) {
      if (remaining <= lengths[i] || i === lengths.length - 1) {
        const direction = points[i + 1].clone().sub(points[i]);
        const fraction = lengths[i] ? remaining / lengths[i] : 1;
        let facing = Math.atan2(-direction.x, -direction.z);
        const next = points.slice(i + 2).find((point) => point.distanceTo(points[i + 1]) > 0.001);
        if (next) {
          const nextDirection = next.clone().sub(points[i + 1]);
          const nextFacing = Math.atan2(-nextDirection.x, -nextDirection.z);
          const turn = THREE.MathUtils.euclideanModulo(nextFacing - facing + Math.PI, Math.PI * 2) - Math.PI;
          facing += turn * ease((fraction - 0.78) / 0.22);
        }
        return { position: points[i].clone().lerp(points[i + 1], fraction), facing };
      }
      remaining -= lengths[i];
    }
    return { position: points[0].clone(), facing: 0 };
  }

  private updateCleaning(time: number): void {
    this.restoreProps();
    this.cleaningProgress = THREE.MathUtils.clamp(time / 9.2, 0, 1);
    this.mop.visible = time >= 1.55 && time < 5.2;
    this.cloth.visible = time >= 6.2 && time < 9.2;
    this.trolley.visible = false;
    this.loadingDock.visible = false;
    if (time < 1.55) {
      const path = this.pathPoint([new THREE.Vector3(0, 0, 3.1), new THREE.Vector3(-1.8, 0, 3.5), new THREE.Vector3(-1.8, 0, 0.45), new THREE.Vector3(-3.7, 0, 0.45)], ease(time / 1.55));
      this.poseActor(path.position, path.facing, time, time > 0.05, 'walk');
    } else if (time < 5.2) {
      const progress = (time - 1.55) / 3.65;
      this.poseActor(new THREE.Vector3(-3.7 + progress * 0.9, 0, 0.45), 0, time, false, 'mop');
    } else if (time < 6.2) {
      const path = this.pathPoint([new THREE.Vector3(-2.8, 0, 0.45), new THREE.Vector3(-4.37, 0, 0.2), new THREE.Vector3(-4.37, 0, -0.82)], ease(time - 5.2));
      this.poseActor(path.position, path.facing, time, true, 'walk');
    } else if (time < 9.2) {
      this.poseActor(new THREE.Vector3(-4.37 + Math.sin(time * 3) * 0.055, 0, -0.82), 0, time, false, 'wipe');
    } else {
      const path = this.pathPoint([new THREE.Vector3(-4.37, 0, -0.82), new THREE.Vector3(-4.37, 0, 0.1)], ease((time - 9.2) / 0.8));
      this.poseActor(path.position, Math.PI - 0.25, time, time < 9.95, 'walk');
    }
    for (const dirt of this.dirt) {
      const cleaned = ease((time - dirt.clearAt) / 0.65);
      if (dirt.paper) {
        // The sheets become an orderly stack rather than being erased.
        const index = this.dirt.filter((item) => item.paper).indexOf(dirt);
        dirt.object.position.lerp(new THREE.Vector3(-0.8, 1.056 + index * 0.009, 0.02), cleaned);
        dirt.object.rotation.y = THREE.MathUtils.lerp(dirt.rotation.y, 0, cleaned);
      } else {
        dirt.object.scale.multiplyScalar(1 - cleaned);
        dirt.object.visible = cleaned < 1;
      }
    }
    this.cleanStars.visible = time >= 9.2;
    this.cleanStars.children.forEach((star, i) => {
      star.scale.setScalar(this.reducedMotion ? 0.55 : Math.max(0, Math.sin(time * 2.8 + i * 1.9)));
      star.rotation.z = Math.PI / 8 + (this.reducedMotion ? 0 : time * 0.15);
    });
    // A high, close view keeps the mop and cloth visible over the other desks.
    const framing = this.camera.aspect < 0.8 ? 1.2 : 1;
    const wiping = ease((time - 5.35) / 1.05);
    this.camera.position.set(
      this.hero.position.x + THREE.MathUtils.lerp(3.3, 3.8, wiping) * framing,
      THREE.MathUtils.lerp(7.5, 5.8, wiping) * framing,
      this.hero.position.z + THREE.MathUtils.lerp(3.6, 2.7, wiping) * framing,
    );
    this.cameraTarget.set(this.hero.position.x + 0.12, THREE.MathUtils.lerp(0.55, 0.88, wiping), this.hero.position.z - THREE.MathUtils.lerp(0.25, 0.45, wiping));
  }

  private transportPose(curve: THREE.CatmullRomCurve3, progress: number, followDistance = 0): { position: THREE.Vector3; facing: number } {
    const position = curve.getPointAt(THREE.MathUtils.clamp(progress, 0, 1));
    const direction = curve.getTangentAt(THREE.MathUtils.clamp(progress, 0, 1));
    direction.y = 0;
    direction.normalize();
    return { position: position.addScaledVector(direction, -followDistance), facing: Math.atan2(-direction.x, -direction.z) };
  }

  private routeSpeed(curve: THREE.CatmullRomCurve3, progress: number, duration: number, followDistance = 0): number {
    const before = Math.max(0, progress - 0.0001);
    const after = Math.min(1, progress + 0.0001);
    return this.transportPose(curve, before, followDistance).position.distanceTo(this.transportPose(curve, after, followDistance).position) / ((after - before) * duration);
  }

  private getTransportRoutes(): NonNullable<OfficeWorld['transportRoutes']> {
    if (this.transportRoutes) return this.transportRoutes;
    const chair = new THREE.CatmullRomCurve3([
      new THREE.Vector3(7.45, 0, 3.25), new THREE.Vector3(7.65, 0, 4.25), new THREE.Vector3(7.65, 0, 8.1),
    ], false, 'centripetal');
    const cart = new THREE.CatmullRomCurve3([
      new THREE.Vector3(6.85, 0, 2), new THREE.Vector3(7.35, 0, 2.5), new THREE.Vector3(7.65, 0, 3.5), new THREE.Vector3(7.65, 0, 8.1),
    ], false, 'centripetal');
    const returnRoute = new THREE.CatmullRomCurve3([
      this.transportPose(chair, 1, 0.58).position, new THREE.Vector3(6.55, 0, 6.85), new THREE.Vector3(6.55, 0, 2.3), this.transportPose(cart, 0, 0.65).position,
    ], false, 'centripetal');
    let peakSpeed = 0;
    for (let i = 0; i <= 80; i++) {
      peakSpeed = Math.max(peakSpeed, this.routeSpeed(chair, i / 80, 5, 0.58), this.routeSpeed(returnRoute, i / 80, 3.7), this.routeSpeed(cart, i / 80, 3.5, 0.65));
    }
    this.transportRoutes = { chair, cart, return: returnRoute, peakSpeed };
    return this.transportRoutes;
  }

  private updateTransport(time: number): void {
    this.restoreProps();
    this.mop.visible = false;
    this.cloth.visible = false;
    this.cleanStars.visible = false;
    this.trolley.visible = false;
    this.loadingDock.visible = true;
    this.corridorWalls.visible = false;
    this.carrying = null;
    this.transportSpeed = 0;
    // Begin at the end of the job: the other fourteen loads have already left.
    const chair = this.movingProps.find((prop) => prop.kind === 'chair' && prop.position.x > 0 && prop.position.z > 2)!;
    const cart = this.movingProps.find((prop) => prop.kind === 'cart')!;
    const routes = this.getTransportRoutes();
    for (const prop of this.movingProps) prop.object.visible = prop === chair || prop === cart;
    for (const dirt of this.dirt) if (dirt.object.parent === this.clutter) dirt.object.visible = false;
    chair.object.position.copy(routes.chair.getPointAt(0));
    cart.object.position.copy(routes.cart.getPointAt(0));
    cart.object.rotation.y = this.transportPose(routes.cart, 0).facing;
    this.remainingAtStart = 2;
    this.delivered = this.movingProps.length - 2;
    this.visibleLoads = 2;
    this.transportMaxSpeed = routes.peakSpeed;

    if (time < 0.9) {
      const lift = ease(time / 0.9);
      const pose = this.transportPose(routes.chair, 0, 0.58);
      this.poseActor(pose.position, pose.facing, time * 0.5, false, 'carry');
      this.body.rotation.x = -0.15 * (1 - lift);
      chair.object.position.y = 0.54 * lift;
      chair.object.rotation.y = THREE.MathUtils.lerp(chair.rotation.y, pose.facing, lift);
      this.carrying = chair.object.name;
    } else if (time < 5.9) {
      const progress = (time - 0.9) / 5;
      const pose = this.transportPose(routes.chair, progress, 0.58);
      this.poseActor(pose.position, pose.facing, time * 0.5, true, 'carry');
      chair.object.position.copy(routes.chair.getPointAt(progress));
      chair.object.position.y = 0.54;
      chair.object.rotation.y = pose.facing;
      this.carrying = chair.object.name;
      this.transportSpeed = this.routeSpeed(routes.chair, progress, 5, 0.58);
    } else {
      chair.object.visible = false;
      chair.object.position.copy(routes.chair.getPointAt(1));
      this.delivered++;
      this.visibleLoads--;
      if (time < 9.6) {
        const progress = (time - 5.9) / 3.7;
        const pose = this.transportPose(routes.return, progress);
        this.poseActor(pose.position, pose.facing, time * 0.5, true, 'walk');
        this.transportSpeed = this.routeSpeed(routes.return, progress, 3.7);
      } else if (time < 10.3) {
        const grip = ease((time - 9.6) / 0.7);
        const returnPose = this.transportPose(routes.return, 1);
        const pushPose = this.transportPose(routes.cart, 0, 0.65);
        const turn = THREE.MathUtils.euclideanModulo(pushPose.facing - returnPose.facing + Math.PI, Math.PI * 2) - Math.PI;
        this.poseActor(pushPose.position, returnPose.facing + turn * grip, time * 0.5, false, 'push');
        this.carrying = cart.object.name;
      } else if (time < 13.8) {
        const progress = (time - 10.3) / 3.5;
        const pose = this.transportPose(routes.cart, progress, 0.65);
        this.poseActor(pose.position, pose.facing, time * 0.5, true, 'push');
        cart.object.position.copy(routes.cart.getPointAt(progress));
        cart.object.rotation.y = pose.facing;
        this.carrying = cart.object.name;
        this.transportSpeed = this.routeSpeed(routes.cart, progress, 3.5, 0.65);
      } else {
        cart.object.position.copy(routes.cart.getPointAt(1));
        cart.object.visible = false;
        this.delivered++;
        this.visibleLoads--;
        const pose = this.transportPose(routes.cart, 1, 0.65);
        this.poseActor(pose.position, pose.facing, time * 0.5, false, 'walk');
      }
    }
    // A single still camera lets the two final trips read without orbiting the worker.
    const framing = this.camera.aspect < 0.8 ? 1.28 : 1;
    this.camera.position.set(12.4 * framing, 10.2 * framing, 14.3 * framing);
    this.cameraTarget.set(3.8, 0.65, 2.6);
  }
  updateEnding(t: number, choice: Choice): void {
    const time = THREE.MathUtils.clamp(t, 0, choice === 'A' ? 10 : choice === 'B' ? 16 : 8);
    if (choice === 'C') {
      const lift = ease(time / 2.1);
      const travel = ease((time - 2) / 2.5);
      const descend = ease((time - 4.1) / 1.8);
      this.office.position.set(travel * 18.5, lift * 7.2 - descend * 6.74, travel * 0.5);
      this.office.rotation.z = this.reducedMotion ? 0 : Math.sin(time * 1.3) * 0.025 * lift * (1 - descend);
      this.straps.visible = time < 6.6;
      const close = ease((time - 6) / 1.65);
      // Both long flaps rotate a half turn from outside to cover the payload.
      this.flaps[0].rotation.x = Math.PI * close;
      this.flaps[1].rotation.x = -Math.PI * close;
      this.flaps[2].rotation.z = -Math.PI * close;
      this.flaps[3].rotation.z = Math.PI * close;
      this.hero.visible = time < 5.9;
      const pullback = ease(time / 2.5);
      const framing = this.camera.aspect < 0.8 ? 1.55 : 1;
      this.camera.position.set(
        THREE.MathUtils.lerp(14, 39 * framing, pullback),
        THREE.MathUtils.lerp(13, 30 * framing, pullback),
        THREE.MathUtils.lerp(18, 33 * framing, pullback),
      );
      this.cameraTarget.set(THREE.MathUtils.lerp(1, 13, pullback), 1.9 + lift * (1 - descend) * 2, -0.6);
      this.craneCable.visible = time < 6.5;
      this.office.updateWorldMatrix(true, false);
      this.crane.updateWorldMatrix(true, false);
      const hook = this.crane.worldToLocal(this.office.localToWorld(new THREE.Vector3(0, 7.55, 0)));
      const boomTip = hook.clone().add(new THREE.Vector3(0, 3.1, 0));
      this.positionCraneBoom(boomTip);
      const cableDirection = hook.clone().sub(boomTip);
      this.craneCable.position.copy(hook.clone().add(boomTip).multiplyScalar(0.5));
      this.craneCable.scale.y = cableDirection.length() / 8;
      this.craneCable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cableDirection.normalize());
    } else if (choice === 'A') this.updateCleaning(time);
    else this.updateTransport(time);
    this.camera.fov = 42;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.cameraTarget);
  }

  reset(): void {
    this.cinematic = null;
    this.office.position.set(0, 0, 0);
    this.office.rotation.set(0, 0, 0);
    this.furniture.position.set(0, 0, 0);
    this.furniture.scale.setScalar(1);
    this.furniture.visible = true;
    this.clutter.visible = true;
    this.restoreProps();
    this.hero.visible = true;
    this.hero.position.set(0, 0, 3);
    this.hero.rotation.y = 0;
    this.heroFacing = 0;
    this.body.position.y = 0;
    this.body.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.leftArm.rotation.set(0, 0, 0);
    this.rightArm.rotation.set(0, 0, 0);
    this.leftLeg.rotation.set(0, 0, 0);
    this.rightLeg.rotation.set(0, 0, 0);
    this.leftShin.rotation.set(0, 0, 0);
    this.rightShin.rotation.set(0, 0, 0);
    this.motion = 0;
    this.gaitPhase = 0;
    this.turnLean = 0;
    this.box.visible = false;
    this.cleanStars.visible = false;
    this.mop.visible = false;
    this.mop.rotation.set(0, 0, 0);
    this.mop.position.set(0.12, 0, 0);
    this.cloth.visible = false;
    this.cloth.rotation.set(0, 0, 0);
    this.trolley.visible = false;
    this.loadingDock.visible = false;
    this.corridorWalls.visible = true;
    this.cleaningProgress = 0;
    this.delivered = 0;
    this.carrying = null;
    this.remainingAtStart = 0;
    this.visibleLoads = 0;
    this.transportSpeed = 0;
    this.transportMaxSpeed = 0;
    this.straps.visible = false;
    this.crane.position.set(9, -0.75, -11.0);
    this.crane.scale.setScalar(1);
    this.craneCable.visible = false;
    this.idleHook.visible = true;
    this.positionCraneBoom(new THREE.Vector3(6.7, 6.8, 0));
    for (const flap of this.flaps) flap.rotation.set(0, 0, 0);
    this.setClues(new Set(), null);
  }

  diagnostics(): { clueMarkers: number; drawCalls: number; triangles: number; hero: { bodyY: number; leftKnee: number; rightKnee: number; x: number; z: number; facing: number }; camera: { x: number; y: number; z: number; targetX: number; targetY: number; targetZ: number }; cleaning: { progress: number; mopVisible: boolean; clothVisible: boolean }; transport: { delivered: number; total: number; carrying: string | null; remainingAtStart: number; visibleLoads: number; speed: number; maxSpeed: number } } {
    return {
      clueMarkers: 0,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      hero: { bodyY: this.body.position.y, leftKnee: this.leftShin.rotation.x, rightKnee: this.rightShin.rotation.x, x: this.hero.position.x, z: this.hero.position.z, facing: this.hero.rotation.y },
      camera: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z, targetX: this.cameraTarget.x, targetY: this.cameraTarget.y, targetZ: this.cameraTarget.z },
      cleaning: { progress: this.cleaningProgress, mopVisible: this.mop.visible, clothVisible: this.cloth.visible },
      transport: { delivered: this.delivered, total: this.movingProps.length, carrying: this.carrying, remainingAtStart: this.remainingAtStart, visibleLoads: this.visibleLoads, speed: this.transportSpeed, maxSpeed: this.transportMaxSpeed },
    };
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
