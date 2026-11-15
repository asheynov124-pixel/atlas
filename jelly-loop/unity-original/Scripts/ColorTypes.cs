using UnityEngine;

public enum JellyColor
{
    None,
    Red,
    Yellow,
    Blue,
    Green,
    Purple,
    Black,
    Cyan,
    Orange,
    Pink
}

public static class ColorUtils
{
    public static Color ToUnityColor(this JellyColor color)
    {
        return color switch
        {
            JellyColor.Red => Color.red,
            JellyColor.Yellow => Color.yellow,
            JellyColor.Blue => Color.blue,
            JellyColor.Green => Color.green,
            JellyColor.Purple => new Color(0.6f, 0.2f, 0.8f),
            JellyColor.Black => Color.black,
            JellyColor.Cyan => Color.cyan,
            JellyColor.Orange => new Color(1f, 0.5f, 0f),
            JellyColor.Pink => new Color(1f, 0.4f, 0.7f),
            _ => Color.gray
        };
    }
}
