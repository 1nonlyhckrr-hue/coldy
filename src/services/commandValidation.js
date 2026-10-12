export function validateCommandOptionOrder(commands) {
  function inspect(options, path) {
    let optionalSeen = false;
    for (const [index, option] of (options ?? []).entries()) {
      const optionPath = `${path}.options[${index}](${option.name})`;
      if (option.type === 1 || option.type === 2) {
        inspect(option.options, optionPath);
        continue;
      }
      if (option.required === true && optionalSeen)
        throw new Error(`Required options must precede optional options: ${optionPath}`);
      if (option.required !== true) optionalSeen = true;
    }
  }
  for (const [index, command] of commands.entries())
    inspect(command.options, `commands[${index}](${command.name})`);
}
