# Free Personal Firebase Project Setup Guide (Spark Plan)

TaskCatch uses **Firebase Cloud Messaging (FCM)** to send push reminders to your mobile phone and browser. This setup operates on Firebase's permanently free **Spark plan** (0 cost, no credit card required).

> [!IMPORTANT]
> **Isolation Rule:** Do not use the IntelliSolar CRM Firebase project for personal reminders. TaskCatch checks the project ID on startup and logs a warning if an IntelliSolar project is detected. Follow the steps below to create a clean, dedicated personal project.

---

## Step 1: Create a Dedicated Personal Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/) and sign in with your personal Google account.
2. Click **"Add project"** or **"Create a project"**.
3. Name your project (e.g. `taskcatch-personal`).
4. (Optional) Disable Google Analytics to keep it minimal and fast.
5. Click **"Create project"**. Your project will be initialized on the **Spark (Free $0/month)** plan.

---

## Step 2: Generate the Service Account Private Key

1. In your Firebase project dashboard, click the gear icon ⚙️ in the left sidebar and select **Project settings**.
2. Click the **Service accounts** tab.
3. Verify that **Firebase Admin SDK** is selected.
4. Click the blue **"Generate new private key"** button.
5. Confirm by clicking **"Generate key"**. A JSON file will download to your machine (e.g., `taskcatch-personal-firebase-adminsdk-xxxxx.json`).

---

## Step 3: Secure the Key File on Your Laptop

Move the downloaded JSON key to a secure local folder on your Ubuntu machine outside the git repository (e.g., in `~/.taskcatch/`):

```bash
mkdir -p ~/.taskcatch
mv ~/Downloads/taskcatch-personal-firebase-adminsdk-*.json ~/.taskcatch/firebase-service-account.json
chmod 600 ~/.taskcatch/firebase-service-account.json
```

---

## Step 4: Configure TaskCatch Environment Variables

Open `/home/lenovo/taskcatch/.env` and update the Firebase path:

```env
# Absolute path to your personal service account JSON
FIREBASE_SERVICE_ACCOUNT_PATH=/home/lenovo/.taskcatch/firebase-service-account.json

# Your Firebase project ID
FIREBASE_PROJECT_ID=taskcatch-personal
```

---

## Step 5: Web Push Certificates (VAPID Key) for PWA

To receive notifications in Android Chrome or iOS Safari Home Screen web apps:
1. In Firebase Console, go to **Project settings** > **Cloud Messaging** tab.
2. Under **Web configuration**, click **Generate key pair** in the **Web Push certificates** section.
3. Copy the generated public key (VAPID key).
4. Put it in `.env`:
   ```env
   VAPID_PUBLIC_KEY=your_copied_vapid_key_here
   ```

---

## Step 6: Verify Delivery

1. Start TaskCatch or restart the systemd service:
   ```bash
   systemctl --user restart taskcatch-api
   ```
2. Check logs to confirm clean startup:
   ```bash
   journalctl --user-unit taskcatch-api -n 20 --no-pager
   ```
   You should see:
   ```
   [Firebase] Firebase Admin SDK successfully initialized.
   ```
3. Open the web interface at `http://localhost:3000` (or over Tailscale), navigate to **Devices**, and click **"Test Push Notification"** to test live message delivery!
