import { createFileRoute } from "@tanstack/react-router";
import { handleQuoteCheckout } from "@/server/wayapp/stripe";

export const Route = createFileRoute("/api/admin/stripe-quote")({
  server: { handlers: { POST: ({ request }) => handleQuoteCheckout(request) } },
});
