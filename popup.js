const STORAGE_KEYS = {
  REMINDER_TIME: 'reminderTime'
};

const DEFAULT_REMINDER_TIME = 5;

document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  const authSection = document.getElementById('auth-section');
  const settingsSection = document.getElementById('settings-section');
  const authButton = document.getElementById('auth-button');
  const testButton = document.getElementById('test-button');
  const logoutButton = document.getElementById('logout-button');
  const reminderOptions = document.querySelectorAll('input[name="reminderTime"]');

  const isAuthenticated = await checkAuthentication();

  if (isAuthenticated) {
    authSection.classList.add('hidden');
    settingsSection.classList.remove('hidden');
    await loadSettings();
    await loadUpcomingEvents();
  } else {
    authSection.classList.remove('hidden');
    settingsSection.classList.add('hidden');
  }

  authButton.addEventListener('click', handleAuthentication);
  testButton.addEventListener('click', handleTestNotification);
  logoutButton.addEventListener('click', handleLogout);

  reminderOptions.forEach((option) => {
    option.addEventListener('change', handleReminderChange);
  });
}

function checkAuthentication() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'checkAuth' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(false);
        return;
      }
      resolve(response?.authenticated || false);
    });
  });
}

async function handleAuthentication() {
  const authButton = document.getElementById('auth-button');
  const authSection = document.getElementById('auth-section');
  const settingsSection = document.getElementById('settings-section');

  authButton.disabled = true;
  authButton.textContent = 'Connecting...';

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'authenticate' }, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result);
      });
    });

    if (response?.success) {
      authSection.classList.add('hidden');
      settingsSection.classList.remove('hidden');
      await loadSettings();
      await loadUpcomingEvents();
      showToast('Successfully connected!', 'success');
    } else {
      showToast(response?.error || 'Authentication failed. Please try again.', 'error');
      resetAuthButton(authButton);
    }
  } catch (error) {
    showToast('An error occurred. Please try again.', 'error');
    resetAuthButton(authButton);
  }
}

function resetAuthButton(button) {
  button.disabled = false;
  button.innerHTML = `
    <svg class="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
      <polyline points="10 17 15 12 10 7"></polyline>
      <line x1="15" y1="12" x2="3" y2="12"></line>
    </svg>
    Sign in with Google
  `;
}

async function loadSettings() {
  const { [STORAGE_KEYS.REMINDER_TIME]: reminderTime = DEFAULT_REMINDER_TIME } =
    await chrome.storage.sync.get([STORAGE_KEYS.REMINDER_TIME]);

  const radioButton = document.querySelector(`input[name="reminderTime"][value="${reminderTime}"]`);
  if (radioButton) {
    radioButton.checked = true;
  }
}

async function loadUpcomingEvents() {
  const eventsList = document.getElementById('events-list');
  eventsList.innerHTML = '<div class="events-loading">Loading...</div>';

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'getEvents' }, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result);
      });
    });

    if (response?.success && response.events) {
      renderEvents(response.events);
    } else {
      eventsList.innerHTML = '<div class="events-empty">No upcoming events</div>';
    }
  } catch {
    eventsList.innerHTML = '<div class="events-error">Failed to load events</div>';
  }
}

function renderEvents(events) {
  const eventsList = document.getElementById('events-list');

  if (!events || events.length === 0) {
    eventsList.innerHTML = '<div class="events-empty">No upcoming events</div>';
    return;
  }

  const eventsHtml = events.slice(0, 5).map((event) => {
    const startTime = event.start?.dateTime
      ? new Date(event.start.dateTime)
      : event.start?.date
        ? new Date(event.start.date)
        : null;

    const timeString = startTime
      ? startTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
      : 'All day';

    const dateString = startTime
      ? startTime.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
      : '';

    return `
      <div class="event-item">
        <div class="event-time">
          <span class="event-time-value">${timeString}</span>
          <span class="event-date">${dateString}</span>
        </div>
        <div class="event-details">
          <div class="event-title">${escapeHtml(event.summary || 'Untitled')}</div>
          ${event.location ? `<div class="event-location">${escapeHtml(event.location)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  eventsList.innerHTML = eventsHtml;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function handleReminderChange(event) {
  const value = parseInt(event.target.value, 10);
  await chrome.storage.sync.set({ [STORAGE_KEYS.REMINDER_TIME]: value });
  showToast(`Reminder set to ${value} minutes before`, 'success');
}

function handleTestNotification() {
  const testButton = document.getElementById('test-button');
  testButton.disabled = true;

  chrome.runtime.sendMessage({ action: 'testNotification' }, (response) => {
    testButton.disabled = false;

    if (response?.success) {
      showToast('Test notification sent!', 'success');
    } else {
      showToast('Failed to send test notification', 'error');
    }
  });
}

async function handleLogout() {
  const logoutButton = document.getElementById('logout-button');
  const authSection = document.getElementById('auth-section');
  const settingsSection = document.getElementById('settings-section');

  logoutButton.disabled = true;

  try {
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'logout' }, resolve);
    });
    settingsSection.classList.add('hidden');
    authSection.classList.remove('hidden');
    showToast('Signed out successfully', 'success');
  } catch {
    showToast('Failed to sign out', 'error');
  } finally {
    logoutButton.disabled = false;
  }
}

function showToast(message, type = 'info') {
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('toast-visible');
  });

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
