import { hostname } from "node:os";
import { pruneBackups } from "../src/lib/operations/backup-retention.ts";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--apply")) {
  console.error("Uso: npm run ops:backup:prune [-- --apply]");
  process.exitCode = 2;
} else if (hostname() !== "F.R.I.D.A.Y") {
  console.error("Este comando solo opera en F.R.I.D.A.Y.");
  process.exitCode = 1;
} else {
  const result = await pruneBackups({
    directory: "/home/friday/Backups/Iron-Strength",
    keyDirectory: "/home/friday/.local/share/iron-strength-backup/keys",
    now: new Date(),
    apply: args[0] === "--apply",
  });
  console.log(
    JSON.stringify(
      { checkedAt: new Date().toISOString(), applied: args[0] === "--apply", ...result },
      null,
      2,
    ),
  );
  if (!result.ok) process.exitCode = 1;
}
