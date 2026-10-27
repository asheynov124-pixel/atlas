/** Renders the open sheet stack. */
import { useUI } from '../../state/ui';
import { DetailsSheet, EditSaveSheet, MenuSheet, MoreLikeSheet, SaveSheet } from './VideoSheets';
import { AspectResultSheet, PathsSheet, ProfilesSheet } from './PathSheets';
import { FiltersSheet } from './FiltersSheet';
import { BoardSheet, CollectionSheet, VisualSearchSheet } from './LibrarySheets';
import { BulkTitleSheet, EditImportSheet, ImportSheet } from './ImportSheets';
import type { Sheet } from '../../state/ui';

function render(s: Sheet) {
  switch (s.kind) {
    case 'details':
      return <DetailsSheet videoId={s.videoId} />;
    case 'menu':
      return <MenuSheet videoId={s.videoId} />;
    case 'more-like':
      return <MoreLikeSheet videoId={s.videoId} title={s.title} />;
    case 'save':
      return <SaveSheet videoId={s.videoId} />;
    case 'edit-save':
      return <EditSaveSheet videoId={s.videoId} />;
    case 'paths':
      return <PathsSheet />;
    case 'profiles':
      return <ProfilesSheet />;
    case 'filters':
      return <FiltersSheet scope={s.scope} />;
    case 'aspect-result':
      return <AspectResultSheet videoId={s.videoId} />;
    case 'visual-search':
      return <VisualSearchSheet />;
    case 'board':
      return <BoardSheet boardId={s.boardId} />;
    case 'collection':
      return <CollectionSheet title={s.title} videoIds={s.videoIds} refId={s.refId} />;
    case 'import':
      return <ImportSheet batchId={s.batchId} />;
    case 'bulk-titles':
      return <BulkTitleSheet target={s.target} focus={s.focus} />;
    case 'edit-import':
      return <EditImportSheet videoId={s.videoId} />;
  }
}

export function SheetHost() {
  const sheets = useUI((s) => s.sheets);
  return (
    <>
      {sheets.map((s, i) => (
        <div key={`${s.kind}-${i}`} className="sheet-layer" style={{ zIndex: 60 + i }}>
          {render(s)}
        </div>
      ))}
    </>
  );
}
