import * as THREE from "three";

const INNER_RADIUS = 3.2;
export const CARD_BELT_OUTER_RADIUS = 9.2;

/** Instanced playing cards orbit and repel from the pointer like the reference belt. */
export function createDistantCards(ivory: string, red: string, blue: string) {
  const group = new THREE.Group();
  const orbit = new THREE.Group();
  orbit.rotation.set(0.68, 0, -0.3);
  group.add(orbit);
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const instances: THREE.InstancedMesh[] = [];
  const dispose = () => {
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
    instances.forEach((instance) => instance.dispose());
  };

  try {
    const print = (rank?: string, suit?: string, ink = blue) => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 192;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Card print unavailable");
      context.fillStyle = ivory;
      context.fillRect(0, 0, 128, 192);
      context.fillStyle = ink;
      if (rank && suit) {
        for (let corner = 0; corner < 2; corner++) {
          context.save();
          if (corner) { context.translate(128, 192); context.rotate(Math.PI); }
          context.font = "bold 26px Georgia, serif";
          context.textAlign = "center";
          context.fillText(rank, 20, 30);
          context.font = "22px Georgia, serif";
          context.fillText(suit, 20, 52);
          context.restore();
        }
        context.font = "64px Georgia, serif";
        context.textAlign = "center";
        context.fillText(suit, 64, 116);
      } else {
        context.fillRect(8, 8, 112, 176);
        context.strokeStyle = ivory;
        context.lineWidth = 1;
        context.globalAlpha = 0.35;
        for (let offset = -192; offset < 128; offset += 12) {
          context.beginPath();
          context.moveTo(offset, 8);
          context.lineTo(offset + 176, 184);
          context.stroke();
          context.beginPath();
          context.moveTo(offset + 176, 8);
          context.lineTo(offset, 184);
          context.stroke();
        }
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.push(texture);
      const material = new THREE.MeshStandardMaterial({
        map: texture, roughness: 0.85,
        emissive: ivory, emissiveMap: texture, emissiveIntensity: 0.11,
      });
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `
          #include <emissivemap_fragment>
          #ifdef USE_INSTANCING_COLOR
            totalEmissiveRadiance *= vColor;
          #endif
        `);
      };
      materials.push(material);
      return material;
    };

    const outline = new THREE.Shape();
    outline.moveTo(-0.265, -0.465);
    outline.lineTo(0.265, -0.465);
    outline.quadraticCurveTo(0.31, -0.465, 0.31, -0.42);
    outline.lineTo(0.31, 0.42);
    outline.quadraticCurveTo(0.31, 0.465, 0.265, 0.465);
    outline.lineTo(-0.265, 0.465);
    outline.quadraticCurveTo(-0.31, 0.465, -0.31, 0.42);
    outline.lineTo(-0.31, -0.42);
    outline.quadraticCurveTo(-0.31, -0.465, -0.265, -0.465);
    const surface = new THREE.ShapeGeometry(outline, 5);
    const uv = surface.getAttribute("uv");
    const position = surface.getAttribute("position");
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (position.getX(i) + 0.31) / 0.62, (position.getY(i) + 0.465) / 0.93);
    }
    geometries.push(surface);
    const edge = new THREE.ExtrudeGeometry(outline, { depth: 0.009, bevelEnabled: false, curveSegments: 5 });
    edge.translate(0, 0, -0.0045);
    geometries.push(edge);
    const paper = new THREE.MeshStandardMaterial({ color: ivory, roughness: 0.9 });
    materials.push(paper);
    const back = print();
    const faces = [print("A", "♠"), print("K", "♥", red), print("A", "♦", red), print("Q", "♣")];
    const count = 280;
    const instanced = (shape: THREE.BufferGeometry, material: THREE.Material, total: number) => {
      const mesh = new THREE.InstancedMesh(shape, material, total);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // The belt moves continuously; avoid stale per-instance bounding spheres.
      mesh.frustumCulled = false;
      instances.push(mesh);
      orbit.add(mesh);
      return mesh;
    };
    const fronts = faces.map((face) => instanced(surface, face, count / 4));
    const backs = instanced(surface, back, count);
    const edges = instanced(edge, paper, count);
    const random = (seed: number) => THREE.MathUtils.euclideanModulo(Math.sin(seed * 127.1) * 43758.5453, 1);
    const cards = Array.from({ length: count }, (_, i) => ({
      angle: i / count * Math.PI * 2 + random(i + 1) * 0.2,
      radialPosition: random(i + 2),
      height: (random(i + 3) - 0.5) * 1.1,
      size: 0.22 + random(i + 4) ** 3 * 0.55,
      displacement: new THREE.Vector3(),
      brightness: 1,
    }));
    const dummy = new THREE.Object3D();
    const frontOffset = new THREE.Matrix4().makeTranslation(0, 0, 0.005);
    const backOffset = new THREE.Matrix4().makeRotationY(Math.PI);
    backOffset.setPosition(0, 0, -0.005);
    const matrix = new THREE.Matrix4();
    const tint = new THREE.Color();
    const cursor = new THREE.Vector3(100000, 0, 0);
    const normal = new THREE.Vector3();
    const center = new THREE.Vector3();
    const point = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3();
    const plane = new THREE.Plane();
    const orbital = new THREE.Vector3();
    const push = new THREE.Vector3();
    let previousTime = 0;

    return {
      group,
      dispose,
      clearPointer() { cursor.set(100000, 0, 0); },
      setPointer(ray: THREE.Ray) {
        orbit.updateWorldMatrix(true, false);
        normalMatrix.getNormalMatrix(orbit.matrixWorld);
        normal.set(0, 1, 0).applyNormalMatrix(normalMatrix);
        plane.setFromNormalAndCoplanarPoint(normal, orbit.getWorldPosition(center));
        if (ray.intersectPlane(plane, point)) cursor.copy(orbit.worldToLocal(point));
        else cursor.set(100000, 0, 0);
      },
      update(time: number, outerRadius = CARD_BELT_OUTER_RADIUS) {
        const delta = Math.max(0, Math.min(time - previousTime, 0.1));
        previousTime = time;
        cards.forEach((card, i) => {
          // Widen only the outside of the annulus. The inner edge and card
          // sizes stay fixed relative to the chip; no belt scaling or offset.
          const radius = INNER_RADIUS + card.radialPosition * (outerRadius - INNER_RADIUS);
          const angle = card.angle + time * (0.3 / radius + 0.01);
          orbital.set(Math.cos(angle) * radius, card.height, Math.sin(angle) * radius);
          push.copy(orbital).sub(cursor);
          const distance = push.length();
          const nearby = distance < 1.25;
          if (nearby) {
            const strength = (1.25 - distance) / 1.25;
            push.multiplyScalar(strength * 1.125 / ((distance + 0.001) * (1 + card.size * 2)));
          } else push.set(0, 0, 0);
          if (time === 0) {
            card.displacement.set(0, 0, 0);
            card.brightness = 1;
          } else {
            // Time-based easing preserves the reference's soft, size-dependent
            // repulsion and brighter hover response at our capped 30fps.
            card.displacement.lerp(push, 1 - Math.exp(-delta * (2.5 / card.size)));
            card.brightness = THREE.MathUtils.lerp(card.brightness, nearby ? 5 : 1, 1 - Math.exp(-delta * 12));
          }
          dummy.position.copy(orbital).add(card.displacement);
          dummy.scale.setScalar(card.size);
          dummy.rotation.set(i * 1.1 + time * 0.15, i * 0.7 + time * 0.19, angle + i);
          dummy.updateMatrix();
          fronts[i % 4].setMatrixAt(Math.floor(i / 4), matrix.multiplyMatrices(dummy.matrix, frontOffset));
          backs.setMatrixAt(i, matrix.multiplyMatrices(dummy.matrix, backOffset));
          edges.setMatrixAt(i, dummy.matrix);
          tint.setScalar(card.brightness);
          fronts[i % 4].setColorAt(Math.floor(i / 4), tint);
          backs.setColorAt(i, tint);
          edges.setColorAt(i, tint);
        });
        instances.forEach((mesh) => {
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        });
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
