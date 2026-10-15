import { Mesh, Texture } from 'three';
import type { BufferGeometry, Material, Scene, WebGLRenderer } from 'three';

/** Release the previous stage's shared GPU assets before reusing its canvas. */
export function disposeWorld(world: { scene: Scene; renderer: WebGLRenderer }) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  world.scene.traverse(object => {
    const renderObject = object as Mesh;
    if (renderObject.geometry) geometries.add(renderObject.geometry);
    if (renderObject.material) {
      for (const material of Array.isArray(renderObject.material) ? renderObject.material : [renderObject.material]) materials.add(material);
    }
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  world.renderer.dispose();
}
