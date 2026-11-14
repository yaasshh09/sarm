const modes = [
  ['Lab', 'Fly a simulated radar, record echoes, and focus them into an image.'],
  ['Explore', 'Scrub real NISAR L-band imagery over a site and see what changed.'],
  ['Rewind', 'Go further back with Sentinel-1 C-band (2014+) and Landsat optical (1984+).'],
]

export default function App() {
  return (
    <main>
      <h1>Radar Waltz</h1>
      <p>Learn how radar sees, see what NISAR sees now, then rewind to see how the place got here.</p>
      <ol>
        {modes.map(([name, text]) => (
          <li key={name}>
            <strong>{name}</strong>: {text}
          </li>
        ))}
      </ol>
      <p>
        <em>Coming soon.</em> NASA Space Apps 2026, Dancing With SARs.{' '}
        <a href="https://github.com/yaasshh09/sarm">Source</a>
      </p>
    </main>
  )
}
