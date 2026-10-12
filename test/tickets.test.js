import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P } from 'discord.js';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import { Tickets, ticketOverwrites, verifyTicketPrivacy } from '../src/services/tickets.js';
import {
  openTicket,
  changeTicketState,
  exportTicketTranscript,
  publishTicketPanel,
  createTicketButtonHandler,
  forgetTicketTranscript,
} from '../src/services/ticketDelivery.js';
import { collectTicketTranscript } from '../src/services/ticketTranscripts.js';
import { handleInteractionError } from '../src/utils/errors.js';
import command from '../src/commands/ticket/ticket.js';
const ids = {
  guild: '100000000000000001',
  bot: '100000000000000002',
  owner: '100000000000000003',
  role: '100000000000000004',
  channel: '100000000000000005',
  category: '100000000000000006',
};
function cache(rules) {
  return new Map(
    rules.map((r) => [
      r.id,
      {
        type: r.type,
        allow: { bitfield: (r.allow ?? []).reduce((a, b) => a | b, 0n) },
        deny: { bitfield: (r.deny ?? []).reduce((a, b) => a | b, 0n) },
      },
    ]),
  );
}
function setup() {
  const db = openDatabase(':memory:'),
    tickets = new Tickets(db),
    guildConfig = new GuildConfig(new GuildSettings(db)),
    replies = [],
    sent = [];
  const owner = {
      id: ids.owner,
      guild: { id: ids.guild },
      user: { bot: false },
      permissions: { has: () => false },
      roles: { cache: new Map() },
    },
    bot = { id: ids.bot, guild: { id: ids.guild }, permissions: { has: () => true } };
  const category = { id: ids.category, guildId: ids.guild, type: 4 },
    role = { id: ids.role, guild: { id: ids.guild }, managed: false };
  const channel = {
    id: ids.channel,
    guildId: ids.guild,
    type: 0,
    permissionsFor: () => ({ has: () => true }),
    permissionOverwrites: {
      cache: new Map(),
      set: async (rules) => {
        channel.permissionOverwrites.cache = cache(rules);
      },
    },
    messages: { fetch: async () => new Map() },
    send: async (p) => {
      sent.push(p);
      return { id: 'panelMessage' };
    },
  };
  const creates = [];
  const guild = {
    id: ids.guild,
    client: { user: { id: ids.bot } },
    ownerId: 'server-owner',
    members: { fetch: async () => owner, fetchMe: async () => bot },
    roles: { fetch: async () => role },
    channels: {
      fetch: async (id) => (id === ids.category ? category : channel),
      create: async (options) => {
        creates.push(options);
        channel.permissionOverwrites.cache = cache(options.permissionOverwrites);
        return channel;
      },
    },
  };
  const c = {
    tickets,
    guildConfig,
    logger: { error: () => {}, warn: () => {} },
    handleInteractionError,
  };
  const i = {
    id: 'i',
    guild,
    guildId: ids.guild,
    channelId: ids.channel,
    user: { id: ids.owner },
    isButton: () => true,
    inGuild: () => true,
    customId: 'luna:ticket:1',
    message: { id: 'panelMessage' },
    deferReply: async () => {
      i.deferred = true;
    },
    editReply: async (p) => replies.push(p),
    reply: async (p) => replies.push(p),
  };
  tickets.configure(ids.guild, ids.category, ids.role);
  return { db, tickets, c, i, guild, owner, bot, role, category, channel, creates, replies, sent };
}
test('ticket overwrites deny everyone and closed owners cannot write', () => {
  const rules = ticketOverwrites(ids.guild, ids.bot, ids.owner, ids.role, true);
  assert.deepEqual(rules[0].deny, [P.ViewChannel]);
  assert.equal(rules[3].deny[0], P.SendMessages);
  assert((rules[3].allow[0] & P.SendMessages) === 0n);
  assert.throws(() => ticketOverwrites(ids.guild, ids.bot, ids.owner, ids.guild));
});
test('one unresolved ticket per owner, guild isolation and source deduplication', () => {
  const x = setup();
  try {
    const id = x.tickets.reserve(ids.guild, ids.owner, ids.role, 'one');
    assert.equal(x.tickets.get(id, 'foreign'), undefined);
    assert.throws(
      () => x.tickets.reserve(ids.guild, ids.owner, ids.role, 'two'),
      /ticketAlreadyOpen/,
    );
    x.tickets.uncertain(id);
    assert.throws(() => x.tickets.reserve(ids.guild, ids.owner, ids.role, 'three'));
    x.tickets.recover();
    assert.equal(x.tickets.get(id, ids.guild).status, 'uncertain');
  } finally {
    x.db.close();
  }
});
test('ticket opening uses explicit overwrites and verifies returned privacy', async () => {
  const x = setup();
  try {
    const r = await openTicket(x.i, x.c);
    assert.equal(r.id, 1);
    assert.equal(x.tickets.get(1, ids.guild).status, 'open');
    assert.equal(x.creates[0].parent, ids.category);
    assert.equal(x.creates[0].permissionOverwrites.length, 4);
    await assert.rejects(() => openTicket(x.i, x.c), /ticketAlreadyOpen/);
    assert.equal(x.creates.length, 1);
  } finally {
    x.db.close();
  }
});
test('ambiguous channel create blocks repeats and privacy mismatch fails closed', async () => {
  for (const privacy of [false, true]) {
    const x = setup();
    try {
      x.guild.channels.create = async () => {
        if (!privacy) throw new Error('network');
        return x.channel;
      };
      await assert.rejects(() => openTicket(x.i, x.c));
      assert.equal(x.tickets.get(1, ids.guild).status, 'uncertain');
      await assert.rejects(() => openTicket(x.i, x.c));
    } finally {
      x.db.close();
    }
  }
});
test('privacy checks reject added overwrite and leaked everyone permissions', async () => {
  const x = setup();
  try {
    await openTicket(x.i, x.c);
    const record = x.tickets.get(1, ids.guild);
    x.channel.permissionOverwrites.cache.set('extra', {
      allow: { bitfield: P.ViewChannel },
      deny: { bitfield: 0n },
    });
    await assert.rejects(
      () => verifyTicketPrivacy(x.channel, record, ids.bot),
      /ticketPrivacyMismatch/,
    );
    x.channel.permissionOverwrites.cache = cache(
      ticketOverwrites(ids.guild, ids.bot, ids.owner, ids.role),
    );
    x.channel.permissionOverwrites.cache.get(ids.guild).allow.bitfield = P.ViewChannel;
    await assert.rejects(() => verifyTicketPrivacy(x.channel, record, ids.bot));
  } finally {
    x.db.close();
  }
});
test('close saves transcript, makes owner read-only and staff can reopen', async () => {
  const x = setup();
  try {
    await openTicket(x.i, x.c);
    await changeTicketState(x.i, x.c, true);
    assert.equal(x.tickets.get(1, ids.guild).status, 'closed');
    assert(x.tickets.transcript(1));
    assert.equal(x.channel.permissionOverwrites.cache.get(ids.owner).deny.bitfield, P.SendMessages);
    await assert.rejects(() => changeTicketState(x.i, x.c, false), /ticketAccessDenied/);
    x.owner.roles.cache.set(ids.role, {});
    await changeTicketState(x.i, x.c, false);
    assert.equal(x.tickets.get(1, ids.guild).status, 'open');
  } finally {
    x.db.close();
  }
});
test('transcript exports literal JSON safely, bounds size and labels truncation', async () => {
  const msg = (n) => ({
    id: String(100000000000000000n + BigInt(n)),
    createdTimestamp: 0,
    author: { id: 'author' },
    content: '<script>alert(1)</script>',
    attachments: new Map(),
    embeds: [],
  });
  let calls = 0;
  const channel = {
    id: ids.channel,
    messages: {
      fetch: async () => new Map(Array.from({ length: 100 }, (_, n) => [String(n), msg(++calls)])),
    },
  };
  const t = await collectTicketTranscript(channel, { limit: 5, maxBytes: 500 });
  assert(t.truncated);
  assert(t.count <= 5);
  assert.match(t.body, /PARTIAL/);
  assert.match(t.body, /<script>/);
  assert(!t.body.startsWith('<html'));
});
test('private transcript denies unrelated users and does not use public channel sends', async () => {
  const x = setup();
  try {
    await openTicket(x.i, x.c);
    const r = await exportTicketTranscript(x.i, x.c);
    assert.match(r.file.name, /emika-ticket-1.txt/);
    assert.equal(x.sent.length, 0);
    x.i.user.id = 'outsider';
    await assert.rejects(() => exportTicketTranscript(x.i, x.c), /ticketAccessDenied/);
  } finally {
    x.db.close();
  }
});
test('panels bind buttons to source messages and refuse copies', async () => {
  const x = setup();
  try {
    x.owner.permissions.has = () => true;
    await publishTicketPanel(x.i, x.c, ids.channel);
    const h = createTicketButtonHandler(x.c);
    x.i.id = 'open-button';
    x.i.message.id = 'copy';
    await h(x.i);
    assert.equal(x.creates.length, 0);
    x.i.message.id = 'panelMessage';
    await h(x.i);
    assert.equal(x.creates.length, 1);
    assert.deepEqual(x.sent[0].allowedMentions.parse, []);
  } finally {
    x.db.close();
  }
});
test('eight management paths execute with current access checks', async () => {
  const x = setup();
  try {
    x.owner.permissions.has = () => true;
    let sub = 'setup';
    x.i.options = {
      getSubcommand: () => sub,
      getChannel: (name) => ({ id: name === 'category' ? ids.category : ids.channel }),
      getRole: () => x.role,
    };
    x.c.guildConfig.setLanguage(ids.guild, 'hi');
    for (const action of [
      'setup',
      'config',
      'panel',
      'open',
      'claim',
      'transcript',
      'close',
      'reopen',
    ]) {
      sub = action;
      if (action === 'open') x.i.id = 'open';
      await command.execute(x.i, x.c);
    }
    assert.equal(x.replies.length, 8);
    assert.equal(x.tickets.get(1, ids.guild).claimed_by, ids.owner);
    assert.match(x.replies[0].embeds[0].data.description, /टिकट/);
  } finally {
    x.db.close();
  }
});
test('stored transcripts expire under default and per-guild retention, old snapshot not exported', async () => {
  const x = setup();
  try {
    await openTicket(x.i, x.c);
    await changeTicketState(x.i, x.c, true);
    x.tickets.now = () => Date.now() + 31 * 86400000;
    assert.equal(x.tickets.transcript(1), undefined);
    await assert.rejects(() => exportTicketTranscript(x.i, x.c), /ticketTranscriptMissing/);
    assert.equal(x.tickets.retention(ids.guild), 30);
    x.tickets.now = () => Date.now();
    x.tickets.saveTranscript(1, { body: 'secret', count: 1, truncated: false });
    x.tickets.now = () => Date.now() + 2 * 86400000;
    assert.equal(x.tickets.setRetention(ids.guild, 1), 1);
    assert.equal(x.tickets.transcript(1), undefined);
    for (const d of [0, 31, 1.5]) assert.throws(() => x.tickets.setRetention(ids.guild, d));
  } finally {
    x.db.close();
  }
});
test('forget stored snapshot scoped by guild/current access/confirmation/privacy, native messages unchanged', async () => {
  const { forgetTicketTranscript } = await import('../src/services/ticketDelivery.js');
  const x = setup();
  try {
    await openTicket(x.i, x.c);
    await changeTicketState(x.i, x.c, true);
    assert.equal(x.tickets.forgetTranscript(1, 'foreign'), 0);
    assert(x.tickets.transcript(1));
    await assert.rejects(
      () => forgetTicketTranscript(x.i, x.c, { confirm: false }),
      /ticketForgetConfirm/,
    );
    x.i.user.id = 'outsider';
    await assert.rejects(
      () => forgetTicketTranscript(x.i, x.c, { confirm: true }),
      /ticketAccessDenied/,
    );
    x.i.user.id = ids.owner;
    assert.equal((await forgetTicketTranscript(x.i, x.c, { confirm: true })).count, 1);
    assert.equal(x.tickets.transcript(1), undefined);
    assert.equal(x.tickets.get(1, ids.guild).status, 'closed');
    assert.equal(x.creates.length, 1);
    assert.equal(x.sent.length, 0);
  } finally {
    x.db.close();
  }
});
test('ticket privacy validates recorded channel ID and overwrite principal type', async () => {
  const x = setup();
  try {
    await openTicket(x.i, x.c);
    const row = x.tickets.get(1, ids.guild);
    x.channel.permissionOverwrites.cache.get(ids.owner).type = 0;
    await assert.rejects(() => verifyTicketPrivacy(x.channel, row, ids.bot));
    x.channel.permissionOverwrites.cache = cache(
      ticketOverwrites(ids.guild, ids.bot, ids.owner, ids.role),
    );
    x.channel.id = 'wrong';
    await assert.rejects(() => verifyTicketPrivacy(x.channel, row, ids.bot));
  } finally {
    x.db.close();
  }
});
test('ticket retention/forget commands localize,confirm and current server permission enforced', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      await openTicket(x.i, x.c);
      await changeTicketState(x.i, x.c, true);
      x.c.guildConfig.setLanguage(ids.guild, locale);
      let sub = 'retention',
        confirm = true;
      x.i.options = { getSubcommand: () => sub, getInteger: () => 7, getBoolean: () => confirm };
      await assert.rejects(() => command.execute(x.i, x.c), /userPermission/);
      x.owner.permissions.has = () => true;
      confirm = false;
      await assert.rejects(() => command.execute(x.i, x.c), /ticketRetentionConfirm/);
      confirm = true;
      await command.execute(x.i, x.c);
      assert.equal(x.tickets.retention(ids.guild), 7);
      sub = 'forgettranscript';
      await command.execute(x.i, x.c);
      assert.equal(x.tickets.transcript(1), undefined);
      for (const r of x.replies) assert.deepEqual(r.allowedMentions.parse, []);
    } finally {
      x.db.close();
    }
  }
});

