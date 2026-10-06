/**
 * Imports every content module for its registration side effects. FOUNDATION — do not reorder.
 * Each items/*.ts file is owned by one agent (see header comments).
 */
import './items/zoneBrushes';
import './items/growResCom';
import './items/growIndOffice';
import './items/utilities';
import './items/industry';
import './items/transit';
import './items/services';
import './items/education';
import './items/leisure';
import './items/landmarks';
import './items/orbital';
import './items/roads';
import './items/decor';

export { allItems, getItem, itemsByCategory, getGeometry, registerItems } from './catalog';
