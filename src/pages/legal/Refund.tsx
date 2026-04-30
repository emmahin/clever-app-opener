import { LegalLayout } from "./LegalLayout";

export default function Refund() {
  return (
    <LegalLayout title="Politique de Remboursement">
      <h2 className="text-xl font-semibold mt-6">Garantie satisfait ou remboursé — 30 jours</h2>
      <p>Nous offrons une <strong>garantie de remboursement de 30 jours</strong>. Si vous n'êtes pas satisfait de votre achat, vous pouvez demander un remboursement complet dans les <strong>30 jours suivant la date de votre commande</strong>.</p>

      <h2 className="text-xl font-semibold mt-6">Comment demander un remboursement</h2>
      <p>Les remboursements sont traités par notre partenaire de paiement <strong>Paddle</strong>, qui agit en tant que Marchand Officiel (Merchant of Record) pour toutes nos commandes.</p>
      <p>Pour demander un remboursement :</p>
      <ol className="list-decimal pl-6 space-y-1">
        <li>Rendez-vous sur <a href="https://paddle.net" target="_blank" rel="noopener noreferrer" className="underline">paddle.net</a> avec l'adresse email utilisée lors de l'achat ;</li>
        <li>Localisez la transaction concernée et soumettez votre demande de remboursement ;</li>
        <li>Vous pouvez également contacter notre support via l'application — nous transmettrons votre demande à Paddle.</li>
      </ol>

      <h2 className="text-xl font-semibold mt-6">Délai de traitement</h2>
      <p>Une fois la demande approuvée, le remboursement est effectué sur le moyen de paiement initial sous 5 à 10 jours ouvrés selon votre banque.</p>

      <h2 className="text-xl font-semibold mt-6">Annulation d'abonnement</h2>
      <p>Vous pouvez annuler votre abonnement à tout moment depuis les paramètres de votre compte ou via paddle.net. L'annulation prend effet à la fin de la période de facturation en cours — vous conservez l'accès jusqu'à cette date. Aucun remboursement n'est dû pour la période en cours en dehors de la garantie 30 jours décrite ci-dessus.</p>

      <h2 className="text-xl font-semibold mt-6">Questions</h2>
      <p>Pour toute question relative à un remboursement, contactez-nous via le support intégré ou directement via paddle.net.</p>
    </LegalLayout>
  );
}