// Restore the site's original GA4 property; previews never load the remote tag.
(() => {
  if (!/^(www\.)?paperonboard\.in$/.test(window.location.hostname) || window.paperOnBoardAnalyticsLoaded) return;
  window.paperOnBoardAnalyticsLoaded = true;
  const measurementId = 'G-F7Y6W97FD0';
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  // Use GA4's automatic pageviews, including enhanced history measurement.
  // Do not also send manual page_view events for the same navigation.
  window.gtag('config', measurementId);
  const tag = document.createElement('script');
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(tag);
})();
