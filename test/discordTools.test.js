import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeSnowflake,
  timestampMarkup,
  decodeColor,
  TIMESTAMP_STYLES,
} from '../src/services/discordTools.js';
import command from '../src/commands/utility/tools.js';
import { translate } from '../src/services/localization.js';
test('snowflake extracts exact timestamp/bits using BigInt without unsafe number rounding', () => {
  const milliseconds = Date.parse('2026-10-11T12:00:00Z');
  const id = ((BigInt(milliseconds) - 1420070400000n) << 22n) | (17n << 17n) | (23n << 12n) | 4095n;
  assert.deepEqual(decodeSnowflake(String(id)), {
    id: String(id),
    milliseconds,
    iso: '2026-10-11T12:00:00.000Z',
    worker: 17,
    process: 23,
    increment: 4095,
  });
  assert.equal(decodeSnowflake('1').milliseconds, 1420070400000);
  assert.equal(decodeSnowflake('18446744073709551615').increment, 4095);
  for (const invalid of [
    '',
    null,
    {},
    1,
    '0',
    '01',
    '-1',
    '1.5',
    '1e18',
    ' 123',
    '18446744073709551616',
    '1'.repeat(21),
  ])
    assert.throws(() => decodeSnowflake(invalid), /toolsSnowflakeInvalid/);
});
test('timestamp accepts explicit Unix seconds and all documented styles without relative-day inference', () => {
  for (const style of TIMESTAMP_STYLES)
    assert.equal(timestampMarkup(0, style).markup, `<t:0:${style}>`);
  assert.equal(timestampMarkup(253402300799, 'F').iso, '9999-12-31T23:59:59.000Z');
  for (const seconds of [-1, NaN, Infinity, 1.5, '123', null, 253402300800])
    assert.throws(() => timestampMarkup(seconds, 'f'), /toolsTimestampInvalid/);
  for (const style of ['', null, 'x', ' f'])
    assert.throws(() => timestampMarkup(0, style), /toolsTimestampInvalid/);
});
test('color converts exact six-digit input preserving zero/max with no shorthand or script parsing', () => {
  assert.deepEqual(decodeColor('#9b87f5'), {
    hex: '#9B87F5',
    decimal: 10192885,
    red: 155,
    green: 135,
    blue: 245,
  });
  assert.equal(decodeColor('000000').decimal, 0);
  assert.equal(decodeColor('FFFFFF').decimal, 16777215);
  for (const value of ['fff', '0xFFFFFF', '1234567', '#ffffff ', null, 'FFFFFF\n', 'GGGGGG'])
    assert.throws(() => decodeColor(value), /toolsColorInvalid/);
});
test('three Discord helper paths serialize bounded inputs and reply private branded no-ping in all locales', async () => {
  assert.deepEqual(
    command.data.toJSON().options.map((s) => s.name),
    [
      'snowflake',
      'timestamp',
      'localtimestamp',
      'timezone',
      'timedifference',
      'permissions',
      'rgb',
      'isotimestamp',
      'color',
    ],
  );
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['snowflake', 'timestamp', 'color']) {
      let reply;
      const i = {
        guildId: 'g',
        options: {
          getSubcommand: () => sub,
          getString: (n) => (n === 'id' ? '1750388559052800000' : n === 'style' ? 'R' : '#9b87f5'),
          getInteger: () => 0,
        },
        reply: async (p) => {
          reply = p;
        },
      };
      await command.execute(i, {
        localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
      });
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(reply.embeds.length, 1);
      assert(reply.embeds[0].data.footer.text);
      assert(reply.embeds[0].data.description.length < 1800);
      if (sub === 'timestamp') assert(reply.embeds[0].data.description.includes('`<t:0:R>`'));
    }
});

test('localtimestamp namedzone conversion exactUnixseconds roundtrip plus DSTgap/overlap rejection', async () => {
  const { localTimestamp, showInZone } = await import('../src/services/discordTools.js');
  const r = localTimestamp('2026-10-12T09:00:00', 'Asia/Kolkata', 'R');
  assert.equal(r.iso, '2026-10-12T03:30:00.000Z');
  assert.equal(r.markup, `<t:${r.seconds}:R>`);
  assert.equal(showInZone(r.seconds, 'Asia/Kolkata').local, '2026-10-12T09:00:00');
  assert.throws(
    () => localTimestamp('2026-03-08T02:30:00', 'America/New_York'),
    /automationZoneGap/,
  );
  assert.throws(
    () => localTimestamp('2026-11-01T01:30:00', 'America/New_York'),
    /automationZoneOverlap/,
  );
  assert.throws(() => localTimestamp('2026-02-30T09:00:00', 'UTC'));
  assert.throws(() => showInZone(0, 'Bad/Zone'));
  assert.throws(() => showInZone(0, '+05:30'));
});
test('elapsed timedifference signed/zero/largebounds exact breakdown not timezonecalendardays', async () => {
  const { timeDifference, showInZone } = await import('../src/services/discordTools.js');
  assert.deepEqual(timeDifference(0, 90061), {
    seconds: 90061,
    days: 1,
    hours: 1,
    minutes: 1,
    remainder: 1,
  });
  assert.equal(timeDifference(90061, 0).seconds, -90061);
  assert.equal(timeDifference(1, 1).days, 0);
  assert.equal(timeDifference(0, 253402300799).seconds, 253402300799);
  assert.equal(showInZone(0, 'UTC').local, '1970-01-01T00:00:00');
  for (const v of [-1, NaN, null, 1.5, 253402300800]) assert.throws(() => timeDifference(v, 0));
});
test('time helpers three newpaths private3locale displaymarkup/explicitzone no schedulingeffects', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['localtimestamp', 'timezone', 'timedifference']) {
      let reply;
      const i = {
        guildId: 'g',
        options: {
          getSubcommand: () => sub,
          getString: (n) =>
            n === 'local' ? '2026-10-12T09:00:00' : n === 'style' ? 'F' : 'Asia/Kolkata',
          getInteger: (n) => (n === 'end' ? 90061 : 0),
        },
        reply: async (p) => {
          reply = p;
        },
      };
      await command.execute(i, {
        localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
      });
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert(reply.embeds[0].data.description.length < 1800);
    }
});
