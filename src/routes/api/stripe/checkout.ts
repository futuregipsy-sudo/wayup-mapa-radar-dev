import { createFileRoute } from "@tanstack/react-router";
import { handleFixedCheckout } from "@/server/wayapp/stripe";

export const Route = createFileRoute("/api/stripe/checkout")({
  server: { handlers: { POST: ({ request }) => handleFixedCheckout(request) } },
});
