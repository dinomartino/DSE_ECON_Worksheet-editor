// Per-material tone mapping. Scenes render into linear HDR targets, where three applies
// none; 3D objects (tile, floor, strokes) opt in here so highlights roll off, while
// paper and screens stay unmapped and white stays exactly white (FILM.md §5.1).

const NEUTRAL = /* glsl */ `
uniform float uExposure;
vec3 filmNeutral(vec3 color) {
  color *= uExposure;
  const float startCompression = 0.8;
  const float desaturation = 0.15;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
`;

/**
 * Chains a shader patch onto a material. Each patch has a key; the keys form the program
 * cache key, so differently patched materials never share a compiled program.
 */
export function patch(material, key, fn) {
  const prev = material.onBeforeCompile;
  const keys = (material.userData.patchKeys ??= []);
  keys.push(key);
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    fn(shader, renderer);
  };
  material.customProgramCacheKey = () => keys.join('|');
  material.needsUpdate = true;
  return material;
}

/**
 * Output through the highlight shoulder of Khronos PBR Neutral (its toe is dropped, so
 * darks keep their authored hue): colours read as authored, highlights compress.
 */
export function filmic(material, exposure = 1) {
  const uniform = { value: exposure };
  material.userData.exposure = uniform;
  return patch(material, 'filmic', (shader) => {
    shader.uniforms.uExposure = uniform;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NEUTRAL}`)
      .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = filmNeutral(gl_FragColor.rgb);');
  });
}
