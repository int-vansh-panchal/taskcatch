# Tailscale HTTPS Mobile Connectivity Guide

TaskCatch connects your mobile phone and Ubuntu laptop securely using **Tailscale** (free personal plan, up to 100 devices). Tailscale creates an encrypted peer-to-peer WireGuard mesh network and provisions **free, trusted HTTPS certificates** via Let's Encrypt for your personal `.ts.net` domain.

No port-forwarding, dynamic DNS, or public IP exposure is required.

---

## 1. Laptop Setup (Ubuntu 22.04 / 24.04)

### Step 1: Install Tailscale
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```
Sign in with your Google, Microsoft, or GitHub account.

### Step 2: Enable MagicDNS & HTTPS Certificates
1. Visit the [Tailscale Admin Console](https://login.tailscale.com/admin/dns).
2. Enable **MagicDNS**.
3. Under **HTTPS Certificates**, click **Enable HTTPS**.

### Step 3: Serve TaskCatch over Tailscale HTTPS
Run `tailscale serve` to expose your local TaskCatch Fastify server (running on port 3000) over port 443 with a trusted SSL certificate:

```bash
sudo tailscale serve --https=443 http://localhost:3000
```

Verify your public Tailscale address:
```bash
tailscale status
```
Your machine will have a URL like:
```
https://taskcatch-laptop.your-tailnet.ts.net
```

---

## 2. Phone Setup (Android & iOS)

### Step 1: Install Tailscale App
- **Android:** Install Tailscale from the Google Play Store.
- **iOS:** Install Tailscale from the Apple App Store.
- Open the app and log in using the **same account** you used on your laptop. Turn the VPN switch **ON**.

### Step 2: Open TaskCatch on Your Phone
1. Open Google Chrome (Android) or Safari (iOS).
2. Navigate to your Tailscale HTTPS URL:
   ```
   https://taskcatch-laptop.your-tailnet.ts.net
   ```
3. You will see the TaskCatch login screen with a green padlock 🔒 (valid Let's Encrypt SSL certificate).

### Step 3: Install as a Progressive Web App (PWA)
- **On Android Chrome:**
  - Tap the three dots menu (⋮) in the top-right corner.
  - Tap **"Add to Home screen"** or **"Install app"**.
  - This enables full-screen mode, background Web Share Target, and Screen Wake Lock during recording.
- **On iOS Safari (16.4+):**
  - Tap the **Share** button (box with an arrow pointing up).
  - Scroll down and tap **"Add to Home Screen"**.
  - Launching from the Home Screen activates Web Push notifications on iOS.

---

## 3. Testing Connectivity

Inside TaskCatch:
1. Tap the **Settings** tab.
2. Check the **Tailscale Connectivity** card.
3. Tap **Devices** and click **Register Current Device**.
4. Test live WebSocket sync: make a change on the laptop; your phone screen updates instantly!

---

## 4. Laptop-Off Behavior & Reconnect Sync
- When your laptop is closed or asleep, your phone's TaskCatch app remains fully functional in **Offline Mode**.
- Any audio recordings made on your phone while offline are safely held in **IndexedDB**.
- As soon as your laptop wakes up or re-connects to Tailscale, the phone automatically streams queued audio chunks to the server for transcription.
