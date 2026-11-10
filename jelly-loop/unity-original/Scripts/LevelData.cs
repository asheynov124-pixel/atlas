using UnityEngine;

[CreateAssetMenu(fileName = "NewLevel", menuName = "Jelly Busters/Level Data")]
public class LevelData : ScriptableObject
{
    public string levelName = "Level 1";
    public Texture2D pixelArt; // The image to clear
    public int difficulty = 1;

    // Optional: predefined hand of jellies for this level
    public JellySpawn[] startingJellies;

    [System.Serializable]
    public struct JellySpawn
    {
        public JellyColor color;
        public int ammo;
        public int count; // how many of this type
    }
}
