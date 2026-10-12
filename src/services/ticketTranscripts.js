import { UserError } from '../utils/errors.js';
export async function collectTicketTranscript(channel, { limit = 1000, maxBytes = 1000000 } = {}) {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 1000 ||
    !Number.isInteger(maxBytes) ||
    maxBytes < 100 ||
    maxBytes > 1000000
  )
    throw new TypeError('Invalid transcript bounds');
  const messages = [],
    seen = new Set();
  let before,
    exhausted = false;
  for (let batch = 0; batch < 11; batch++) {
    const fetched = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    const page = [...fetched.values()];
    if (!page.length) {
      exhausted = true;
      break;
    }
    if (
      page.length > 100 ||
      new Set(page.map((m) => m?.id)).size !== page.length ||
      page.some(
        (m) =>
          typeof m?.id !== 'string' ||
          !/^\d{17,20}$/.test(m.id) ||
          (before && BigInt(m.id) >= BigInt(before)) ||
          (m.channelId !== undefined && m.channelId !== channel.id) ||
          !Number.isFinite(m.createdTimestamp) ||
          !Number.isFinite(new Date(m.createdTimestamp).getTime()),
      )
    )
      throw new UserError('ticketTranscriptPagination');
    const fresh = page.filter((m) => !seen.has(m.id));
    if (!fresh.length) throw new UserError('ticketTranscriptPagination');
    for (const m of fresh) {
      seen.add(m.id);
      messages.push(m);
    }
    before = page.reduce((a, b) => (BigInt(a.id) < BigInt(b.id) ? a : b)).id;
    if (page.length < 100) {
      exhausted = true;
      break;
    }
    if (messages.length > limit) break;
  }
  const selected = messages.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1)).slice(-limit);
  let truncated = !exhausted || messages.length > limit;
  const lines = selected.map((m) =>
    JSON.stringify({
      id: m.id,
      at: new Date(m.createdTimestamp).toISOString(),
      authorId: m.author?.id ?? null,
      content: m.content ?? '',
      attachments: [...(m.attachments?.values() ?? [])].map((a) => ({ name: a.name, url: a.url })),
      embedCount: m.embeds?.length ?? 0,
    }),
  );
  let body = lines.join('\n');
  while (Buffer.byteLength(body, 'utf8') > maxBytes && lines.length) {
    lines.shift();
    body = lines.join('\n');
    truncated = true;
  }
  return {
    body: `Emika ticket transcript | channel ${channel.id}\nJSON lines; attachment URLs may expire. Embed contents are not exported.\n${truncated ? 'PARTIAL export: older messages were omitted.' : 'Complete fetched history at export time.'}\n\n${body}`,
    count: lines.length,
    truncated,
  };
}
