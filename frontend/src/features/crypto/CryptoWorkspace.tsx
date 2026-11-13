import { DecryptPanel } from './DecryptPanel';
import { EncryptPanel } from './EncryptPanel';

type CryptoWorkspaceProps = {
  onSessionExpired?: () => void;
};

/**
 * Authenticated encryption workspace. Both panels are always visible; a 401 is reported to the
 * app layer, which ends the session, so this module never imports the auth feature.
 */
export function CryptoWorkspace({ onSessionExpired }: CryptoWorkspaceProps) {
  return (
    <section className="crypto-workspace" aria-labelledby="crypto-heading">
      <h2 id="crypto-heading">Szyfrowanie i deszyfrowanie</h2>
      <p className="crypto-workspace__lead">
        Pakiet jest powiązany z Twoim kontem. Odszyfrowanie zadziała tylko w tej sesji i tylko dla
        pakietu utworzonego przez Ciebie.
      </p>
      <EncryptPanel onSessionExpired={onSessionExpired} />
      <DecryptPanel onSessionExpired={onSessionExpired} />
    </section>
  );
}
