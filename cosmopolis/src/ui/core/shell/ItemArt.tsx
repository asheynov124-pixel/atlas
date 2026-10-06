/**
 * OWNER: ui-core.
 * ItemArt — the picture for an item: a 3D thumbnail (render/Thumbnails) when the item has a mesh, otherwise a
 * designed glyph tile (zone hexes in zone colours, asphalt for roads, accent tiles for tools).
 */
import type { ItemDef } from '../../../content/catalog';
import { zoneInfo } from '../../../content/zones';
import { RoadKind, Zone, zoneFamily } from '../../../core/types';
import { thumbnailSignal } from '../../../render/Thumbnails';
import { Icon, IconOrEmoji, hasIcon } from '../../icons';
import { hexCss } from '../format';

const ZONE_ICON: Record<string, string> = { R: 'housing', C: 'shop', I: 'factory', O: 'office' };
const ROAD_ICON: Partial<Record<RoadKind, string>> = {
  [RoadKind.Path]: 'navigate',
  [RoadKind.Street]: 'roads',
  [RoadKind.Avenue]: 'roads',
  [RoadKind.Highway]: 'car',
  [RoadKind.Maglev]: 'transit',
  [RoadKind.Hyperloop]: 'warp',
};

function Glyph({ def, size }: { def: ItemDef; size: number }) {
  const iconSize = Math.round(size * 0.42);
  if (def.zone !== undefined) {
    const info = def.zone === Zone.None ? undefined : zoneInfo(def.zone);
    const fam = def.zone === Zone.None ? null : zoneFamily(def.zone);
    const color = info ? hexCss(info.color) : 'rgba(255,255,255,0.4)';
    return (
      <span class={'ia-glyph ia-zone' + (info ? '' : ' is-clear')} style={{ '--zc': color } as Record<string, string>}>
        <span class="ia-hex" />
        <span class="ia-glyph-icon">
          <Icon name={fam ? ZONE_ICON[fam] : 'close'} size={iconSize} />
        </span>
        {info && <span class="ia-zone-short num">{info.short}</span>}
      </span>
    );
  }
  if (def.road) {
    const rail = def.road.kind === RoadKind.Maglev || def.road.kind === RoadKind.Hyperloop;
    return (
      <span class={'ia-glyph ia-road k' + def.road.kind + (rail ? ' is-rail' : '')}>
        <span class="ia-road-lanes" />
        <span class="ia-glyph-icon">
          <Icon name={ROAD_ICON[def.road.kind] ?? 'roads'} size={iconSize} />
        </span>
      </span>
    );
  }
  const ic = def.icon && (hasIcon(def.icon) || def.icon.length <= 4) ? def.icon : 'build';
  return (
    <span class="ia-glyph ia-tool">
      <span class="ia-glyph-icon">
        <IconOrEmoji value={ic} size={iconSize} />
      </span>
    </span>
  );
}

export function ItemArt({ def, size = 80, large }: { def: ItemDef; size?: number; large?: boolean }) {
  if (!def.mesh) return <Glyph def={def} size={size} />;
  const url = thumbnailSignal(def.id, { size: large ? 'lg' : 'sm' }).value;
  if (url) return <img class="ia-img" src={url} alt="" draggable={false} />;
  return (
    <span class="ia-loading" aria-hidden="true">
      <span class="ia-loading-disc" />
      {def.icon && <IconOrEmoji value={def.icon} size={Math.round(size * 0.3)} class="ia-loading-icon" />}
    </span>
  );
}
