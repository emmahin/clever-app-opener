import { LegalLayout } from "./LegalLayout";

const SELLER = "[VOTRE NOM LÉGAL / RAISON SOCIALE]";

export default function Privacy() {
  return (
    <LegalLayout title="Politique de Confidentialité">
      <h2 className="text-xl font-semibold mt-6">1. Responsable du traitement</h2>
      <p>Le responsable du traitement de vos données personnelles est <strong>{SELLER}</strong> (« nous »), éditeur du service Nex. Nous agissons en qualité de responsable de traitement au sens du RGPD.</p>

      <h2 className="text-xl font-semibold mt-6">2. Données collectées</h2>
      <p>Nous collectons les catégories de données suivantes :</p>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Identité et compte</strong> : nom, adresse email, mot de passe (chiffré), photo de profil ;</li>
        <li><strong>Contenu utilisateur</strong> : conversations avec l'IA, fichiers téléchargés, agenda, notes, préférences ;</li>
        <li><strong>Données techniques</strong> : adresse IP, identifiants d'appareil, navigateur, journaux d'utilisation ;</li>
        <li><strong>Données de support</strong> : messages échangés avec le support client ;</li>
        <li><strong>Données vocales</strong> (si activées) : enregistrements et transcriptions traités à la volée.</li>
      </ul>
      <p>Les données de paiement (carte bancaire, adresse de facturation) sont collectées et traitées directement par Paddle — nous n'y avons pas accès.</p>

      <h2 className="text-xl font-semibold mt-6">3. Finalités et bases légales</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Création et gestion du compte</strong> — exécution du contrat ;</li>
        <li><strong>Fourniture des fonctionnalités IA, agenda, organisation</strong> — exécution du contrat ;</li>
        <li><strong>Sécurité et prévention de la fraude</strong> — intérêt légitime ;</li>
        <li><strong>Amélioration du service et statistiques</strong> — intérêt légitime ;</li>
        <li><strong>Support client</strong> — exécution du contrat ;</li>
        <li><strong>Communications marketing</strong> — consentement (révocable à tout moment) ;</li>
        <li><strong>Obligations légales et comptables</strong> — obligation légale.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">4. Destinataires et sous-traitants</h2>
      <p>Vos données peuvent être partagées avec :</p>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Paddle.com</strong> — Marchand Officiel pour la vente, la gestion des abonnements, les paiements, la conformité fiscale et la facturation ;</li>
        <li><strong>Hébergeurs et infrastructure cloud</strong> (Supabase, Lovable Cloud) ;</li>
        <li><strong>Fournisseurs d'IA</strong> (OpenAI, Google AI, ElevenLabs) pour le traitement des requêtes IA et vocales ;</li>
        <li><strong>Outils d'analyse et de support</strong> ;</li>
        <li><strong>Conseils professionnels</strong> (juridique, comptable) ;</li>
        <li><strong>Autorités</strong> lorsque la loi l'exige.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">5. Transferts internationaux</h2>
      <p>Certains sous-traitants (notamment fournisseurs d'IA) sont situés hors UE/EEE. Ces transferts sont encadrés par les Clauses Contractuelles Types de la Commission européenne ou par des décisions d'adéquation.</p>

      <h2 className="text-xl font-semibold mt-6">6. Durée de conservation</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Données de compte : pendant toute la durée du compte, puis 30 jours après suppression ;</li>
        <li>Conversations IA et contenu : tant que vous ne les supprimez pas ;</li>
        <li>Données de facturation : 10 ans (obligation légale) ;</li>
        <li>Journaux techniques : 12 mois maximum.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">7. Vos droits (RGPD)</h2>
      <p>Vous disposez des droits suivants sur vos données :</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Accès, rectification et effacement ;</li>
        <li>Limitation et opposition au traitement ;</li>
        <li>Portabilité de vos données ;</li>
        <li>Retrait du consentement à tout moment ;</li>
        <li>Réclamation auprès de la CNIL (www.cnil.fr).</li>
      </ul>
      <p>Pour exercer vos droits, contactez-nous via le support de l'application. Nous répondons sous 1 mois.</p>

      <h2 className="text-xl font-semibold mt-6">8. Sécurité</h2>
      <p>Nous mettons en œuvre des mesures techniques et organisationnelles appropriées : chiffrement en transit (HTTPS/TLS) et au repos, contrôles d'accès stricts, authentification sécurisée, audits réguliers et politique RLS (Row-Level Security) sur la base de données.</p>

      <h2 className="text-xl font-semibold mt-6">9. Cookies</h2>
      <p>Nous utilisons uniquement des cookies essentiels au fonctionnement du service (session, authentification, préférences). Aucun cookie publicitaire n'est utilisé. Vous pouvez gérer vos cookies via les paramètres de votre navigateur.</p>

      <h2 className="text-xl font-semibold mt-6">10. Modifications</h2>
      <p>Cette politique peut être mise à jour. Toute modification substantielle vous sera notifiée par email ou dans l'application.</p>
    </LegalLayout>
  );
}