import { LegalLayout } from "./LegalLayout";

const SELLER = "[VOTRE NOM LÉGAL / RAISON SOCIALE]";

export default function Terms() {
  return (
    <LegalLayout title="Conditions Générales de Vente et d'Utilisation">
      <h2 className="text-xl font-semibold mt-6">1. Vendeur</h2>
      <p>Le service Nex (« le Service ») est édité et fourni par <strong>{SELLER}</strong> (« le Vendeur », « nous »). En utilisant le Service, vous concluez un contrat avec le Vendeur.</p>

      <h2 className="text-xl font-semibold mt-6">2. Acceptation</h2>
      <p>En accédant au Service ou en l'utilisant, vous reconnaissez avoir lu et accepté les présentes conditions. Si vous n'acceptez pas, vous devez cesser d'utiliser le Service.</p>

      <h2 className="text-xl font-semibold mt-6">3. Description du service</h2>
      <p>Nex est un assistant personnel intelligent fournissant chat IA, organisation de fichiers, gestion d'agenda, intégrations tierces et fonctionnalités d'automatisation, accessibles via web et application desktop.</p>

      <h2 className="text-xl font-semibold mt-6">4. Compte utilisateur</h2>
      <p>Vous devez fournir des informations exactes lors de l'inscription, maintenir la confidentialité de vos identifiants et être responsable de toute activité sur votre compte. Vous garantissez avoir l'âge légal requis (16 ans minimum) ou disposer du consentement parental.</p>

      <h2 className="text-xl font-semibold mt-6">5. Usage acceptable et abus</h2>
      <p>Vous vous engagez à ne pas :</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Utiliser le Service à des fins illégales, frauduleuses ou contraires à l'ordre public ;</li>
        <li>Envoyer du spam, distribuer des malwares, ou tenter de compromettre la sécurité du Service (scan, intrusion, scraping abusif) ;</li>
        <li>Porter atteinte aux droits de propriété intellectuelle de tiers ;</li>
        <li>Générer du contenu illégal, haineux, diffamatoire, pornographique, ou des deepfakes non consentis ;</li>
        <li>Tenter de contourner les limites techniques ou de revendre le Service sans autorisation.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">6. Fonctionnalités d'IA générative</h2>
      <p>Le Service utilise des modèles d'intelligence artificielle. Vous êtes responsable :</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>du contenu de vos requêtes (prompts) et de l'usage que vous faites des réponses générées ;</li>
        <li>de vérifier l'exactitude des informations produites — l'IA peut être imprécise et ne remplace pas un conseil professionnel (juridique, médical, financier) ;</li>
        <li>de disposer des droits sur les données soumises au Service.</li>
      </ul>
      <p>Nous nous réservons le droit de modérer, filtrer ou refuser certains contenus, et de suspendre les comptes en cas d'abus répété.</p>

      <h2 className="text-xl font-semibold mt-6">7. Propriété intellectuelle</h2>
      <p>Le Service, son code, sa marque, son design et sa documentation restent la propriété exclusive du Vendeur. Nous vous accordons une licence limitée, non-exclusive, non-transférable d'utilisation du Service dans les limites de votre abonnement. Toute reproduction, rétro-ingénierie ou redistribution est interdite.</p>
      <p>Vous conservez la propriété de votre contenu utilisateur. Vous nous accordez une licence limitée pour l'héberger et le traiter dans le seul but de fournir le Service.</p>

      <h2 className="text-xl font-semibold mt-6">8. Tarifs, abonnements et paiements</h2>
      <p><strong>Notre processus de commande est géré par notre revendeur en ligne Paddle.com, qui est le Marchand Officiel (Merchant of Record) pour toutes nos commandes. Paddle gère l'ensemble du service client lié aux paiements et traite les remboursements.</strong></p>
      <p>Pour les modalités complètes de paiement, facturation, taxes, renouvellement et annulation, veuillez consulter les <a href="https://www.paddle.com/legal/checkout-buyer-terms" target="_blank" rel="noopener noreferrer" className="underline">Conditions Acheteur de Paddle</a>. Les abonnements se renouvellent automatiquement à la fin de chaque période sauf annulation.</p>

      <h2 className="text-xl font-semibold mt-6">9. Disponibilité du service</h2>
      <p>Nous fournissons le Service « en l'état » sans garantie de disponibilité ininterrompue ou exempte d'erreurs. Nous déclinons, dans les limites permises par la loi, toute garantie implicite de qualité marchande ou d'adéquation à un usage particulier.</p>

      <h2 className="text-xl font-semibold mt-6">10. Suspension et résiliation</h2>
      <p>Nous pouvons suspendre ou résilier votre accès en cas de : violation matérielle des présentes, défaut de paiement, risque de sécurité ou de fraude, ou violations répétées de nos politiques. À la résiliation, vos données pourront être exportées pendant 30 jours puis supprimées.</p>

      <h2 className="text-xl font-semibold mt-6">11. Limitation de responsabilité</h2>
      <p>Dans la mesure permise par la loi, notre responsabilité totale est limitée aux sommes que vous nous avez versées au cours des 12 derniers mois. Nous excluons toute responsabilité pour dommages indirects, perte de profit, perte de données ou perte de clientèle. Aucune limitation ne s'applique en cas de fraude, de dol, ou de dommage corporel.</p>

      <h2 className="text-xl font-semibold mt-6">12. Indemnisation</h2>
      <p>Vous acceptez de nous indemniser contre toute réclamation résultant de votre contenu, de votre usage illégal du Service ou de violations des présentes.</p>

      <h2 className="text-xl font-semibold mt-6">13. Droit applicable</h2>
      <p>Les présentes sont régies par le droit français. Tout litige sera soumis aux tribunaux compétents du ressort du siège du Vendeur, sous réserve des dispositions impératives applicables aux consommateurs.</p>

      <h2 className="text-xl font-semibold mt-6">14. Modifications</h2>
      <p>Nous pouvons modifier les présentes conditions. Les changements substantiels vous seront notifiés. La poursuite de l'utilisation après notification vaut acceptation.</p>

      <h2 className="text-xl font-semibold mt-6">15. Contact</h2>
      <p>Pour toute question : contactez-nous via le support intégré à l'application.</p>
    </LegalLayout>
  );
}