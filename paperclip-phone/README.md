# Paperclip on your phone

Screenshots of Paperclip's first-run setup at iPhone size (version 2026.1106.0).

1. `1-name-your-org.png` – name your organization
2. `2-create-agent.png` – name your first agent
3. `3-connect-model.png` – sign in to Claude, OpenAI, or Copilot (needs your own account)

## Setup

1. On your computer, install Node.js 24 or newer.
2. Install Tailscale on the computer and the iPhone, and sign in to the same account on both.
3. On the computer, run `npx paperclipai@latest onboard --bind tailnet`.
4. On the iPhone, open Safari to `http://<computer>.<tailnet>.ts.net:3100`, create a login, then tap Share → Add to Home Screen.
5. If a "hostname" error appears, run `npx paperclipai allowed-hostname <computer>.<tailnet>.ts.net` on the computer.

The computer must stay on and awake. The phone is only the control panel.
