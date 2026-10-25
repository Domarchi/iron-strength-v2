import { checkRelease } from "../src/lib/operations/release-check.ts";

const args = process.argv.slice(2);
if (args.length !== 1 || !/^[a-f0-9]{32}$/.test(args[0])) {
  console.error("Uso: npm run ops:check -- <BUILD_ID hexadecimal de 32 caracteres>");
  process.exitCode = 2;
} else {
  const result = await checkRelease(args[0]);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2));
  if (!result.ok) process.exitCode = 1;
}
