export function renderTemplate(template, member) {
  const vars = {
    user: `<@${member.id}>`,
    username: member.user.username,
    server: member.guild.name,
    count: String(member.guild.memberCount),
  };
  return template
    .replace(/\{(user|username|server|count)\}/g, (_, key) => vars[key])
    .slice(0, 1900);
}
