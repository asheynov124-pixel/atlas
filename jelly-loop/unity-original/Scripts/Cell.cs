using UnityEngine;

/// <summary>
/// Individual cube/cell on the puzzle board.
/// </summary>
public class Cell : MonoBehaviour
{
    public JellyColor Color { get; private set; }
    public bool IsCleared { get; private set; }
    public Vector2Int GridPosition { get; private set; }

    private SpriteRenderer _spriteRenderer;

    private void Awake()
    {
        _spriteRenderer = GetComponent<SpriteRenderer>();
    }

    public void Initialize(JellyColor color, Vector2Int gridPos)
    {
        Color = color;
        GridPosition = gridPos;
        IsCleared = color == JellyColor.None;
        UpdateVisual();
    }

    public bool TryClear(JellyColor shooterColor)
    {
        if (IsCleared || Color != shooterColor) return false;

        IsCleared = true;
        UpdateVisual();
        // Optional: play particle / ASMR pop sound here
        return true;
    }

    private void UpdateVisual()
    {
        if (_spriteRenderer == null) return;
        _spriteRenderer.color = IsCleared ? new Color(1, 1, 1, 0.1f) : Color.ToUnityColor();
        _spriteRenderer.enabled = !IsCleared || true; // Keep faint for debug
    }
}
