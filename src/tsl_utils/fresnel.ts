import { normalView, vec3 } from "three/tsl";

interface FresnelOptions {
  tintColor?: any;
  power?: number;
}

export function createFresnelColorNode({
  tintColor = vec3(1, 1, 1).mul(0.5),
  power = 3,
}: FresnelOptions = {}) {
  const viewDirection = vec3(0, 0, -1);
  const fresnel = normalView.dot(viewDirection).abs().oneMinus().pow(power);
  return tintColor.mul(fresnel);
}
