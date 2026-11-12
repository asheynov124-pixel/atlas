using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// Manages the pixel-art board of colored cubes.
/// Loads from a Texture2D (or generates a simple one) and tracks win condition.
/// </summary>
public class BoardManager : MonoBehaviour
{
    [Header("Setup")]
    public Cell cellPrefab;
    public Transform boardParent;
    public float cellSize = 0.5f;
    public int gridWidth = 12;
    public int gridHeight = 16;

    private Cell[,] _grid;
    private int _remainingCells;

    public event System.Action OnBoardCleared;

    public void LoadLevel(Texture2D levelTexture)
    {
        ClearBoard();

        // If no texture provided, generate a simple test pattern
        if (levelTexture == null)
        {
            GenerateSimpleLevel();
            return;
        }

        gridWidth = levelTexture.width;
        gridHeight = levelTexture.height;
        _grid = new Cell[gridWidth, gridHeight];
        _remainingCells = 0;

        for (int x = 0; x < gridWidth; x++)
        {
            for (int y = 0; y < gridHeight; y++)
            {
                Color pixel = levelTexture.GetPixel(x, y);
                JellyColor color = PixelToColor(pixel);

                if (color == JellyColor.None) continue;

                Vector3 worldPos = GridToWorld(x, y);
                Cell cell = Instantiate(cellPrefab, worldPos, Quaternion.identity, boardParent);
                cell.Initialize(color, new Vector2Int(x, y));
                _grid[x, y] = cell;
                _remainingCells++;
            }
        }
    }

    private void GenerateSimpleLevel()
    {
        // Simple colored pattern for testing (e.g. a small house or just blocks)
        _grid = new Cell[gridWidth, gridHeight];
        _remainingCells = 0;

        for (int x = 0; x < gridWidth; x++)
        {
            for (int y = 0; y < gridHeight; y++)
            {
                // Create a simple pattern: outer layers different colors
                JellyColor color = JellyColor.None;
                if (y > gridHeight - 4) color = JellyColor.Red;
                else if (y > gridHeight / 2) color = JellyColor.Blue;
                else if (x < 3 || x > gridWidth - 4) color = JellyColor.Yellow;
                else color = JellyColor.Green;

                if (color == JellyColor.None) continue;

                Vector3 worldPos = GridToWorld(x, y);
                Cell cell = Instantiate(cellPrefab, worldPos, Quaternion.identity, boardParent);
                cell.Initialize(color, new Vector2Int(x, y));
                _grid[x, y] = cell;
                _remainingCells++;
            }
        }
    }

    private JellyColor PixelToColor(Color pixel)
    {
        if (pixel.a < 0.1f) return JellyColor.None;

        // Simple color matching — expand as needed
        if (pixel.r > 0.7f && pixel.g < 0.3f && pixel.b < 0.3f) return JellyColor.Red;
        if (pixel.r > 0.7f && pixel.g > 0.7f && pixel.b < 0.3f) return JellyColor.Yellow;
        if (pixel.b > 0.7f && pixel.r < 0.3f && pixel.g < 0.3f) return JellyColor.Blue;
        if (pixel.g > 0.7f && pixel.r < 0.3f && pixel.b < 0.3f) return JellyColor.Green;
        if (pixel.r > 0.5f && pixel.b > 0.5f && pixel.g < 0.4f) return JellyColor.Purple;
        if (pixel.r < 0.2f && pixel.g < 0.2f && pixel.b < 0.2f) return JellyColor.Black;
        if (pixel.g > 0.6f && pixel.b > 0.6f && pixel.r < 0.4f) return JellyColor.Cyan;

        return JellyColor.Orange; // fallback
    }

    public Vector3 GridToWorld(int x, int y)
    {
        float offsetX = -gridWidth * cellSize * 0.5f + cellSize * 0.5f;
        float offsetY = -gridHeight * cellSize * 0.5f + cellSize * 0.5f;
        return new Vector3(offsetX + x * cellSize, offsetY + y * cellSize, 0);
    }

    public bool TryShootAtEdge(JellyColor color, Vector3 shooterWorldPos, Vector2 inwardDirection)
    {
        // Simplified: check nearby cells in the facing direction
        // For a real version, raycast or sample the edge row/column
        Vector2Int approxGrid = WorldToGrid(shooterWorldPos);

        // Check a few cells inward from the edge
        for (int i = 0; i < 3; i++)
        {
            Vector2Int checkPos = approxGrid + Vector2Int.RoundToInt(inwardDirection * (i + 1));
            if (IsValid(checkPos) && _grid[checkPos.x, checkPos.y] != null)
            {
                Cell cell = _grid[checkPos.x, checkPos.y];
                if (cell.TryClear(color))
                {
                    _remainingCells--;
                    if (_remainingCells <= 0)
                        OnBoardCleared?.Invoke();
                    return true;
                }
            }
        }
        return false;
    }

    private Vector2Int WorldToGrid(Vector3 worldPos)
    {
        float offsetX = -gridWidth * cellSize * 0.5f + cellSize * 0.5f;
        float offsetY = -gridHeight * cellSize * 0.5f + cellSize * 0.5f;
        int x = Mathf.RoundToInt((worldPos.x - offsetX) / cellSize);
        int y = Mathf.RoundToInt((worldPos.y - offsetY) / cellSize);
        return new Vector2Int(x, y);
    }

    private bool IsValid(Vector2Int pos)
    {
        return pos.x >= 0 && pos.x < gridWidth && pos.y >= 0 && pos.y < gridHeight;
    }

    private void ClearBoard()
    {
        if (boardParent != null)
        {
            foreach (Transform child in boardParent)
                Destroy(child.gameObject);
        }
        _grid = null;
        _remainingCells = 0;
    }
}
