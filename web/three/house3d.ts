import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PointLight,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';

/**
 * Willow House in 3D: one model that gains parts as rooms are restored.
 *
 * The ruin is always the base mesh; every restored room adds geometry and, for
 * the interior rooms, a light that switches on. Progress therefore reads as
 * repair rather than as a slideshow of separate pictures, and a returning
 * player can see at a glance exactly how far they have got.
 */

const WOOD = new MeshStandardMaterial({ color: new Color('#6d5942'), roughness: 0.95 });
const WOOD_DARK = new MeshStandardMaterial({ color: new Color('#4b3626'), roughness: 1 });
const WOOD_WARM = new MeshStandardMaterial({ color: new Color('#9c7248'), roughness: 0.85 });
const STONE = new MeshStandardMaterial({ color: new Color('#6a6055'), roughness: 1 });
const GLASS_LIT = new MeshBasicMaterial({ color: new Color('#ffc879') });
const GLASS_DARK = new MeshStandardMaterial({ color: new Color('#17130f'), roughness: 0.6 });
const GLASS_PANE = new MeshStandardMaterial({
  color: new Color('#9fd0d4'),
  roughness: 0.12,
  metalness: 0.1,
  transparent: true,
  opacity: 0.32,
});

function box(w: number, h: number, d: number, material: MeshStandardMaterial | MeshBasicMaterial): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function place(object: Object3D, x: number, y: number, z: number): Object3D {
  object.position.set(x, y, z);
  return object;
}

export class House3D {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly model = new Group();
  private readonly rooms = new Map<string, Group>();
  /** Boarding over each opening; removed when that room is restored. */
  private readonly boards = new Map<string, Group>();
  private readonly smoke: Mesh[] = [];
  private spin = 0;
  private disposed = false;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.outputColorSpace = SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    this.camera = new PerspectiveCamera(30, 1, 0.1, 60);
    this.camera.position.set(0.6, 4.2, 12.4);
    this.camera.lookAt(0, 1.5, 0);

