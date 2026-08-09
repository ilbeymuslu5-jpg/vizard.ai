import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PointLight,
  Raycaster,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';

import type { CellIndex, GridState, Item, ItemType } from '../../src/types/game';
import { isGeneratorType } from '../../src/constants/itemTrees';
import { CHAIN_COLORS, drawEmblem } from '../icons';

/**
 * The merge board as a real 3D scene.
 *
 * Design intent: a workbench under a warm lamp. Items are physical chips that
 * sit in routed sockets, cast soft shadows and lift toward the light when you
 * pick them up. Everything the player reads at a glance - what a chip is, how
 * far up the chain it is, whether it is a generator - is carried by the chip's
 * own materials (engraved emblem, rim colour, glow) rather than by UI chrome
 * printed on top of the scene.
 *
 * Rendering budget: one directional shadow-casting light, no post-processing,
 * ~40 meshes. That holds 60fps on a mid-range phone, which matters more here
 * than any extra effect would.
 */

const COLS = 5;
const ROWS = 6;
const CELL = 1;
const GAP = 0.09;
const PITCH = CELL + GAP;
const CHIP_R = 0.4;
const CHIP_H = 0.17;
const LIFT = 0.55;

/**
 * Camera placement.
 *
 * High and only slightly forward: enough tilt that chips read as objects with
 * thickness, flat enough that the far row is the same size as the near one.
 * A steeper angle looks more dramatic and makes the top row unplayable.
 */
const CAMERA_POSITION = new Vector3(0, 11.6, 3.5);

/** Level ramp, matched to the CSS tokens so 2D and 3D agree. */
const LEVEL_COLORS = [
  '#b9a88f', '#d6bd94', '#eec177', '#ffb44b', '#ff9145',
  '#c3cd85', '#86d189', '#63d2d8', '#9adcff', '#fff0bd',
];

function levelColor(level: number): string {
  return LEVEL_COLORS[Math.min(LEVEL_COLORS.length, Math.max(1, level)) - 1] ?? LEVEL_COLORS[0]!;
}

function cellPosition(index: CellIndex): Vector3 {
  const row = Math.floor(index / COLS);
  const col = index % COLS;
  return new Vector3(
    (col - (COLS - 1) / 2) * PITCH,
    0,
    (row - (ROWS - 1) / 2) * PITCH,
  );
}

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------

