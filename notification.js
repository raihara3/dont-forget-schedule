document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const title = params.get('title') || 'Event';
  const time = params.get('time') || '';
  const location = params.get('location') || '';

  document.getElementById('event-title').textContent = title;
  document.getElementById('time-badge').textContent = time ? `${time} start` : 'Starting soon';

  const locationElement = document.getElementById('event-location');
  if (location) {
    locationElement.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3"></circle>
      </svg>
      ${location}
    `;
  } else {
    locationElement.style.display = 'none';
  }

  const audio = document.getElementById('alarm-audio');
  audio.volume = 1.0;
  audio.play().catch(() => {});

  document.getElementById('open-calendar').addEventListener('click', () => {
    audio.pause();
    chrome.tabs.create({ url: 'https://calendar.google.com' });
    window.close();
  });

  document.getElementById('dismiss').addEventListener('click', () => {
    audio.pause();
    window.close();
  });

  setTimeout(() => {
    audio.pause();
  }, 30000);
});
