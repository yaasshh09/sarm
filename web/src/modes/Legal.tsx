// Terms and privacy as plain pages on #terms and #privacy. Update UPDATED whenever the text changes.
const UPDATED = '15 November 2026'
const REPO = 'https://github.com/yaasshh09/sarm'

function Terms() {
  return (
    <>
      <h1>Terms of use</h1>
      <p>Sarm is a free project our team built for NASA Space Apps 2026. By using it you agree to the points below.</p>
      <h2>What it's for</h2>
      <p>Sarm is for learning and curiosity. Please don't use it for safety, navigation, emergency, legal or money decisions. NASA and ISRO still mark some of the NISAR data as beta or provisional, and our own processing (resampling, color stretches, change maps) can hide some things and exaggerate others.</p>
      <h2>No warranty</h2>
      <p>We share the site as it is. We can't promise it's accurate, complete or always online, and we aren't liable for any loss that comes from using it.</p>
      <h2>The data isn't ours</h2>
      <p>Every picture comes from someone else and keeps its own terms:</p>
      <ul>
        <li>NISAR radar: NASA and ISRO, through the ASF DAAC.</li>
        <li>Sentinel-1 radar: ESA Copernicus, through Microsoft Planetary Computer.</li>
        <li>Landsat photos: USGS and NASA, through Microsoft Planetary Computer.</li>
        <li>Globe: NASA Blue Marble through GIBS.</li>
        <li>Close-up photo layer: Sentinel-2 cloudless by EOX, under the license listed at <a href="https://s2maps.eu">s2maps.eu</a>.</li>
        <li>Roads and labels: OpenFreeMap, built on OpenStreetMap data (ODbL).</li>
      </ul>
      <p>If you reuse a picture, credit where it came from and follow its license.</p>
      <h2>The code</h2>
      <p>Our source code is MIT licensed. You can read it, and the full license, on <a href={REPO}>GitHub</a>.</p>
      <h2>Changes</h2>
      <p>We might update these terms. The date at the bottom shows when we last did.</p>
    </>
  )
}

function Privacy() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p>We don't collect anything about you.</p>
      <h2>What we collect</h2>
      <p>Nothing at all. Sarm has no accounts, forms, cookies, analytics, ads or tracking, and it doesn't save anything in your browser.</p>
      <h2>Who else sees your visit</h2>
      <p>Any server your browser talks to can see your IP address and what it asked for. That's true of every website. For Sarm, those servers belong to:</p>
      <ul>
        <li>GitHub Pages, which hosts the site. GitHub may log visits for security, as its <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">privacy statement</a> explains.</li>
        <li>NASA GIBS, which serves the globe pictures.</li>
        <li>EOX, which serves the Sentinel-2 close-up photos.</li>
        <li>OpenFreeMap, which serves the roads and labels in Explore and Rewind.</li>
      </ul>
      <p>We don't control those logs and never see them. The radar data ships with the site itself, so loading it only talks to GitHub.</p>
      <h2>Questions</h2>
      <p>Open an issue on our <a href={REPO}>GitHub repo</a> and we'll get back to you.</p>
    </>
  )
}

export default function Legal({ page }: { page: 'terms' | 'privacy' }) {
  return (
    <main className="legal">
      <p><a href="#">Back to the globe</a></p>
      {page === 'terms' ? <Terms /> : <Privacy />}
      <p className="muted">Last updated {UPDATED}.</p>
      <p className="muted"><a href="#terms">Terms</a> · <a href="#privacy">Privacy</a></p>
    </main>
  )
}
