# Don't Forget Schedule

Google Calendar notifications that you won't miss - a Chrome extension that ensures you never miss important events with attention-grabbing popup notifications and sound alerts.

## Features

- **Popup Notifications with Sound** - Eye-catching popup window with alarm sound that demands your attention
- **Customizable Reminder Time** - Choose to be notified 5, 10, or 15 minutes before events
- **Snooze Feature** - "1min before" button to get reminded again 1 minute before the event starts
- **Upcoming Events View** - See your next 5 events directly in the extension popup
- **Quick Calendar Access** - Open Google Calendar with one click from the notification

## Installation

### 1. Get Google OAuth Client ID

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Calendar API**
4. Go to **APIs & Services** > **Credentials**
5. Click **Create Credentials** > **OAuth client ID**
6. Select **Web application** as the application type
7. Add your extension's redirect URI to **Authorized redirect URIs**:
   ```
   https://<YOUR_EXTENSION_ID>.chromiumapp.org/
   ```
   (You'll get the extension ID after loading the unpacked extension)
8. Copy the generated Client ID

### 2. Configure the Extension

1. Clone this repository:

   ```bash
   git clone https://github.com/raihara3/dont-forget-schedule.git
   cd dont-forget-schedule
   ```

2. Copy the example manifest and add your Client ID:

   ```bash
   cp manifest.example.json manifest.json
   ```

3. Edit `manifest.json` and replace `YOUR_CLIENT_ID` with your actual Client ID:
   ```json
   "oauth2": {
     "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
     ...
   }
   ```

### 3. Load the Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `dont-forget-schedule` folder
5. Note your extension ID and update the redirect URI in Google Cloud Console if needed

### 4. Sign In

1. Click the extension icon in Chrome
2. Click **Sign in with Google**
3. Authorize the extension to access your calendar

## Usage

### Viewing Events

Click the extension icon to see your upcoming events for the next 24 hours.

### Setting Reminder Time

Choose how early you want to be notified:

- **15 min** - 15 minutes before the event
- **10 min** - 10 minutes before the event
- **5 min** - 5 minutes before the event (default)

### Notification Actions

When a notification appears, you can:

- **Open Calendar** - Opens Google Calendar in a new tab
- **1min before** - Schedules another reminder for 1 minute before the event starts
- **Dismiss** - Closes the notification

### Test Notification

Click **Test Notification** to see a sample notification in 5 seconds.

## File Structure

```
dont-forget-schedule/
├── manifest.json          # Extension manifest (gitignored)
├── manifest.example.json  # Example manifest template
├── background.js          # Service worker for alarms and notifications
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic
├── popup.css              # Popup styles
├── notification.html      # Notification popup window
├── notification.js        # Notification logic
├── sounds/
│   └── alarm.mp3          # Notification sound
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Permissions

This extension requires the following permissions:

- `identity` - For Google OAuth authentication
- `storage` - To save user preferences
- `alarms` - To schedule notification checks
- `calendar.readonly` - To read your Google Calendar events (OAuth scope)

## Privacy

- This extension only reads your calendar data to display upcoming events and send notifications
- Your calendar data is never stored or transmitted to any third-party servers
- Authentication tokens are stored locally in your browser

## Development

```bash
# Clone the repository
git clone https://github.com/raihara3/dont-forget-schedule.git

# Create manifest.json from template
cp manifest.example.json manifest.json

# Add your OAuth Client ID to manifest.json
# Then load the extension in Chrome
```

## License

MIT

## Author

[@raihara3](https://x.com/raihara3)
