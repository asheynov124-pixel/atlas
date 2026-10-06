/**
 * OWNER: terrain.
 * SurfaceUniforms — one uniform bag shared (by reference) by the terrain and water shaders, plus the shared
 * frame uniforms from render/materials.ts. Updating a value here updates every surface shader.
 */
import { Color, Matrix3, type CubeTexture, type DataTexture, type Texture } from 'three';
import { ZONES } from '../../content/zones';
import { ZONE_COUNT } from '../../core/types';

export interface SurfaceUniforms {
  uTileTex: { value: DataTexture | null };
  uMaskTex: { value: DataTexture | null };
  uOverlayTex: { value: DataTexture | null };
  uHighTex: { value: DataTexture | null };
  uDistPal: { value: DataTexture | null };
  uCloudCube: { value: CubeTexture | Texture | null };
  uCloudRotA: { value: Matrix3 };
  uCloudRotB: { value: Matrix3 };
  uCloudCover: { value: number };
  uCloudStorm: { value: number };
  /** 0..1 strength of cloud shadows on the ground (0 disables the lookup) */
  uCloudShadow: { value: number };
  uCloudR: { value: number };
  uRadius: { value: number };
  /** absolute radius of the sea surface */
  uWaterR: { value: number };
  uHasOcean: { value: number };
  /** height above the radius where snow starts on peaks */
  uSnowLine: { value: number };
  uGrid: { value: number };
  uZoneVis: { value: number };
  uZoneStrong: { value: number };
  uOverlay: { value: number };
  uDistrict: { value: number };
  uSeed: { value: number };
  /** emissive multiplier for lava / toxic / crystal / coolant glows */
  uGlow: { value: number };
  uRock: { value: Color };
  uStrata: { value: Color };
  uSnowCol: { value: Color };
  uAtmoColor: { value: Color };
  uAtmoDensity: { value: number };
  uHazeNear: { value: number };
  uHazeFar: { value: number };
  uLavaCol: { value: Color };
  uMoonCol: { value: Color };
  uZoneCol: { value: Color[] };
  uShallow: { value: Color };
  uDeep: { value: Color };
  uFoamCol: { value: Color };
  uWaterGlow: { value: number };
  /** 0 → water drawn opaque-ish, 1 → normal transparency */
  uWaterClarity: { value: number };
  /** surface animation clock (seconds; slowed down when settings.reduceMotion) */
  uSurfTime: { value: number };
}

export function createSurfaceUniforms(): SurfaceUniforms {
  const zoneCols: Color[] = [];
  for (let z = 0; z < ZONE_COUNT; z++) {
    const info = ZONES.find((i) => i.zone === z);
    zoneCols.push(new Color(info ? info.color : 0xffffff));
  }
  return {
    uTileTex: { value: null },
    uMaskTex: { value: null },
    uOverlayTex: { value: null },
    uHighTex: { value: null },
    uDistPal: { value: null },
    uCloudCube: { value: null },
    uCloudRotA: { value: new Matrix3() },
    uCloudRotB: { value: new Matrix3() },
    uCloudCover: { value: 0.4 },
    uCloudStorm: { value: 0 },
    uCloudShadow: { value: 0 },
    uCloudR: { value: 70 },
    uRadius: { value: 66 },
    uWaterR: { value: 66 },
    uHasOcean: { value: 1 },
    uSnowLine: { value: 99 },
    uGrid: { value: 0 },
    uZoneVis: { value: 1 },
    uZoneStrong: { value: 0 },
    uOverlay: { value: 0 },
    uDistrict: { value: 0 },
    uSeed: { value: 0 },
    uGlow: { value: 1 },
    uRock: { value: new Color(0x8a8578) },
    uStrata: { value: new Color(0x7d7a60) },
    uSnowCol: { value: new Color(0xf4f8ff) },
    uAtmoColor: { value: new Color(0x6fb6ff) },
    uAtmoDensity: { value: 1 },
    uHazeNear: { value: 26 },
    uHazeFar: { value: 140 },
    uLavaCol: { value: new Color(0xff5a14) },
    uMoonCol: { value: new Color(0x0e1626) },
    uZoneCol: { value: zoneCols },
    uShallow: { value: new Color(0x2fc6c8) },
    uDeep: { value: new Color(0x0b3a6a) },
    uFoamCol: { value: new Color(0xf4fbff) },
    uWaterGlow: { value: 0 },
    uWaterClarity: { value: 1 },
    uSurfTime: { value: 0 },
  };
}
