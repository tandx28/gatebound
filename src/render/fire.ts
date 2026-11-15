import * as THREE from "three";

/**
 * Fire, drawn by a small shader: a cone whose sides waver and whose colour
 * runs from a bright core at the base to nothing at the tip. One material per
 * colour is shared by every flame of that colour, so a single clock drives
 * them all.
 */

const VERTEX = /* glsl */ `
  uniform float time;
  varying float vUp;
  void main() {
    vUp = uv.y;
    vec3 p = position;
    // The higher up the flame, the more it wavers.
    float sway = sin(time * 9.0 + position.y * 0.35 + position.x) * 0.22 + sin(time * 14.0 + position.z * 1.3) * 0.12;
    p.x += sway * vUp * vUp * 5.0;
    p.z += cos(time * 11.0 + position.y * 0.3) * 0.18 * vUp * vUp * 5.0;
    p.y *= 1.0 + 0.12 * sin(time * 17.0 + position.x * 2.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 color;
  uniform float time;
  varying float vUp;
  void main() {
    float core = smoothstep(0.75, 0.0, vUp);
    vec3 c = mix(color, vec3(1.0, 0.97, 0.85), core * 0.75);
    float a = smoothstep(1.0, 0.15, vUp) * (0.75 + 0.25 * sin(time * 23.0 + vUp * 9.0));
    gl_FragColor = vec4(c * a * 1.6, a);
  }
`;

const made = new Map<number, THREE.ShaderMaterial>();

/** The shared fire material of a colour. */
export function fireMaterial(color: number): THREE.ShaderMaterial {
  let m = made.get(color);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color(color) } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    // Shared by every flame: never to be freed with one of them.
    m.userData.shared = true;
    made.set(color, m);
  }
  return m;
}

/** A flame of the given size, standing on its base. */
export function flame(color: number, radius: number, height: number): THREE.Mesh {
  const geo = new THREE.ConeGeometry(radius, height, 9, 5, true);
  geo.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geo, fireMaterial(color));
  mesh.userData.keepMaterial = true;
  return mesh;
}

/** Advance every fire. Call once a frame. */
export function tickFire(time: number): void {
  for (const m of made.values()) m.uniforms.time.value = time;
}

/**
 * The last pass over the finished picture: a little more contrast, colder
 * shadows and warmer lights, a touch less colour, and fine grain, so the
 * dungeon reads as a place rather than a diagram.
 */
export const GRADE = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, amount: { value: 1 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float amount;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      // Split tone: blue into the dark, amber into the bright.
      vec3 toned = c + mix(vec3(-0.012, 0.0, 0.03), vec3(0.03, 0.012, -0.02), smoothstep(0.15, 0.75, l));
      toned = mix(vec3(l), toned, 0.9);
      toned = (toned - 0.5) * 1.1 + 0.5;
      toned += (hash(vUv * 900.0 + time) - 0.5) * 0.035;
      gl_FragColor = vec4(mix(c, toned, amount), src.a);
    }
  `,
};
