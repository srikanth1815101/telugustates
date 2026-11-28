// Locally drawn 24-unit line icons, designed as one family for the field sheet.
const paths = {
  minimal:
    '<rect x="3" y="4" width="18" height="15" rx="2"/><path d="M6 8h3v3H6zm7 0h4M4 21 21 3"/>',
  locate:
    '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  man: '<circle cx="9.7" cy="14.3" r="6.1"/><path d="m14.2 9.8 6-6M15 3.8h5.2V9"/>',
  woman: '<circle cx="12" cy="8.8" r="5.9"/><path d="M12 14.8V22m-4-3.9h8"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  third:
    '<circle cx="10" cy="8.5" r="3"/><path d="M4.2 19c.2-6.9 11.2-6.9 11.6 0M17 5h4v4M3 9V5h3m12 14h3v-3"/>',
  settings:
    '<path d="m9.5 3 .7-1h3.6l.7 2 2.2 1.2 2.1-.4 1.8 3.1-1.4 1.6v2.8l1.4 1.6-1.8 3.1-2.1-.4-2.2 1.3-.7 2h-3.6l-.7-2-2.2-1.3-2.1.4-1.8-3.1 1.4-1.6V9.5L3.4 8 5.2 4.8l2.1.4L9.5 4Z"/><circle cx="12" cy="11" r="3.2"/>',
  jump: '<path d="M4 19c3.6 0 5.8-2.4 7-6.5l1-4m-4 2 4.5-4L17 9m-4 4 3.7 1 1.3 3M3 22h6"/><circle cx="15" cy="3.6" r="1.65" fill="currentColor" stroke="none"/>',
  sprint:
    '<circle cx="16" cy="4.2" r="1.9" fill="currentColor" stroke="none"/><path d="m7.7 10.5 3.5-3.3 3.1.3 2.8 3 3-.7M13.4 8l-2.6 5.4 4.8 2-1.5 5.3M10.8 13.4l-2.6 4.4-4.4 1.8M2.5 8.4h4M2 12h3"/>',
  currency:
    '<ellipse cx="12" cy="7" rx="7.7" ry="3.3"/><path d="M4.3 7v5c0 4.3 15.4 4.3 15.4 0V7M4.3 12v4.8c0 4.3 15.4 4.3 15.4 0V12"/>',
  food: '<path d="M12 21V6m0 9c-5 0-6.8-3.1-6.6-6.4 3.7.3 6.2 2.5 6.6 6.4Zm0-4c.4-4.2 2.8-6.3 6.3-6.6.1 4.2-2.4 6.6-6.3 6.6ZM12 19c.5-4 2.8-6.1 6.3-6.4.1 4.3-2.2 6.4-6.3 6.4ZM12 7c-2.4-1.8-2.2-3.7 0-5.8 2.1 2.3 2.1 4 0 5.8Z"/>',
  gold: '<path d="m3 18 2-6h6l2 6Zm9 0 2-6h5l2 6ZM8 11l1.7-5h5l1.6 5Z"/>',
  homes: '<path d="m2.7 11 9.3-7.6 9.3 7.6M5 10v10h5.2v-6h3.6v6H19V10"/>',
  residents:
    '<circle cx="10" cy="8" r="3.3"/><path d="M3.6 20a6.4 6.4 0 0 1 12.8 0M16 5.6a3.1 3.1 0 0 1 0 5.9m2 2.9a5.6 5.6 0 0 1 3.3 5.4"/>',
  acres:
    '<path d="m12 4 9 4.7-9 4.7-9-4.7Zm-9 9.4 9 4.7 9-4.7M3 17.8l9 4.4 9-4.4"/>',
  villages:
    '<path d="m2 11 5.4-5 5.4 5M4 10v8h6.7M12 13l5-5 5 5m-8-1v7h6v-7M5 21h14"/>',
  exit: '<path d="M10 4H4v16h6m4-13 5 5-5 5M8 12h11"/>',
};
export const ink = (k) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths[k] || ""}</svg>`;
