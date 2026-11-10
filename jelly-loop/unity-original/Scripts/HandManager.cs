using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// Manages the player's hand / queue of jellies at the bottom of the screen.
/// </summary>
public class HandManager : MonoBehaviour
{
    [Header("Setup")]
    public Jelly jellyPrefab;
    public Transform handParent;
    public int columns = 4;
    public int jelliesPerColumn = 5;

    private List<Jelly> _handJellies = new List<Jelly>();

    public void GenerateHand(List<(JellyColor color, int ammo)> jellyData)
    {
        ClearHand();

        float spacing = 1.2f;
        int index = 0;

        foreach (var data in jellyData)
        {
            for (int i = 0; i < 1; i++) // one per data entry for simplicity; expand for columns
            {
                Vector3 pos = new Vector3((index % columns) * spacing - (columns * spacing * 0.4f),
                                         -6f - (index / columns) * 0.8f, 0);
                Jelly jelly = Instantiate(jellyPrefab, pos, Quaternion.identity, handParent);
                jelly.Initialize(data.color, data.ammo);
                _handJellies.Add(jelly);
                index++;
            }
        }
    }

    public void GenerateDefaultHand()
    {
        var data = new List<(JellyColor, int)>
        {
            (JellyColor.Red, 40),
            (JellyColor.Yellow, 40),
            (JellyColor.Blue, 40),
            (JellyColor.Green, 20),
            (JellyColor.Black, 40),
            (JellyColor.Cyan, 40),
            (JellyColor.Purple, 10),
            (JellyColor.Orange, 40)
        };
        GenerateHand(data);
    }

    public void RemoveFromHand(Jelly jelly)
    {
        _handJellies.Remove(jelly);
    }

    private void ClearHand()
    {
        foreach (var j in _handJellies)
            if (j != null) Destroy(j.gameObject);
        _handJellies.Clear();
    }
}
