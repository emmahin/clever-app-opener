import { useState } from "react";
import { initializePaddle, getPaddlePriceId } from "@/lib/paddle";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function usePaddleCheckout() {
  const [loading, setLoading] = useState(false);

  const openCheckout = async (priceId: string) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Veuillez vous connecter pour acheter");
        setLoading(false);
        return;
      }
      await initializePaddle();
      const paddlePriceId = await getPaddlePriceId(priceId);

      window.Paddle.Checkout.open({
        items: [{ priceId: paddlePriceId, quantity: 1 }],
        customer: { email: user.email! },
        customData: { userId: user.id },
        settings: {
          displayMode: "overlay",
          successUrl: `${window.location.origin}/billing?status=success`,
          allowLogout: false,
          variant: "one-page",
        },
      });
    } catch (e) {
      console.error(e);
      toast.error("Impossible d'ouvrir le paiement", {
        description: (e as Error).message,
      });
    } finally {
      setLoading(false);
    }
  };

  return { openCheckout, loading };
}