import * as T from "three";
import type { Chunk, Prop } from "../shared/map.ts";
import { SIZE, CHUNK, rng, hash } from "../shared/map.ts";
export class Models {
  private markerGeometry = new T.ConeGeometry(0.12, 0.25, 3);
  private markerMaterials = {
    ALPHA: new T.MeshBasicMaterial({ color: 0x6ba2e7 }),
    BRAVO: new T.MeshBasicMaterial({ color: 0xd56463 }),
  };
  geometries: Record<string, T.BufferGeometry> = {
    box: new T.BoxGeometry(1, 1, 1),
    cylinder: new T.CylinderGeometry(0.5, 0.5, 1, 7),
    cone: new T.ConeGeometry(0.5, 1, 6),
    sphere: new T.IcosahedronGeometry(0.5, 1),
  };
  materials = new Map<string, T.MeshStandardMaterial>();
  constructor(
    private mask: T.Texture,
    private origin: T.Vector2,
  ) {}
  material(color: string) {
    let m = this.materials.get(color);
    if (m) return m;
    m = new T.MeshStandardMaterial({
      color,
      roughness: 0.94,
      flatShading: true,
    });
    m.onBeforeCompile = (s) => {
      s.uniforms.visibilityMap = { value: this.mask };
      s.uniforms.visibilityOrigin = { value: this.origin };
      s.vertexShader = "varying vec3 vWorld;\n" + s.vertexShader;
      s.vertexShader = s.vertexShader.replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvec4 maskPos=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nmaskPos=instanceMatrix*maskPos;\n#endif\nvWorld=(modelMatrix*maskPos).xyz;",
      );
      s.fragmentShader =
        "uniform sampler2D visibilityMap;uniform vec2 visibilityOrigin;varying vec3 vWorld;\n" +
        s.fragmentShader;
      s.fragmentShader = s.fragmentShader.replace(
        "#include <dithering_fragment>",
        "vec2 uvMask=(vWorld.xz-visibilityOrigin)/64.0+0.5;float vis=texture2D(visibilityMap,uvMask).r;gl_FragColor.rgb*=mix(0.008,1.0,vis);\n#include <dithering_fragment>",
      );
    };
    m.customProgramCacheKey = () => "office-mask-v1";
    this.materials.set(color, m);
    return m;
  }
  mesh(
    shape: string,
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) {
    const m = new T.Mesh(this.geometries[shape], this.material(color));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  character(team: string, skin: number) {
    const g = new T.Group(),
      blue = team === "ALPHA" ? "#486b94" : "#945052",
      cloth = skin ? "#263743" : "#3a3934",
      skinColor = skin ? "#b48b71" : "#d2ab88";
    const add = (
      shape: string,
      c: string,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      parent: T.Group = g,
    ) => {
      const m = this.mesh(shape, c, x, y, z, sx, sy, sz);
      parent.add(m);
      return m;
    };
    add("cylinder", cloth, 0, 1.14, 0, 0.7, 0.74, 0.46);
    add("box", blue, 0, 1.18, 0.18, 0.56, 0.49, 0.12);
    add("box", "#776747", 0, 1.18, -0.22, 0.53, 0.53, 0.24);
    add("box", "#252927", 0, 0.82, 0, 0.66, 0.12, 0.42);
    add("sphere", skinColor, 0, 1.81, 0.03, 0.62, 0.67, 0.56);
    add(
      "sphere",
      skin ? "#1d2428" : "#30251f",
      0,
      2.01,
      -0.04,
      0.66,
      0.38,
      0.6,
    );
    if (skin) add("box", "#303e48", 0, 1.98, 0.22, 0.67, 0.1, 0.4);
    add("box", "#292523", -0.12, 1.84, 0.288, 0.055, 0.055, 0.025);
    add("box", "#292523", 0.12, 1.84, 0.288, 0.055, 0.055, 0.025);
    add("sphere", skinColor, 0, 1.76, 0.32, 0.1, 0.12, 0.12);
    const legs: T.Group[] = [];
    for (const x of [-0.2, 0.2]) {
      const pivot = new T.Group();
      pivot.position.set(x, 0.85, 0);
      g.add(pivot);
      add("cylinder", "#263039", 0, -0.3, 0, 0.25, 0.6, 0.28, pivot);
      add("box", "#1c2023", 0, -0.66, 0.09, 0.3, 0.2, 0.45, pivot);
      legs.push(pivot);
    }
    const arms = new T.Group();
    g.add(arms);
    const a = add("cylinder", cloth, -0.33, 1.2, 0.29, 0.22, 0.58, 0.23, arms);
    a.rotation.x = -0.9;
    const b = add("cylinder", cloth, 0.34, 1.21, 0.29, 0.22, 0.59, 0.23, arms);
    b.rotation.x = -1;
    add("sphere", skinColor, 0.34, 1.1, 0.56, 0.19, 0.2, 0.22, arms);
    add("box", "#24282a", 0.34, 1.19, 0.72, 0.15, 0.2, 0.48, arms);
    add(
      "cylinder",
      "#454b4b",
      -0.27,
      1.15,
      0.69,
      0.13,
      0.3,
      0.13,
      arms,
    ).rotation.x = Math.PI / 2;
    const mark = new T.Mesh(
      this.markerGeometry,
      this.markerMaterials[team === "ALPHA" ? "ALPHA" : "BRAVO"],
    );
    mark.position.y = 2.58;
    mark.rotation.z = Math.PI;
    g.add(mark);
    g.userData = { legs, arms };
    return g;
  }
  chunk(c: Chunk) {
    const group = new T.Group();
    const buckets = new Map<string, T.Matrix4[]>(),
      obj = new T.Object3D();
    const put = (
      shape: string,
      color: string,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      angle = 0,
    ) => {
      obj.position.set(x, y, z);
      obj.scale.set(sx, sy, sz);
      obj.rotation.set(0, angle, 0);
      obj.updateMatrix();
      const key = shape + "|" + color;
      let a = buckets.get(key);
      if (!a) {
        a = [];
        buckets.set(key, a);
      }
      a.push(obj.matrix.clone());
    };
    const random = rng(hash(332, c.cx, c.cz));
    for (let z = 0; z < CHUNK; z++)
      for (let x = 0; x < CHUNK; x++) {
        const wx = c.cx * SIZE + x * 2 + 1,
          wz = c.cz * SIZE + z * 2 + 1;
        if (c.cells[z * CHUNK + x]) {
          let exposed = false;
          for (const [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = x + dx,
              nz = z + dz;
            if (
              nx >= 0 &&
              nx < 32 &&
              nz >= 0 &&
              nz < 32 &&
              !c.cells[nz * 32 + nx]
            )
              exposed = true;
          }
          if (exposed) {
            put("box", "#77776e", wx, 1.35, wz, 2, 2.7, 2);
            put("box", "#454a49", wx, 2.73, wz, 2.07, 0.09, 2.07);
            put("box", "#393d3b", wx, 0.12, wz, 2.04, 0.24, 2.04);
          }
        } else {
          put(
            "box",
            random() > 0.5 ? "#494945" : "#4c4b45",
            wx,
            -0.06,
            wz,
            2,
            0.12,
            2,
          );
          if (random() < 0.09) {
            put(
              "box",
              "#97958a",
              wx + (random() - 0.5),
              0.012,
              wz + (random() - 0.5),
              0.27,
              0.015,
              0.38,
              random() * 6,
            );
          }
        }
      }
    for (const p of c.props) this.decorate(p, put);
    for (const [key, matrices] of buckets) {
      const [shape, color] = key.split("|");
      const mesh = new T.InstancedMesh(
        this.geometries[shape],
        this.material(color),
        matrices.length,
      );
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    return group;
  }
  private decorate(
    p: Prop,
    put: (
      shape: string,
      color: string,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      angle?: number,
    ) => void,
  ) {
    const ca = Math.cos(p.angle),
      sa = Math.sin(p.angle);
    const add = (
      shape: string,
      col: string,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
    ) =>
      put(
        shape,
        col,
        p.x + x * ca + z * sa,
        y,
        p.z - x * sa + z * ca,
        sx,
        sy,
        sz,
        p.angle,
      );
    const box = (
      c: string,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
    ) => add("box", c, x, y, z, sx, sy, sz);
    switch (p.kind) {
      case "desk":
      case "meeting":
      case "table":
      case "reception":
      case "counter":
        box("#79674e", 0, 0.82, 0, 1.22, 0.1, 0.92);
        for (const x of [-0.5, 0.5])
          for (const z of [-0.32, 0.32])
            box("#343a3b", x, 0.4, z, 0.07, 0.8, 0.07);
        if (p.kind === "desk") {
          box("#232c30", 0, 1.16, 0.19, 0.7, 0.47, 0.08);
          box("#111a1f", 0, 1.16, 0.142, 0.59, 0.35, 0.025);
          box("#40494b", 0, 0.94, 0.2, 0.07, 0.2, 0.08);
          box("#252b2d", 0, 0.89, -0.16, 0.48, 0.035, 0.18);
          box("#292b2e", 0.42, 0.36, 0.1, 0.24, 0.65, 0.45);
        }
        if (p.kind === "reception")
          box("#716047", 0, 0.6, 0.38, 1.2, 1.1, 0.22);
        break;
      case "chair":
        box("#292f34", 0, 0.55, 0, 0.55, 0.1, 0.53);
        box("#344353", 0, 0.93, 0.23, 0.55, 0.68, 0.1);
        add("cylinder", "#343a3b", 0, 0.27, 0, 0.12, 0.55, 0.12);
        box("#25282a", 0, 0.07, 0, 0.7, 0.08, 0.1);
        box("#25282a", 0, 0.07, 0, 0.1, 0.08, 0.7);
        break;
      case "plant":
        add("cylinder", "#777063", 0, 0.24, 0, 0.46, 0.48, 0.46);
        for (let i = 0; i < 5; i++) {
          let a = i * 2.4;
          add(
            "cone",
            i % 2 ? "#3c5031" : "#52613c",
            Math.sin(a) * 0.24,
            0.87 + i * 0.12,
            Math.cos(a) * 0.22,
            0.55,
            0.85,
            0.55,
          );
        }
        break;
      case "water":
        box("#8e938e", 0, 0.53, 0, 0.56, 1.05, 0.53);
        add("cylinder", "#3a626d", 0, 1.29, 0, 0.47, 0.48, 0.47);
        box("#303b3e", 0, 0.83, -0.28, 0.3, 0.28, 0.03);
        break;
      case "sofa":
        box("#545e62", 0, 0.4, 0, 1.25, 0.38, 0.66);
        box("#4b5456", 0, 0.8, 0.25, 1.25, 0.7, 0.22);
        for (const x of [-0.55, 0.55])
          box("#545e62", x, 0.64, 0, 0.15, 0.44, 0.72);
        break;
      case "paper":
        for (let i = 0; i < 3; i++)
          box(
            "#a9a697",
            i * 0.15 - 0.15,
            0.02 + i * 0.009,
            i * 0.1,
            0.32,
            0.015,
            0.43,
          );
        break;
      case "warning":
        box("#c29b29", 0, 0.45, 0, 0.49, 0.82, 0.07);
        box("#383724", 0, 0.47, -0.045, 0.24, 0.23, 0.02);
        box("#b58d24", 0, 0.1, 0.24, 0.5, 0.08, 0.5);
        break;
      case "boxes":
        for (let i = 0; i < 3; i++) {
          box(
            "#806b4f",
            (i % 2) * 0.4 - 0.2,
            0.28 + Math.floor(i / 2) * 0.51,
            0,
            0.5,
            0.51,
            0.55,
          );
          box(
            "#a28e67",
            (i % 2) * 0.4 - 0.2,
            0.54 + Math.floor(i / 2) * 0.51,
            0,
            0.1,
            0.018,
            0.55,
          );
        }
        break;
      case "server":
        box("#202a30", 0, 1.06, 0, 0.85, 2.12, 0.75);
        for (let i = 0; i < 7; i++) {
          box("#414c4f", 0, 0.25 + i * 0.26, -0.39, 0.7, 0.17, 0.04);
          box("#617d6a", 0.25, 0.25 + i * 0.26, -0.42, 0.035, 0.035, 0.015);
        }
        break;
      case "printer":
        box("#777e7b", 0, 0.45, 0, 0.8, 0.9, 0.73);
        box("#303b40", 0, 0.96, 0, 0.72, 0.16, 0.66);
        box("#979d97", 0, 1.1, 0.12, 0.69, 0.12, 0.4);
        box("#2e3635", 0, 0.7, -0.38, 0.54, 0.2, 0.02);
        break;
      case "coffee":
        box("#6f756e", 0, 0.42, 0, 0.9, 0.82, 0.65);
        box("#222e32", 0, 1.04, 0, 0.46, 0.4, 0.38);
        box("#c7bfa7", 0, 0.92, -0.23, 0.14, 0.13, 0.14);
        break;
      case "shelf":
        for (let i = 0; i < 5; i++)
          box("#77715d", 0, 0.12 + i * 0.41, 0, 1.2, 0.07, 0.58);
        for (const x of [-0.57, 0.57])
          box("#4a504b", x, 0.95, 0, 0.07, 1.9, 0.6);
        for (let i = 0; i < 6; i++)
          box(
            i % 2 ? "#5b6359" : "#887e67",
            -0.46 + i * 0.18,
            0.73,
            0,
            0.13,
            0.34,
            0.35,
          );
        break;
      default:
        box(
          p.kind === "fridge" ? "#989c92" : "#69716c",
          0,
          0.94,
          0,
          0.94,
          1.88,
          0.67,
        );
        for (let i = 0; i < 3; i++) {
          box("#414b48", 0, 0.4 + i * 0.5, -0.345, 0.83, 0.02, 0.02);
          box("#333c38", 0.2, 0.63 + i * 0.45, -0.36, 0.18, 0.04, 0.04);
        }
        break;
    }
  }
  dispose() {
    this.markerGeometry.dispose();
    Object.values(this.markerMaterials).forEach((m) => m.dispose());
    for (const g of Object.values(this.geometries)) g.dispose();
    for (const m of this.materials.values()) m.dispose();
  }
}
