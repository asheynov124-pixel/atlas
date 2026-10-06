/**
 * OWNER: agent roads-props
 * Decor & nature props (category 'decor', placement 'free', footprint 1): placed anywhere on a tile by the decor
 * tool (u, v, yaw, scale, tint) and drawn by render/props/PropRenderer. 70+ items in 8 groups:
 *   Trees · Plants · Furniture · Lights · Art · Signs · Sci-Fi · Seasonal
 * Meshes live in content/meshes/props/{decor,trees}.ts (≤ 150 triangles each). Costs are small; effects are local
 * flavour (a bench makes a street a little happier, a monolith a little stranger).
 */
import { registerItems, type Effects, type ItemDef, type MeshFactory } from '../catalog';
import type { PlanetTypeId } from '../../core/types';
import { DECOR_MESHES as M, treeMesh } from '../meshes/props/decor';

interface Decor {
  id: string;
  name: string;
  group: 'Trees' | 'Plants' | 'Furniture' | 'Lights' | 'Art' | 'Signs' | 'Sci-Fi' | 'Seasonal';
  mesh: MeshFactory;
  cost: number;
  tier: number;
  height: number;
  icon: string;
  description: string;
  flavor: string;
  effects?: Effects;
  tags?: string[];
  planetTypes?: PlanetTypeId[];
}

function decor(d: Decor): ItemDef {
  return {
    id: `decor.${d.id}`,
    name: d.name,
    category: 'decor',
    group: d.group,
    description: d.description,
    flavor: d.flavor,
    icon: d.icon,
    footprint: 1,
    placement: 'free',
    cost: d.cost,
    upkeep: Math.max(1, Math.round(d.cost * 0.02)),
    tier: d.tier,
    mesh: d.mesh,
    height: d.height,
    effects: d.effects ?? { happiness: 1, radius: 1 },
    tags: ['decor', d.group.toLowerCase(), ...(d.tags ?? [])],
    planetTypes: d.planetTypes,
  };
}

const green = (h = 1, lv = 1): Effects => ({ happiness: h, landValue: lv, pollution: -1, radius: 1 });