test('ticket setup forces native category/support identity and blocks wrong returned ID', async () => {
  for (const kind of ['category', 'role']) {
    const x = setup();
    try {
      const fetch = x.guild.channels.fetch;
      x.guild.channels.fetch = async (id, options) => {
        assert.equal(options.force, true);
        const row = await fetch(id);
        return kind === 'category' ? { ...row, id: 'other' } : row;
      };
      x.guild.roles.fetch = async (id, options) => {
        assert.equal(id, ids.role);
        assert.equal(options.force, true);
        return kind === 'role' ? { ...x.role, id: 'other' } : x.role;
      };
      await assert.rejects(() => openTicket(x.i, x.c));
      assert.equal(x.creates.length, 0);
    } finally {
      x.db.close();
    }
  }
});
test('ticket open rejects changed support/category config and wrong fetched owner before creation', async () => {
  for (const kind of ['config', 'actor']) {
    const x = setup();
    try {
      if (kind === 'actor') x.guild.members.fetch = async () => ({ ...x.owner, id: 'other' });
      else
        x.guild.members.fetchMe = async () => {
          x.tickets.configure(ids.guild, ids.category, '100000000000000009');
          return x.bot;
        };
      await assert.rejects(() => openTicket(x.i, x.c));
      assert.equal(x.creates.length, 0);
      assert.equal(x.db.prepare('SELECT count(*) n FROM tickets').get().n, 0);
    } finally {
      x.db.close();
    }
  }
});

