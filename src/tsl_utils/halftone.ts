import {
  clamp,
  cos,
  dot,
  float,
  length,
  mat3,
  max,
  min,
  mix,
  mod,
  radians,
  sin,
  smoothstep,
  step,
  texture,
  time as timeNode,
  vec2,
  vec3,
  vec4,
  sqrt,
  screenSize,
  Fn,
  screenCoordinate,
} from "three/tsl";



const DEFAULT_LAYERS = [
  { rotationDeg: float(15), mask: vec4(1, 0, 0, 0) },
  { rotationDeg: float(75), mask: vec4(0, 1, 0, 0) },
  { rotationDeg: float(30), mask: vec4(0, 0, 1, 0) },
  { rotationDeg: float(45), mask: vec4(0, 0, 0, 1) },
];

const EPSILON = 1e-6;

const rgbToCmykNode=Fn(([rgb]: [any]) => {
  const one = float(1);
  const zero = float(0);
  const epsilonNode = float(EPSILON);

  const r = rgb.x;
  const g = rgb.y;
  const b = rgb.z;

  const maxGB = max(g, b);
  const maxRGB = max(r, maxGB);
  const k = one.sub(maxRGB);

  const safeDenom = max(maxRGB, epsilonNode);
  const c = maxRGB.sub(r).div(safeDenom);
  const m = maxRGB.sub(g).div(safeDenom);
  const y = maxRGB.sub(b).div(safeDenom);

  const cmy = vec3(c, m, y).clamp(zero, one);
  const result = vec4(cmy, k);
  const blackMask = step(one.sub(epsilonNode), k);
  return mix(result, vec4(0, 0, 0, 1), blackMask);
});

const cmykToRgbNode=Fn(([cmyk]: [any]) => {
  const one = float(1);

  const c = cmyk.x;
  const m = cmyk.y;
  const y = cmyk.z;
  const k = cmyk.w;

  const oneMinusK = one.sub(k);
  const r = one.sub(c).mul(oneMinusK);
  const g = one.sub(m).mul(oneMinusK);
  const b = one.sub(y).mul(oneMinusK);

  return vec3(r, g, b);
});

const rotationMatrixNode = Fn(([angle]: [any])=>{
  const c = cos(angle);
  const s = sin(angle);
  const zero = float(0);
  const one = float(1);

  return mat3(
    // @ts-ignore
    c, s, zero,
    s.mul(-1), c, zero,
    zero, zero, one
  );
});

const translationMatrixNode = Fn(([translation]: [any]) => {
  const zero = float(0);
  const one = float(1);

  return mat3(
  // @ts-ignore
    one, zero, zero,
    zero, one, zero,
    translation.x, translation.y, one
  );
});

const coordToHexCoordsNode = Fn(([coord,height]: [any,any]) => {
  const sqrt3 = float(1.7320508);
  const half = float(0.5);

  const r = vec2(1, sqrt3).mul(height);
  const h = r.mul(half);
  const a = mod(coord, r).sub(h);
  const b = mod(coord.sub(h), r).sub(h);

  const distA = dot(a, a);
  const distB = dot(b, b);
  
  const chooseB = step(distB,distA);
  const gv = mix(a, b, chooseB);
  const id = coord.sub(gv);

  return vec4( gv, id );
});

const processLayer=Fn(([textureNode,rotationDeg, mask]:[any,any,any])=>{

  const sampler = (uv: any) => texture(textureNode, uv).rgb;

  const gridSizeMin = 2;
  const gridSizeMaxDivisor = 32;
  const gridSizeOscillationSpeed = 0.5;

  const coord = screenCoordinate;
  const resolution = screenSize;
  const timeValue = timeNode;
  const rotationSpeed = float(0.1);

  const half = float(0.5);

  const sizeMinNode = float(gridSizeMin);
  const sizeMaxNode = min(resolution.x, resolution.y).div(float(gridSizeMaxDivisor));
  const sizeRange = sizeMaxNode.sub(sizeMinNode);

  const gridOscillation = sin(timeValue.mul(gridSizeOscillationSpeed)).mul(half).add(half);
  const gridSize = gridOscillation.mul(sizeRange).add(sizeMinNode);

  const translation = resolution.mul(float(-0.5));

  const rotationBase = radians(rotationDeg);
  const rotation = rotationBase.add(timeValue.mul(rotationSpeed));

  const rotationMatrix = rotationMatrixNode(rotation);
  const inverseRotationMatrix = rotationMatrixNode(rotation.mul(-1));

  const transformMatrix = rotationMatrix.mul(translationMatrixNode(translation));
  const inverseTransformMatrix = translationMatrixNode(translation.mul(-1)).mul(inverseRotationMatrix);
  
  const fragCoordVec3 = vec3(coord.x, coord.y, 1);
  const transformedCoord = transformMatrix.mul(fragCoordVec3).xy;

  const gvid = coordToHexCoordsNode(transformedCoord, gridSize);
  const gv=gvid.xy;
  const id=gvid.zw;


  const gridCoord = inverseRotationMatrix.mul(vec3(gv.x, gv.y, 1)).xy;
  const hexCenterCoord = inverseTransformMatrix.mul(vec3(id.x, id.y, 1)).xy;
  const uv = hexCenterCoord.div(resolution);

  const sampledColor = sampler(uv);
  const cmykColor = rgbToCmykNode(sampledColor);
  const maskNode = mask;

  const layerStrength = clamp(dot(cmykColor, maskNode));
  const radius = gridSize.mul(half).mul(sqrt(layerStrength));

  const distance = length(gridCoord).sub(radius);
  const fade = smoothstep(
    -1,
    1,
    distance
  );
  const cmykContribution = mix(maskNode, vec4(0), fade);
  return cmykContribution;
});


export function createHalftoneColorNode(textureNode:any) {
  return Fn(()=>{

    const cmykTotal = vec4(0).toVar();
    for(const layer of DEFAULT_LAYERS){
      const cmyk = processLayer(textureNode,layer.rotationDeg, layer.mask);
      cmykTotal.addAssign(cmyk);

    }

    return cmykToRgbNode(cmykTotal);
  })();

}