    this.buildLights();
    this.buildGround();
    this.buildRuin();
    this.buildRooms();
    this.scene.add(this.model);

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  private buildLights(): void {
    this.scene.add(new AmbientLight(new Color('#59536e'), 1.9));

    // Late sun, front-left and low: it rakes across the facade so the boarded
    // windows and, later, the new joinery both read in silhouette.
    const sun = new DirectionalLight(new Color('#ffbe80'), 3.4);
    sun.position.set(-6, 5.4, 7.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 22;
    sun.shadow.camera.left = -6;
    sun.shadow.camera.right = 6;
    sun.shadow.camera.top = 6;
    sun.shadow.camera.bottom = -4;
    sun.shadow.bias = -0.0016;
    this.scene.add(sun);

    // Cool rim from behind, to lift the roofline off the sky.
    const rim = new DirectionalLight(new Color('#8fb6e8'), 1.5);
    rim.position.set(4.5, 4.5, -6);
    this.scene.add(rim);
  }

  private buildGround(): void {
    const ground = new Mesh(
      new CircleGeometry(13, 56),
      new MeshStandardMaterial({ color: new Color('#3b452e'), roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Scrubby grass so the plot does not read as a flat disc.
    for (let i = 0; i < 42; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 2.6 + Math.random() * 4.4;
      const blade = new Mesh(
        new ConeGeometry(0.05, 0.22 + Math.random() * 0.2, 4),
        new MeshStandardMaterial({ color: new Color(Math.random() < 0.5 ? '#46552f' : '#3a4a28'), roughness: 1 }),
      );
      blade.position.set(Math.cos(angle) * radius, 0.12, Math.sin(angle) * radius);
      blade.castShadow = true;
      this.scene.add(blade);
    }
  }

  /** The state you start in: four walls, boarded openings, no roof. */
  private buildRuin(): void {
    const shell = box(3.6, 2.5, 2.8, WOOD);
    shell.position.y = 1.25;
    this.model.add(shell);

    // Foundation course.
    const base = box(3.9, 0.3, 3.1, STONE);
    base.position.y = 0.15;
    this.model.add(base);

    // Broken rafters: what is left of the old roof.
    for (let i = -1; i <= 1; i += 1) {
      const rafter = box(0.16, 0.16, 3.1, WOOD_DARK);
      rafter.position.set(i * 1.2, 2.55, 0);
      rafter.rotation.z = (i * 5 * Math.PI) / 180;
      this.model.add(rafter);
    }
    const brokenBeam = box(3.7, 0.18, 0.18, WOOD_DARK);
    brokenBeam.position.set(0.1, 2.72, 0.4);
    brokenBeam.rotation.z = -0.12;
    this.model.add(brokenBeam);

    // Openings, boarded over. Each set of boards is grouped under its room id
    // so a restore takes the boards down instead of glazing over them.
    const openings: Array<[string, number, number, number, number]> = [
      ['kitchen', -1.05, 1.35, 0.62, 0.72],
      ['parlour', 1.05, 1.35, 0.62, 0.72],
      ['bedroom', 0, 2.05, 0.5, 0.5],
    ];
    for (const [id, x, y, w, h] of openings) {
      const group = new Group();
      const hole = box(w, h, 0.08, GLASS_DARK);
      hole.position.set(x, y, 1.42);
      group.add(hole);
      for (let i = 0; i < 2; i += 1) {
        const plank = box(w * 1.25, 0.1, 0.06, WOOD_DARK);
        plank.position.set(x, y, 1.47);
        plank.rotation.z = i === 0 ? 0.5 : -0.5;
        group.add(plank);
      }
      this.model.add(group);
      this.boards.set(id, group);
    }

    // Doorway: dark until the porch is rebuilt.
    const doorGroup = new Group();
    const door = box(0.62, 1.15, 0.1, WOOD_DARK);
    door.position.set(0, 0.6, 1.42);
    doorGroup.add(door);
    this.model.add(doorGroup);
    this.boards.set('porch', doorGroup);
  }

  private buildRooms(): void {
    this.rooms.set('porch', this.buildPorch());
    this.rooms.set('kitchen', this.buildWindow(-1.05, 1.35, 0.72, 0.82));
    this.rooms.set('parlour', this.buildWindow(1.05, 1.35, 0.72, 0.82));
    this.rooms.set('bedroom', this.buildWindow(0, 2.05, 0.6, 0.6));
    this.rooms.set('glasshouse', this.buildGlasshouse());
    this.rooms.set('roof', this.buildRoof());

    this.rooms.forEach((group) => {
      group.visible = false;
      this.model.add(group);
    });
  }

  private buildPorch(): Group {
    const group = new Group();

    const deck = box(2.1, 0.16, 0.9, WOOD_WARM);
    group.add(place(deck, 0, 0.36, 1.85));

    for (let i = 0; i < 2; i += 1) {
      const step = box(1.5 - i * 0.2, 0.12, 0.26, WOOD_WARM);
      group.add(place(step, 0, 0.24 - i * 0.12, 2.42 + i * 0.24));
    }

    for (const x of [-0.92, 0.92]) {
      const post = box(0.12, 1.6, 0.12, WOOD_WARM);
      group.add(place(post, x, 1.24, 2.05));
    }
    const canopy = box(2.35, 0.12, 1.05, WOOD_WARM);
    canopy.rotation.x = -0.1;
    group.add(place(canopy, 0, 2.05, 2.05));

    const rail = box(2.1, 0.09, 0.09, WOOD_WARM);
    group.add(place(rail, 0, 0.72, 2.26));

    // Repaired door, and a lantern that actually lights the deck.
    const door = box(0.66, 1.2, 0.09, WOOD_WARM);
    group.add(place(door, 0, 0.63, 1.44));
    const knob = new Mesh(new SphereGeometry(0.045, 12, 10), new MeshStandardMaterial({ color: new Color('#d0a04a'), metalness: 0.8, roughness: 0.3 }));
    group.add(place(knob, 0.22, 0.66, 1.5));

    const lantern = new Mesh(new BoxGeometry(0.16, 0.22, 0.16), GLASS_LIT);
    group.add(place(lantern, 0.72, 1.55, 1.95));
    const lamp = new PointLight(new Color('#ffc165'), 3.4, 3.6, 2);
    group.add(place(lamp, 0.72, 1.5, 2.05));

    return group;
  }

  /** A repaired window: glass, frame, and a warm light inside the room. */
  private buildWindow(x: number, y: number, w: number, h: number): Group {
    const group = new Group();

    const pane = new Mesh(new BoxGeometry(w, h, 0.06), GLASS_LIT);
    group.add(place(pane, x, y, 1.44));

    const frameThickness = 0.07;
    const top = box(w + 0.12, frameThickness, 0.09, WOOD_WARM);
    group.add(place(top, x, y + h / 2, 1.46));
    const bottom = box(w + 0.12, frameThickness, 0.09, WOOD_WARM);
    group.add(place(bottom, x, y - h / 2, 1.46));
    for (const side of [-1, 1]) {
      const post = box(frameThickness, h + 0.12, 0.09, WOOD_WARM);
      group.add(place(post, x + (side * w) / 2, y, 1.46));
    }
    const mullion = box(frameThickness * 0.7, h, 0.09, WOOD_WARM);
    group.add(place(mullion, x, y, 1.47));

    const glow = new PointLight(new Color('#ffb457'), 1.5, 2.4, 2);
    group.add(place(glow, x, y, 1.75));

    return group;
  }

  private buildGlasshouse(): Group {
    const group = new Group();

    const base = box(1.7, 0.16, 1.9, STONE);
    group.add(place(base, 2.55, 0.14, 0.1));

    const shell = new Mesh(new BoxGeometry(1.6, 1.5, 1.8), GLASS_PANE);
    shell.castShadow = true;
    group.add(place(shell, 2.55, 0.95, 0.1));

    const roof = new Mesh(new ConeGeometry(1.28, 0.6, 4), GLASS_PANE);
    roof.rotation.y = Math.PI / 4;
    group.add(place(roof, 2.55, 2, 0.1));

    // Frame edges: without them a transparent box reads as fog.
    for (const x of [1.78, 3.32]) {
      for (const z of [-0.78, 0.98]) {
        const post = box(0.07, 1.5, 0.07, WOOD_WARM);
        group.add(place(post, x, 0.95, z));
      }
    }
    const sill = box(1.66, 0.07, 1.86, WOOD_WARM);
    group.add(place(sill, 2.55, 1.7, 0.1));

    // Planting inside, so the glasshouse has a reason to exist.
    for (let i = 0; i < 5; i += 1) {
      const bloom = new Mesh(
        new SphereGeometry(0.09, 10, 8),
        new MeshStandardMaterial({ color: new Color(i % 2 === 0 ? '#e0819f' : '#e8c65f'), roughness: 0.7 }),
      );
      group.add(place(bloom, 2.1 + (i % 3) * 0.45, 0.5 + (i % 2) * 0.12, -0.4 + Math.floor(i / 3) * 0.8));
    }

    const inner = new PointLight(new Color('#9fe6d8'), 2.2, 3, 2);
    group.add(place(inner, 2.55, 1.1, 0.1));

    return group;
  }

  private buildRoof(): Group {
    const group = new Group();

    // Hipped roof from a 4-sided cone: cheap, and reads correctly in silhouette.
    const roof = new Mesh(
      new ConeGeometry(2.85, 1.5, 4),
      new MeshStandardMaterial({ color: new Color('#7a4436'), roughness: 0.85 }),
    );
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(place(roof, 0, 3.25, 0));

    const eaves = box(3.9, 0.14, 3.1, WOOD_WARM);
    group.add(place(eaves, 0, 2.55, 0));

    const chimney = box(0.42, 1.05, 0.42, STONE);
    group.add(place(chimney, 1.1, 3.4, -0.5));
    const cap = box(0.54, 0.12, 0.54, WOOD_DARK);
    group.add(place(cap, 1.1, 3.96, -0.5));

    // Smoke: three puffs cycling upward, the only idle motion in the scene.
    for (let i = 0; i < 3; i += 1) {
      const puff = new Mesh(
        new SphereGeometry(0.16 + i * 0.05, 10, 8),
        new MeshStandardMaterial({
          color: new Color('#cfc4b4'),
          transparent: true,
          opacity: 0.42,
          roughness: 1,
        }),
      );
      puff.position.set(1.1, 4.1 + i * 0.5, -0.5);
      puff.userData['phase'] = i / 3;
      group.add(puff);
      this.smoke.push(puff);
    }

    return group;
  }

  /** Shows the layers for the rooms that are done. */
  sync(restoredRoomIds: readonly string[]): void {
    const restored = new Set(restoredRoomIds);
    this.rooms.forEach((group, id) => {
      group.visible = restored.has(id);
    });
    this.boards.forEach((group, id) => {
      group.visible = !restored.has(id);
    });
  }

  private resize = (): void => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  render(dt: number): void {
    if (this.disposed) return;
    if (this.renderer.domElement.width === 0) this.resize();

    // A slow turntable: enough to show it is a model, slow enough to ignore.
    this.spin += dt * 0.12;
    this.model.rotation.y = Math.sin(this.spin * 0.5) * 0.3;

    const roofVisible = this.rooms.get('roof')?.visible === true;
    if (roofVisible) {
      for (const puff of this.smoke) {
        const phase = ((puff.userData['phase'] as number) + dt * 0.22) % 1;
        puff.userData['phase'] = phase;
        puff.position.y = 4.1 + phase * 1.8;
        puff.position.x = 1.1 + Math.sin(phase * 4) * 0.16;
        const material = puff.material as MeshStandardMaterial;
        material.opacity = 0.45 * (1 - phase);
        puff.scale.setScalar(1 + phase * 1.1);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