test('ticket transcript/close reject access or privacy revoked during history fetch before save/effect', async () => {
  for (const action of ['export', 'close']) {
    for (const race of ['access', 'privacy', 'state']) {
      const x = setup();
      try {
        await openTicket(x.i, x.c);
        if (race === 'access') {
          x.i.user.id = 'staff';
          x.owner.id = 'staff';
          x.owner.permissions.has = () => true;
        }
        x.channel.messages.fetch = async () => {
          if (race === 'access') x.owner.permissions.has = () => false;
          if (race === 'privacy') x.channel.permissionOverwrites.cache.clear();
          if (race === 'state') x.tickets.uncertain(1);
          return new Map();
        };
        await assert.rejects(() =>
          action === 'export'
            ? exportTicketTranscript(x.i, x.c)
            : changeTicketState(x.i, x.c, true),
        );
        assert.equal(x.tickets.transcript(1), undefined);
        assert.equal(x.tickets.get(1, ids.guild).status, race === 'state' ? 'uncertain' : 'open');
      } finally {
        x.db.close();
      }
    }
  }
});

test('ticket own-claim release is isolated,current-staff-only and does not modify access/content', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      await openTicket(x.i, x.c);
      x.owner.permissions.has = () => true;
      x.c.guildConfig.setLanguage(ids.guild, language);
      x.tickets.claim(1, ids.owner);
      x.i.options = { getSubcommand: () => 'unclaim' };
      const before = x.channel.permissionOverwrites.cache;
      await command.execute(x.i, x.c);
      assert.equal(x.tickets.get(1, ids.guild).claimed_by, null);
      assert.equal(x.channel.permissionOverwrites.cache, before);
      assert.equal(x.sent.length, 0);
      assert.throws(() => x.tickets.unclaim(1, 'other', ids.owner));
      assert.throws(() => x.tickets.unclaim(1, ids.guild, ids.owner));
      x.tickets.claim(1, 'other-user');
      await assert.rejects(() => command.execute(x.i, x.c), /ticketUnclaimInvalid/);
      x.owner.permissions.has = () => false;
      await assert.rejects(() => command.execute(x.i, x.c), /ticketAccessDenied/);
      x.owner.permissions.has = () => true;
      x.tickets.transition(1, 'open', 'closed');
      assert.throws(() => x.tickets.unclaim(1, ids.guild, 'other-user'));
    } finally {
      x.db.close();
    }
  }
});

