using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// Handles the conveyor belt path around the board.
/// Moves jellies clockwise and triggers shooting when aligned with the board.
/// </summary>
public class ConveyorManager : MonoBehaviour
{
    [Header("Path")]
    public List<Transform> pathWaypoints = new List<Transform>(); // Place empty GameObjects around the board in clockwise order
    public float moveSpeed = 2.5f;
    public int maxSlots = 5;

    [Header("References")]
    public BoardManager boardManager;
    public Transform jelliesParent;

    private List<Jelly> _activeJellies = new List<Jelly>();
    private float[] _progress; // 0-1 progress along full path for each jelly (simplified)

    private void Update()
    {
        MoveJellies();
    }

    public bool CanAddJelly()
    {
        return _activeJellies.Count < maxSlots;
    }

    public void AddJelly(Jelly jelly)
    {
        if (!CanAddJelly()) return;

        jelly.SetOnConveyor(true);
        jelly.transform.SetParent(jelliesParent);
        jelly.PathIndex = 0;
        _activeJellies.Add(jelly);

        // Place at first waypoint
        if (pathWaypoints.Count > 0)
            jelly.transform.position = pathWaypoints[0].position;
    }

    private void MoveJellies()
    {
        if (pathWaypoints.Count < 2) return;

        foreach (var jelly in _activeJellies)
        {
            if (jelly == null) continue;

            int current = jelly.PathIndex;
            int next = (current + 1) % pathWaypoints.Count;

            Vector3 target = pathWaypoints[next].position;
            jelly.transform.position = Vector3.MoveTowards(
                jelly.transform.position,
                target,
                moveSpeed * Time.deltaTime);

            // Check if reached next waypoint
            if (Vector3.Distance(jelly.transform.position, target) < 0.05f)
            {
                jelly.PathIndex = next;

                // Try to shoot when moving along a side
                TryShoot(jelly, current, next);
            }
        }

        // Remove depleted jellies
        _activeJellies.RemoveAll(j => j == null || j.Ammo <= 0);
    }

    private void TryShoot(Jelly jelly, int fromIndex, int toIndex)
    {
        if (jelly.Ammo <= 0) return;

        // Determine which side we're on and the inward direction
        // This is a simplified version — expand with better edge detection
        Vector2 direction = (pathWaypoints[toIndex].position - pathWaypoints[fromIndex].position).normalized;
        Vector2 inward = new Vector2(-direction.y, direction.x); // perpendicular (tweak based on clockwise)

        // For a rectangular path going clockwise, adjust inward per side
        // For prototype, just attempt a shot
        bool hit = boardManager.TryShootAtEdge(jelly.Color, jelly.transform.position, inward);

        if (hit)
        {
            jelly.ConsumeAmmo();
            // Optional: small visual feedback / particle on jelly
        }
    }

    public void ClearAll()
    {
        foreach (var j in _activeJellies)
            if (j != null) Destroy(j.gameObject);
        _activeJellies.Clear();
    }
}
