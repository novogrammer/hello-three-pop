import {
  clamp,
  cos,
  dot,
  float,
  length,
  mat3,
  max,
  mix,
  mod,
  radians,
  sin,
  smoothstep,
  step,
  texture,
  vec2,
  vec3,
  vec4,
  sqrt,
  screenSize,
  Fn,
  screenCoordinate,
  If,
} from "three/tsl";



const DEFAULT_LAYERS = [
  { rotationDeg: float(15), mask: vec4(1, 0, 0, 0) },
  { rotationDeg: float(75), mask: vec4(0, 1, 0, 0) },
  { rotationDeg: float(30), mask: vec4(0, 0, 1, 0) },
  { rotationDeg: float(45), mask: vec4(0, 0, 0, 1) },
];

const EPSILON = 1e-6;

const rgbToCmykNode=Fn(([rgb]: [any]) => {
  const epsilonNode = float(EPSILON);

  const r = rgb.x;
  const g = rgb.y;
  const b = rgb.z;

  const maxGB = max(g, b);
  const maxRGB = max(r, maxGB);
  const k = maxRGB.oneMinus();

  const safeDenom = max(maxRGB, epsilonNode);
  const c = maxRGB.sub(r).div(safeDenom);
  const m = maxRGB.sub(g).div(safeDenom);
  const y = maxRGB.sub(b).div(safeDenom);

  const cmy = vec3(c, m, y).clamp();
  const result = vec4(cmy, k);
  const blackMask = step(epsilonNode.oneMinus(), k);
  return mix(result, vec4(0, 0, 0, 1), blackMask);
});

const cmykToRgbNode=Fn(([cmyk]: [any]) => {

  const c = cmyk.x;
  const m = cmyk.y;
  const y = cmyk.z;
  const k = cmyk.w;

  const oneMinusK = k.oneMinus();
  const r = c.oneMinus().mul(oneMinusK);
  const g = m.oneMinus().mul(oneMinusK);
  const b = y.oneMinus().mul(oneMinusK);

  return vec3(r, g, b);
});

const rotationMatrixNode = Fn(([angle]: [any])=>{
  const c = cos(angle);
  const s = sin(angle);

  return mat3(
    // @ts-ignore
    c, s, 0,
    s.mul(-1), c, 0,
    0, 0, 1
  );
});

const translationMatrixNode = Fn(([translation]: [any]) => {
  return mat3(
    // @ts-ignore
    1, 0, 0,
    0, 1, 0,
    translation.x, translation.y, 1
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

const processLayer=Fn(([textureNode,rotationDeg, mask,uGridSize,uRotationDeg]:[any,any,any,any,any])=>{

  const sampler = (uv: any) => texture(textureNode, uv).rgb;

  const coord = screenCoordinate;
  const resolution = screenSize;

  const half = float(0.5);

  const gridSize = uGridSize;

  const translation = resolution.mul(float(-0.5));

  const rotationBase = radians(rotationDeg);
  const rotationTotal = rotationBase.add(radians(uRotationDeg));

  const rotationMatrix = rotationMatrixNode(rotationTotal);
  const inverseRotationMatrix = rotationMatrixNode(rotationTotal.mul(-1));

  const transformMatrix = rotationMatrix.mul(translationMatrixNode(translation));
  const inverseTransformMatrix = translationMatrixNode(translation.mul(-1)).mul(inverseRotationMatrix);
  
  const transformedCoord = transformMatrix.mul(vec3(coord, 1)).xy;

  const gvid = coordToHexCoordsNode(transformedCoord, gridSize);
  const gv=gvid.xy;
  const id=gvid.zw;


  const gridCoord = inverseRotationMatrix.mul(vec3(gv, 1)).xy;
  const hexCenterCoord = inverseTransformMatrix.mul(vec3(id, 1)).xy;
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


export function createHalftoneColorNode(textureNode:any,uEnableHalftone:any,uGridSize:any,uRotationDeg:any) {
  return Fn(()=>{
    const rgb = vec3(textureNode).toVar();
    If(uEnableHalftone.notEqual(0),()=>{

      const cmykTotal = vec4(0).toVar();
      for(const layer of DEFAULT_LAYERS){
        const cmyk = processLayer(textureNode,layer.rotationDeg, layer.mask,uGridSize,uRotationDeg);
        cmykTotal.addAssign(cmyk);

      }

      rgb.assign(cmykToRgbNode(cmykTotal));
    });
    return rgb;
  })();

}
