// Shared flag parsing for the audio commands: --name[=value], unknown flags exit 2.
export function cli(name, summary, flags, argv = process.argv.slice(2)) {
  const help = `${name} [flags]\n${summary}\n${Object.entries(flags).map(([k, v]) => `  --${k.padEnd(10)} ${v}`).join('\n')}\n  --help       this text`;
  const o = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (!m || (m[1] !== 'help' && !(m[1] in flags))) {
      console.error(`${name}: unknown argument ${a} (--help lists the flags)`);
      process.exit(2);
    }
    o[m[1]] = m[2] ?? true;
  }
  if (o.help) {
    console.log(help);
    process.exit(0);
  }
  return o;
}
