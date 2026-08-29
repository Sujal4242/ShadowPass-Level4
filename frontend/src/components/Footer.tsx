export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-left">
          <div>
            ShadowPass &middot; Built with{' '}
            <a href="https://github.com/midnightntwk/midnight-network" target="_blank" rel="noopener">
              Midnight Network
            </a>
          </div>
          <div className="footer-note">
            Demo application. Credentials are public and documented.
          </div>
        </div>
        <div className="footer-right">
          Preprod &middot; Zero-Knowledge
        </div>
      </div>
    </footer>
  );
}
