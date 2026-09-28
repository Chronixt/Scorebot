import { InteractionResponseType, InteractionType, verifyKey } from "discord-interactions";
import {
  handleApplicationCommand,
  handlePaginationComponent,
  isPaginationComponent,
  type ApplicationCommandInteraction,
} from "./discord/interactions";
import { isScoreComponent, scoreSelectedAnswer } from "./discord/scoring";
import type { Env } from "./env";

interface DiscordInteraction {
  type: number;
}

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (request.method !== "POST" || url.pathname !== "/interactions") {
      return new Response("Not found", { status: 404 });
    }

    const signature = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");
    const body = await request.text();

    if (
      !signature ||
      !timestamp ||
      !(await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY))
    ) {
      return new Response("Invalid request signature", { status: 401 });
    }

    const interaction = JSON.parse(body) as DiscordInteraction;
    const componentCustomId = (
      interaction as DiscordInteraction & { data?: { custom_id?: string } }
    ).data?.custom_id;
    if (interaction.type === InteractionType.PING) {
      return Response.json({ type: InteractionResponseType.PONG });
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      return handleApplicationCommand(
        interaction as ApplicationCommandInteraction,
        env,
        context,
      );
    }

    if (
      interaction.type === InteractionType.MESSAGE_COMPONENT &&
      isScoreComponent(componentCustomId)
    ) {
      context.waitUntil(scoreSelectedAnswer(interaction as never, env));
      return Response.json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });
    }

    if (
      interaction.type === InteractionType.MESSAGE_COMPONENT &&
      isPaginationComponent(componentCustomId)
    ) {
      return handlePaginationComponent(componentCustomId!, env);
    }

    return new Response("Unsupported interaction", { status: 400 });
  },
} satisfies ExportedHandler<Env>;