test('released ticket claim remains unclaimed across database restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'emika-unclaim-')),
    path = join(dir, 'db');
  let db;
  try {
    db = openDatabase(path);
    let t = new Tickets(db);
    const id = t.reserve(ids.guild, ids.owner, ids.role, 'restart');
    t.activate(id, ids.channel);
    t.claim(id, ids.owner);
    t.unclaim(id, ids.guild, ids.owner);
    db.close();
    db = openDatabase(path);
    t = new Tickets(db);
    assert.equal(t.get(id, ids.guild).claimed_by, null);
    assert.equal(t.get(id, ids.guild).status, 'open');
    assert.throws(() => t.reserve(ids.guild, ids.owner, ids.role, 'restart-new'));
  } finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ticket activation and panel completion require one pending reservation and identity', () => {
  const x = setup();
  try {
    const id = x.tickets.reserve(ids.guild, ids.owner, ids.role, 'source');
    assert.throws(() => x.tickets.activate(id, null), /identity/);
    x.tickets.activate(id, ids.channel);
    assert.throws(() => x.tickets.activate(id, 'other'), /not creating/);
    assert.throws(() => x.tickets.activate(999, ids.channel), /not creating/);
    const panel = x.tickets.reservePanel(ids.guild, ids.channel, 'panel');
    assert.throws(() => x.tickets.panelSent(panel, ''), /identity/);
    x.tickets.panelSent(panel, 'message');
    assert.throws(() => x.tickets.panelSent(panel, 'other'), /not pending/);
    assert.throws(() => x.tickets.panelSent(999, 'message'), /not pending/);
    assert.equal(x.tickets.panel(panel, ids.guild).message_id, 'message');
  } finally {
    x.db.close();
  }
});
test('accepted ticket panel send without identity is uncertain and source cannot replay', async () => {
  const x = setup();
  try {
    x.owner.permissions.has = () => true;
    x.channel.send = async (p) => {
      x.sent.push(p);
      return {};
    };
    await assert.rejects(() => publishTicketPanel(x.i, x.c, ids.channel), /ticketPanelUncertain/);
    assert.equal(x.tickets.panel(1, ids.guild).status, 'uncertain');
    await assert.rejects(() => publishTicketPanel(x.i, x.c, ids.channel));
    assert.equal(x.sent.length, 1);
  } finally {
    x.db.close();
  }
});

test('ticket opening rejects foreign member guild and foreign app bot without reserving', async () => {
  for (const kind of ['member', 'bot', 'botguild', 'interaction']) {
    const x = setup();
    try {
      if (kind === 'member') x.owner.guild.id = 'foreign';
      if (kind === 'bot') x.bot.id = 'foreign';
      if (kind === 'botguild') x.bot.guild.id = 'foreign';
      if (kind === 'interaction') x.i.guildId = 'foreign';
      await assert.rejects(() => openTicket(x.i, x.c));
      assert.equal(x.creates.length, 0);
      assert.equal(x.db.prepare('SELECT count(*) n FROM tickets').get().n, 0);
    } finally {
      x.db.close();
    }
  }
});
test('ticket opening refreshes member after config native lookups before reservation', async () => {
  const x = setup();
  try {
    x.guild.members.fetchMe = async () => {
      x.owner.guild.id = 'foreign';
      return x.bot;
    };
    await assert.rejects(() => openTicket(x.i, x.c), /ticketAccessDenied/);
    assert.equal(x.creates.length, 0);
    assert.equal(x.db.prepare('SELECT count(*) n FROM tickets').get().n, 0);
  } finally {
    x.db.close();
  }
});
test('ticket transcript rejects foreign native actor and bot before history disclosure', async () => {
  for (const kind of ['member', 'bot']) {
    const x = setup();
    try {
      await openTicket(x.i, x.c);
      let fetched = 0;
      x.channel.messages.fetch = async () => {
        fetched++;
        return new Map();
      };
      if (kind === 'member') x.owner.guild.id = 'foreign';
      else x.bot.id = 'foreign';
      await assert.rejects(() => exportTicketTranscript(x.i, x.c));
      assert.equal(fetched, 0);
      assert.equal(x.tickets.transcript(1), undefined);
    } finally {
      x.db.close();
    }
  }
});

test('ticket manager commands reject wrong actor/member guild/interaction guild before config or retention', async () => {
  for (const sub of ['config', 'retention', 'setup', 'panel'])
    for (const kind of ['actor', 'member', 'interaction']) {
      const x = setup();
      try {
        x.owner.permissions.has = () => true;
        if (kind === 'actor') x.owner.id = 'foreign';
        if (kind === 'member') x.owner.guild.id = 'foreign';
        if (kind === 'interaction') x.i.guildId = 'foreign';
        x.i.options = { getSubcommand: () => sub };
        await assert.rejects(() => command.execute(x.i, x.c), /userPermission/);
        assert.equal(x.sent.length, 0);
        assert.equal(x.tickets.retention(ids.guild), 30);
      } finally {
        x.db.close();
      }
    }
});
test('ticket setup rechecks manager after native category/role lookups before changing config', async () => {
  const x = setup();
  try {
    x.owner.permissions.has = () => true;
    x.i.options = {
      getSubcommand: () => 'setup',
      getChannel: () => x.category,
      getRole: () => x.role,
    };
    const old = x.tickets.config(ids.guild);
    x.guild.roles.fetch = async () => {
      x.owner.permissions.has = () => false;
      return x.role;
    };
    await assert.rejects(() => command.execute(x.i, x.c), /userPermission/);
    assert.deepEqual(x.tickets.config(ids.guild), old);
  } finally {
    x.db.close();
  }
});
test('ticket panel rechecks manager and configured state after destination lookup before reserve/send', async () => {
  for (const kind of ['authority', 'config']) {
    const x = setup();
    try {
      x.owner.permissions.has = () => true;
      x.guild.channels.fetch = async () => {
        if (kind === 'authority') x.owner.permissions.has = () => false;
        else x.db.prepare('DELETE FROM ticket_config WHERE guild_id=?').run(ids.guild);
        return x.channel;
      };
      await assert.rejects(() => publishTicketPanel(x.i, x.c, ids.channel));
      assert.equal(x.sent.length, 0);
      assert.equal(x.db.prepare('SELECT count(*) n FROM ticket_panels').get().n, 0);
    } finally {
      x.db.close();
    }
  }
});

