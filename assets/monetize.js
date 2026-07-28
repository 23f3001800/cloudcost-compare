/* ------------------------------------------------------------------
   THE ONLY FILE YOU EDIT TO TURN ON REVENUE.

   Everything is off by default. Empty values mean no third-party script
   is loaded at all, which keeps the site fast and keeps it honest while
   it has no traffic. Fill these in as each account is approved, rebuild,
   and push.
   ------------------------------------------------------------------ */
window.MONETIZE = {

  // From AdSense: Account -> Settings -> Account information -> Publisher ID.
  // Looks like "ca-pub-1234567890123456".
  // Leave empty until AdSense approves the site, which it will not do
  // until the site has real content and some real traffic.
  adsenseClient: '',

  // Plausible is paid; swap for any script or leave empty.
  // GitHub Pages gives you no server logs, so with this empty you are
  // flying blind. Turning on Search Console (free) is the higher priority.
  plausibleDomain: ''
};