const DECOR: Decor[] = [
  // ─────────────────────────────────────────── Trees
  { id: 'tree.oak', name: 'Oak Tree', group: 'Trees', mesh: treeMesh('oak'), cost: 40, tier: 0, height: 0.62, icon: '🌳', description: 'A broad, shady oak. Plants itself in the hearts of residents.', flavor: 'Three hundred years of growth, delivered by drone this morning.', effects: green(), tags: ['tree', 'nature'] },
  { id: 'tree.pine', name: 'Pine', group: 'Trees', mesh: treeMesh('pine'), cost: 35, tier: 0, height: 1.0, icon: '🌲', description: 'Tall, tidy conifer that stays green through any season.', flavor: 'Smells like a car air freshener, but the original.', effects: green(), tags: ['tree', 'conifer'] },
  { id: 'tree.birch', name: 'Silver Birch', group: 'Trees', mesh: treeMesh('birch'), cost: 40, tier: 0, height: 0.7, icon: '🌳', description: 'Slender white bark and a feathery crown. Lovely in groves.', flavor: 'Nature’s barcode — scans as “pretty”.', effects: green(), tags: ['tree'] },
  { id: 'tree.palm', name: 'Palm Tree', group: 'Trees', mesh: treeMesh('palm'), cost: 55, tier: 0, height: 0.8, icon: '🌴', description: 'Leaning palm with a crown of drooping fronds. Instant holiday.', flavor: 'Coconut liability waivers sold separately.', effects: green(1, 2), tags: ['tree', 'tropical', 'beach'] },
  { id: 'tree.cherry', name: 'Cherry Blossom', group: 'Trees', mesh: treeMesh('cherry'), cost: 90, tier: 1, height: 0.55, icon: '🌸', description: 'Clouds of pink blossom. Boosts happiness more than any ordinary tree.', flavor: 'Blooms for a week, gets photographed for a year.', effects: { happiness: 3, landValue: 2, radius: 1 }, tags: ['tree', 'blossom', 'pink'] },
  { id: 'tree.autumn', name: 'Autumn Maple', group: 'Trees', mesh: treeMesh('autumn'), cost: 60, tier: 0, height: 0.6, icon: '🍁', description: 'Permanently set to its best season: fire-orange leaves all year.', flavor: 'We patched out winter.', effects: green(2, 1), tags: ['tree', 'autumn', 'maple'] },
  { id: 'tree.baobab', name: 'Baobab', group: 'Trees', mesh: treeMesh('baobab'), cost: 80, tier: 1, height: 0.6, icon: '🌳', description: 'Fat-trunked savanna giant that stores water for the dry season.', flavor: 'Upside-down tree, right-side-up attitude.', effects: green(), tags: ['tree', 'savanna'] },
  { id: 'tree.acacia', name: 'Acacia', group: 'Trees', mesh: treeMesh('acacia'), cost: 45, tier: 0, height: 0.48, icon: '🌳', description: 'Flat-topped umbrella tree of the open plains.', flavor: 'Giraffes not included. Yet.', effects: green(), tags: ['tree', 'savanna'] },
  { id: 'tree.cactus', name: 'Saguaro Cactus', group: 'Trees', mesh: treeMesh('cactus'), cost: 30, tier: 0, height: 0.6, icon: '🌵', description: 'Waves hello with both arms. Needs no water, no care, no hugs.', flavor: 'Emotionally prickly, structurally sound.', effects: green(1, 0), tags: ['desert', 'cactus'] },
  { id: 'tree.willow', name: 'Weeping Willow', group: 'Trees', mesh: treeMesh('willow'), cost: 70, tier: 1, height: 0.62, icon: '🌳', description: 'Drapes its branches like a curtain. Perfect beside ponds and rivers.', flavor: 'It’s not sad, it’s just very relaxed.', effects: green(2, 1), tags: ['tree', 'water'] },
  { id: 'tree.jungle', name: 'Jungle Giant', group: 'Trees', mesh: treeMesh('jungle'), cost: 85, tier: 1, height: 0.85, icon: '🌴', description: 'Towering rainforest canopy tree trailing vines.', flavor: 'Comes with an ecosystem. Several, actually.', effects: green(2, 1), tags: ['tree', 'jungle'] },
  { id: 'tree.snowpine', name: 'Snowy Pine', group: 'Trees', mesh: treeMesh('snowpine'), cost: 45, tier: 0, height: 0.95, icon: '🌲', description: 'A conifer dusted with snow that never melts — on any world.', flavor: 'Seasonally confused, aesthetically correct.', effects: green(), tags: ['tree', 'winter', 'snow'] },
  { id: 'tree.larch', name: 'Golden Larch', group: 'Trees', mesh: treeMesh('larch'), cost: 45, tier: 0, height: 0.9, icon: '🌲', description: 'A conifer that turns gold. Hardy enough for tundra worlds.', flavor: 'Rich in colour, if not in currency.', effects: green(), tags: ['tree', 'tundra'] },
  { id: 'tree.mushroom', name: 'Giant Mushroom', group: 'Trees', mesh: treeMesh('mushroom', 1.4), cost: 120, tier: 2, height: 0.62, icon: '🍄', description: 'A towering fungal-world mushroom with glowing gills. Lights up the night.', flavor: 'Do not lick. We have to say that now.', effects: { happiness: 2, tourism: 2, radius: 1 }, tags: ['alien', 'fungal', 'glow'] },
  { id: 'tree.crystal', name: 'Crystal Tree', group: 'Trees', mesh: treeMesh('crystal', 1.4), cost: 260, tier: 3, height: 0.75, icon: '💎', description: 'Faceted crystal branches that glow from within. Grown, not carved.', flavor: 'Photosynthesis, but make it fashion.', effects: { happiness: 2, landValue: 4, tourism: 3, radius: 1 }, tags: ['alien', 'crystal', 'glow'] },
  { id: 'tree.bulb', name: 'Glowbulb Plant', group: 'Trees', mesh: treeMesh('bulb', 1.5), cost: 110, tier: 2, height: 0.6, icon: '💡', description: 'Toxic-world flora whose bulbs glow lime and amber after dark.', flavor: 'Bioluminescent and only mildly radioactive.', effects: { happiness: 2, tourism: 1, radius: 1 }, tags: ['alien', 'toxic', 'glow'] },
  { id: 'tree.pylon', name: 'Signal Pylon', group: 'Trees', mesh: treeMesh('pylon', 1.2), cost: 140, tier: 3, height: 0.85, icon: '📡', description: 'The “trees” of machine worlds: lattice pylons with beacon lights.', flavor: 'They grow one bolt at a time.', effects: { happiness: 1, data: 2, radius: 1 }, tags: ['machine', 'metal', 'beacon'] },

  // ─────────────────────────────────────────── Plants
  { id: 'hedge', name: 'Hedge', group: 'Plants', mesh: M.hedge, cost: 25, tier: 0, height: 0.14, icon: '🌿', description: 'A neatly trimmed hedge row. Defines lots, hides bins, frames gardens.', flavor: 'Topiary’s quiet, rectangular cousin.', effects: green(1, 1), tags: ['garden', 'fence'] },
  { id: 'flowerbed', name: 'Flower Bed', group: 'Plants', mesh: M.flowerbed, cost: 35, tier: 0, height: 0.1, icon: '🌷', description: 'A brick-edged bed bursting with colourful blooms.', flavor: 'Bees give it five stars.', effects: { happiness: 2, landValue: 1, radius: 1 }, tags: ['garden', 'flowers'] },
  { id: 'planter', name: 'Planter Box', group: 'Plants', mesh: M.planter, cost: 30, tier: 0, height: 0.14, icon: '🪴', description: 'Wooden planter with shrubs and a pop of colour. Great on plazas.', flavor: 'Urban greening, one box at a time.', effects: green(1, 1), tags: ['garden'] },
  { id: 'topiary', name: 'Topiary', group: 'Plants', mesh: M.topiary, cost: 70, tier: 1, height: 0.35, icon: '🌲', description: 'Three perfect spheres of clipped evergreen in a terracotta pot.', flavor: 'The gardener has been to art school and wants you to know.', effects: { happiness: 2, landValue: 3, radius: 1 }, tags: ['garden', 'fancy'] },
  { id: 'shrubs', name: 'Shrubs', group: 'Plants', mesh: M.shrubs, cost: 20, tier: 0, height: 0.15, icon: '🌿', description: 'A pair of leafy shrubs to soften any corner.', flavor: 'The filler that holds a city’s look together.', effects: green(1, 0), tags: ['bush'] },
  { id: 'glowshrooms', name: 'Glowing Mushrooms', group: 'Plants', mesh: M.glowshrooms, cost: 45, tier: 1, height: 0.12, icon: '🍄', description: 'A cluster of bioluminescent mushrooms in four soft colours.', flavor: 'Nightlights that grow back.', effects: { happiness: 2, radius: 1 }, tags: ['glow', 'fungal', 'night'] },
  { id: 'fern', name: 'Giant Fern', group: 'Plants', mesh: treeMesh('fern', 1.5), cost: 35, tier: 0, height: 0.3, icon: '🌿', description: 'Prehistoric-looking fern fronds unfurling in every direction.', flavor: 'Dinosaurs loved it. Dinosaurs are not available.', effects: green(1, 0), tags: ['jungle'] },
  { id: 'bamboo', name: 'Bamboo Grove', group: 'Plants', mesh: M.bamboo, cost: 50, tier: 1, height: 0.5, icon: '🎋', description: 'Tall, rustling bamboo stalks. Fast-growing and endlessly calming.', flavor: 'Grows a metre a day. Please do not stand still.', effects: { happiness: 2, landValue: 1, radius: 1 }, tags: ['garden', 'zen'] },
  { id: 'boulder', name: 'Boulder', group: 'Plants', mesh: M.boulder, cost: 25, tier: 0, height: 0.15, icon: '🪨', description: 'A mossy boulder for natural-looking landscaping.', flavor: 'Hand-placed by a crane operator with feelings.', effects: { landValue: 1, radius: 1 }, tags: ['rock', 'landscape'] },
  { id: 'zen', name: 'Zen Garden', group: 'Plants', mesh: M.zen, cost: 120, tier: 1, height: 0.08, icon: '⛩️', description: 'Raked sand, two stones and one perfect bonsai-ish shrub.', flavor: 'Raking it is the hardest job in the city. Spiritually.', effects: { happiness: 3, landValue: 2, radius: 1 }, tags: ['garden', 'calm', 'rock'] },

  // ─────────────────────────────────────────── Furniture
  { id: 'bench', name: 'Park Bench', group: 'Furniture', mesh: M.bench, cost: 30, tier: 0, height: 0.08, icon: '🪑', description: 'Wood-and-iron bench. Where pigeons and philosophers meet.', flavor: 'In memory of someone who really liked sitting here.', effects: { happiness: 1, radius: 1 }, tags: ['seat', 'park'] },
  { id: 'picnic', name: 'Picnic Table', group: 'Furniture', mesh: M.picnic, cost: 45, tier: 0, height: 0.2, icon: '🧺', description: 'Picnic table with a cheerful striped parasol.', flavor: 'Ants rate it highly.', effects: { happiness: 2, radius: 1 }, tags: ['park', 'seat'] },
  { id: 'busstop', name: 'Bus Shelter', group: 'Furniture', mesh: M.busstop, cost: 120, tier: 0, height: 0.26, icon: '🚏', description: 'Glass hover-bus shelter with a bench, an animated ad panel and a glowing route sign.', flavor: 'The bus is always three minutes away. Always.', effects: { happiness: 1, landValue: 1, radius: 1 }, tags: ['transit', 'street'] },
  { id: 'mailbox', name: 'Mailbox', group: 'Furniture', mesh: M.mailbox, cost: 15, tier: 0, height: 0.12, icon: '📫', description: 'A classic blue post box. Still the fastest way to send a birthday card.', flavor: 'Interplanetary postage: one kidney.', effects: { happiness: 0, radius: 1 }, tags: ['street'] },
  { id: 'bikerack', name: 'Bike Rack', group: 'Furniture', mesh: M.bikerack, cost: 25, tier: 0, height: 0.06, icon: '🚲', description: 'Three hoops and one optimistic cyclist.', flavor: 'Lock it. Even the robots are tempted.', effects: { happiness: 1, pollution: -1, radius: 1 }, tags: ['street', 'bike'] },
  { id: 'bins', name: 'Recycling Bins', group: 'Furniture', mesh: M.bins, cost: 20, tier: 0, height: 0.09, icon: '♻️', description: 'Paper, plastic, and the mysterious yellow one.', flavor: 'Nobody knows what goes in yellow.', effects: { pollution: -1, radius: 1 }, tags: ['street', 'recycling'] },
  { id: 'foodcart', name: 'Food Cart', group: 'Furniture', mesh: M.foodcart, cost: 80, tier: 0, height: 0.24, icon: '🌭', description: 'Street-food cart under a sunny umbrella. Glows after dark.', flavor: 'Health inspector rating: enthusiastic.', effects: { happiness: 2, income: 2, radius: 1 }, tags: ['food', 'street'] },
  { id: 'kiosk', name: 'News Kiosk', group: 'Furniture', mesh: M.kiosk, cost: 90, tier: 0, height: 0.22, icon: '📰', description: 'A little green kiosk selling papers, gum and gossip.', flavor: 'Headlines printed on actual paper, for collectors.', effects: { happiness: 1, income: 2, radius: 1 }, tags: ['shop', 'street'] },
  { id: 'stall', name: 'Market Stall', group: 'Furniture', mesh: M.stall, cost: 70, tier: 0, height: 0.23, icon: '🍎', description: 'Striped canopy over a table of fresh produce.', flavor: 'Organic, local, and only slightly levitating.', effects: { happiness: 2, income: 2, radius: 1 }, tags: ['market', 'food'] },
  { id: 'slide', name: 'Playground Slide', group: 'Furniture', mesh: M.slide, cost: 110, tier: 0, height: 0.16, icon: '🛝', description: 'Bright yellow slide with a ladder and a lookout deck.', flavor: 'Engineered for maximum giggle velocity.', effects: { happiness: 3, landValue: 1, radius: 1 }, tags: ['playground', 'kids', 'park'] },
  { id: 'swings', name: 'Swing Set', group: 'Furniture', mesh: M.swings, cost: 90, tier: 0, height: 0.21, icon: '🎠', description: 'A two-seat swing set. Adults are not technically banned.', flavor: 'Peak altitude: one squeal.', effects: { happiness: 3, radius: 1 }, tags: ['playground', 'kids', 'park'] },
  { id: 'hydrant', name: 'Fire Hydrant', group: 'Furniture', mesh: M.hydrant, cost: 20, tier: 0, height: 0.1, icon: '🧯', description: 'Bright red hydrant. Dogs consider it a newspaper.', flavor: 'Summer splash parties by appointment.', effects: { happiness: 0, radius: 1 }, tags: ['street', 'fire'] },
  { id: 'phonebooth', name: 'Holo-Phone Booth', group: 'Furniture', mesh: M.phonebooth, cost: 150, tier: 2, height: 0.24, icon: '☎️', description: 'A retro booth with a holographic screen. Call anyone, any planet, any decade.', flavor: 'Mostly used by time travellers and nostalgic teens.', effects: { happiness: 1, data: 1, radius: 1 }, tags: ['retro', 'holo'] },

  // ─────────────────────────────────────────── Lights
  { id: 'lamp.classic', name: 'Classic Lamp', group: 'Lights', mesh: M.lampClassic, cost: 40, tier: 0, height: 0.36, icon: '🏮', description: 'Victorian-style lantern on a cast-iron post. Warm glow at night.', flavor: 'Lamplighter not required since 2087.', effects: { happiness: 1, landValue: 1, radius: 1 }, tags: ['lamp', 'light', 'night'] },
  { id: 'lamp.neo', name: 'Neo Lamp', group: 'Lights', mesh: M.lampNeo, cost: 70, tier: 1, height: 0.3, icon: '💡', description: 'A sleek white stem crowned with a floating cyan halo.', flavor: 'Designed by a committee of minimalists. It took one meeting.', effects: { happiness: 1, landValue: 2, radius: 1 }, tags: ['lamp', 'light', 'futuristic'] },
  { id: 'lamp.cyber', name: 'Cyber Lamp', group: 'Lights', mesh: M.lampCyber, cost: 80, tier: 2, height: 0.34, icon: '🔦', description: 'Angular gunmetal lamp with a magenta neon spine. Rainy-night essential.', flavor: 'Comes with free ambient synthwave.', effects: { happiness: 1, landValue: 1, radius: 1 }, tags: ['lamp', 'neon', 'cyberpunk'] },
  { id: 'lanterns', name: 'String Lanterns', group: 'Lights', mesh: M.lanterns, cost: 50, tier: 0, height: 0.22, icon: '🏮', description: 'Paper lanterns strung between two posts. Festival every night.', flavor: 'Mood lighting for the whole block.', effects: { happiness: 2, radius: 1 }, tags: ['light', 'festival', 'night'] },
  { id: 'campfire', name: 'Campfire', group: 'Lights', mesh: M.campfire, cost: 25, tier: 0, height: 0.13, icon: '🔥', description: 'Crackling fire in a ring of stones. Marshmallows sold separately.', flavor: 'The original social network.', effects: { happiness: 2, pollution: 1, radius: 1 }, tags: ['fire', 'camping', 'light'] },
  { id: 'torches', name: 'Tiki Torches', group: 'Lights', mesh: M.torches, cost: 30, tier: 0, height: 0.33, icon: '🔥', description: 'A pair of bamboo torches with dancing flames.', flavor: 'Instant beach party. Beach optional.', effects: { happiness: 2, radius: 1 }, tags: ['fire', 'tropical', 'light'] },
  { id: 'searchlight', name: 'Searchlight', group: 'Lights', mesh: M.searchlight, cost: 160, tier: 2, height: 0.75, icon: '🔦', description: 'A holographic beam sweeping the sky. Every grand opening needs one.', flavor: 'Also useful for summoning caped vigilantes.', effects: { happiness: 2, tourism: 2, radius: 1 }, tags: ['light', 'beam', 'event'] },

  // ─────────────────────────────────────────── Art
  { id: 'statue', name: 'Founder Statue', group: 'Art', mesh: M.statue, cost: 300, tier: 1, height: 0.3, icon: '🗿', description: 'Bronze figure of the colony founder, pointing bravely at the future (or a bakery).', flavor: 'The pigeons have opinions.', effects: { happiness: 2, landValue: 4, tourism: 2, radius: 2 }, tags: ['statue', 'monument'] },
  { id: 'robot', name: 'Robot Statue', group: 'Art', mesh: M.robotStatue, cost: 350, tier: 2, height: 0.29, icon: '🤖', description: 'A tribute to the first robot that ever asked “why?”. Its eyes still glow.', flavor: 'It waves when nobody’s looking.', effects: { happiness: 2, landValue: 3, tourism: 3, radius: 2 }, tags: ['statue', 'robot'] },
  { id: 'fountain', name: 'Fountain', group: 'Art', mesh: M.fountain, cost: 400, tier: 1, height: 0.28, icon: '⛲', description: 'Two-tier stone fountain with shimmering, animated water.', flavor: 'Wishes granted at a 0.0% rate, coins collected at 100%.', effects: { happiness: 3, landValue: 5, tourism: 2, radius: 2 }, tags: ['water', 'plaza'] },
  { id: 'sculpture', name: 'Abstract Sculpture', group: 'Art', mesh: M.sculpture, cost: 280, tier: 1, height: 0.25, icon: '🎨', description: 'An orange ring orbiting a blue sphere. Critics disagree on everything else.', flavor: 'Title: “Untitled #47 (Budget Approved)”.', effects: { happiness: 1, landValue: 4, tourism: 2, radius: 2 }, tags: ['art', 'modern'] },
  { id: 'monolith', name: 'Alien Monolith', group: 'Art', mesh: M.monolith, cost: 900, tier: 5, height: 0.38, icon: '⬛', description: 'A perfectly black slab etched with lines of living light. Nobody remembers installing it.', flavor: 'It does nothing. Probably.', effects: { happiness: 1, research: 3, tourism: 6, radius: 2 }, tags: ['alien', 'mystery', 'glow'] },
  { id: 'totem', name: 'Totem Pole', group: 'Art', mesh: M.totem, cost: 160, tier: 0, height: 0.3, icon: '🪵', description: 'Four stacked faces in bold colours, topped with outstretched wings.', flavor: 'The one at the bottom has the hardest job.', effects: { happiness: 2, tourism: 2, radius: 1 }, tags: ['art', 'heritage'] },
  { id: 'cascade', name: 'Water Cascade', group: 'Art', mesh: M.cascade, cost: 350, tier: 2, height: 0.2, icon: '💧', description: 'Stepped stone water feature spilling into a shallow pool.', flavor: 'White noise, but posh.', effects: { happiness: 3, landValue: 4, radius: 2 }, tags: ['water', 'plaza'] },
  { id: 'pond', name: 'Koi Pond', group: 'Art', mesh: M.pond, cost: 180, tier: 1, height: 0.04, icon: '🐟', description: 'A stone-ringed pond with lily pads and two very spoiled koi.', flavor: 'The koi have a bigger budget than the library.', effects: { happiness: 3, landValue: 3, radius: 1 }, tags: ['water', 'garden', 'fish'] },
  { id: 'gnome', name: 'Garden Gnome', group: 'Art', mesh: M.gnome, cost: 10, tier: 0, height: 0.11, icon: '🧙', description: 'A cheerful garden gnome. Moves when you’re not watching.', flavor: 'Reported missing 47 times. Always comes back with photos.', effects: { happiness: 1, radius: 1 }, tags: ['garden', 'cute'] },
  { id: 'obelisk', name: 'Rune Obelisk', group: 'Art', mesh: M.obelisk, cost: 420, tier: 3, height: 0.4, icon: '🗿', description: 'Sandstone obelisk carved with glowing runes from a vanished civilisation.', flavor: 'Translation in progress. So far it says “keep off the grass”.', effects: { happiness: 1, tourism: 5, research: 1, radius: 2 }, tags: ['ancient', 'ruins', 'glow'] },
  { id: 'astronaut', name: 'Astronaut Statue', group: 'Art', mesh: M.astronaut, cost: 380, tier: 2, height: 0.3, icon: '👩‍🚀', description: 'The first boots on this world, planting the first flag. Visor glows gold.', flavor: 'One small step, one giant photo op.', effects: { happiness: 2, landValue: 3, tourism: 3, radius: 2 }, tags: ['statue', 'space'] },

  // ─────────────────────────────────────────── Signs
  { id: 'flag', name: 'Flagpole', group: 'Signs', mesh: M.flag, cost: 30, tier: 0, height: 0.42, icon: '🚩', description: 'A tall flagpole. Tint it to fly your colony’s colours.', flavor: 'Flaps majestically even without wind. We don’t ask.', effects: { happiness: 1, radius: 1 }, tags: ['flag', 'civic'] },
  { id: 'banner', name: 'Banner Poles', group: 'Signs', mesh: M.banner, cost: 45, tier: 0, height: 0.33, icon: '🎌', description: 'A pair of street banners for festivals, districts and sports teams.', flavor: 'Currently advertising itself.', effects: { happiness: 1, radius: 1 }, tags: ['banner', 'festival'] },
  { id: 'neon', name: 'Neon Sign', group: 'Signs', mesh: M.neonSign, cost: 90, tier: 1, height: 0.25, icon: '🍸', description: 'A buzzing neon cocktail glass and an OPEN bar. Glows day and night.', flavor: 'Open 25 hours. Don’t ask about the 25th.', effects: { happiness: 1, income: 1, radius: 1 }, tags: ['neon', 'nightlife', 'glow'] },
  { id: 'holoboard', name: 'Holo-Billboard', group: 'Signs', mesh: M.holoBoard, cost: 220, tier: 2, height: 0.31, icon: '📺', description: 'Free-standing holographic billboard with neon trim. Ads flicker in mid-air.', flavor: 'Now targeting ads at your thoughts. Beta.', effects: { income: 3, landValue: -1, radius: 1 }, tags: ['holo', 'advert', 'glow'] },
  { id: 'signpost', name: 'Signpost', group: 'Signs', mesh: M.signpost, cost: 20, tier: 0, height: 0.27, icon: '🪧', description: 'Three arrows pointing to three places, all of them “that way”.', flavor: 'Mars: 225 million km. Nearest café: 40 m.', effects: { happiness: 1, radius: 1 }, tags: ['sign', 'wayfinding'] },

  // ─────────────────────────────────────────── Sci-Fi
  { id: 'antenna', name: 'Antenna Mast', group: 'Sci-Fi', mesh: M.antenna, cost: 140, tier: 1, height: 0.5, icon: '📡', description: 'A lattice comms mast with a blinking red aviation light.', flavor: 'Five bars everywhere, including the basement.', effects: { data: 2, radius: 1 }, tags: ['comms', 'tech'] },
  { id: 'dish', name: 'Satellite Dish', group: 'Sci-Fi', mesh: M.dish, cost: 160, tier: 1, height: 0.22, icon: '📡', description: 'A white parabolic dish listening to the stars.', flavor: 'Mostly picks up reruns from 1962.', effects: { data: 3, research: 1, radius: 1 }, tags: ['comms', 'space', 'tech'] },
  { id: 'hologlobe', name: 'Holo Globe', group: 'Sci-Fi', mesh: M.holoGlobe, cost: 260, tier: 2, height: 0.24, icon: '🌐', description: 'A holographic planet turning above a glowing pedestal.', flavor: 'Shows the weather on a planet you can’t afford to visit.', effects: { happiness: 2, tourism: 2, landValue: 2, radius: 2 }, tags: ['holo', 'plaza', 'glow'] },
  { id: 'dronepad', name: 'Drone Pad', group: 'Sci-Fi', mesh: M.dronePad, cost: 200, tier: 2, height: 0.06, icon: '🛸', description: 'Hexagonal landing pad with glowing markings and a resting delivery drone.', flavor: 'Packages arrive before you finish ordering.', effects: { income: 2, noise: 4, radius: 1 }, tags: ['drone', 'delivery', 'tech'] },
  { id: 'crystal', name: 'Crystal Shard', group: 'Sci-Fi', mesh: M.crystalShard, cost: 180, tier: 2, height: 0.38, icon: '💎', description: 'A cluster of glowing alien crystals in violet, cyan and pink.', flavor: 'Hums at 432 Hz. Influencers are thrilled.', effects: { happiness: 2, tourism: 3, landValue: 2, radius: 1 }, tags: ['crystal', 'alien', 'glow'] },
  { id: 'teleporter', name: 'Teleporter Pad', group: 'Sci-Fi', mesh: M.teleporter, cost: 600, tier: 5, height: 0.36, icon: '🌀', description: 'Three glowing pylons around a shimmering beam. Destination: elsewhere.', flavor: 'Arrives in one piece 99.97 % of the time.', effects: { happiness: 2, tourism: 4, landValue: 3, radius: 2 }, tags: ['teleport', 'future', 'glow'] },
  { id: 'charger', name: 'Hovercar Charger', group: 'Sci-Fi', mesh: M.charger, cost: 110, tier: 2, height: 0.2, icon: '🔌', description: 'A charging post with a glowing pad for hover-cars. Green after dark.', flavor: 'Zero emissions, maximum queueing.', effects: { pollution: -2, income: 1, radius: 1 }, tags: ['ev', 'car', 'tech'] },
  { id: 'servicebot', name: 'Service Bot', group: 'Sci-Fi', mesh: M.serviceBot, cost: 150, tier: 2, height: 0.17, icon: '🤖', description: 'A friendly round helper bot on patrol. Picks up litter, gives directions.', flavor: 'Rated “adorable” by 98 % of residents and 100 % of toddlers.', effects: { happiness: 2, pollution: -1, radius: 1 }, tags: ['robot', 'cute'] },

  // ─────────────────────────────────────────── Seasonal
  { id: 'snowman', name: 'Snowman', group: 'Seasonal', mesh: M.snowman, cost: 15, tier: 0, height: 0.27, icon: '⛄', description: 'Three snowballs, a carrot and a top hat. Climate-controlled — never melts.', flavor: 'Cold on the outside, warm on the inside. Mostly outside.', effects: { happiness: 2, radius: 1 }, tags: ['winter', 'snow', 'holiday'] },
  { id: 'festivetree', name: 'Festive Tree', group: 'Seasonal', mesh: M.festiveTree, cost: 80, tier: 0, height: 0.42, icon: '🎄', description: 'A decorated pine with glowing baubles, a star and presents underneath.', flavor: 'Lights tested. Twice. One still doesn’t work.', effects: { happiness: 3, tourism: 1, radius: 2 }, tags: ['winter', 'holiday', 'glow'] },
  { id: 'pumpkin', name: 'Jack-o’-Lantern', group: 'Seasonal', mesh: M.pumpkin, cost: 15, tier: 0, height: 0.12, icon: '🎃', description: 'A carved pumpkin with a flickering grin.', flavor: 'Mildly spooky. Extremely photogenic.', effects: { happiness: 2, radius: 1 }, tags: ['autumn', 'holiday', 'glow'] },
  { id: 'egg', name: 'Spring Egg', group: 'Seasonal', mesh: M.springEgg, cost: 25, tier: 0, height: 0.19, icon: '🥚', description: 'A giant painted egg on a patch of fresh grass.', flavor: 'Laid by a very large, very artistic bird.', effects: { happiness: 2, radius: 1 }, tags: ['spring', 'holiday'] },
  { id: 'gifts', name: 'Gift Boxes', group: 'Seasonal', mesh: M.gifts, cost: 20, tier: 0, height: 0.13, icon: '🎁', description: 'A pile of wrapped presents with golden ribbons.', flavor: 'Contents: socks. Always socks.', effects: { happiness: 2, radius: 1 }, tags: ['holiday', 'gift'] },
];

registerItems(DECOR.map(decor));
