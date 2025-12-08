const STORAGE_KEYS = {
  REMINDER_TIME: "reminderTime",
  ACCESS_TOKEN: "accessToken",
  REFRESH_TOKEN: "refreshToken",
  TOKEN_EXPIRY: "tokenExpiry",
  NOTIFIED_EVENTS: "notifiedEvents",
};

const DEFAULT_REMINDER_TIME = 5;
const CHECK_INTERVAL_MINUTES = 1;
const ALARM_NAME = "checkCalendar";
const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
function getClientSecret() {
  return chrome.runtime.getManifest().oauth2?.client_secret;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get([STORAGE_KEYS.REMINDER_TIME], (result) => {
    if (result[STORAGE_KEYS.REMINDER_TIME] === undefined) {
      chrome.storage.sync.set({
        [STORAGE_KEYS.REMINDER_TIME]: DEFAULT_REMINDER_TIME,
      });
    }
  });

  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 0,
    periodInMinutes: CHECK_INTERVAL_MINUTES,
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkUpcomingEvents();
    return;
  }

  if (alarm.name.startsWith("reminder-")) {
    const { scheduledReminders = {} } = await chrome.storage.local.get([
      "scheduledReminders",
    ]);
    const eventData = scheduledReminders[alarm.name];
    if (eventData) {
      showNotification({
        id: alarm.name,
        title: eventData.title,
        startTime: eventData.startTime,
        location: eventData.location,
      });
      delete scheduledReminders[alarm.name];
      await chrome.storage.local.set({ scheduledReminders });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "testNotification") {
    setTimeout(() => {
      showNotification({
        id: "test-" + Date.now(),
        title: "Test Event",
        startTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        isTest: true,
      });
    }, 5000);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "authenticate") {
    authenticate()
      .then((token) => sendResponse({ success: true, token }))
      .catch((error) => {
        console.error("Authentication error:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.action === "checkAuth") {
    checkAuthentication()
      .then((authenticated) => sendResponse({ authenticated }))
      .catch(() => sendResponse({ authenticated: false }));
    return true;
  }

  if (message.action === "logout") {
    logout()
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  if (message.action === "getEvents") {
    getUpcomingEventsForPopup()
      .then((events) => sendResponse({ success: true, events }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === "scheduleReminder") {
    scheduleOneMinuteReminder(message.event);
    sendResponse({ success: true });
    return true;
  }
});

function getClientId() {
  const manifest = chrome.runtime.getManifest();
  return manifest.oauth2?.client_id;
}

async function authenticate() {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error("Client ID not configured in manifest.json");
  }

  const redirectUri = chrome.identity.getRedirectURL();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      async (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!responseUrl) {
          reject(new Error("No response URL"));
          return;
        }

        const url = new URL(responseUrl);
        const code = url.searchParams.get("code");

        if (!code) {
          const error = url.searchParams.get("error");
          reject(new Error(error || "No authorization code in response"));
          return;
        }

        try {
          const tokens = await exchangeCodeForTokens(code, redirectUri);
          resolve(tokens.access_token);
        } catch (error) {
          reject(error);
        }
      }
    );
  });
}

async function exchangeCodeForTokens(code, redirectUri) {
  const clientId = getClientId();

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: getClientSecret(),
      code: code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error_description || "Token exchange failed");
  }

  const tokens = await response.json();
  const tokenExpiry = Date.now() + tokens.expires_in * 1000;

  await chrome.storage.local.set({
    [STORAGE_KEYS.ACCESS_TOKEN]: tokens.access_token,
    [STORAGE_KEYS.REFRESH_TOKEN]: tokens.refresh_token,
    [STORAGE_KEYS.TOKEN_EXPIRY]: tokenExpiry,
  });

  return tokens;
}

async function refreshAccessToken() {
  const result = await chrome.storage.local.get([STORAGE_KEYS.REFRESH_TOKEN]);
  const refreshToken = result[STORAGE_KEYS.REFRESH_TOKEN];

  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  const clientId = getClientId();

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: getClientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    if (errorData.error === "invalid_grant") {
      await chrome.storage.local.remove([
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
        STORAGE_KEYS.TOKEN_EXPIRY,
      ]);
      throw new Error("Refresh token expired, please re-authenticate");
    }
    throw new Error(errorData.error_description || "Token refresh failed");
  }

  const tokens = await response.json();
  const tokenExpiry = Date.now() + tokens.expires_in * 1000;

  await chrome.storage.local.set({
    [STORAGE_KEYS.ACCESS_TOKEN]: tokens.access_token,
    [STORAGE_KEYS.TOKEN_EXPIRY]: tokenExpiry,
  });

  if (tokens.refresh_token) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.REFRESH_TOKEN]: tokens.refresh_token,
    });
  }

  return tokens.access_token;
}