/** Oak-ish grain for the bench, drawn once into a canvas. */
function benchTexture(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2D context unavailable');

  ctx.fillStyle = '#4a3728';
  ctx.fillRect(0, 0, size, size);

  // Long grain lines with wandering amplitude read as sawn timber.
  for (let i = 0; i < 190; i += 1) {
    const y = Math.random() * size;
    const amplitude = 2 + Math.random() * 9;
    ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '32,22,14' : '108,80,52'},${0.05 + Math.random() * 0.13})`;
    ctx.lineWidth = 0.6 + Math.random() * 2.4;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 8) {
      const ny = y + Math.sin((x / size) * Math.PI * (1 + Math.random() * 0.4)) * amplitude;
      if (x === 0) ctx.moveTo(x, ny);
      else ctx.lineTo(x, ny);
    }
    ctx.stroke();
  }

  // A couple of knots so the plane never looks like a gradient.
  for (let i = 0; i < 3; i += 1) {
    const kx = Math.random() * size;
    const ky = Math.random() * size;
    for (let r = 22; r > 0; r -= 3) {
      ctx.strokeStyle = `rgba(30,20,12,${0.05 + (22 - r) * 0.006})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(kx, ky, r, r * 0.62, 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Chip face: engraved emblem plus the level numeral, on a brushed disc. */
function chipTexture(itemType: ItemType, level: number): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2D context unavailable');

  const generator = isGeneratorType(itemType);
  const face = ctx.createRadialGradient(size * 0.4, size * 0.32, 8, size * 0.5, size * 0.5, size * 0.62);
  face.addColorStop(0, generator ? '#5f4a28' : '#4b3c2b');
  face.addColorStop(1, generator ? '#332714' : '#291f16');
  ctx.fillStyle = face;
  ctx.fillRect(0, 0, size, size);

  // Turned-metal rings, faint, to catch the light like a real token.
  ctx.strokeStyle = 'rgba(255,236,200,.05)';
  for (let r = 18; r < size * 0.52; r += 7) {
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Emblem, centred on a 24-grid scaled to 62% of the face.
  const emblemSize = size * 0.62;
  ctx.save();
  ctx.translate((size - emblemSize) / 2, (size - emblemSize) / 2 - size * 0.03);
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  drawEmblem(ctx, itemType, emblemSize, CHAIN_COLORS[itemType]);
  ctx.restore();

  // Level plate at the bottom of the face.
  const plateW = size * 0.3;
  const plateH = size * 0.15;
  ctx.fillStyle = 'rgba(12,9,6,.62)';
  ctx.beginPath();
  ctx.roundRect((size - plateW) / 2, size * 0.775, plateW, plateH, 7);
  ctx.fill();
  ctx.fillStyle = levelColor(level);
  ctx.font = `700 ${Math.round(size * 0.115)}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(level), size / 2, size * 0.775 + plateH / 2 + 1);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export interface BoardCallbacks {
  readonly onTap: (index: CellIndex) => void;
  readonly onDrop: (from: CellIndex, to: CellIndex) => void;
}

interface Chip {
  readonly group: Group;
  readonly body: Mesh;
  readonly rim: Mesh;
  itemId: string;
  index: CellIndex;
  /** Animation state: 0..1 progress of the current entrance/merge tween. */
  spawnT: number;
  popT: number;
}

export class Board3D {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly sockets: Mesh[] = [];
  private readonly locks: Mesh[] = [];
  private readonly chips = new Map<CellIndex, Chip>();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly boardPlane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly highlight: Mesh;
  private readonly chipGeometry = new CylinderGeometry(CHIP_R, CHIP_R * 0.94, CHIP_H, 30, 1);
  private readonly rimGeometry = new CylinderGeometry(CHIP_R * 1.03, CHIP_R * 1.03, CHIP_H * 0.42, 30, 1, true);
  private readonly faceGeometry = new CircleGeometry(CHIP_R * 0.93, 34);
  private readonly textures: CanvasTexture[] = [];

  private grid: GridState | null = null;
  private dragging: { chip: Chip; from: CellIndex; pointerId: number; moved: boolean } | null = null;
  private hoverIndex: CellIndex | null = null;
  private sway = new Vector2();
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: BoardCallbacks,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.outputColorSpace = SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    // Framing is computed, not eyeballed: the whole grid plus a margin has to
    // fit at any aspect ratio, or the bottom row ends up under the tab bar.
    this.camera = new PerspectiveCamera(38, 1, 0.1, 60);
    this.camera.position.copy(CAMERA_POSITION);
    this.camera.lookAt(0, 0, 0);

    this.buildLights();
    this.buildBench();
    this.buildSockets();

    this.highlight = new Mesh(
      new RingGeometry(CHIP_R * 1.12, CHIP_R * 1.3, 40),
      new MeshStandardMaterial({ color: new Color('#ffcf7a'), emissive: new Color('#c9973f'), emissiveIntensity: 1.6, transparent: true, opacity: 0 }),
    );
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.position.y = 0.055;
    this.scene.add(this.highlight);

    this.attachInput();
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  // -- construction ------------------------------------------------------

  private buildLights(): void {
    this.scene.add(new AmbientLight(new Color('#7d7183'), 1.5));

    // Key: the workshop lamp, warm, high and slightly to the left.
    const key = new DirectionalLight(new Color('#ffd7a1'), 3.1);
    key.position.set(-3.4, 8.5, 4.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.bias = -0.0014;
    key.shadow.radius = 3;
    this.scene.add(key);

    // Cool bounce from behind, so chip rims separate from the bench.
    const fill = new PointLight(new Color('#5fa8c4'), 34, 26, 2);
    fill.position.set(4.2, 4.4, -5.2);
    this.scene.add(fill);
  }

  private buildBench(): void {
    const texture = benchTexture();
    this.textures.push(texture);

    const bench = new Mesh(
      new PlaneGeometry(26, 26),
      new MeshStandardMaterial({ map: texture, roughness: 0.88, metalness: 0.02, color: new Color('#c39c6c') }),
    );
    bench.rotation.x = -Math.PI / 2;
    bench.position.y = -0.09;
    bench.receiveShadow = true;
    this.scene.add(bench);

    // The routed tray the sockets sit in: a bed plus four rails. The rails are
    // what make the board read as an object on a bench rather than a texture
    // painted on the floor.
    const trayW = COLS * PITCH + 0.62;
    const trayD = ROWS * PITCH + 0.62;

    const bed = new Mesh(
      new PlaneGeometry(trayW, trayD),
      new MeshStandardMaterial({ color: new Color('#4a3826'), roughness: 1 }),
    );
    bed.rotation.x = -Math.PI / 2;
    bed.position.y = -0.035;
    bed.receiveShadow = true;
    this.scene.add(bed);

    const railMaterial = new MeshStandardMaterial({
      map: texture,
      color: new Color('#9a7850'),
      roughness: 0.8,
    });
    const rails: Array<[number, number, number, number, number]> = [
      [trayW + 0.5, 0.26, 0.5, 0, (trayD + 0.5) / 2],
      [trayW + 0.5, 0.26, 0.5, 0, -(trayD + 0.5) / 2],
      [0.5, 0.26, trayD + 0.5, (trayW + 0.5) / 2, 0],
      [0.5, 0.26, trayD + 0.5, -(trayW + 0.5) / 2, 0],
    ];
    for (const [w, h, d, x, z] of rails) {
      const rail = new Mesh(new BoxGeometry(w, h, d), railMaterial);
      rail.position.set(x, 0.06, z);
      rail.castShadow = true;
      rail.receiveShadow = true;
      this.scene.add(rail);
    }
  }

  private buildSockets(): void {
    const socketGeometry = new CircleGeometry(CHIP_R * 1.16, 34);
    const ringGeometry = new RingGeometry(CHIP_R * 1.17, CHIP_R * 1.24, 34);
    const lockGeometry = new RingGeometry(CHIP_R * 0.3, CHIP_R * 0.42, 24);
    for (let index = 0; index < COLS * ROWS; index += 1) {
      // A bright lip around each hole: without it the empty board is a void.
      const ring = new Mesh(
        ringGeometry,
        new MeshStandardMaterial({ color: new Color('#4b3927'), roughness: 0.95 }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(cellPosition(index));
      ring.position.y = -0.018;
      this.scene.add(ring);

      const socket = new Mesh(
        socketGeometry,
        new MeshStandardMaterial({ color: new Color('#1c1510'), roughness: 1 }),
      );
      socket.rotation.x = -Math.PI / 2;
      socket.position.copy(cellPosition(index));
      socket.position.y = -0.02;
      socket.receiveShadow = true;
      socket.userData['index'] = index;
      this.scene.add(socket);
      this.sockets.push(socket);

      // Locked cells get a brass ring marker rather than just a darker hole:
      // "not yet yours" has to be legible at a glance, not inferred.
      const lock = new Mesh(
        lockGeometry,
        new MeshStandardMaterial({
          color: new Color('#c9973f'),
          emissive: new Color('#8d6a2c'),
          emissiveIntensity: 0.5,
          roughness: 0.5,
          metalness: 0.4,
        }),
      );
      lock.rotation.x = -Math.PI / 2;
      lock.position.copy(cellPosition(index));
      lock.position.y = -0.01;
      lock.visible = false;
      this.scene.add(lock);
      this.locks.push(lock);
    }
  }

  // -- state -------------------------------------------------------------

  /** Rebuilds only the chips whose cell contents changed. */
  sync(grid: GridState): void {
    this.grid = grid;

    grid.cells.forEach((cell) => {
      const socket = this.sockets[cell.index];
      if (socket !== undefined) {
        (socket.material as MeshStandardMaterial).color.set(cell.locked ? '#140f0a' : '#1c1510');
      }
      const lock = this.locks[cell.index];
      if (lock !== undefined) lock.visible = cell.locked;

      const existing = this.chips.get(cell.index);
      const item = cell.item;

      if (item === null) {
        if (existing !== undefined) this.removeChip(cell.index);
        return;
      }
      if (existing !== undefined && existing.itemId === item.id) return;
      if (existing !== undefined) this.removeChip(cell.index);
      this.addChip(cell.index, item, existing !== undefined);
    });
  }

  private addChip(index: CellIndex, item: Item, replaced: boolean): void {
    const group = new Group();
    group.position.copy(cellPosition(index));

    const texture = chipTexture(item.itemType, item.level);
    this.textures.push(texture);

    const generator = isGeneratorType(item.itemType);
    const side = new MeshStandardMaterial({
      color: new Color(levelColor(item.level)).multiplyScalar(0.55),
      roughness: 0.55,
      metalness: 0.35,
    });
    const shell = new MeshStandardMaterial({ color: new Color('#2e2318'), roughness: 0.8 });

    const body = new Mesh(this.chipGeometry, [side, shell, shell]);
    body.castShadow = true;
    body.position.y = CHIP_H / 2;
    group.add(body);

    // The artwork lives on its own disc rather than the cylinder cap: cap UVs
    // are radial, which rotates and skews a square texture. A flat circle has
    // predictable UVs, so the emblem always sits upright to the camera.
    const face = new Mesh(this.faceGeometry, new MeshStandardMaterial({
      map: texture,
      roughness: 0.6,
      metalness: 0.16,
    }));
    face.rotation.x = -Math.PI / 2;
    face.position.y = CHIP_H + 0.002;
    group.add(face);

    // A glowing band at the level colour: the chip states its own tier.
    const rim = new Mesh(
      this.rimGeometry,
      new MeshStandardMaterial({
        color: new Color(levelColor(item.level)),
        emissive: new Color(levelColor(item.level)),
        emissiveIntensity: generator ? 0.9 : 0.34,
        roughness: 0.4,
        transparent: true,
        opacity: 0.95,
      }),
    );
    rim.position.y = CHIP_H * 0.62;
    group.add(rim);

    if (generator) {
      // Sits low and close so it pools on the bench instead of flaring the face.
      const lamp = new PointLight(new Color('#ffc46a'), 1.1, 1.5, 2);
      lamp.position.y = 0.12;
      group.add(lamp);
    }

    this.scene.add(group);
    this.chips.set(index, {
      group,
      body,
      rim,
      itemId: item.id,
      index,
      spawnT: replaced ? 1 : 0,
      popT: replaced ? 0 : 1,
    });
  }

  private removeChip(index: CellIndex): void {
    const chip = this.chips.get(index);
    if (chip === undefined) return;
    this.scene.remove(chip.group);
    chip.group.traverse((object) => {
      if (object instanceof Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.chips.delete(index);
  }

  /** Plays the merge punch on the chip that just levelled up. */
  punch(index: CellIndex): void {
    const chip = this.chips.get(index);
    if (chip !== undefined) chip.popT = 0;
  }

  // -- input -------------------------------------------------------------

  private attachInput(): void {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('pointerdown', (event: PointerEvent) => {
      const index = this.pickCell(event);
      if (index === null) return;
      const chip = this.chips.get(index);
      if (chip === undefined) return;
      canvas.setPointerCapture(event.pointerId);
      this.dragging = { chip, from: index, pointerId: event.pointerId, moved: false };
    });

    canvas.addEventListener('pointermove', (event: PointerEvent) => {
      if (this.dragging === null) {
        // Idle parallax: the bench leans very slightly toward the pointer.
        const rect = canvas.getBoundingClientRect();
        this.sway.set(
          ((event.clientX - rect.left) / rect.width - 0.5) * 0.22,
          ((event.clientY - rect.top) / rect.height - 0.5) * 0.14,
        );
        return;
      }
      if (event.pointerId !== this.dragging.pointerId) return;

      const point = this.pointOnBoard(event);
      if (point === null) return;
      this.dragging.moved = true;
      this.dragging.chip.group.position.set(point.x, LIFT, point.z);

      const over = this.nearestCell(point);
      this.hoverIndex = over;
      if (over !== null && over !== this.dragging.from) {
        this.highlight.position.set(cellPosition(over).x, 0.055, cellPosition(over).z);
      }
    });

    const end = (event: PointerEvent): void => {
      const session = this.dragging;
      if (session === null || event.pointerId !== session.pointerId) return;
      this.dragging = null;
      this.hoverIndex = null;

      if (!session.moved) {
        this.settleChip(session.chip);
        this.callbacks.onTap(session.from);
        return;
      }

      const point = this.pointOnBoard(event);
      const target = point === null ? null : this.nearestCell(point);
      this.settleChip(session.chip);
      if (target !== null && target !== session.from) this.callbacks.onDrop(session.from, target);
      else this.sync(this.grid!);
    };

    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  /** Drops a dragged chip back into its socket (the store decides the truth). */
  private settleChip(chip: Chip): void {
    chip.group.position.copy(cellPosition(chip.index));
  }

  private updatePointer(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private pickCell(event: PointerEvent): CellIndex | null {
    const point = this.pointOnBoard(event);
    return point === null ? null : this.nearestCell(point);
  }

  private pointOnBoard(event: PointerEvent): Vector3 | null {
    this.updatePointer(event);
    const hit = new Vector3();
    return this.raycaster.ray.intersectPlane(this.boardPlane, hit) === null ? null : hit;
  }

  /** Snaps a world point to the closest cell, within half a pitch. */
  private nearestCell(point: Vector3): CellIndex | null {
    const col = Math.round(point.x / PITCH + (COLS - 1) / 2);
    const row = Math.round(point.z / PITCH + (ROWS - 1) / 2);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
    return row * COLS + col;
  }

  /** Screen position of a cell centre - used by the automated tests. */
  screenPosition(index: CellIndex): { x: number; y: number } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const projected = cellPosition(index).clone().project(this.camera);
    return {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height,
    };
  }

  // -- loop --------------------------------------------------------------

  private resize = (): void => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;

    // Widen the lens until both the board's width and its (foreshortened)
    // depth fit with a margin. Doing this in code means the board is fully
    // playable on a tall phone and a short desktop window alike.
    const distance = this.camera.position.length();
    const needWidth = COLS * PITCH + 1.35;
    const needDepth = (ROWS * PITCH + 1.35) * 0.94;
    const fovForHeight = 2 * Math.atan(needDepth / 2 / distance);
    const fovForWidth = 2 * Math.atan(needWidth / 2 / distance / this.camera.aspect);
    this.camera.fov = (Math.max(fovForHeight, fovForWidth) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
  };

  render(dt: number): void {
    if (this.disposed) return;
    if (this.renderer.domElement.width === 0) this.resize();

    // Chip animations: a spring-ish entrance and a punch on merge.
    this.chips.forEach((chip) => {
      if (chip.spawnT < 1) {
        chip.spawnT = Math.min(1, chip.spawnT + dt * 3.4);
        const t = 1 - Math.pow(1 - chip.spawnT, 3);
        chip.group.scale.setScalar(0.35 + t * 0.65);
        chip.group.position.y = (1 - t) * 1.5;
      }
      if (chip.popT < 1) {
        chip.popT = Math.min(1, chip.popT + dt * 2.6);
        const punch = Math.sin(chip.popT * Math.PI) * 0.24;
        chip.group.scale.setScalar(1 + punch);
        chip.group.position.y = punch * 0.5;
        chip.group.rotation.y = (1 - chip.popT) * 0.9;
      }
      if (chip.spawnT >= 1 && chip.popT >= 1 && this.dragging?.chip !== chip) {
        chip.group.scale.setScalar(1);
        chip.group.rotation.y = 0;
        chip.group.position.y = 0;
      }
    });

    // Dragged chip hovers and turns very slightly - it feels held.
    if (this.dragging !== null) {
      this.dragging.chip.group.position.y = LIFT;
      this.dragging.chip.group.rotation.z = Math.sin(performance.now() / 260) * 0.05;
      this.dragging.chip.group.scale.setScalar(1.12);
    }

    const material = this.highlight.material as MeshStandardMaterial;
    const wantsHighlight = this.dragging !== null && this.hoverIndex !== null;
    material.opacity += ((wantsHighlight ? 0.9 : 0) - material.opacity) * Math.min(1, dt * 12);

    // Parallax decays back to centre. Left latched at the last pointer
    // position it reads as a crooked board, not as depth.
    this.sway.multiplyScalar(Math.max(0, 1 - dt * 1.6));

    // Parallax, damped so it never fights a drag.
    this.camera.position.x += (CAMERA_POSITION.x + this.sway.x - this.camera.position.x) * Math.min(1, dt * 2.2);
    this.camera.position.y += (CAMERA_POSITION.y - this.sway.y - this.camera.position.y) * Math.min(1, dt * 2.2);
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('resize', this.resize);
    this.textures.forEach((texture) => texture.dispose());
    this.chipGeometry.dispose();
    this.rimGeometry.dispose();
    this.faceGeometry.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
