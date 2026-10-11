import {
  SlashCommandBuilder,
  AttachmentBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import {
  customRoleEffect,
  styleOwnRole,
  createOwnRole,
  ownRoleEffect,
  reconcileCreation,
} from '../../services/customRoles.js';
import { validateSelfRole } from '../../services/rolePanels.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
async function requireManager(i) {
  if (!i.guildId || i.guild?.id !== i.guildId) throw new UserError('roleActorPermission');
  const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
  if (
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    !actor.permissions?.has(P.ManageRoles)
  )
    throw new UserError('roleActorPermission');
  return actor;
}
const name = (o) =>
  o
    .setName('name')
    .setDescription('Mapping name: lowercase letters, digits, _ or -')
    .setMinLength(1)
    .setMaxLength(24)
    .setRequired(true);
const data = new SlashCommandBuilder()
  .setName('customrole')
  .setDescription('Configured self-service roles with safe role checks.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('map')
      .setDescription('Manage Roles: map a name to an existing safe role.')
      .addStringOption(name)
      .addRoleOption((o) =>
        o.setName('role').setDescription('Existing safe role').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('unmap')
      .setDescription('Manage Roles: remove a mapping, leaving existing assignments.')
      .addStringOption(name),
  )
  .addSubcommand((s) =>
    s
      .setName('required')
      .setDescription('Manage Roles: set eligibility role or remove the gate.')
      .addRoleOption((o) =>
        o.setName('role').setDescription('Omit to allow all server members to claim mapped roles.'),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('clear')
      .setDescription(
        'Manage Roles:remove all mappings,leaving native roles,assignments and eligibility unchanged.',
      )
      .addBooleanOption((o) =>
        o.setName('confirm').setDescription('Confirm mapping removal only').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('creation')
      .setDescription('ManageRoles:opt in/out of unassigned zero-permission member role creation.')
      .addBooleanOption((o) =>
        o
          .setName('enabled')
          .setDescription('Enable member role creation,cap50 per guild')
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm native role creation opt-in policy')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('createown')
      .setDescription('Create one unassigned zero-permission role for yourself,if manager enabled.')
      .addStringOption((o) =>
        o
          .setName('label')
          .setDescription('Role name1-32chars,no @')
          .setMaxLength(32)
          .setMinLength(1)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o.setName('hex').setDescription('Optional6hex RGB digits').setMinLength(6).setMaxLength(6),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('reconcile')
      .setDescription('ManageRoles:verify observed uncertain creation,no native changes.')
      .addUserOption((o) => o.setName('member').setDescription('Creation owner').setRequired(true))
      .addBooleanOption((o) =>
        o.setName('confirm').setDescription('Confirm stored status repair only').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('claimown')
      .setDescription('Assign your verified zero-permission created role to yourself.'),
  )
  .addSubcommand((s) =>
    s.setName('releaseown').setDescription('Remove your created role from yourself,no deletion.'),
  )
  .addSubcommand((s) =>
    s
      .setName('created')
      .setDescription('Privately inspect your stored creation record,no native role changes.'),
  )
  .addSubcommand((s) =>
    s
      .setName('creations')
      .setDescription('ManageRoles:private paged creation records,status and IDs only.')
      .addIntegerOption((o) =>
        o.setName('page').setDescription('Page1-5,ten records each').setMinValue(1).setMaxValue(5),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('renameown')
      .setDescription(
        'Confirmed own zero-permission created role name,not mapping/native other roles.',
      )
      .addStringOption((o) =>
        o
          .setName('label')
          .setDescription('Name1-32characters,no @')
          .setMinLength(1)
          .setMaxLength(32)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm native own-role cosmetic edit')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('colorown')
      .setDescription('Confirmed own zero-permission created role primaryRGB color only.')
      .addStringOption((o) =>
        o
          .setName('hex')
          .setDescription('Six hex RGB digits')
          .setMinLength(6)
          .setMaxLength(6)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm native own-role cosmetic edit')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('resetstyle')
      .setDescription('Confirmed own created role primary color reset to0;name/access retained.')
      .addBooleanOption((o) =>
        o.setName('confirm').setDescription('Confirm own-role color reset').setRequired(true),
      ),
  )
  .addSubcommand((s) => s.setName('list').setDescription('Show mapped names and eligibility role.'))
  .addSubcommand((s) =>
    s
      .setName('claim')
      .setDescription('Assign one configured safe role to yourself.')
      .addStringOption(name),
  )
  .addSubcommand((s) =>
    s
      .setName('release')
      .setDescription('Remove one configured role from yourself.')
      .addStringOption(name),
  );
data
  .addSubcommand((s) =>
    s
      .setName('renamemapping')
      .setDescription('ManageRoles:change only storedmapping alias,not nativerolename/access.')
      .addStringOption(name)
      .addStringOption((o) =>
        o
          .setName('new-name')
          .setDescription('Unique lowercasealias1-24,letters/digits/_/-')
          .setMinLength(1)
          .setMaxLength(24)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('exportmappings')
      .setDescription(
        'ManageRoles:privateJSON mappingnames/roleIDs/gate/policy,no ownership/memberhistory.',
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('eligibility')
      .setDescription(
        'Privately check your current storedgate membership,no role grants/safety/readinessclaim.',
      ),
  );
for (const name of ['unmaprole', 'clearrequired', 'resetconfig'])
  data.addSubcommand((s) => {
    s.setName(name)
      .setDescription(
        name === 'unmaprole'
          ? 'ManageRoles:remove exact stored mapped role ID,no native assignments changed.'
          : name === 'clearrequired'
            ? 'ManageRoles:remove eligibility gate,allowing otherwise eligible future self claims.'
            : 'ManageRoles:forget mappings/gate and stop creation,ownership/native roles/cases kept.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm this stored self-role configuration change')
          .setRequired(true),
      );
    if (name === 'unmaprole')
      s.addStringOption((o) =>
        o
          .setName('role-id')
          .setDescription('Exact stored mapped role ID,deleted roles allowed')
          .setMinLength(17)
          .setMaxLength(20)
          .setRequired(true),
      );
    return s;
  });
export default {
  category: 'customrole',
  data,
  cooldownMs: 5000,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = i.options.getSubcommand(),
      locale = c.localization.locale(i.guildId),
      t = (key, params) => c.localization.t(i.guildId, key, params);
    let text, files;
    if (['unmaprole', 'clearrequired', 'resetconfig'].includes(sub)) {
      await requireManager(i);
      if (i.options.getBoolean('confirm', true) !== true) throw new UserError('customClearConfirm');
      if (sub === 'unmaprole')
        text = t('customRoleIdUnmapped', {
          count: c.customRoles.unmapRole(i.guildId, i.options.getString('role-id', true)),
        });
      else if (sub === 'clearrequired') {
        c.customRoles.clearRequired(i.guildId);
        text = t('customGateCleared');
      } else text = t('customConfigReset', { count: c.customRoles.resetConfig(i.guildId) });
    } else if (sub === 'renamemapping') {
      await requireManager(i);
      c.customRoles.renameMapping(
        i.guildId,
        i.options.getString('name', true),
        i.options.getString('new-name', true),
      );
      text = t('customMappingRenamed');
    } else if (sub === 'exportmappings') {
      await requireManager(i);
      const r = {
        mappings: c.customRoles.list(i.guildId),
        requiredRoleId: c.customRoles.required(i.guildId),
        creationEnabled: c.customRoles.creationEnabled(i.guildId),
      };
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(r, null, 2) + '\n', 'utf8'), {
          name: 'luna-customrole-mappings.json',
        }),
      ];
      text = t('customMappingsExported');
    } else if (sub === 'eligibility') {
      const gate = c.customRoles.required(i.guildId);
      if (gate) {
        const role = await i.guild.roles.fetch(gate, { force: true });
        if (role?.id !== gate || role.guild?.id !== i.guildId)
          throw new UserError('customRequiredMissing');
      }
      const member = await i.guild.members.fetch({ user: i.user.id, force: true });
      if (
        i.guild.id !== i.guildId ||
        member?.id !== i.user.id ||
        member.guild?.id !== i.guildId ||
        member.user?.bot !== false
      )
        throw new UserError('customMemberMissing');
      if (c.customRoles.required(i.guildId) !== gate) throw new UserError('customConfigChanged');
      text = t('customEligibility', {
        gate: gate ?? t('customNoGate'),
        status: t(!gate || member.roles.cache.has(gate) ? 'enabled' : 'disabled'),
        creation: t(c.customRoles.creationEnabled(i.guildId) ? 'enabled' : 'disabled'),
      });
    } else if (['map', 'unmap', 'required', 'clear', 'creation', 'creations'].includes(sub)) {
      let actor = await requireManager(i);
      if (sub === 'creations') {
        const page = i.options.getInteger('page') ?? 1;
        const result = c.customRoles.creations(i.guildId, page);
        text =
          t('customCreationRecords', { page, count: result.count }) +
          '\n' +
          (result.rows
            .map((r) =>
              t('customCreationRecord', {
                owner: r.owner_id,
                role: r.role_id ?? t('customCreationNoRole'),
                status: t('customCreationState_' + r.status),
              }),
            )
            .join('\n') || t('customEmpty'));
      } else if (sub === 'creation') {
        if (i.options.getBoolean('confirm', true) !== true)
          throw new UserError('customCreationConfirm');
        c.customRoles.setCreation(i.guildId, i.options.getBoolean('enabled', true));
        text = t('customCreationSaved');
      } else if (sub === 'map') {
        const selected = i.options.getRole('role', true),
          role = await i.guild.roles.fetch(selected.id, { force: true });
        const [current, bot] = await Promise.all([
          requireManager(i),
          i.guild.members.fetchMe({ force: true }),
        ]);
        actor = current;
        if (
          !i.client?.user?.id ||
          bot?.id !== i.client.user.id ||
          bot.guild?.id !== i.guildId ||
          !i.appPermissions?.has(P.ManageRoles)
        )
          throw new UserError('roleBotPermission');
        if (role?.id !== selected.id) throw new UserError('roleInvalid');
        validateSelfRole(role, bot, actor, i.guild);
        c.customRoles.map(i.guildId, i.options.getString('name', true), role.id);
        text = t('customSaved');
      } else if (sub === 'clear') {
        if (i.options.getBoolean('confirm', true) !== true)
          throw new UserError('customClearConfirm');
        const count = c.customRoles.clearMappings(i.guildId);
        text = t('customCleared', { count });
      } else if (sub === 'unmap') {
        const removed = c.customRoles.unmap(i.guildId, i.options.getString('name', true));
        if (!removed) throw new UserError('customMappingMissing');
        text = t('customUnmapped');
      } else {
        const selected = i.options.getRole('role');
        let role = null;
        if (selected) {
          role = await i.guild.roles.fetch(selected.id, { force: true });
          if (
            !role ||
            role.id !== selected.id ||
            role.guild.id !== i.guildId ||
            role.id === i.guildId ||
            role.managed
          )
            throw new UserError('customRoleInvalid');
          actor = await requireManager(i);
          if (actor.id !== i.guild.ownerId && actor.roles.highest.comparePositionTo(role) <= 0)
            throw new UserError('roleActorHierarchy');
        }
        c.customRoles.setRequired(i.guildId, role?.id ?? null);
        text = t('customSaved');
      }
    } else if (['renameown', 'colorown', 'resetstyle'].includes(sub)) {
      const hex = sub === 'colorown' ? i.options.getString('hex', true) : null;
      if (hex !== null && !/^[a-fA-F0-9]{6}$/.test(hex)) throw new UserError('customCreationInput');
      const r = await styleOwnRole(i, c, {
        confirm: i.options.getBoolean('confirm', true),
        ...(sub === 'renameown'
          ? { name: i.options.getString('label', true) }
          : { color: hex === null ? 0 : parseInt(hex, 16) }),
      });
      text = t(r.changed ? 'customStyleSaved' : 'customAlready');
    } else if (sub === 'reconcile') {
      const result = await reconcileCreation(i, c, {
        ownerId: i.options.getUser('member', true).id,
        confirm: i.options.getBoolean('confirm', true),
      });
      text = t('customReconciled', { id: result.roleId });
    } else if (['claimown', 'releaseown'].includes(sub)) {
      const result = await ownRoleEffect(i, c, { claim: sub === 'claimown' });
      text = t(
        result.changed
          ? sub === 'claimown'
            ? 'customClaimed'
            : 'customReleased'
          : 'customAlready',
      );
    } else if (sub === 'created') {
      const row = c.customRoles.created(i.guildId, i.user.id);
      text = row
        ? t('customCreationRecord', {
            owner: i.user.id,
            role: row.role_id ?? t('customCreationNoRole'),
            status: t('customCreationState_' + row.status),
          })
        : t('customCreationNoRecord');
    } else if (sub === 'createown') {
      const hex = i.options.getString('hex');
      if (hex !== null && !/^[a-fA-F0-9]{6}$/.test(hex)) throw new UserError('customCreationInput');
      const result = await createOwnRole(i, c, {
        name: i.options.getString('label', true),
        color: hex === null ? 0 : parseInt(hex, 16),
      });
      text = t('customCreatedUnassigned', { id: result.roleId });
    } else if (sub === 'list') {
      const rows = c.customRoles.list(i.guildId);
      text =
        t('customList', {
          count: rows.length,
          required: c.customRoles.required(i.guildId) ?? t('customNoGate'),
        }) +
        '\n' +
        (rows.map((r) => `${r.name}: ${r.role_id}`).join('\n') || t('customEmpty'));
    } else if (['claim', 'release'].includes(sub)) {
      const result = await customRoleEffect(i, c, {
        name: i.options.getString('name', true),
        claim: sub === 'claim',
      });
      text = t(
        result.changed ? (sub === 'claim' ? 'customClaimed' : 'customReleased') : 'customAlready',
      );
    } else throw new UserError('unknownCommand');
    await i.editReply(
      lunaPayload(
        { content: text, ...(files ? { files } : {}), allowedMentions: { parse: [] } },
        { locale },
      ),
    );
  },
};