test('ticket native lookup authority race blocks transcript reads and stored snapshot deletion', async () => {
  for (const action of ['export', 'close', 'forget']) {
    const x = setup();
    try {
      await openTicket(x.i, x.c);
      x.tickets.saveTranscript(1, { body: 'saved', count: 0, truncated: false });
      x.i.user.id = 'staff';
      x.owner.id = 'staff';
      x.owner.permissions.has = () => true;
      let fetched = 0;
      x.channel.messages.fetch = async () => {
        fetched++;
        return new Map();
      };
      x.guild.channels.fetch = async () => {
        x.owner.permissions.has = () => false;
        return x.channel;
      };
      await assert.rejects(
        () =>
          action === 'forget'
            ? forgetTicketTranscript(x.i, x.c, { confirm: true })
            : action === 'close'
              ? changeTicketState(x.i, x.c, true)
              : exportTicketTranscript(x.i, x.c),
        /ticketAccessDenied/,
      );
      assert.equal(fetched, 0);
      assert.equal(x.tickets.transcript(1).body, 'saved');
      assert.equal(x.tickets.get(1, ids.guild).status, 'open');
    } finally {
      x.db.close();
    }
  }
});
test('ticket close applies overwrite mutation on freshly revalidated channel object', async () => {
  const x = setup();
  try {
    await openTicket(x.i, x.c);
    const fresh = { ...x.channel, permissionOverwrites: { ...x.channel.permissionOverwrites } };
    let writes = 0;
    fresh.permissionOverwrites.set = async (rules) => {
      writes++;
      fresh.permissionOverwrites.cache = cache(rules);
    };
    let reads = 0;
    x.guild.channels.fetch = async () => (++reads === 1 ? x.channel : fresh);
    x.channel.permissionOverwrites.set = async () => {
      throw new Error('stale channel used');
    };
    await changeTicketState(x.i, x.c, true);
    assert.equal(writes, 1);
    assert.equal(x.tickets.get(1, ids.guild).status, 'closed');
  } finally {
    x.db.close();
  }
});

test('ticket stored self status is private localized and cannot read others or transcript/native channels', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.c.guildConfig.setLanguage(ids.guild, locale);
      x.i.options = { getSubcommand: () => 'status' };
      await command.execute(x.i, x.c);
      assert.equal(x.tickets.ownRecords(ids.guild, ids.owner).length, 0);
      for (let n = 0; n < 12; n++) {
        const id = x.tickets.reserve(ids.guild, ids.owner, ids.role, 'self' + n);
        x.tickets.activate(id, String(100000000000000100n + BigInt(n)));
        x.tickets.transition(id, 'open', 'closed');
      }
      x.tickets.reserve(ids.guild, 'other', ids.role, 'other');
      x.tickets.reserve('foreign', ids.owner, ids.role, 'foreign');
      const before = x.db.prepare('SELECT * FROM tickets').all();
      x.guild.members.fetch = async () => {
        throw Error('native lookup');
      };
      x.guild.channels.fetch = x.guild.members.fetch;
      x.tickets.transcript = () => {
        throw Error('transcript read');
      };
      await command.execute(x.i, x.c);
      const rows = x.tickets.ownRecords(ids.guild, ids.owner);
      assert.equal(rows.length, 10);
      assert.equal(rows[0].id, 12);
      assert.equal(rows.at(-1).id, 3);
      const reply = x.replies.at(-1);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert(reply.embeds[0].data.description.includes('#12'));
      assert(!reply.embeds[0].data.description.includes('#13'));
      assert.deepEqual(x.db.prepare('SELECT * FROM tickets').all(), before);
      assert.equal(x.creates.length, 0);
    } finally {
      x.db.close();
    }
  }
});

test('ticket manager queue excludes closed and foreign records,bounds oldest-first and omits owner/content fields', () => {
  const x = setup();
  try {
    for (let n = 0; n < 12; n++) {
      const id = x.tickets.reserve(ids.guild, 'owner' + n, ids.role, 'source' + n);
      x.tickets.activate(id, 'channel' + n);
    }
    const closed = x.tickets.reserve(ids.guild, 'closed-owner', ids.role, 'closed');
    x.tickets.activate(closed, 'closed-channel');
    x.tickets.transition(closed, 'open', 'closed');
    x.tickets.reserve('foreign', 'owner', ids.role, 'foreign');
    const first = x.tickets.queue(ids.guild);
    assert.equal(first.length, 10);
    assert.equal(first[0].id, 1);
    assert.equal(first[9].id, 10);
    assert.equal(x.tickets.queue(ids.guild, 2).length, 2);
    assert.deepEqual(Object.keys(first[0]).sort(), ['channel_id', 'claimed_by', 'id', 'status']);
    for (const page of [0, 11, 1.5])
      assert.throws(() => x.tickets.queue(ids.guild, page), /ticketQueuePageInvalid/);
  } finally {
    x.db.close();
  }
});
test('ticket queue command privately localizes stored metadata with manager gate and no native channel/transcript lookup', async () => {
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.owner.permissions.has = () => true;
      x.c.guildConfig.setLanguage(ids.guild, locale);
      const id = x.tickets.reserve(ids.guild, ids.owner, ids.role, 'source');
      x.tickets.activate(id, ids.channel);
      x.guild.channels.fetch = async () => {
        throw Error('no channels');
      };
      x.tickets.transcript = () => {
        throw Error('no transcript');
      };
      x.i.options = {
        getSubcommand: () => 'queue',
        getInteger: () => null,
        getString: () => null,
        getBoolean: () => null,
      };
      const before = x.tickets.get(id, ids.guild);
      await command.execute(x.i, x.c);
      assert(
        x.replies[0].embeds[0].data.description.includes(
          translate(locale, 'ticketQueueHeader', { page: 1 }),
        ),
      );
      assert.deepEqual(x.replies[0].allowedMentions.parse, []);
      assert.deepEqual(x.tickets.get(id, ids.guild), before);
      assert.equal(x.sent.length, 0);
      assert.equal(x.creates.length, 0);
      x.owner.permissions.has = () => false;
      await assert.rejects(() => command.execute(x.i, x.c), /userPermission/);
    } finally {
      x.db.close();
    }
  }
});
test('ticket queue refuses foreign current manager before storage read and empty pages retain honest caveat', async () => {
  const x = setup();
  try {
    x.owner.permissions.has = () => true;
    x.i.options = {
      getSubcommand: () => 'queue',
      getInteger: () => 10,
      getString: () => null,
      getBoolean: () => null,
    };
    await command.execute(x.i, x.c);
    assert(x.replies[0].embeds[0].data.description.includes('No unresolved stored tickets'));
    x.owner.guild.id = 'foreign';
    x.tickets.queue = () => assert.fail('must not query');
    await assert.rejects(() => command.execute(x.i, x.c), /userPermission/);
  } finally {
    x.db.close();
  }
});

