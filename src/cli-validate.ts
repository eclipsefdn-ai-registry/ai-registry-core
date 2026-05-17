import { resolve } from "node:path";
import { validateVendorRepo } from "./validate.js";

const repoDir = resolve(process.argv[2] ?? ".");
const ok = await validateVendorRepo(repoDir);
if (!ok) process.exit(1);
