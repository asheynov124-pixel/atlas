using UnityEngine;
using UnityEngine.SceneManagement;

/// <summary>
/// Main game controller. Handles level start, win/lose, and coordination.
/// </summary>
public class GameManager : MonoBehaviour
{
    public static GameManager Instance { get; private set; }

    [Header("Managers")]
    public BoardManager boardManager;
    public ConveyorManager conveyorManager;
    public HandManager handManager;

    [Header("Level")]
    public Texture2D testLevelTexture; // Assign a pixel art texture in inspector

    [Header("UI")]
    public GameObject winPanel;
    public GameObject losePanel;

    private bool _gameOver;

    private void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }
        Instance = this;
    }

    private void Start()
    {
        StartLevel();
    }

    public void StartLevel()
    {
        _gameOver = false;
        if (winPanel) winPanel.SetActive(false);
        if (losePanel) losePanel.SetActive(false);

        conveyorManager.ClearAll();
        boardManager.LoadLevel(testLevelTexture);
        handManager.GenerateDefaultHand();

        boardManager.OnBoardCleared += OnWin;
    }

    public void TrySendJellyToConveyor(Jelly jelly)
    {
        if (_gameOver) return;
        if (!conveyorManager.CanAddJelly()) return;

        handManager.RemoveFromHand(jelly);
        conveyorManager.AddJelly(jelly);
    }

    private void OnWin()
    {
        if (_gameOver) return;
        _gameOver = true;
        Debug.Log("Level Cleared! All cubes busted.");
        if (winPanel) winPanel.SetActive(true);
        // Optional: reward coins, next level, etc.
    }

    public void RestartLevel()
    {
        SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
    }

    public void NextLevel()
    {
        // Hook up your level progression here
        RestartLevel();
    }
}
