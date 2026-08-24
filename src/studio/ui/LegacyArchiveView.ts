/**
 * Read-only migration checkpoint. The old Three renderer is archived outside
 * production source; this route deliberately shows its recorded output only.
 */
export class LegacyArchiveView {
  public constructor(root: HTMLElement) {
    root.innerHTML = `
      <main class="legacy-archive-view">
        <header>
          <div><strong>PLEOS</strong><span>LEGACY RENDERER CHECKPOINT</span></div>
          <a href="?renderer=raw">Open Raw WebGL2 Studio</a>
        </header>
        <figure>
          <img src="/debug/legacy-three-before.png" alt="Archived output from the previous Three.js renderer">
          <figcaption>
            <strong>Archived comparison capture</strong>
            <span>This is not a live production renderer. The former engine source is retained under archive/legacy-three for migration audit only.</span>
          </figcaption>
        </figure>
      </main>`;
  }
}