test('ticket queue filters stored state and claimant before pagination,guild isolated and side-effect free', () => {
  const x = setup();
  try {
    for (let n = 0; n < 25; n++) {
      const id = x.tickets.reserve(ids.guild, 'owner' + n, ids.role, 'source' + n);
      x.db
        .prepare('UPDATE tickets SET status=?,claimed_by=? WHERE id=?')
        .run(n % 2 ? 'uncertain' : 'open', n % 3 ? 'staff' : null, id);
    }
    const before = x.db.prepare('SELECT * FROM tickets ORDER BY id').all();
    const rows = x.tickets.queue(ids.guild, 1, { state: 'open', unclaimed: true });
    assert.equal(rows.length, 5);
    assert(rows.every((r) => r.status === 'open' && r.claimed_by === null));
    assert.equal(x.tickets.queue('foreign', 1, { state: 'open' }).length, 0);
    assert.deepEqual(x.db.prepare('SELECT * FROM tickets ORDER BY id').all(), before);
    assert.equal(x.tickets.queue(ids.guild, 1, { state: 'uncertain' }).length, 10);
    assert.equal(x.tickets.queue(ids.guild, 2, { state: 'uncertain' }).length, 2);
    assert.equal(x.tickets.queue(ids.guild, 2, { state: 'open', unclaimed: true }).length, 0);
  } finally {
    x.db.close();
  }
});
test('queue rejects unsupported states and nonboolean filters rather than silently changing interpretation', () => {
  const x = setup();
  try {
    for (const filters of [
      { state: 'closed' },
      { state: 'all' },
      { state: 0 },
      { unclaimed: 1 },
      { unclaimed: null },
    ])
      assert.throws(() => x.tickets.queue(ids.guild, 1, filters), /ticketQueueFilterInvalid/);
  } finally {
    x.db.close();
  }
});
test('filtered queue slash displays selected policy privately in3locales without channel/transcript lookup', async () => {
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.owner.permissions.has = () => true;
      x.c.guildConfig.setLanguage(ids.guild, locale);
      const id = x.tickets.reserve(ids.guild, ids.owner, ids.role, 'one');
      x.tickets.activate(id, ids.channel);
      x.guild.channels.fetch = async () => assert.fail('no native lookup');
      x.i.options = {
        getSubcommand: () => 'queue',
        getInteger: () => null,
        getString: () => 'open',
        getBoolean: () => true,
      };
      await command.execute(x.i, x.c);
      const text = x.replies[0].embeds[0].data.description;
      assert(text.includes(translate(locale, 'ticketOwnState_open')));
      assert.deepEqual(x.replies[0].allowedMentions.parse, []);
      assert.equal(x.tickets.get(id, ids.guild).claimed_by, null);
      assert.equal(x.sent.length, 0);
    } finally {
      x.db.close();
    }
  }
});
test('filtered queue does not promote uncertain or claimed jobs as available and requires current manager', async () => {
  const x = setup();
  try {
    x.owner.permissions.has = () => true;
    const id = x.tickets.reserve(ids.guild, ids.owner, ids.role, 'one');
    x.tickets.activate(id, ids.channel);
    x.tickets.claim(id, 'staff');
    x.i.options = {
      getSubcommand: () => 'queue',
      getInteger: () => 1,
      getString: () => 'open',
      getBoolean: () => true,
    };
    await command.execute(x.i, x.c);
    assert(!x.replies[0].embeds[0].data.description.includes('#' + id));
    x.owner.permissions.has = () => false;
    let reads = 0;
    x.tickets.queue = () => {
      reads++;
      return [];
    };
    await assert.rejects(() => command.execute(x.i, x.c), /userPermission/);
    assert.equal(reads, 0);
    assert.equal(x.tickets.get(id, ids.guild).claimed_by, 'staff');
  } finally {
    x.db.close();
  }
});

