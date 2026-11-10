# Jelly Busters-like Mobile Game in Unity

A complete prototype of a **Jelly Busters** style puzzle game built in Unity. Clear pixel-art pictures by sending colored jelly shooters around a conveyor belt that automatically fire at matching cubes.

## Core Mechanics Implemented

- Pixel-art board loaded from a Texture2D (or procedurally generated)
- Colored jelly shooters with ammo counts
- 5-slot conveyor belt that moves clockwise around the board
- Automatic shooting when jellies align with matching colored cubes
- Hand/queue of jellies at the bottom
- Win condition when the entire board is cleared
- Basic color system and visual feedback

## Project Setup

1. **Create a new Unity 2D project** (Unity 2022 LTS or newer recommended)
2. Copy the entire `Assets/Scripts` folder into your project's Assets folder
3. Create the required prefabs (see below)
4. Set up the Game scene
5. Press Play

## Required Prefabs

### 1. Cell Prefab
- Create empty GameObject → Add SpriteRenderer + BoxCollider2D
- Add `Cell` script
- Use a simple square sprite (white square works — color is set in code)
- Save as `Cell.prefab`

### 2. Jelly Prefab
- Create empty GameObject → Add SpriteRenderer
- Optional: Add a child Canvas with Text (for ammo number)
- Add `Jelly` script
- Assign the SpriteRenderer and Text references
- Add a BoxCollider2D (for tapping)
- Use a cute jelly/cube sprite or colored circle/square
- Save as `Jelly.prefab`

## Scene Setup (Game Scene)

1. Create empty GameObjects for managers:
   - `GameManager` (add GameManager script)
   - `BoardManager` (add BoardManager script)
   - `ConveyorManager` (add ConveyorManager script)
   - `HandManager` (add HandManager script)

2. **Board**:
   - Create empty `BoardParent` under BoardManager
   - Assign `cellPrefab` and `boardParent`
   - Set cellSize = 0.45–0.6 depending on your camera

3. **Conveyor Path**:
   - Create 8–12 empty GameObjects positioned around the board in a rectangular/rounded path (clockwise)
   - Drag them into the `pathWaypoints` list on ConveyorManager in order
   - Assign BoardManager reference

4. **Hand**:
   - Create empty `HandParent`
   - Assign `jellyPrefab` and `handParent` on HandManager

5. **UI** (optional but recommended):
   - Canvas with WinPanel and LosePanel (simple text + Restart button)
   - Assign them on GameManager

6. **Camera**:
   - Orthographic size ~8–10 so the board + conveyor + hand all fit
   - Position at (0, -1, -10)

7. **Test Level**:
   - Create a small pixel-art PNG (e.g. 12×16) with solid colors matching the ColorUtils
   - Assign it to `testLevelTexture` on GameManager
   - Or leave null to use the built-in procedural level

## How to Play the Prototype

- Tap jellies in the hand at the bottom
- They jump onto the conveyor and circle the board
- When they pass near matching colored cubes, they automatically shoot and clear them
- Clear the entire picture to win
- Watch the conveyor capacity (max 5)

## Expanding to a Full Game

### Next Features to Add
- **Waiting slots**: After a full lap, jellies with remaining ammo park in slots and can be re-sent
- **Boosters**: Propeller (targeted shot), Claw (pick from deeper queue), Merger (combine ammo)
- **Level progression**: Use `LevelData` ScriptableObjects + a level selector home screen
- **Real shooting logic**: Improve edge detection so jellies only shoot the outermost exposed cubes on the current side
- **Juice**: Particle bursts, screen shake, satisfying pop sounds, jelly bounce animations
- **Mobile polish**: Touch input, safe area, different aspect ratios, haptics
- **Economy**: Coins, lives (hearts), boosters as inventory
- **Home screen**: Level map with pixel-art previews (like the original)

### Recommended Architecture Improvements
- Use ScriptableObjects for all levels
- Object pooling for cells and jellies
- Event system (UnityEvents or C# events) for loose coupling
- Addressables for level textures if you have hundreds of levels
- DOTween or Animation Rigging for smooth jelly movement and UI

### Art Direction
- Cute 3D-looking 2D jellies on skateboards
- Bright, saturated colors
- Soft particle pops when cubes break
- Skatepark background with subtle motion

## Performance Notes (Mobile)

- Keep board size reasonable (max ~20×25 for older devices)
- Use sprite atlases
- Avoid excessive Instantiate/Destroy — pool cells and jellies
- Orthographic camera + simple sprites is very performant

## Files Included

```
Assets/Scripts/
├── ColorTypes.cs       # Color enum + conversion
├── Cell.cs             # Individual cube
├── BoardManager.cs     # Board generation + win check
├── Jelly.cs            # Shooter with ammo
├── ConveyorManager.cs  # Path movement + shooting
├── HandManager.cs      # Bottom queue
├── GameManager.cs      # Overall flow
└── LevelData.cs        # ScriptableObject for levels
```

This gives you a solid, playable foundation. From here you can iterate on the shooting precision, add the waiting slot mechanic, create real pixel-art levels, and build out the full meta game.

Enjoy busting cubes!
