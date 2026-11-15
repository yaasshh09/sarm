// Terms and privacy as plain pages on #terms and #privacy. Update UPDATED whenever the text changes.
const UPDATED = '15 November 2026'
const REPO = 'https://github.com/yaasshh09/sarm'

function Terms() {
  return (
    <>
      <h1>Terms of use</h1>
      <p>Sarm is a free project I built for NASA Space Apps 2026. By using it you agree to the points below.</p>
      <h2>What this is for</h2>
      <p>Sarm is for learning and curiosity. Please do not use it to make safety, navigation, emergency, legal or money decisions. Some of the NISAR data is still marked beta or provisional by NASA and ISRO, and my processing (resampling, color stretches, change maps) can hide or exaggerate things.</p>
      <h2>No warranty</h2>
      <p>I give the site as it is, with no promise that it is accurate, complete or always online. I am not liable for any loss that comes from using it.</p>
      <h2>The data is not mine</h2>
      <p>The pictures come from other people and keep their own terms:</p>
      <ul>
        <li>NISAR radar: NASA and ISRO, through the ASF DAAC.</li>
        <li>Sentinel-1 radar: ESA Copernicus, through Microsoft Planetary Computer.</li>
        <li>Landsat photos: USGS and NASA, through Microsoft Planetary Computer.</li>
        <li>Globe: NASA Blue Marble through GIBS.</li>
        <li>Close-up photo layer: Sentinel-2 cloudless by EOX, under the license listed at <a href="https://s2maps.eu">s2maps.eu</a>.</li>
        <li>Roads and labels: OpenFreeMap, built on OpenStreetMap data (ODbL).</li>
      </ul>
      <p>If you reuse a picture, credit its source and follow its license.</p>
      <h2>The code</h2>
      <p>The source code is MIT licensed. You can read it and the full license on <a href={REPO}>GitHub</a>.</p>
      <h2>Changes</h2>
      <p>I may update these terms. The date below shows the last change.</p>
    </>
  )
}

function Privacy() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p>Short version: I do not collect anything about you.</p>
      <h2>What I collect</h2>
      <p>Nothing. Sarm has no accounts, no forms, no cookies, no analytics, no ads and no tracking. It does not save anything in your browser.</p>
      <h2>Who else sees your visit</h2>
      <p>Like any website, the servers your browser talks to can see your IP address and what it asked for. For Sarm those are:</p>
      <ul>
        <li>GitHub Pages, which hosts the site. GitHub may log visits for security, as its <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">privacy statement</a> explains.</li>
        <li>NASA GIBS, which serves the globe pictures.</li>
        <li>EOX, which serves the Sentinel-2 close-up photos.</li>
        <li>OpenFreeMap, which serves the roads and labels in Explore and Rewind.</li>
      </ul>
      <p>I do not control those logs and never see them. The radar data itself ships with the site, so loading it only talks to GitHub.</p>
      <h2>Questions</h2>
      <p>Open an issue on the <a href={REPO}>GitHub repo</a>.</p>
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