test('uncertainty receipts require matching in-flight state and preserve newer completed ticket receipts', () => {
  const x = setup();
  try {
    const id = x.tickets.reserve(ids.guild, ids.owner, ids.role, 'one');
    assert.equal(x.tickets.uncertain(id, 'closing'), false);
    assert.equal(x.tickets.get(id, ids.guild).status, 'creating');
    x.tickets.activate(id, ids.channel);
    assert.equal(x.tickets.uncertain(id, 'creating'), false);
    assert.equal(x.tickets.get(id, ids.guild).status, 'open');
    x.tickets.transition(id, 'open', 'closing');
    assert.equal(x.tickets.uncertain(id, 'reopening'), false);
    x.tickets.transition(id, 'closing', 'closed');
    for (const state of ['creating', 'closing', 'reopening', null])
      assert.equal(x.tickets.uncertain(id, state), false);
    assert.equal(x.tickets.get(id, ids.guild).status, 'closed');
    assert.equal(x.tickets.get(id, ids.guild).channel_id, ids.channel);
    assert.equal(x.tickets.uncertain(999, 'creating'), false);
    assert.throws(() => x.tickets.uncertain(id, 'closed'), /Invalid uncertain/);
  } finally {
    x.db.close();
  }
});
test('matching active ticket faults mark uncertain exactly once and unresolved rows block repeat creation', () => {
  for (const state of ['creating', 'open', 'closing', 'reopening']) {
    const x = setup();
    try {
      const id = x.tickets.reserve(ids.guild, ids.owner, ids.role, state);
      if (state !== 'creating') {
        x.tickets.activate(id, ids.channel);
        if (state !== 'open') x.tickets.transition(id, 'open', state);
      }
      assert.equal(x.tickets.uncertain(id, state), true);
      assert.equal(x.tickets.uncertain(id, state), false);
      assert.equal(x.tickets.get(id, ids.guild).status, 'uncertain');
      assert.throws(
        () => x.tickets.reserve(ids.guild, ids.owner, ids.role, 'repeat'),
        /ticketAlreadyOpen/,
      );
    } finally {
      x.db.close();
    }
  }
});
test('late ticket panel fault cannot invalidate active delivery identity or resurrect missing reservation', () => {
  const x = setup();
  try {
    const id = x.tickets.reservePanel(ids.guild, ids.channel, 'one');
    assert.equal(x.tickets.panelUncertain(id), true);
    assert.equal(x.tickets.panelUncertain(id), false);
    assert.throws(() => x.tickets.panelSent(id, 'bad'), /not pending/);
    const active = x.tickets.reservePanel(ids.guild, ids.channel, 'two');
    x.tickets.panelSent(active, 'exact-message');
    assert.equal(x.tickets.panelUncertain(active), false);
    assert.equal(x.tickets.panel(active, ids.guild).status, 'active');
    assert.equal(x.tickets.panel(active, ids.guild).message_id, 'exact-message');
    assert.equal(x.tickets.panelUncertain(999), false);
  } finally {
    x.db.close();
  }
});
test('ticket receipt guarded storage writes remain guarded after actual SQLite restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'emika-ticket-receipts-')),
    path = join(dir, 'db');
  let db;
  try {
    db = openDatabase(path);
    let t = new Tickets(db);
    const id = t.reserve(ids.guild, ids.owner, ids.role, 'one');
    t.activate(id, ids.channel);
    t.transition(id, 'open', 'closed');
    const p = t.reservePanel(ids.guild, ids.channel, 'panel');
    t.panelSent(p, 'message');
    db.close();
    db = openDatabase(path);
    t = new Tickets(db);
    assert.equal(t.uncertain(id, 'creating'), false);
    assert.equal(t.panelUncertain(p), false);
    assert.equal(t.get(id, ids.guild).status, 'closed');
    assert.equal(t.panel(p, ids.guild).message_id, 'message');
  } finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ticket transcript rejects nonadvancing pages even when they contain unseen newer message IDs', async () => {
  let calls = 0;
  const channel = {
    id: ids.channel,
    messages: {
      fetch: async () => {
        const base = 100000000000000000n + (calls++ ? 1000n : 0n);
        return new Map(
          Array.from({ length: 100 }, (_, n) => {
            const id = String(base + BigInt(n));
            return [id, { id, createdTimestamp: 0 }];
          }),
        );
      },
    },
  };
  await assert.rejects(() => collectTicketTranscript(channel), /ticketTranscriptPagination/);
  assert.equal(calls, 2);
});
test('ticket transcript validates native message IDs,timestamps and explicit channel provenance before export', async () => {
  for (const change of [
    { id: 'bad' },
    { id: 123 },
    { id: '1' },
    { createdTimestamp: NaN },
    { createdTimestamp: Infinity },
    { createdTimestamp: 1e20 },
    { channelId: 'foreign' },
  ]) {
    const msg = {
      id: '100000000000000001',
      createdTimestamp: 0,
      channelId: ids.channel,
      ...change,
    };
    const channel = { id: ids.channel, messages: { fetch: async () => new Map([['m', msg]]) } };
    await assert.rejects(() => collectTicketTranscript(channel), /ticketTranscriptPagination/);
  }
});
test('ticket transcript bounds reject invalid requests without reads and valid descending cursor exports oldest first', async () => {
  let calls = 0;
  const channel = {
    id: ids.channel,
    messages: {
      fetch: async ({ before }) => {
        calls++;
        if (before) {
          assert.equal(before, '100000000000000100');
          return new Map([
            ['old', { id: '100000000000000099', createdTimestamp: 0, channelId: ids.channel }],
          ]);
        }
        return new Map(
          Array.from({ length: 100 }, (_, n) => {
            const id = String(100000000000000100n + BigInt(n));
            return [id, { id, createdTimestamp: 0, channelId: ids.channel }];
          }),
        );
      },
    },
  };
  for (const options of [
    { limit: 0 },
    { limit: 1001 },
    { limit: 1.5 },
    { maxBytes: 99 },
    { maxBytes: 1000001 },
    { maxBytes: '500' },
  ])
    await assert.rejects(() => collectTicketTranscript(channel, options), /bounds/);
  assert.equal(calls, 0);
  const result = await collectTicketTranscript(channel);
  assert.equal(calls, 2);
  assert.equal(result.count, 101);
  assert.equal(result.truncated, false);
  const lines = result.body
    .split('\n')
    .filter((l) => l.startsWith('{'))
    .map(JSON.parse);
  assert.equal(lines[0].id, '100000000000000099');
  assert.equal(lines.at(-1).id, '100000000000000199');
});

