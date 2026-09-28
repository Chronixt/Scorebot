import { describe, expect, it, vi } from "vitest";
import { EasyPollClient } from "../src/easypoll/client";

describe("EasyPollClient", () => {
  it("follows vote pagination", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ data: [{ id: "vote-1" }], page: 1, totalPages: 2, total: 2, limit: 1 }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: [{ id: "vote-2" }], page: 2, totalPages: 2, total: 2, limit: 1 }),
      );
    const client = new EasyPollClient("test-key", fetcher);

    const votes = await client.getVotes("poll-1");

    expect(votes.map((vote) => vote.id)).toEqual(["vote-1", "vote-2"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toContain("page=2");
  });
});
