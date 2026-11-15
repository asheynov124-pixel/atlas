using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// A jelly shooter that rides the conveyor and fires at matching cubes.
/// </summary>
public class Jelly : MonoBehaviour
{
    public JellyColor Color { get; private set; }
    public int Ammo { get; private set; }
    public bool IsOnConveyor { get; private set; }
    public int PathIndex { get; set; } // current waypoint index

    [SerializeField] private SpriteRenderer spriteRenderer;
    [SerializeField] private Text ammoText; // world space or UI text

    public void Initialize(JellyColor color, int ammo)
    {
        Color = color;
        Ammo = ammo;
        IsOnConveyor = false;
        UpdateVisual();
    }

    public bool ConsumeAmmo()
    {
        if (Ammo <= 0) return false;
        Ammo--;
        UpdateVisual();
        return Ammo > 0;
    }

    public void SetOnConveyor(bool on)
    {
        IsOnConveyor = on;
    }

    private void UpdateVisual()
    {
        if (spriteRenderer != null)
            spriteRenderer.color = Color.ToUnityColor();
        if (ammoText != null)
            ammoText.text = Ammo.ToString();
    }

    // For hand jellies: can be tapped
    private void OnMouseDown()
    {
        if (!IsOnConveyor)
            GameManager.Instance.TrySendJellyToConveyor(this);
    }
}