test('ticket transcript duplicate IDs in one native page fail closed instead of exporting two versions', async () => {
  const id = '100000000000000001';
  let calls = 0;
  const channel = {
    id: ids.channel,
    messages: {
      fetch: async () => {
        calls++;
        return new Map([
          ['first', { id, createdTimestamp: 0, content: 'first' }],
          ['second', { id, createdTimestamp: 0, content: 'conflicting' }],
        ]);
      },
    },
  };
  await assert.rejects(() => collectTicketTranscript(channel), /ticketTranscriptPagination/);
  assert.equal(calls, 1);
});
test('ticket transcript duplicate identities in a full older page fail without misleading complete export', async () => {
  let calls = 0;
  const channel = {
    id: ids.channel,
    messages: {
      fetch: async () => {
        const older = calls++ > 0,
          base = older ? 100000000000000000n : 100000000000000200n;
        return new Map(
          Array.from({ length: 100 }, (_, n) => {
            const id = String(base + BigInt(older && n === 99 ? 0 : n));
            return [String(n), { id, createdTimestamp: 0, content: 'safe' }];
          }),
        );
      },
    },
  };
  await assert.rejects(() => collectTicketTranscript(channel), /ticketTranscriptPagination/);
  assert.equal(calls, 2);
});

test('ticket channel and panel receipts reject blank identities without promoting reservations', () => {
  const x = setup();
  try {
    const id = x.tickets.reserve(ids.guild, ids.owner, ids.role, 'blank-ticket'),
      panel = x.tickets.reservePanel(ids.guild, ids.channel, 'blank-panel');
    for (const value of ['', ' ', '\t', null, 1]) {
      assert.throws(() => x.tickets.activate(id, value), /identity/);
      assert.throws(() => x.tickets.panelSent(panel, value), /identity/);
    }
    assert.equal(x.tickets.get(id, ids.guild).status, 'creating');
    assert.equal(x.tickets.panel(panel, ids.guild).status, 'pending');
    x.tickets.activate(id, ids.channel);
    x.tickets.panelSent(panel, 'observed');
    assert.equal(x.tickets.get(id, ids.guild).status, 'open');
    assert.equal(x.tickets.panel(panel, ids.guild).status, 'active');
  } finally {
    x.db.close();
  }
});

test('ticket setupreset/transcriptallforget/claimrelease exactguild/state/idempotence preserve records/nativeaccess', () => {
  const s = setup();
  try {
    const id = s.tickets.reserve(ids.guild, ids.owner, ids.role, 'one');
    s.tickets.activate(id, ids.channel);
    s.tickets.claim(id, 'staff');
    s.tickets.saveTranscript(id, { body: 'SECRET', count: 1, truncated: false });
    const foreign = s.tickets.reserve('foreign', 'owner2', 'support2', 'other');
    s.tickets.activate(foreign, 'channel2');
    s.tickets.claim(foreign, 'staff2');
    s.tickets.saveTranscript(foreign, { body: 'FOREIGN', count: 1, truncated: false });
    assert.equal(s.tickets.releaseClaims(ids.guild), 1);
    assert.equal(s.tickets.releaseClaims(ids.guild), 0);
    assert.equal(s.tickets.get(id, ids.guild).owner_id, ids.owner);
    assert.equal(s.tickets.get(foreign, 'foreign').claimed_by, 'staff2');
    assert.equal(s.tickets.forgetAllTranscripts(ids.guild), 1);
    assert.equal(s.tickets.forgetAllTranscripts(ids.guild), 0);
    assert(s.tickets.transcript(foreign));
    assert(s.tickets.get(id, ids.guild));
    assert.equal(s.tickets.resetSetup(ids.guild), 1);
    assert.equal(s.tickets.resetSetup(ids.guild), 0);
    assert.equal(s.tickets.get(id, ids.guild).status, 'open');
    assert.equal(s.sent.length, 0);
    assert.equal(s.creates.length, 0);
  } finally {
    s.db.close();
  }
});
test('ticket reset during outputvalidation blocks newopen,closed/uncertain claims kept,transcripts can be newly saved', async () => {
  const s = setup();
  try {
    const fetch = s.guild.channels.fetch;
    s.guild.channels.fetch = async (...args) => {
      s.tickets.resetSetup(ids.guild);
      return fetch(...args);
    };
    await assert.rejects(() => openTicket(s.i, s.c));
    assert.equal(s.creates.length, 0);
    const id = s.tickets.reserve(ids.guild, ids.owner, ids.role, 'one');
    s.tickets.activate(id, ids.channel);
    s.tickets.claim(id, 'staff');
    s.tickets.transition(id, 'open', 'closed');
    assert.equal(s.tickets.releaseClaims(ids.guild), 0);
    assert.equal(s.tickets.get(id, ids.guild).claimed_by, 'staff');
    s.tickets.saveTranscript(id, { body: 'OLD', count: 1, truncated: false });
    s.tickets.forgetAllTranscripts(ids.guild);
    s.tickets.saveTranscript(id, { body: 'NEW', count: 1, truncated: false });
    assert.equal(s.tickets.transcript(id).body, 'NEW');
  } finally {
    s.db.close();
  }
});
test('ticket three storedbulkcommands private3locale exactmanager/confirmation no nativeeffects', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.c.guildConfig.setLanguage(ids.guild, locale);
      s.owner.permissions.has = () => true;
      let sub = 'resetsetup',
        confirm = false;
      s.i.options = { getSubcommand: () => sub, getBoolean: () => confirm };
      await assert.rejects(() => command.execute(s.i, s.c), /ticketStoredConfirm/);
      assert(s.tickets.config(ids.guild));
      confirm = true;
      for (sub of ['resetsetup', 'forgetalltranscripts', 'releaseclaims'])
        await command.execute(s.i, s.c);
      assert.equal(s.sent.length, 0);
      assert.equal(s.creates.length, 0);
      for (const p of s.replies) assert.deepEqual(p.allowedMentions.parse, []);
      s.owner.permissions.has = () => false;
      await assert.rejects(() => command.execute(s.i, s.c), /userPermission/);
    } finally {
      s.db.close();
    }
  }
});