async function getAccessToken() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.ACCESS_TOKEN,
    STORAGE_KEYS.REFRESH_TOKEN,
    STORAGE_KEYS.TOKEN_EXPIRY,
  ]);

  const accessToken = result[STORAGE_KEYS.ACCESS_TOKEN];
  const refreshToken = result[STORAGE_KEYS.REFRESH_TOKEN];
  const tokenExpiry = result[STORAGE_KEYS.TOKEN_EXPIRY];

  if (!accessToken && !refreshToken) {
    throw new Error("Not authenticated");
  }

  if (tokenExpiry && Date.now() > tokenExpiry - 300000) {
    if (refreshToken) {
      const newToken = await refreshAccessToken();
      return newToken;
    }
    throw new Error("Token expired");
  }

  return accessToken;
}

async function checkAuthentication() {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.ACCESS_TOKEN,
      STORAGE_KEYS.REFRESH_TOKEN,
      STORAGE_KEYS.TOKEN_EXPIRY,
    ]);

    const accessToken = result[STORAGE_KEYS.ACCESS_TOKEN];
    const refreshToken = result[STORAGE_KEYS.REFRESH_TOKEN];

    if (!accessToken && !refreshToken) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function logout() {
  const result = await chrome.storage.local.get([STORAGE_KEYS.ACCESS_TOKEN]);
  const token = result[STORAGE_KEYS.ACCESS_TOKEN];

  if (token) {
    fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
      method: "POST",
    }).catch(() => {});
  }

  await chrome.storage.local.remove([
    STORAGE_KEYS.ACCESS_TOKEN,
    STORAGE_KEYS.REFRESH_TOKEN,
    STORAGE_KEYS.TOKEN_EXPIRY,
  ]);
}

async function fetchCalendarEvents(token, hoursAhead = 1) {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(
    now.getTime() + hoursAhead * 60 * 60 * 1000
  ).toISOString();

  const url = new URL(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events"
  );
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch calendar events");
  }

  const data = await response.json();
  return data.items || [];
}

async function getUpcomingEventsForPopup() {
  const token = await getAccessToken();
  return fetchCalendarEvents(token, 24);
}

async function checkUpcomingEvents() {
  let token;
  try {
    token = await getAccessToken();
  } catch {
    return;
  }

  const { [STORAGE_KEYS.REMINDER_TIME]: reminderTime = DEFAULT_REMINDER_TIME } =
    await chrome.storage.sync.get([STORAGE_KEYS.REMINDER_TIME]);

  const { [STORAGE_KEYS.NOTIFIED_EVENTS]: notifiedEvents = {} } =
    await chrome.storage.local.get([STORAGE_KEYS.NOTIFIED_EVENTS]);

  let events;
  try {
    events = await fetchCalendarEvents(token);
  } catch {
    return;
  }

  const now = Date.now();
  const reminderMilliseconds = reminderTime * 60 * 1000;
  const cleanedNotifiedEvents = {};

  for (const event of events) {
    if (!event.start || !event.start.dateTime) {
      continue;
    }

    const eventStart = new Date(event.start.dateTime).getTime();
    const timeUntilEvent = eventStart - now;

    if (timeUntilEvent > 0 && timeUntilEvent <= reminderMilliseconds) {
      const notificationKey = `${event.id}-${event.start.dateTime}`;

      if (!notifiedEvents[notificationKey]) {
        showNotification({
          id: event.id,
          title: event.summary || "Untitled Event",
          startTime: event.start.dateTime,
          location: event.location,
        });
        cleanedNotifiedEvents[notificationKey] = now;
      } else {
        cleanedNotifiedEvents[notificationKey] =
          notifiedEvents[notificationKey];
      }
    }
  }

  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  for (const [key, timestamp] of Object.entries(notifiedEvents)) {
    if (timestamp > oneDayAgo && !cleanedNotifiedEvents[key]) {
      cleanedNotifiedEvents[key] = timestamp;
    }
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.NOTIFIED_EVENTS]: cleanedNotifiedEvents,
  });
}

function showNotification(event) {
  const startTime = new Date(event.startTime);
  const timeString = startTime.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const params = new URLSearchParams({
    title: event.title,
    time: timeString,
    location: event.location || "",
    startTime: event.startTime,
  });

  const notificationUrl = chrome.runtime.getURL(
    `notification.html?${params.toString()}`
  );

  chrome.windows.create({
    url: notificationUrl,
    type: "popup",
    width: 550,
    height: 450,
    focused: true,
  });
}

async function scheduleOneMinuteReminder(event) {
  const eventStartTime = new Date(event.startTime).getTime();
  const reminderTime = eventStartTime - 60000;
  const now = Date.now();

  if (reminderTime <= now) {
    return;
  }

  const alarmName = `reminder-${Date.now()}`;
  const delayInMinutes = (reminderTime - now) / 60000;

  const { scheduledReminders = {} } = await chrome.storage.local.get([
    "scheduledReminders",
  ]);
  scheduledReminders[alarmName] = {
    title: event.title,
    startTime: event.startTime,
    location: event.location || "",
  };
  await chrome.storage.local.set({ scheduledReminders });

  chrome.alarms.create(alarmName, {
    delayInMinutes: delayInMinutes,
  });
}
